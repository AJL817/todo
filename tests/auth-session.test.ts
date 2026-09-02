import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  createSession,
  createSessionToken,
  destroyAllSessionsOfUser,
  destroySession,
  findUserBySessionToken,
  hashSessionToken,
  purgeExpiredSessions,
  sessionTtlMs,
  upsertGithubUser,
} from '@/lib/auth/session'
import { apiBase, authorizeUrl, clientId, oauthBase } from '@/lib/auth/github'
import { Session, User } from '@/models'

const PROFILE = { githubId: 4242, username: 'octocat', avatarUrl: 'https://example.test/a.png' }

// 이 파일은 인증 흐름 자체를 검증한다. 사용자/세션 개수를 직접 세므로
// tests/setup.ts 가 미리 만들어 둔 기본 사용자와 세션을 치우고 시작한다.
beforeEach(async () => {
  await Session.deleteMany({})
  await User.deleteMany({})
})

describe('세션 토큰', () => {
  it('추측할 수 없을 만큼 길고 호출마다 다르다', () => {
    const a = createSessionToken()
    const b = createSessionToken()

    expect(a).toHaveLength(64) // 32바이트 hex
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9a-f]+$/)
  })

  it('DB 에는 원문이 아니라 해시가 저장된다', async () => {
    const user = await upsertGithubUser(PROFILE)
    const { token } = await createSession(user._id.toString())

    const stored = await Session.findOne({}).lean()

    expect(stored?.tokenHash).toBe(hashSessionToken(token))
    expect(stored?.tokenHash).not.toBe(token)
    // 문서 어디에도 원문이 없어야 한다
    expect(JSON.stringify(stored)).not.toContain(token)
  })

  it('쿠키 이름이 고정돼 있다', () => {
    expect(SESSION_COOKIE).toBe('todo_session')
    expect(OAUTH_STATE_COOKIE).toBe('todo_oauth_state')
  })
})

describe('upsertGithubUser', () => {
  it('같은 githubId 로 두 번 호출해도 사용자는 1명이고 최신 값으로 갱신된다', async () => {
    const first = await upsertGithubUser(PROFILE)
    const second = await upsertGithubUser({
      githubId: PROFILE.githubId,
      username: 'octocat-renamed',
      avatarUrl: 'https://example.test/b.png',
    })

    expect(await User.countDocuments({})).toBe(1)
    expect(second._id.toString()).toBe(first._id.toString())
    expect(second.username).toBe('octocat-renamed')
    expect(second.avatarUrl).toBe('https://example.test/b.png')
  })

  it('githubId 가 다르면 별개의 사용자다', async () => {
    await upsertGithubUser(PROFILE)
    await upsertGithubUser({ githubId: 999, username: 'other', avatarUrl: 'https://example.test/c.png' })

    expect(await User.countDocuments({})).toBe(2)
  })
})

describe('세션 수명주기', () => {
  it('만든 세션으로 사용자를 찾을 수 있다', async () => {
    const user = await upsertGithubUser(PROFILE)
    const { token } = await createSession(user._id.toString())

    const found = await findUserBySessionToken(token)

    expect(found).toMatchObject({ id: user._id.toString(), username: 'octocat', githubId: 4242 })
  })

  it('없는 토큰이나 빈 토큰이면 null', async () => {
    await expect(findUserBySessionToken(undefined)).resolves.toBeNull()
    await expect(findUserBySessionToken('')).resolves.toBeNull()
    await expect(findUserBySessionToken('a'.repeat(64))).resolves.toBeNull()
  })

  it('만료된 세션은 사용자를 반환하지 않고 문서도 정리한다', async () => {
    const user = await upsertGithubUser(PROFILE)
    const { token } = await createSession(user._id.toString())

    const wayLater = new Date(Date.now() + sessionTtlMs() + 1000)

    await expect(findUserBySessionToken(token, wayLater)).resolves.toBeNull()
    expect(await Session.countDocuments({})).toBe(0)
  })

  it('사용자 문서가 사라지면 세션이 있어도 null', async () => {
    const user = await upsertGithubUser(PROFILE)
    const { token } = await createSession(user._id.toString())
    await User.deleteOne({ _id: user._id })

    await expect(findUserBySessionToken(token)).resolves.toBeNull()
  })

  it('destroySession 이 문서를 실제로 지운다 (완전 삭제)', async () => {
    const user = await upsertGithubUser(PROFILE)
    const { token } = await createSession(user._id.toString())

    expect(await Session.countDocuments({})).toBe(1)
    await expect(destroySession(token)).resolves.toBe(true)

    expect(await Session.countDocuments({})).toBe(0)
    await expect(findUserBySessionToken(token)).resolves.toBeNull()
  })

  it('없는 토큰을 지우면 false 를 돌려주고 아무 일도 일어나지 않는다', async () => {
    await expect(destroySession('b'.repeat(64))).resolves.toBe(false)
    await expect(destroySession(undefined)).resolves.toBe(false)
  })

  it('destroyAllSessionsOfUser 가 그 사용자의 세션만 전부 지운다', async () => {
    const mine = await upsertGithubUser(PROFILE)
    const other = await upsertGithubUser({ githubId: 7, username: 'other', avatarUrl: 'x' })

    await createSession(mine._id.toString())
    await createSession(mine._id.toString())
    const kept = await createSession(other._id.toString())

    await expect(destroyAllSessionsOfUser(mine._id.toString())).resolves.toBe(2)

    expect(await Session.countDocuments({})).toBe(1)
    await expect(findUserBySessionToken(kept.token)).resolves.not.toBeNull()
  })

  it('purgeExpiredSessions 가 만료분만 지운다', async () => {
    const user = await upsertGithubUser(PROFILE)
    const alive = await createSession(user._id.toString())
    await Session.create({
      tokenHash: hashSessionToken('expired-token'),
      userId: user._id,
      expiresAt: new Date(Date.now() - 1000),
    })

    await expect(purgeExpiredSessions()).resolves.toBe(1)
    await expect(findUserBySessionToken(alive.token)).resolves.not.toBeNull()
  })

  it('SESSION_TTL_DAYS 로 수명을 바꿀 수 있고 잘못된 값은 기본값으로 되돌린다', () => {
    const original = process.env.SESSION_TTL_DAYS
    try {
      delete process.env.SESSION_TTL_DAYS
      expect(sessionTtlMs()).toBe(14 * 24 * 3600 * 1000)

      process.env.SESSION_TTL_DAYS = '3'
      expect(sessionTtlMs()).toBe(3 * 24 * 3600 * 1000)

      process.env.SESSION_TTL_DAYS = 'nope'
      expect(sessionTtlMs()).toBe(14 * 24 * 3600 * 1000)
    } finally {
      if (original === undefined) delete process.env.SESSION_TTL_DAYS
      else process.env.SESSION_TTL_DAYS = original
    }
  })
})

describe('GitHub OAuth 설정', () => {
  const saved = {
    id: process.env.GITHUB_CLIENT_ID,
    secret: process.env.GITHUB_CLIENT_SECRET,
    oauth: process.env.GITHUB_OAUTH_BASE,
    api: process.env.GITHUB_API_BASE,
  }

  afterEach(() => {
    for (const [key, value] of [
      ['GITHUB_CLIENT_ID', saved.id],
      ['GITHUB_CLIENT_SECRET', saved.secret],
      ['GITHUB_OAUTH_BASE', saved.oauth],
      ['GITHUB_API_BASE', saved.api],
    ] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('설정이 없으면 실제 github.com 을 쓴다', () => {
    delete process.env.GITHUB_OAUTH_BASE
    delete process.env.GITHUB_API_BASE

    expect(oauthBase()).toBe('https://github.com')
    expect(apiBase()).toBe('https://api.github.com')
  })

  it('설정하면 그 주소를 쓴다 (E2E 스텁용)', () => {
    process.env.GITHUB_OAUTH_BASE = 'http://127.0.0.1:9999'
    process.env.GITHUB_API_BASE = 'http://127.0.0.1:9999'

    expect(oauthBase()).toBe('http://127.0.0.1:9999')
    expect(apiBase()).toBe('http://127.0.0.1:9999')
  })

  it('GITHUB_CLIENT_ID 가 없으면 명확한 오류를 던진다', () => {
    delete process.env.GITHUB_CLIENT_ID
    expect(() => clientId()).toThrow(/GITHUB_CLIENT_ID/)
  })

  it('공백뿐인 값도 없는 것으로 본다', () => {
    process.env.GITHUB_CLIENT_ID = '   '
    expect(() => clientId()).toThrow(/GITHUB_CLIENT_ID/)
  })

  it('authorizeUrl 이 필요한 파라미터를 모두 담는다', () => {
    process.env.GITHUB_CLIENT_ID = 'test-client-id'
    process.env.GITHUB_OAUTH_BASE = 'https://github.com'

    const url = new URL(authorizeUrl('state-123', 'http://localhost:3000/auth/github/callback'))

    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('test-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/auth/github/callback')
    expect(url.searchParams.get('state')).toBe('state-123')
    expect(url.searchParams.get('scope')).toBe('read:user')
  })
})
