import { expect, test } from '@playwright/test'
import {
  card,
  createPlan,
  createTodo,
  loginAs,
  moveTodoApi,
  resetData,
} from './helpers'

const WEEK = '2026-08-31'
const NEXT_WEEK = '2026-09-07'

test.beforeEach(async ({ page }) => {
  // 모든 API 가 인증을 요구하므로 먼저 로그인한다 (docs/LOGIN.md)
  await loginAs(page)
  await resetData(page)
})

test('주간 계획을 고르면 그 계획에 이미 있는 할일을 불러와 보여 준다', async ({ page }) => {
  const planId = await createPlan(page, { title: '체력 주간', weekStart: WEEK })
  const done = await createTodo(page, { title: '이미 있는 스쿼트', weeklyPlanId: planId })
  await createTodo(page, { title: '이미 있는 달리기', weeklyPlanId: planId })
  await moveTodoApi(page, done, 'done')

  await page.goto('/todos')

  // 아직 고르지 않았으면 미리보기가 없다
  await expect(page.getByTestId('linked-plan-preview')).toHaveCount(0)

  await page.getByTestId('todo-plan').selectOption(planId)

  await expect(page.getByTestId('linked-plan-preview')).toBeVisible()
  await expect(page.getByTestId('linked-plan-title')).toHaveText('체력 주간')
  await expect(page.getByTestId('linked-plan-progress')).toHaveText('50% · 1/2')

  const titles = page.getByTestId('linked-plan-todos').locator('[data-testid^="linked-todo-"]')
  await expect(titles).toHaveCount(2)
  await expect(titles.filter({ hasText: '이미 있는 스쿼트' })).toContainText('완료')
  await expect(titles.filter({ hasText: '이미 있는 달리기' })).toContainText('할 일')
})

test('미분류로 되돌리면 미리보기가 사라진다', async ({ page }) => {
  const planId = await createPlan(page, { title: '체력 주간', weekStart: WEEK })
  await createTodo(page, { title: '기존 할일', weeklyPlanId: planId })

  await page.goto('/todos')
  await page.getByTestId('todo-plan').selectOption(planId)
  await expect(page.getByTestId('linked-plan-preview')).toBeVisible()

  await page.getByTestId('todo-plan').selectOption('')
  await expect(page.getByTestId('linked-plan-preview')).toHaveCount(0)
})

test('할일이 없는 계획을 고르면 비어 있다고 알려 준다', async ({ page }) => {
  const planId = await createPlan(page, { title: '빈 계획', weekStart: WEEK })

  await page.goto('/todos')
  await page.getByTestId('todo-plan').selectOption(planId)

  await expect(page.getByTestId('linked-plan-empty')).toBeVisible()
  await expect(page.getByTestId('linked-plan-progress')).toHaveText('0% · 0/0')
})

test('연결해서 추가하면 미리보기 목록에 바로 반영된다', async ({ page }) => {
  const planId = await createPlan(page, { title: '체력 주간', weekStart: WEEK })
  await createTodo(page, { title: '기존 할일', weeklyPlanId: planId })

  await page.goto('/todos')
  await page.getByTestId('todo-plan').selectOption(planId)
  await expect(page.getByTestId('linked-plan-todos').locator('li')).toHaveCount(1)

  await page.getByTestId('todo-title').fill('새로 넣는 할일')
  await page.getByTestId('todo-submit').click()

  await expect(card(page, '새로 넣는 할일')).toBeVisible()
  await expect(page.getByTestId('linked-plan-todos').locator('li')).toHaveCount(2)
  await expect(page.getByTestId('linked-plan-progress')).toHaveText('0% · 0/2')
})

test('같은 제목의 계획이 여러 주에 있어도 주 시작일로 구분된다', async ({ page }) => {
  const thisWeekPlan = await createPlan(page, { title: '체력 주간', weekStart: WEEK })
  const nextWeekPlan = await createPlan(page, { title: '체력 주간', weekStart: NEXT_WEEK })

  await createTodo(page, { title: '이번 주 것', weeklyPlanId: thisWeekPlan })

  await page.goto('/todos')

  // allTextContents 는 자동 대기를 하지 않는다. 계획 목록이 도착하기 전에 읽으면 빈 배열이다.
  await expect
    .poll(() => page.getByTestId('todo-plan').locator('option').allTextContents())
    .toEqual(expect.arrayContaining([`${WEEK} · 체력 주간`, `${NEXT_WEEK} · 체력 주간`]))

  // 제목이 같아도 고른 주의 내용이 정확히 나온다
  await page.getByTestId('todo-plan').selectOption(nextWeekPlan)
  await expect(page.getByTestId('linked-plan-empty')).toBeVisible()

  await page.getByTestId('todo-plan').selectOption(thisWeekPlan)
  await expect(page.getByTestId('linked-plan-todos')).toContainText('이번 주 것')
})

test('주간 뷰에서도 같은 미리보기가 동작한다', async ({ page }) => {
  const planId = await createPlan(page, { title: '체력 주간', weekStart: WEEK })
  await createTodo(page, { title: '주간 기존 할일', weeklyPlanId: planId })

  await page.goto(`/week/${WEEK}`)

  // 주간 뷰는 첫 계획이 기본 선택이므로 미리보기가 바로 뜬다
  await expect(page.getByTestId('linked-plan-preview')).toBeVisible()
  await expect(page.getByTestId('linked-plan-todos')).toContainText('주간 기존 할일')
})
