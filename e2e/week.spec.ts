import { expect, test } from '@playwright/test'
import {
  card,
  column,
  createGoal,
  createPlan,
  createTodo,
  dragCard,
  dragTo,
  loginAs,
  mondayOf,
  moveTodoApi,
  resetData,
  withApiSettled,
  withMoveSettled,
} from './helpers'

const WEEK = '2026-08-31' // 월요일
const NEXT_WEEK = '2026-09-07'

test.beforeEach(async ({ page }) => {
  // 모든 API 가 인증을 요구하므로 먼저 로그인한다 (docs/LOGIN.md)
  await loginAs(page)
  await resetData(page)
})

test('주간 계획별 진행률 바가 done수/분모와 함께 표시된다', async ({ page }) => {
  const planId = await createPlan(page, { title: '체력 주간', weekStart: WEEK })
  await createTodo(page, { title: 'A', weeklyPlanId: planId })
  await createTodo(page, { title: 'B', weeklyPlanId: planId })

  await page.goto(`/week/${WEEK}`)

  await expect(page.getByTestId(`plan-progress-${planId}-percent`)).toHaveText('0%')
  await expect(page.getByTestId(`plan-progress-${planId}-label`)).toHaveText('0/2')
})

test('연결 할일이 0건인 계획은 0% 로 표시된다 (NaN 이나 빈 값 아님)', async ({ page }) => {
  const planId = await createPlan(page, { title: '빈 계획', weekStart: WEEK })

  await page.goto(`/week/${WEEK}`)

  await expect(page.getByTestId(`plan-progress-${planId}-percent`)).toHaveText('0%')
  await expect(page.getByTestId(`plan-progress-${planId}-label`)).toHaveText('0/0')
})

test('할일을 done 으로 끌면 새로고침 없이 진행률이 갱신된다', async ({ page }) => {
  const planId = await createPlan(page, { title: '체력 주간', weekStart: WEEK })
  await createTodo(page, { title: 'A', weeklyPlanId: planId })
  await createTodo(page, { title: 'B', weeklyPlanId: planId })

  await page.goto(`/week/${WEEK}`)
  await expect(page.getByTestId(`plan-progress-${planId}-percent`)).toHaveText('0%')

  await dragCard(page, 'A', column(page, 'done'))

  await expect(page.getByTestId(`plan-progress-${planId}-percent`)).toHaveText('50%')
  await expect(page.getByTestId(`plan-progress-${planId}-label`)).toHaveText('1/2')
})

test('마감일 없이 계획에만 연결된 할일이 주간 뷰에 보인다 (A9 핵심)', async ({ page }) => {
  const planId = await createPlan(page, { title: '체력 주간', weekStart: WEEK })
  await createTodo(page, { title: '마감일 없는 할일', weeklyPlanId: planId })

  await page.goto(`/week/${WEEK}`)

  await expect(card(page, '마감일 없는 할일')).toBeVisible()
})

test('마감일이 주 범위 밖인 소속 할일은 경고 배지와 함께 보이고 숨겨지지 않는다 (A10)', async ({ page }) => {
  const planId = await createPlan(page, { title: '체력 주간', weekStart: WEEK })
  const insideId = await createTodo(page, { title: '범위 안', weeklyPlanId: planId, dueDate: '2026-09-03' })
  const outsideId = await createTodo(page, { title: '범위 밖', weeklyPlanId: planId, dueDate: '2026-10-01' })

  await page.goto(`/week/${WEEK}`)

  await expect(card(page, '범위 밖')).toBeVisible()
  await expect(page.getByTestId(`due-outside-${outsideId}`)).toBeVisible()
  await expect(page.getByTestId(`due-outside-${insideId}`)).toHaveCount(0)
})

test('다음 주 버튼이 URL 을 바꾸고 해당 주 소속 할일만 보여 준다', async ({ page }) => {
  const thisWeekPlan = await createPlan(page, { title: '이번 주 계획', weekStart: WEEK })
  const nextWeekPlan = await createPlan(page, { title: '다음 주 계획', weekStart: NEXT_WEEK })
  await createTodo(page, { title: '이번 주 할일', weeklyPlanId: thisWeekPlan })
  await createTodo(page, { title: '다음 주 할일', weeklyPlanId: nextWeekPlan })

  await page.goto(`/week/${WEEK}`)
  await expect(card(page, '이번 주 할일')).toBeVisible()
  await expect(card(page, '다음 주 할일')).toHaveCount(0)

  await page.getByTestId('week-next').click()

  await expect(page).toHaveURL(new RegExp(`/week/${NEXT_WEEK}$`))
  await expect(card(page, '다음 주 할일')).toBeVisible()
  await expect(card(page, '이번 주 할일')).toHaveCount(0)
})

test('일요일 날짜로 들어가도 직전 월요일 시작 주가 표시된다 (A2)', async ({ page }) => {
  const planId = await createPlan(page, { title: '이번 주 계획', weekStart: WEEK })
  await createTodo(page, { title: '주간 할일', weeklyPlanId: planId })

  // 2026-09-06 은 일요일이다.
  await page.goto('/week/2026-09-06')

  await expect(page.getByTestId('week-range')).toHaveText('2026-08-31 ~ 2026-09-06')
  await expect(card(page, '주간 할일')).toBeVisible()
})

test('할일을 다른 주간 계획으로 재지정하면 양쪽 진행률이 모두 갱신된다', async ({ page }) => {
  const planA = await createPlan(page, { title: 'A 계획', weekStart: WEEK })
  const planB = await createPlan(page, { title: 'B 계획', weekStart: WEEK })
  const todoId = await createTodo(page, { title: '옮길 할일', weeklyPlanId: planA })
  await moveTodoApi(page, todoId, 'done')

  await page.goto(`/week/${WEEK}`)
  await expect(page.getByTestId(`plan-progress-${planA}-label`)).toHaveText('1/1')
  await expect(page.getByTestId(`plan-progress-${planB}-label`)).toHaveText('0/0')

  // 인박스 경로가 아니라 API 로 재지정한 뒤 화면이 따라오는지 본다.
  await page.request.patch(`/api/todos/${todoId}`, { data: { weeklyPlanId: planB } })
  await page.reload()

  await expect(page.getByTestId(`plan-progress-${planA}-label`)).toHaveText('0/0')
  await expect(page.getByTestId(`plan-progress-${planB}-label`)).toHaveText('1/1')
})

test('주간 계획을 삭제하면 하위 할일이 미분류로 살아남고 배지가 증가한다', async ({ page }) => {
  const planId = await createPlan(page, { title: '삭제할 계획', weekStart: WEEK })
  await createTodo(page, { title: '살아남을 할일 1', weeklyPlanId: planId })
  await createTodo(page, { title: '살아남을 할일 2', weeklyPlanId: planId })

  await page.goto(`/week/${WEEK}`)
  await expect(page.getByTestId('inbox-badge')).toHaveCount(0)

  await page.getByTestId(`plan-delete-${planId}`).click()

  await expect(page.getByTestId(`plan-${planId}`)).toHaveCount(0)
  await expect(page.getByTestId('inbox-badge')).toHaveText('2')
  await expect(page.getByTestId('inbox-count')).toHaveText('2건')
})

test('미분류가 0건이면 배지가 표시되지 않는다', async ({ page }) => {
  const planId = await createPlan(page, { title: '계획', weekStart: WEEK })
  await createTodo(page, { title: '연결된 할일', weeklyPlanId: planId })

  await page.goto(`/week/${WEEK}`)

  await expect(page.getByTestId('inbox-empty')).toBeVisible()
  await expect(page.getByTestId('inbox-badge')).toHaveCount(0)
})

test('인박스에서 계획에 연결하면 배지가 줄고 진행률 분모가 늘어난다', async ({ page }) => {
  const planId = await createPlan(page, { title: '받을 계획', weekStart: WEEK })
  const orphanId = await createTodo(page, { title: '미분류 할일' })

  await page.goto(`/week/${WEEK}`)
  await expect(page.getByTestId('inbox-badge')).toHaveText('1')
  await expect(page.getByTestId(`plan-progress-${planId}-label`)).toHaveText('0/0')

  await page.getByTestId(`inbox-assign-${orphanId}`).selectOption(planId)

  await expect(page.getByTestId(`plan-progress-${planId}-label`)).toHaveText('0/1')
  await expect(page.getByTestId('inbox-badge')).toHaveCount(0)
  await expect(card(page, '미분류 할일')).toBeVisible()
})

test('인박스 칩을 계획으로 끌어다 놓아도 연결된다 (PLAN §4.6)', async ({ page }) => {
  const planId = await createPlan(page, { title: '받을 계획', weekStart: WEEK })
  const orphanId = await createTodo(page, { title: '끌어 붙일 할일' })

  await page.goto(`/week/${WEEK}`)
  await expect(page.getByTestId(`inbox-item-${orphanId}`)).toBeVisible()

  await dragTo(page, page.getByTestId(`inbox-item-${orphanId}`), page.getByTestId(`inbox-drop-${planId}`))

  await expect(page.getByTestId(`plan-progress-${planId}-label`)).toHaveText('0/1')
  await expect(page.getByTestId('inbox-badge')).toHaveCount(0)
})

test('전용 인박스 화면에서도 연결할 수 있다', async ({ page }) => {
  const thisWeek = await mondayOf(page)

  const planId = await createPlan(page, { title: '이번 주 계획', weekStart: thisWeek })
  const orphanId = await createTodo(page, { title: '인박스 할일' })

  await page.goto('/inbox')
  await expect(page.getByTestId(`inbox-item-${orphanId}`)).toBeVisible()

  await page.getByTestId(`inbox-assign-${orphanId}`).selectOption(planId)

  await expect(page.getByTestId('inbox-empty')).toBeVisible()
  await expect(page.getByTestId('inbox-badge')).toHaveCount(0)
})

test('주간 계획을 1년 목표에 연결할 수 있다', async ({ page }) => {
  const goalId = await createGoal(page, {
    title: '2026년 체력',
    year: 2026,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  })
  const planId = await createPlan(page, { title: '체력 주간', weekStart: WEEK })

  await page.goto(`/week/${WEEK}`)
  // 저장이 끝나기 전에 새로고침하면 PATCH 가 끊겨 연결이 사라진 것처럼 보인다.
  await withApiSettled(
    page,
    (url, method) => url.includes(`/api/weekly-plans/${planId}`) && method === 'PATCH',
    () => page.getByTestId(`plan-goal-${planId}`).selectOption(goalId),
  )

  await page.reload()
  await expect(page.getByTestId(`plan-goal-${planId}`)).toHaveValue(goalId)
})

test('주간 뷰에서 만든 할일이 기본으로 첫 계획에 연결된다', async ({ page }) => {
  const planId = await createPlan(page, { title: '기본 계획', weekStart: WEEK })

  await page.goto(`/week/${WEEK}`)
  await page.getByTestId('todo-title').fill('주간 뷰에서 추가')
  await page.getByTestId('todo-submit').click()

  await expect(card(page, '주간 뷰에서 추가')).toBeVisible()
  await expect(page.getByTestId(`plan-progress-${planId}-label`)).toHaveText('0/1')
})

test('주간 뷰에서 카드 순서를 바꾸면 새로고침 후에도 유지된다', async ({ page }) => {
  const planId = await createPlan(page, { title: '계획', weekStart: WEEK })
  await createTodo(page, { title: 'A', weeklyPlanId: planId })
  await createTodo(page, { title: 'B', weeklyPlanId: planId })

  await page.goto(`/week/${WEEK}`)
  await expect(column(page, 'todo').locator('[data-testid^="card-"]')).toHaveCount(2)

  await withMoveSettled(page, () => dragCard(page, 'B', card(page, 'A')))

  await page.reload()
  // evaluateAll 은 자동 대기를 하지 않는다. 새로고침 직후에는 아직 비어 있을 수 있다.
  await expect
    .poll(() =>
      column(page, 'todo')
        .locator('[data-testid^="card-"]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-title'))),
    )
    .toEqual(['B', 'A'])
})
