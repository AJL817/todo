import { expect, test } from '@playwright/test'
import { card, createTodo, loginAs, logoutViaUi, resetData, STUB_URL } from './helpers'

test('로그인하지 않으면 보호 화면에서 로그인 페이지로 보내진다', async ({ page }) => {
  for (const path of ['/', '/todos', '/week', '/goals', '/inbox']) {
    await page.goto(path)
    await expect(page, path).toHaveURL(/\/login$/)
  }

  await expect(page.getByTestId('login-github')).toBeVisible()
})

test('GitHub 로그인 버튼을 누르면 콜백을 거쳐 로그인 상태가 된다', async ({ page }) => {
  const set = await page.request.post(`${STUB_URL}/__set-user`, { data: { login: 'octocat', id: 583231 } })
  expect(set.ok()).toBe(true)

  await page.goto('/login')
  await page.getByTestId('login-github').click()

  // /auth/github -> 스텁 authorize -> /auth/github/callback -> /
  await expect(page).toHaveURL(/127\.0\.0\.1:3100\/$/)
  await expect(page.getByRole('heading', { name: '대시보드', level: 1 })).toBeVisible()

  // GitHub username 과 avatar_url 이 화면에 보인다 (docs/LOGIN.md)
  await expect(page.getByTestId('current-user-name')).toHaveText('octocat')
  await expect(page.getByTestId('current-user-avatar')).toHaveAttribute(
    'src',
    'https://example.test/octocat.png',
  )
})

test('로그인하면 할일을 만들고 다시 볼 수 있다', async ({ page }) => {
  await loginAs(page, 'worker', 2001)
  await resetData(page)

  await page.goto('/todos')
  await page.getByTestId('todo-title').fill('로그인 후 만든 할일')
  await page.getByTestId('todo-submit').click()

  await expect(card(page, '로그인 후 만든 할일')).toBeVisible()

  await page.reload()
  await expect(card(page, '로그인 후 만든 할일')).toBeVisible()
})

test('다른 사용자로 로그인하면 앞 사용자의 할일이 보이지 않는다', async ({ page }) => {
  await loginAs(page, 'alice', 3001)
  await resetData(page)
  await createTodo(page, { title: '앨리스의 비밀' })

  await page.goto('/todos')
  await expect(card(page, '앨리스의 비밀')).toBeVisible()

  // 밥으로 갈아탄다
  await logoutViaUi(page)
  await loginAs(page, 'bob', 3002)
  await resetData(page)

  await page.goto('/todos')
  await expect(page.getByTestId('current-user-name')).toHaveText('bob')
  await expect(card(page, '앨리스의 비밀')).toHaveCount(0)

  // 앨리스로 돌아오면 자기 데이터는 그대로다
  await logoutViaUi(page)
  await loginAs(page, 'alice', 3001)
  await page.goto('/todos')
  await expect(card(page, '앨리스의 비밀')).toBeVisible()
})

test('로그아웃하면 로그인 화면으로 가고 뒤로 가기로도 되돌아올 수 없다', async ({ page }) => {
  await loginAs(page, 'leaver', 4001)
  await page.goto('/todos')
  await expect(page.getByTestId('current-user-name')).toHaveText('leaver')

  await logoutViaUi(page)
  await expect(page).toHaveURL(/\/login$/)

  // 뒤로 가기로 보호 화면에 접근해도 다시 로그인으로 간다
  await page.goBack()
  await expect(page).toHaveURL(/\/login$/)

  await page.goto('/todos')
  await expect(page).toHaveURL(/\/login$/)
})

test('로그아웃 후에는 같은 세션 쿠키로도 API 가 401 이다', async ({ page }) => {
  await loginAs(page, 'revoked', 5001)

  const before = await page.request.get('/api/todos')
  expect(before.status()).toBe(200)

  // 브라우저가 들고 있던 쿠키를 그대로 보관했다가 로그아웃 뒤에 다시 쓴다
  const cookies = await page.context().cookies()
  const session = cookies.find((cookie) => cookie.name === 'todo_session')
  expect(session).toBeDefined()

  await page.goto('/todos')
  await logoutViaUi(page)

  // 쿠키를 되돌려 놓아도 서버의 세션 문서가 지워졌으므로 통하지 않는다
  await page.context().addCookies([session!])
  const after = await page.request.get('/api/todos')

  expect(after.status()).toBe(401)
  expect(typeof (await after.json()).error).toBe("string")
})

test('세션 없이 API 를 호출하면 401 이다', async ({ page }) => {
  await page.context().clearCookies()

  for (const path of ['/api/todos', '/api/weekly-plans', '/api/goals', '/api/stats', '/api/me']) {
    const response = await page.request.get(path)
    expect(response.status(), path).toBe(401)
  }

  // health 는 인증 없이도 열려 있어야 한다
  expect((await page.request.get('/api/health')).status()).toBe(200)
})

test('로그인 화면과 인증 경로는 로그인 없이 열린다', async ({ page }) => {
  await page.context().clearCookies()

  const login = await page.goto('/login')
  expect(login?.status()).toBe(200)
  await expect(page.getByTestId('login-github')).toBeVisible()
})
