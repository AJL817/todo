import { expect, test } from '@playwright/test'
import {
  card,
  createGoal,
  createPlan,
  createTodo,
  loginAs,
  moveTodoApi,
  resetData,
} from './helpers'

const WEEK = '2026-08-31' // 월요일
const NEXT_WEEK = '2026-09-07'

test.beforeEach(async ({ page }) => {
  // 모든 API 가 인증을 요구하므로 먼저 로그인한다 (docs/LOGIN.md)
  await loginAs(page)
  await resetData(page)
})

test('미완료 3건이 있는 주에서 이월하면 3건이 다음 주 뷰에 나타난다', async ({ page }) => {
  const planId = await createPlan(page, { title: '체력 주간', weekStart: WEEK })
  for (const title of ['A', 'B', 'C']) {
    await createTodo(page, { title, weeklyPlanId: planId })
  }

  await page.goto(`/week/${WEEK}`)
  await page.getByTestId(`plan-carryover-${planId}`).click()

  await expect(page.getByTestId('carryover-list')).toBeVisible()
  await expect(page.getByTestId('carryover-confirm')).toHaveText('3건 이월')
  await page.getByTestId('carryover-confirm').click()

  await expect(page.getByTestId('carryover-dialog')).toHaveCount(0)

  await page.goto(`/week/${NEXT_WEEK}`)
  for (const title of ['A', 'B', 'C']) {
    await expect(card(page, title)).toBeVisible()
  }
})

test('이월 직후 이전 주 진행률이 이월 전과 동일하다 (A8 / R12 게이밍 차단)', async ({ page }) => {
  const planId = await createPlan(page, { title: '체력 주간', weekStart: WEEK })
  const done = await createTodo(page, { title: '끝낸 일', weeklyPlanId: planId })
  await createTodo(page, { title: '남은 일 1', weeklyPlanId: planId })
  await createTodo(page, { title: '남은 일 2', weeklyPlanId: planId })
  await moveTodoApi(page, done, 'done')

  await page.goto(`/week/${WEEK}`)
  await expect(page.getByTestId(`plan-progress-${planId}-percent`)).toHaveText('33%')
  await expect(page.getByTestId(`plan-progress-${planId}-label`)).toHaveText('1/3')

  await page.getByTestId(`plan-carryover-${planId}`).click()
  await page.getByTestId('carryover-confirm').click()
  await expect(page.getByTestId('carryover-dialog')).toHaveCount(0)

  // 미완료를 밀어냈다고 이번 주가 100% 가 되면 안 된다. 분모가 그대로 유지된다.
  await expect(page.getByTestId(`plan-progress-${planId}-percent`)).toHaveText('33%')
  await expect(page.getByTestId(`plan-progress-${planId}-label`)).toHaveText('1/3')
})

test('다이얼로그에 완료된 항목은 나타나지 않는다', async ({ page }) => {
  const planId = await createPlan(page, { title: '체력 주간', weekStart: WEEK })
  const done = await createTodo(page, { title: '끝낸 일', weeklyPlanId: planId })
  await createTodo(page, { title: '남은 일', weeklyPlanId: planId })
  await moveTodoApi(page, done, 'done')

  await page.goto(`/week/${WEEK}`)
  await page.getByTestId(`plan-carryover-${planId}`).click()

  await expect(page.getByTestId('carryover-list')).toBeVisible()
  await expect(page.getByTestId(`carryover-check-${done}`)).toHaveCount(0)
  await expect(page.getByTestId('carryover-confirm')).toHaveText('1건 이월')
})

test('체크를 해제한 항목은 원래 주에 남는다', async ({ page }) => {
  const planId = await createPlan(page, { title: '체력 주간', weekStart: WEEK })
  const stay = await createTodo(page, { title: '남길 일', weeklyPlanId: planId })
  await createTodo(page, { title: '보낼 일', weeklyPlanId: planId })

  await page.goto(`/week/${WEEK}`)
  await page.getByTestId(`plan-carryover-${planId}`).click()

  await page.getByTestId(`carryover-check-${stay}`).uncheck()
  await expect(page.getByTestId('carryover-confirm')).toHaveText('1건 이월')
  await page.getByTestId('carryover-confirm').click()
  await expect(page.getByTestId('carryover-dialog')).toHaveCount(0)

  await expect(card(page, '남길 일')).toBeVisible()
  await expect(card(page, '보낼 일')).toHaveCount(0)

  await page.goto(`/week/${NEXT_WEEK}`)
  await expect(card(page, '보낼 일')).toBeVisible()
  await expect(card(page, '남길 일')).toHaveCount(0)
})

test('이월을 연속 2회 실행해도 카드가 중복되지 않고 이월 배지가 1로 유지된다 (멱등성)', async ({ page }) => {
  const planId = await createPlan(page, { title: '체력 주간', weekStart: WEEK })
  const todoId = await createTodo(page, { title: '한 번만 이월', weeklyPlanId: planId })

  await page.goto(`/week/${WEEK}`)
  await page.getByTestId(`plan-carryover-${planId}`).click()
  await page.getByTestId('carryover-confirm').click()
  await expect(page.getByTestId('carryover-dialog')).toHaveCount(0)

  // 두 번째 실행: 이미 옮겨 갔으므로 대상이 없다.
  await page.getByTestId(`plan-carryover-${planId}`).click()
  await expect(page.getByTestId('carryover-empty')).toBeVisible()
  await expect(page.getByTestId('carryover-confirm')).toBeDisabled()
  await page.getByTestId('carryover-cancel').click()

  await page.goto(`/week/${NEXT_WEEK}`)
  await expect(page.locator('[data-testid^="card-"][data-title="한 번만 이월"]')).toHaveCount(1)
  await expect(page.getByTestId(`carried-${todoId}`)).toHaveText('이월 1')
})

test('다음 주 계획이 없으면 자동 생성되고 목표 연결을 승계한다', async ({ page }) => {
  const goalId = await createGoal(page, {
    title: '2026년 체력',
    year: 2026,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  })
  const planId = await createPlan(page, { title: '체력 주간', weekStart: WEEK, goalId })
  await createTodo(page, { title: '옮길 일', weeklyPlanId: planId })

  await page.goto(`/week/${NEXT_WEEK}`)
  await expect(page.getByTestId('plan-empty')).toBeVisible()

  await page.goto(`/week/${WEEK}`)
  await page.getByTestId(`plan-carryover-${planId}`).click()
  await page.getByTestId('carryover-confirm').click()
  await expect(page.getByTestId('carryover-dialog')).toHaveCount(0)

  await page.goto(`/week/${NEXT_WEEK}`)

  const created = page.locator('[data-testid^="plan-"][data-title="체력 주간"]')
  await expect(created).toBeVisible()
  // 목표 연결이 끊긴 채 이월되면 진행률 반영에서 누락된다 (PLAN §4.5).
  await expect(page.locator('[data-testid^="plan-goal-"]')).toHaveValue(goalId)
})

test('이월된 카드는 이전 주 뷰에 "이월됨" 으로 남고 분모에 계속 잡힌다', async ({ page }) => {
  const planId = await createPlan(page, { title: '체력 주간', weekStart: WEEK })
  const todoId = await createTodo(page, { title: '떠난 일', weeklyPlanId: planId })
  await createTodo(page, { title: '남은 일', weeklyPlanId: planId })

  await page.goto(`/week/${WEEK}`)
  await expect(page.getByTestId('carried-out-section')).toHaveCount(0)

  await page.getByTestId(`plan-carryover-${planId}`).click()
  await page.getByTestId(`carryover-check-${todoId}`).check()
  // '남은 일' 은 제외하고 '떠난 일' 만 보낸다
  const stayCheckbox = page.locator('[data-testid^="carryover-check-"]').nth(1)
  await stayCheckbox.uncheck()
  await page.getByTestId('carryover-confirm').click()
  await expect(page.getByTestId('carryover-dialog')).toHaveCount(0)

  // 칸반에서는 사라지고 별도 섹션에 '이월됨' 으로 남는다
  await expect(card(page, '떠난 일')).toHaveCount(0)
  await expect(page.getByTestId('carried-out-section')).toBeVisible()
  await expect(page.getByTestId(`carried-out-${todoId}`)).toContainText('이월됨')
  await expect(page.getByTestId('carried-out-count')).toHaveText('1건')

  // 분모에는 그대로 남는다: 소속 1건 + 이월돼 나간 1건 = 2
  await expect(page.getByTestId(`plan-progress-${planId}-label`)).toHaveText('0/2')
})

test('다이얼로그를 취소하면 아무것도 옮겨지지 않는다', async ({ page }) => {
  const planId = await createPlan(page, { title: '체력 주간', weekStart: WEEK })
  await createTodo(page, { title: '그대로 있을 일', weeklyPlanId: planId })

  await page.goto(`/week/${WEEK}`)
  await page.getByTestId(`plan-carryover-${planId}`).click()
  await page.getByTestId('carryover-cancel').click()

  await expect(page.getByTestId('carryover-dialog')).toHaveCount(0)
  await expect(card(page, '그대로 있을 일')).toBeVisible()

  await page.goto(`/week/${NEXT_WEEK}`)
  await expect(card(page, '그대로 있을 일')).toHaveCount(0)
})
