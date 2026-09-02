/**
 * GitHub OAuth 2.0 authorization code 흐름 (docs/LOGIN.md).
 *
 * NextAuth 를 쓰지 않는다. 명세가 지정한 경로 /auth/github, /auth/github/callback 은
 * NextAuth 규약과 다르고, 흐름 자체가 세 번의 HTTP 호출이라 직접 쓰는 편이 짧다.
 *
 * 엔드포인트 주소를 환경변수로 뺀 이유는 E2E 때문이다. 실제 github.com 에 붙을 수 없으므로
 * 테스트는 로컬 스텁을 가리키게 한다. 기본값은 언제나 진짜 GitHub 다.
 */

const DEFAULT_OAUTH_BASE = 'https://github.com'
const DEFAULT_API_BASE = 'https://api.github.com'

export const GITHUB_SCOPE = 'read:user'

export interface GithubProfile {
  githubId: number
  username: string
  avatarUrl: string
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.trim() === '') {
    // 시크릿에 기본값을 두지 않는다. 없으면 여기서 멈추는 편이 안전하다.
    throw new Error(
      `환경변수 ${name} 가 필요합니다. .env.local 에 설정하세요 (docs/LOGIN-SETUP.md 참고).`,
    )
  }
  return value.trim()
}

export function oauthBase(): string {
  return process.env.GITHUB_OAUTH_BASE?.trim() || DEFAULT_OAUTH_BASE
}

export function apiBase(): string {
  return process.env.GITHUB_API_BASE?.trim() || DEFAULT_API_BASE
}

export function clientId(): string {
  return requiredEnv('GITHUB_CLIENT_ID')
}

function clientSecret(): string {
  return requiredEnv('GITHUB_CLIENT_SECRET')
}

/**
 * 이 요청이 실제로 도착한 주소.
 *
 * request.url 을 그대로 쓰면 안 된다. 개발 서버는 127.0.0.1 로 접속해도 request.url 이
 * localhost 로 나오는데, 쿠키는 호스트가 다르면 공유되지 않는다. 그러면 state 쿠키를
 * 심은 호스트와 콜백이 도착하는 호스트가 갈려 CSRF 검사가 항상 실패한다.
 * 프록시 뒤에 두는 경우에도 같은 이유로 forwarded 헤더를 먼저 본다.
 */
export function appOrigin(request: Request): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!host) return new URL(request.url).origin

  const proto = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '')
  return `${proto}://${host}`
}

/**
 * 콜백 주소. 명시하지 않으면 요청이 도착한 호스트에서 만든다.
 * GitHub OAuth App 에 등록한 값과 정확히 같아야 하므로, 배포 환경에서는
 * AUTH_CALLBACK_URL 로 못 박는 편이 안전하다.
 */
export function callbackUrl(request: Request): string {
  const explicit = process.env.AUTH_CALLBACK_URL?.trim()
  if (explicit) return explicit
  return `${appOrigin(request)}/auth/github/callback`
}

export function authorizeUrl(state: string, redirectUri: string): string {
  const url = new URL('/login/oauth/authorize', oauthBase())
  url.searchParams.set('client_id', clientId())
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', GITHUB_SCOPE)
  url.searchParams.set('state', state)
  return url.toString()
}

/** authorization code 를 액세스 토큰으로 바꾼다. */
export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
  const response = await fetch(new URL('/login/oauth/access_token', oauthBase()), {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId(),
      client_secret: clientSecret(),
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    throw new Error(`GitHub 토큰 교환에 실패했습니다 (HTTP ${response.status})`)
  }

  const body = (await response.json()) as { access_token?: string; error?: string; error_description?: string }

  if (body.error !== undefined || body.access_token === undefined) {
    // 오류 본문에는 시크릿이 없다. 그래도 원문을 그대로 흘리지 않고 요약만 남긴다.
    throw new Error(`GitHub 토큰 교환이 거부됐습니다: ${body.error ?? 'access_token 없음'}`)
  }

  return body.access_token
}

export async function fetchGithubProfile(accessToken: string): Promise<GithubProfile> {
  const response = await fetch(new URL('/user', apiBase()), {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${accessToken}`,
      'user-agent': 'goal-kanban-todo',
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub 사용자 정보를 가져오지 못했습니다 (HTTP ${response.status})`)
  }

  const body = (await response.json()) as { id?: number; login?: string; avatar_url?: string }

  if (typeof body.id !== 'number' || typeof body.login !== 'string') {
    throw new Error('GitHub 사용자 응답의 형식이 예상과 다릅니다')
  }

  return {
    githubId: body.id,
    username: body.login,
    avatarUrl: body.avatar_url ?? '',
  }
}
