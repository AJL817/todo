import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { NextRequest } from 'next/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as startLogin } from '@/app/auth/github/route'
import { GET as handleCallback } from '@/app/auth/github/callback/route'
import { POST as logout } from '@/app/auth/logout/route'
import { middleware } from '@/middleware'
import { OAUTH_STATE_COOKIE, SESSION_COOKIE } from '@/lib/auth/constants'
import { createSession, findUserBySessionToken, upsertGithubUser } from '@/lib/auth/session'
import { Session, User } from '@/models'

const ORIGIN = 'http://127.0.0.1:3000'

// 이 파일은 인증 흐름 자체를 검증한다. 사용자/세션 개수를 직접 세므로
// tests/setup.ts 가 미리 만들어 둔 기본 사용자와 세션을 치우고 시작한다.
beforeEach(async () => {
  await Session.deleteMany({})
  await User.deleteMany({})
})

/** GitHub 를 흉내내는 최소 스텁. 실제 github.com 에 붙지 않고 콜백 전 구간을 돌린다. */
let stub: http.Server
let stubUrl: string
let stubProfile = { id: 4242, login: 'octocat', avatar_url: 'https://example.test/a.png' }
let tokenRequests = 0

beforeAll(async () => {
  stub = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')

    if (url.pathname === '/login/oauth/access_token') {
      tokenRequests += 1
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ access_token: 'stub-access-token' }))
      return
    }

    if (url.pathname === '/user') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(stubProfile))
      return
    }

    res.writeHead(404)
    res.end()
  })

  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve))
  stubUrl = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`

  process.env.GITHUB_CLIENT_ID = 'test-client-id'
  process.env.GITHUB_CLIENT_SECRET = 'test-client-secret'
  process.env.GITHUB_OAUTH_BASE = stubUrl
  process.env.GITHUB_API_BASE = stubUrl
})

afterAll(async () => {
  await new Promise<void>((resolve) => stub.close(() => resolve()))
})

afterEach(() => {
  stubProfile = { id: 4242, login: 'octocat', avatar_url: 'https://example.test/a.png' }
  tokenRequests = 0
})

function req(path: string, init?: RequestInit): Request {
  return new Request(`${ORIGIN}${path}`, init)
}

/** Set-Cookie 헤더에서 한 쿠키의 값과 속성을 뽑는다. */
function readSetCookie(response: Response, name: string): { value: string; raw: string } | null {
  const all = response.headers.getSetCookie?.() ?? []
  const found = all.find((cookie) => cookie.startsWith(`${name}=`))
  if (!found) return null
  return { value: decodeURIComponent(found.slice(name.length + 1).split(';')[0] ?? ''), raw: found }
}

describe('GET /auth/github — 로그인 시작', () => {
  it('GitHub authorize 로 302 보내고 state 쿠키를 심는다', () => {
    const response = startLogin(req('/auth/github'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.origin + location.pathname).toBe(`${stubUrl}/login/oauth/authorize`)
    expect(location.searchParams.get('client_id')).toBe('test-client-id')
    expect(location.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/auth/github/callback`)
    expect(location.searchParams.get('scope')).toBe('read:user')

    const state = readSetCookie(response, OAUTH_STATE_COOKIE)
    expect(state?.value).toMatch(/^[0-9a-f]{32}$/)
    // authorize URL 의 state 와 쿠키가 일치해야 콜백에서 대조가 성립한다
    expect(location.searchParams.get('state')).toBe(state?.value)
  })

  it('state 쿠키가 HttpOnly / SameSite=Lax / Path=/ 다', () => {
    const response = startLogin(req('/auth/github'))
    const raw = readSetCookie(response, OAUTH_STATE_COOKIE)?.raw ?? ''

    expect(raw).toContain('HttpOnly')
    expect(raw).toContain('SameSite=lax')
    expect(raw).toContain('Path=/')
  })

  it('프로덕션에서는 Secure 를 붙이고 개발에서는 붙이지 않는다', () => {
    try {
      vi.stubEnv('NODE_ENV', 'production')
      expect(readSetCookie(startLogin(req('/auth/github')), OAUTH_STATE_COOKIE)?.raw).toContain('Secure')

      vi.stubEnv('NODE_ENV', 'development')
      expect(readSetCookie(startLogin(req('/auth/github')), OAUTH_STATE_COOKIE)?.raw).not.toContain('Secure')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('CLIENT_ID 가 없으면 세션 없이 로그인 화면으로 되돌린다', () => {
    const saved = process.env.GITHUB_CLIENT_ID
    delete process.env.GITHUB_CLIENT_ID
    try {
      const response = startLogin(req('/auth/github'))
      expect(response.headers.get('location')).toContain('/login?error=')
    } finally {
      process.env.GITHUB_CLIENT_ID = saved
    }
  })
})

describe('GET /auth/github/callback — 콜백', () => {
  it('code 를 교환하고 사용자를 저장한 뒤 세션 쿠키를 굽는다', async () => {
    const response = await handleCallback(
      req('/auth/github/callback?code=test-code&state=s1', { headers: { cookie: `${OAUTH_STATE_COOKIE}=s1` } }),
    )

    expect(response.headers.get('location')).toBe(`${ORIGIN}/`)
    expect(tokenRequests).toBe(1)

    // GitHub username 과 avatar_url 이 DB 에 저장된다 (LOGIN.md 완료 조건)
    const user = await User.findOne({ githubId: 4242 }).lean()
    expect(user).toMatchObject({ username: 'octocat', avatarUrl: 'https://example.test/a.png' })

    const cookie = readSetCookie(response, SESSION_COOKIE)
    expect(cookie?.value).toMatch(/^[0-9a-f]{64}$/)
    expect(cookie?.raw).toContain('HttpOnly')
    expect(cookie?.raw).toContain('SameSite=lax')

    // 그 쿠키로 실제 사용자를 찾을 수 있어야 한다
    await expect(findUserBySessionToken(cookie?.value)).resolves.toMatchObject({ username: 'octocat' })

    // state 쿠키는 소임을 다했으므로 만료시킨다
    expect(readSetCookie(response, OAUTH_STATE_COOKIE)?.raw).toMatch(/Max-Age=0|Expires=/)
  })

  it('state 가 다르면 세션을 만들지 않는다 (CSRF 방어)', async () => {
    const response = await handleCallback(
      req('/auth/github/callback?code=test-code&state=attacker', {
        headers: { cookie: `${OAUTH_STATE_COOKIE}=mine` },
      }),
    )

    expect(response.headers.get('location')).toContain('/login?error=')
    expect(readSetCookie(response, SESSION_COOKIE)).toBeNull()
    expect(await Session.countDocuments({})).toBe(0)
    expect(await User.countDocuments({})).toBe(0)
    expect(tokenRequests).toBe(0)
  })

  it('state 쿠키가 아예 없으면 거부한다', async () => {
    const response = await handleCallback(req('/auth/github/callback?code=test-code&state=s1'))

    expect(response.headers.get('location')).toContain('/login?error=')
    expect(await Session.countDocuments({})).toBe(0)
  })

  it('code 가 없으면 세션을 만들지 않는다', async () => {
    const response = await handleCallback(
      req('/auth/github/callback?state=s1', { headers: { cookie: `${OAUTH_STATE_COOKIE}=s1` } }),
    )

    expect(response.headers.get('location')).toContain('/login?error=')
    expect(await Session.countDocuments({})).toBe(0)
    expect(tokenRequests).toBe(0)
  })

  it('같은 GitHub 계정으로 두 번 로그인해도 사용자는 1명이다', async () => {
    for (const state of ['a', 'b']) {
      await handleCallback(
        req(`/auth/github/callback?code=c&state=${state}`, { headers: { cookie: `${OAUTH_STATE_COOKIE}=${state}` } }),
      )
    }

    expect(await User.countDocuments({})).toBe(1)
    expect(await Session.countDocuments({})).toBe(2) // 세션은 로그인마다 새로 생긴다
  })
})

describe('POST /auth/logout — 세션 완전 삭제', () => {
  it('세션 문서를 지우고 쿠키를 만료시킨다', async () => {
    const user = await upsertGithubUser({ githubId: 1, username: 'me', avatarUrl: 'x' })
    const { token } = await createSession(user._id.toString())

    const response = await logout(req('/auth/logout', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${token}` } }))

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`${ORIGIN}/login`)
    expect(await Session.countDocuments({})).toBe(0)
    await expect(findUserBySessionToken(token)).resolves.toBeNull()

    const cleared = readSetCookie(response, SESSION_COOKIE)
    expect(cleared?.value).toBe('')
    expect(cleared?.raw).toMatch(/Max-Age=0|Expires=/)
  })

  it('세션 쿠키가 없어도 안전하게 로그인 화면으로 보낸다', async () => {
    const response = await logout(req('/auth/logout', { method: 'POST' }))
    expect(response.headers.get('location')).toBe(`${ORIGIN}/login`)
  })

  it('다른 사용자의 세션은 건드리지 않는다', async () => {
    const me = await upsertGithubUser({ githubId: 1, username: 'me', avatarUrl: 'x' })
    const you = await upsertGithubUser({ githubId: 2, username: 'you', avatarUrl: 'y' })
    const mine = await createSession(me._id.toString())
    const yours = await createSession(you._id.toString())

    await logout(req('/auth/logout', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${mine.token}` } }))

    await expect(findUserBySessionToken(yours.token)).resolves.toMatchObject({ username: 'you' })
  })
})

describe('middleware — 화면 접근 안내', () => {
  const request = (path: string, cookie?: string) =>
    new NextRequest(`${ORIGIN}${path}`, cookie ? { headers: { cookie } } : undefined)

  it('세션 쿠키가 없으면 보호 화면에서 /login 으로 보낸다', () => {
    for (const path of ['/', '/todos', '/week/2026-08-31', '/goals', '/inbox']) {
      const response = middleware(request(path))
      expect(new URL(response.headers.get('location') ?? '').pathname, path).toBe('/login')
    }
  })

  it('세션 쿠키가 있으면 통과시킨다', () => {
    const response = middleware(request('/todos', `${SESSION_COOKIE}=anything`))
    expect(response.headers.get('location')).toBeNull()
  })

  it('/login 과 /auth/* 는 언제나 통과시킨다', () => {
    for (const path of ['/login', '/auth/github', '/auth/github/callback']) {
      expect(middleware(request(path)).headers.get('location'), path).toBeNull()
    }
  })

  it('API 는 리다이렉트하지 않는다 (라우트가 401 을 돌려주게 둔다)', () => {
    const response = middleware(request('/api/todos'))
    expect(response.headers.get('location')).toBeNull()
  })
})
