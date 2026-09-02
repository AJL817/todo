import { expect, test } from '@playwright/test'
import {
  card,
  cardHandle,
  column,
  dragCard,
  loginAs,
  mondayOf,
  resetData,
  withApiSettled,
} from './helpers'

/**
 * PRD §3 User Flow 전 구간을 화면 조작만으로 한 번에 통과시킨다.
 * docs/PLAN.md §9 의 수동 확인 절차를 그대로 자동화한 것이다.
 */

test('전체 여정: 목표 → 주간 계획 → 할일 → DnD → 진행률 → 이월', async ({ page }) => {
  test.setTimeout(180_000)
  await loginAs(page)
  await resetData(page)

  const thisWeek = await mondayOf(page, 0)
  const nextWeek = await mondayOf(page, 1)
  const year = Number(thisWeek.slice(0, 4))

  // ── 1. 1년 목표 등록 ────────────────────────────────────────────────
  await page.goto('/goals')
  await page.getByTestId('goal-title').fill('체력 만들기')
  await page.getByTestId('goal-year').fill(String(year))
  await page.getByTestId('goal-submit').click()

  const goalCard = page.locator('[data-testid^="goal-"][data-title="체력 만들기"]')
  await expect(goalCard).toBeVisible()
  const goalId = (await goalCard.getAttribute('data-testid'))!.replace('goal-', '')

  // 하위 계획이 없으니 분모가 0이다
  await expect(page.getByTestId(`goal-progress-${goalId}`)).toHaveText('0% (경과 0주 기준)')

  // ── 2. 하위에 이번 주 주간 계획 생성 ────────────────────────────────
  await page.goto(`/week/${thisWeek}`)
  await page.getByTestId('plan-title').fill('이번 주 운동')
  await page.getByTestId('plan-submit').click()

  const planCard = page.locator('[data-testid^="plan-"][data-title="이번 주 운동"]')
  await expect(planCard).toBeVisible()
  const planId = (await planCard.getAttribute('data-testid'))!.replace('plan-', '')

  // 저장이 끝나기 전에 페이지를 떠나면 PATCH 가 끊겨 연결이 없던 일이 된다 (docs/CLAUDE.md).
  await withApiSettled(
    page,
    (url, method) => url.includes(`/api/weekly-plans/${planId}`) && method === 'PATCH',
    () => page.getByTestId(`plan-goal-${planId}`).selectOption(goalId),
  )

  await page.goto('/goals')
  await expect(page.getByTestId(`goal-progress-${goalId}`)).toHaveText('0% (경과 1주 기준)')

  // ── 3. 할일 3건 생성 (주간 계획에 연결) ─────────────────────────────
  await page.goto(`/week/${thisWeek}`)
  for (const title of ['스쿼트', '달리기', '수영']) {
    await page.getByTestId('todo-title').fill(title)
    await page.getByTestId('todo-submit').click()
    await expect(card(page, title)).toBeVisible()
  }
  await expect(page.getByTestId(`plan-progress-${planId}-label`)).toHaveText('0/3')

  // ── 4. 드래그로 1건 완료 → 주간 33%, 목표 33% ───────────────────────
  await dragCard(page, '스쿼트', column(page, 'done'))
  await expect(page.getByTestId(`plan-progress-${planId}-percent`)).toHaveText('33%')
  await expect(card(page, '스쿼트').locator('[data-testid^="completed-"]')).toBeVisible()

  await page.goto('/goals')
  await expect(page.getByTestId(`goal-progress-${goalId}`)).toHaveText('33% (경과 1주 기준)')

  // ── 5. 미래 주간 계획 10개 추가 → 목표 진행률 불변 (A5 핵심) ────────
  for (let week = 1; week <= 10; week += 1) {
    const response = await page.request.post('/api/weekly-plans', {
      data: { title: `미래 ${week}주`, weekStart: await mondayOf(page, week), goalId },
    })
    expect(response.status()).toBe(201)
  }

  await page.reload()
  await expect(page.getByTestId(`goal-progress-${goalId}`)).toHaveText('33% (경과 1주 기준)')

  // ── 6. 1건 소프트 삭제 → 분모가 줄어 50% ────────────────────────────
  await page.goto(`/week/${thisWeek}`)
  const swimming = card(page, '수영')
  const swimmingId = (await swimming.getAttribute('data-testid'))!.replace('card-', '')
  await page.getByTestId(`delete-${swimmingId}`).click()

  await expect(card(page, '수영')).toHaveCount(0)
  await expect(page.getByTestId(`plan-progress-${planId}-label`)).toHaveText('1/2')
  await expect(page.getByTestId(`plan-progress-${planId}-percent`)).toHaveText('50%')

  // ── 7. 남은 미완료 1건을 다음 주로 이월 → 이번 주 진행률 불변 (A8) ──
  await page.getByTestId(`plan-carryover-${planId}`).click()
  await expect(page.getByTestId('carryover-confirm')).toHaveText('1건 이월')
  await page.getByTestId('carryover-confirm').click()
  await expect(page.getByTestId('carryover-dialog')).toHaveCount(0)

  // 밀어냈다고 이번 주가 100% 가 되지 않는다
  await expect(page.getByTestId(`plan-progress-${planId}-percent`)).toHaveText('50%')
  await expect(page.getByTestId(`plan-progress-${planId}-label`)).toHaveText('1/2')
  await expect(page.getByTestId('carried-out-count')).toHaveText('1건')

  // 다음 주에는 정상 카드로 나타나고 이월 배지가 붙는다
  await page.goto(`/week/${nextWeek}`)
  await expect(card(page, '달리기')).toBeVisible()
  const runningId = (await card(page, '달리기').getAttribute('data-testid'))!.replace('card-', '')
  await expect(page.getByTestId(`carried-${runningId}`)).toHaveText('이월 1')

  // ── 8. 주간 계획 삭제 → 하위 할일이 미분류로 살아남는다 ─────────────
  await page.goto(`/week/${thisWeek}`)
  await page.getByTestId(`plan-delete-${planId}`).click()

  await expect(page.getByTestId(`plan-${planId}`)).toHaveCount(0)
  await expect(page.getByTestId('inbox-badge')).toHaveText('1')

  // ── 9. 인박스에서 다시 연결 → 배지 감소 ─────────────────────────────
  await page.getByTestId('plan-title').fill('되살린 주간')
  await page.getByTestId('plan-submit').click()
  const revived = page.locator('[data-testid^="plan-"][data-title="되살린 주간"]')
  await expect(revived).toBeVisible()
  const revivedId = (await revived.getAttribute('data-testid'))!.replace('plan-', '')

  const squatId = (await page.locator('[data-testid^="inbox-item-"]').first().getAttribute('data-testid'))!.replace(
    'inbox-item-',
    '',
  )
  await page.getByTestId(`inbox-assign-${squatId}`).selectOption(revivedId)

  await expect(page.getByTestId('inbox-badge')).toHaveCount(0)
  await expect(page.getByTestId(`plan-progress-${revivedId}-label`)).toHaveText('1/1')

  // ── 10. 목표 삭제 → 하위 주간 계획은 미분류로 살아남는다 ────────────
  await page.goto('/goals')
  await page.getByTestId(`goal-delete-${goalId}`).click()

  await expect(page.getByTestId(`goal-${goalId}`)).toHaveCount(0)
  // 미래 10주 + 다음 주(이월로 자동 생성) 계획들이 미분류로 남는다
  await expect(page.getByTestId('orphan-plan-count')).not.toHaveText('0건')
  await expect(page.locator('[data-testid^="orphan-plan-"][data-title="미래 1주"]')).toBeVisible()

  // ── 11. 지표가 산출된다 ─────────────────────────────────────────────
  const stats = await page.request.get('/api/stats')
  expect(stats.ok()).toBe(true)
  const metrics = (await stats.json()) as {
    linkedRate: number
    executionRate: number
    carryOverBacklogRate: number
  }
  for (const value of [metrics.linkedRate, metrics.executionRate, metrics.carryOverBacklogRate]) {
    expect(Number.isFinite(value)).toBe(true)
  }
})

test('오프라인에서 카드를 옮기면 원위치로 롤백된다 (PLAN §9 수동 확인 12)', async ({ page }) => {
  await loginAs(page)
  await resetData(page)

  const response = await page.request.post('/api/todos', { data: { title: '오프라인 이동' } })
  expect(response.status()).toBe(201)

  await page.goto('/todos')
  await expect(card(page, '오프라인 이동')).toBeVisible()

  // 네트워크를 끊는다
  await page.route('**/api/todos/*/move', (route) => route.abort('failed'))

  await dragCard(page, '오프라인 이동', column(page, 'done'))

  await expect(page.getByTestId('toast-error')).toBeVisible()
  await expect(column(page, 'todo').locator('[data-title="오프라인 이동"]')).toBeVisible()
  await expect(column(page, 'done').locator('[data-title="오프라인 이동"]')).toHaveCount(0)

  // 드래그 손잡이는 여전히 살아 있다 (화면이 망가지지 않았다)
  await expect(cardHandle(page, '오프라인 이동')).toBeVisible()
})
