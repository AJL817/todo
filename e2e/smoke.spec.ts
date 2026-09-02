import { expect, test } from '@playwright/test'
import { loginAs } from './helpers'

test('홈이 대시보드로 200 응답하고 사이드바 메뉴가 보인다', async ({ page }) => {
  await loginAs(page)

  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: '대시보드', level: 1 })).toBeVisible()

  // 왼쪽 메뉴 5개가 모두 있어야 한다
  await expect(page.getByTestId('sidebar')).toBeVisible()
  for (const testId of ['nav-dashboard', 'nav-todos', 'nav-week', 'nav-goals', 'nav-inbox']) {
    await expect(page.getByTestId(testId)).toBeVisible()
  }
})

test('health 엔드포인트가 ok 를 반환한다', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ ok: true })
})
