import { expect, test } from '@playwright/test'
import {
  createGoal,
  createPlan,
  createTodo,
  loginAs,
  mondayOf,
  moveTodoApi,
  resetData,
} from './helpers'

test.beforeEach(async ({ page }) => {
  // 모든 API 가 인증을 요구하므로 먼저 로그인한다 (docs/LOGIN.md)
  await loginAs(page)
  await resetData(page)
})

const GOAL = { title: '2026년 체력 만들기', year: 2026, startDate: '2026-01-01', endDate: '2026-12-31' }

test('주간 계획이 0건인 목표는 0% (경과 0주 기준) 으로 표시된다', async ({ page }) => {
  const goalId = await createGoal(page, GOAL)

  await page.goto('/goals')

  await expect(page.getByTestId(`goal-progress-${goalId}`)).toHaveText('0% (경과 0주 기준)')
})

test('경과 주 100% 와 0% 두 계획을 가진 목표는 50% (경과 2주 기준) 이다', async ({ page }) => {
  const goalId = await createGoal(page, GOAL)

  const lastWeek = await mondayOf(page, -1)
  const thisWeek = await mondayOf(page, 0)

  const donePlan = await createPlan(page, { title: '지난 주', weekStart: lastWeek, goalId })
  const emptyPlan = await createPlan(page, { title: '이번 주', weekStart: thisWeek, goalId })

  const finished = await createTodo(page, { title: '끝낸 일', weeklyPlanId: donePlan })
  await moveTodoApi(page, finished, 'done')
  await createTodo(page, { title: '안 끝낸 일', weeklyPlanId: emptyPlan })

  await page.goto('/goals')

  await expect(page.getByTestId(`goal-progress-${goalId}`)).toHaveText('50% (경과 2주 기준)')
})

test('미래 주간 계획을 50개 추가해도 표시 진행률이 변하지 않는다 (A5 핵심)', async ({ page }) => {
  const goalId = await createGoal(page, GOAL)
  const thisWeek = await mondayOf(page, 0)

  const planId = await createPlan(page, { title: '이번 주', weekStart: thisWeek, goalId })
  const first = await createTodo(page, { title: 'A', weeklyPlanId: planId })
  await createTodo(page, { title: 'B', weeklyPlanId: planId })
  await createTodo(page, { title: 'C', weeklyPlanId: planId })
  await moveTodoApi(page, first, 'done')

  await page.goto('/goals')
  await expect(page.getByTestId(`goal-progress-${goalId}`)).toHaveText('33% (경과 1주 기준)')

  for (let week = 1; week <= 50; week += 1) {
    await createPlan(page, { title: `미래 ${week}주`, weekStart: await mondayOf(page, week), goalId })
  }

  await page.reload()

  // 미래 주를 아무리 많이 만들어도 분모가 늘지 않는다.
  await expect(page.getByTestId(`goal-progress-${goalId}`)).toHaveText('33% (경과 1주 기준)')
})

test('진행률 옆에 분모 라벨이 항상 노출된다 (PLAN §0.2)', async ({ page }) => {
  const goalId = await createGoal(page, GOAL)
  const thisWeek = await mondayOf(page, 0)
  await createPlan(page, { title: '이번 주', weekStart: thisWeek, goalId })

  await page.goto('/goals')
  await expect(page.getByTestId(`goal-progress-${goalId}`)).toContainText('경과')

  await page.getByTestId(`goal-link-${goalId}`).click()
  await expect(page.getByTestId('goal-detail-progress')).toContainText('경과')
})

test('목표 상세가 계획별 진행률과 할일 건수, 집계 여부를 함께 보여 준다 (R14)', async ({ page }) => {
  const goalId = await createGoal(page, GOAL)

  const thisWeek = await mondayOf(page, 0)
  const nextWeek = await mondayOf(page, 1)

  const smallPlan = await createPlan(page, { title: '1건짜리 주', weekStart: thisWeek, goalId })
  const futurePlan = await createPlan(page, { title: '미래 주', weekStart: nextWeek, goalId })

  const only = await createTodo(page, { title: '유일한 할일', weeklyPlanId: smallPlan })
  await moveTodoApi(page, only, 'done')

  await page.goto(`/goals/${goalId}`)

  await expect(page.getByTestId(`goal-plan-progress-${smallPlan}-percent`)).toHaveText('100%')
  await expect(page.getByTestId(`goal-plan-progress-${smallPlan}-label`)).toHaveText('1/1')
  await expect(page.getByTestId(`goal-plan-todocount-${smallPlan}`)).toHaveText('할일 1건')
  await expect(page.getByTestId(`goal-plan-counted-${smallPlan}`)).toHaveText('집계 대상')

  // 미래 주는 목록에는 보이지만 분모에서 빠진다.
  await expect(page.getByTestId(`goal-plan-${futurePlan}`)).toBeVisible()
  await expect(page.getByTestId(`goal-plan-counted-${futurePlan}`)).toHaveText('미도래')
  await expect(page.getByTestId('goal-detail-progress')).toHaveText('100% (경과 1주 기준)')
})

test('목표를 삭제해도 하위 주간 계획은 미분류 목록에 살아남는다 (PRD P0)', async ({ page }) => {
  const goalId = await createGoal(page, GOAL)
  const thisWeek = await mondayOf(page, 0)
  await createPlan(page, { title: '살아남을 계획', weekStart: thisWeek, goalId })

  await page.goto('/goals')
  await expect(page.getByTestId('orphan-plans-empty')).toBeVisible()

  await page.getByTestId(`goal-delete-${goalId}`).click()

  await expect(page.getByTestId(`goal-${goalId}`)).toHaveCount(0)
  await expect(page.getByTestId('orphan-plan-count')).toHaveText('1건')
  await expect(page.locator('[data-testid^="orphan-plan-"][data-title="살아남을 계획"]')).toBeVisible()
})

test('미분류 주간 계획을 목표에 연결하면 진행률이 즉시 반영된다', async ({ page }) => {
  const goalId = await createGoal(page, GOAL)
  const thisWeek = await mondayOf(page, 0)

  const orphanPlan = await createPlan(page, { title: '미분류 주', weekStart: thisWeek })
  const finished = await createTodo(page, { title: '완료', weeklyPlanId: orphanPlan })
  await createTodo(page, { title: '미완료', weeklyPlanId: orphanPlan })
  await moveTodoApi(page, finished, 'done')

  await page.goto('/goals')
  await expect(page.getByTestId(`goal-progress-${goalId}`)).toHaveText('0% (경과 0주 기준)')

  await page.getByTestId(`orphan-plan-assign-${orphanPlan}`).selectOption(goalId)

  await expect(page.getByTestId(`goal-progress-${goalId}`)).toHaveText('50% (경과 1주 기준)')
  await expect(page.getByTestId('orphan-plans-empty')).toBeVisible()
})

test('제목 없이 목표를 만들려 하면 폼에서 막히고 요청이 나가지 않는다', async ({ page }) => {
  await page.goto('/goals')

  let posted = false
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/goals')) posted = true
  })

  await page.getByTestId('goal-submit').click()

  await expect(page.getByTestId('goal-title-error')).toBeVisible()
  await page.waitForTimeout(400)
  expect(posted).toBe(false)
})

test('폼으로 만든 목표가 목록에 나타난다', async ({ page }) => {
  await page.goto('/goals')
  await expect(page.getByTestId('goals-empty')).toBeVisible()

  await page.getByTestId('goal-title').fill('2027년 독서')
  await page.getByTestId('goal-year').fill('2027')
  await page.getByTestId('goal-submit').click()

  await expect(page.locator('[data-testid^="goal-"][data-title="2027년 독서"]')).toBeVisible()
})

test('왼쪽 메뉴에서 목표 화면으로 이동할 수 있다', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-goals').click()

  await expect(page).toHaveURL(/\/goals$/)
  await expect(page.getByRole('heading', { name: '1년 목표', level: 1 })).toBeVisible()
})
