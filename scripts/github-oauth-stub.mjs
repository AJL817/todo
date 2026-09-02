import http from 'node:http'

/**
 * E2E 전용 GitHub OAuth 스텁.
 *
 * 실제 github.com 에 붙을 수 없으므로 authorize / access_token / user 세 지점만 흉내낸다.
 * 앱은 GITHUB_OAUTH_BASE / GITHUB_API_BASE 로 이 서버를 가리키게 된다.
 * 테스트 전용 라우트를 앱 안에 심지 않으려고 별도 프로세스로 띄운다.
 *
 * 반환할 사용자는 POST /__set-user 로 바꾼다. 사용자 전환 시나리오에 필요하다.
 */

const PORT = Number(process.env.STUB_PORT ?? 3199)

let profile = { id: 1001, login: 'e2e-user', avatar_url: 'https://example.test/e2e-user.png' }

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'))
      } catch {
        resolve({})
      }
    })
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)

  // 어느 사용자로 로그인할지 테스트가 지정한다
  if (req.method === 'POST' && url.pathname === '/__set-user') {
    const body = await readBody(req)
    profile = {
      id: Number(body.id ?? profile.id),
      login: String(body.login ?? profile.login),
      avatar_url: String(body.avatar_url ?? `https://example.test/${body.login ?? profile.login}.png`),
    }
    json(res, 200, { ok: true, profile })
    return
  }

  if (url.pathname === '/__current-user') {
    json(res, 200, profile)
    return
  }

  // 사용자가 GitHub 에서 승인한 것처럼 곧바로 콜백으로 돌려보낸다.
  // state 는 앱이 준 값을 그대로 되돌려 줘야 CSRF 검사를 통과한다.
  if (url.pathname === '/login/oauth/authorize') {
    const redirectUri = url.searchParams.get('redirect_uri')
    const state = url.searchParams.get('state') ?? ''

    if (!redirectUri) {
      json(res, 400, { error: 'redirect_uri 없음' })
      return
    }

    const back = new URL(redirectUri)
    back.searchParams.set('code', 'stub-authorization-code')
    back.searchParams.set('state', state)

    res.writeHead(302, { location: back.toString() })
    res.end()
    return
  }

  if (req.method === 'POST' && url.pathname === '/login/oauth/access_token') {
    json(res, 200, { access_token: 'stub-access-token', token_type: 'bearer', scope: 'read:user' })
    return
  }

  if (url.pathname === '/user') {
    json(res, 200, profile)
    return
  }

  json(res, 404, { error: `스텁이 모르는 경로: ${url.pathname}` })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[github-stub] http://127.0.0.1:${PORT} 에서 대기 중`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => process.exit(0)))
}
