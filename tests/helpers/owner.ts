import { createSession, upsertGithubUser } from '@/lib/auth/session'

/**
 * 테스트마다 새로 만들어지는 기본 사용자.
 *
 * afterEach 가 컬렉션을 비우므로 사용자도 매번 사라진다. 그래서 beforeEach 에서 다시 만들고
 * 여기에 담아 둔다. 리포지토리가 소유자를 필수 인자로 받게 됐기 때문에(docs/LOGIN.md)
 * 거의 모든 테스트가 이 값을 쓴다.
 */
let currentOwnerId: string | null = null
let currentSessionToken: string | null = null

export interface TestPrincipal {
  ownerId: string
  sessionToken: string
  username: string
}

/** 새 사용자 + 세션을 만든다. 두 번째 사용자를 만들 때도 쓴다(격리 테스트). */
export async function makePrincipal(username = 'tester', githubId = 1): Promise<TestPrincipal> {
  const user = await upsertGithubUser({
    githubId,
    username,
    avatarUrl: `https://example.test/${username}.png`,
  })
  const { token } = await createSession(user._id.toString())

  return { ownerId: user._id.toString(), sessionToken: token, username }
}

export function setCurrentPrincipal(principal: TestPrincipal): void {
  currentOwnerId = principal.ownerId
  currentSessionToken = principal.sessionToken
}

export function clearCurrentPrincipal(): void {
  currentOwnerId = null
  currentSessionToken = null
}

/** 현재 테스트의 소유자 id. 설정 전에 부르면 조용히 넘어가지 않고 바로 실패한다. */
export function owner(): string {
  if (currentOwnerId === null) {
    throw new Error('테스트 소유자가 설정되지 않았습니다. tests/setup.ts 의 beforeEach 를 확인하세요.')
  }
  return currentOwnerId
}

/** 현재 테스트의 세션 토큰. API 라우트를 호출할 때 쿠키로 붙인다. */
export function sessionToken(): string {
  if (currentSessionToken === null) {
    throw new Error('테스트 세션이 설정되지 않았습니다. tests/setup.ts 의 beforeEach 를 확인하세요.')
  }
  return currentSessionToken
}
