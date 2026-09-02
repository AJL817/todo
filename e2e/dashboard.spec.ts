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

/** KST 기준 오늘/어제/내일 'YYYY-MM-DD' */
async function kstDate(page: import('@playwright/test').Page, dayOffset = 0): Promise<string> {
  return page.evaluate((offset) => {
    const kst = new Date(Date.now() + 9 * 3600 * 1000 + offset * 86400000)
    return kst.toISOString().slice(0, 10)
  }, dayOffset)
}

test('왼쪽 메뉴가 5개 항목을 보여 주고 각 화면으로 이동한다', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('sidebar')).toBeVisible()

  const routes = [
    ['nav-todos', /\/todos$/, '전체 보드'],
    ['nav-week', /\/week\/\d{4}-\d{2}-\d{2}$/, '주간 뷰'],
    ['nav-goals', /\/goals$/, '1년 목표'],
    ['nav-inbox', /\/inbox$/, '미분류'],
    ['nav-dashboard', /\/$/, '대시보드'],
  ] as const

  for (const [testId, url, heading] of routes) {
    await page.getByTestId(testId).click()
    await expect(page).toHaveURL(url)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
  }
})

test('현재 화면의 메뉴 항목이 활성으로 표시된다', async ({ page }) => {
  await page.goto('/goals')
  await expect(page.getByTestId('nav-goals')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('nav-dashboard')).not.toHaveAttribute('aria-current', 'page')

  // 하위 경로에서도 상위 메뉴가 활성이어야 한다
  await page.goto('/week/2026-08-31')
  await expect(page.getByTestId('nav-week')).toHaveAttribute('aria-current', 'page')
})

test('대시보드 오늘 목록이 일일 뷰 규칙대로 채워진다 (PRD 일일 뷰)', async ({ page }) => {
  const today = await kstDate(page, 0)
  const yesterday = await kstDate(page, -1)
  const nextWeek = await kstDate(page, 7)

  await createTodo(page, { title: '오늘 마감', dueDate: today })
  await createTodo(page, { title: '지난 미완료', dueDate: yesterday })
  const doing = await createTodo(page, { title: '진행 중' })
  await moveTodoApi(page, doing, 'doing')
  await createTodo(page, { title: '미래 마감', dueDate: nextWeek })
  await createTodo(page, { title: '마감 없는 할일' })

  await page.goto('/')

  // evaluateAll 은 자동 대기를 하지 않는다. dev 서버의 첫 컴파일을 견디도록 poll 로 감싼다.
  await expect
    .poll(() =>
      page
        .getByTestId('today-list')
        .locator('[data-testid^="today-"][data-title]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-title')).sort()),
    )
    .toEqual(['오늘 마감', '지난 미완료', '진행 중'])
})

test('오늘 목록에서 완료를 누르면 목록에서 빠지고 주간 진행률이 오른다', async ({ page }) => {
  const thisWeek = await mondayOf(page)
  const today = await kstDate(page, 0)

  const planId = await createPlan(page, { title: '이번 주 계획', weekStart: thisWeek })
  const todoId = await createTodo(page, { title: '오늘 끝낼 일', dueDate: today, weeklyPlanId: planId })
  await createTodo(page, { title: '남는 일', weeklyPlanId: planId })

  await page.goto('/')
  await expect(page.getByTestId(`dash-plan-progress-${planId}-percent`)).toHaveText('0%')

  await page.getByTestId(`today-done-${todoId}`).click()

  await expect(page.getByTestId(`dash-plan-progress-${planId}-percent`)).toHaveText('50%')
  // done 이면서 마감일이 오늘이면 일일 뷰에는 그대로 남는다 (조건 1)
  await expect(page.getByTestId(`today-${todoId}`)).toContainText('완료')
})

test('대시보드가 이번 주 계획·목표·미분류·지표를 함께 보여 준다', async ({ page }) => {
  const thisWeek = await mondayOf(page)
  const year = Number(thisWeek.slice(0, 4))

  const goalId = await createGoal(page, {
    title: '체력 만들기',
    year,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  })
  const planId = await createPlan(page, { title: '이번 주 운동', weekStart: thisWeek, goalId })
  const done = await createTodo(page, { title: '스쿼트', weeklyPlanId: planId })
  await createTodo(page, { title: '달리기', weeklyPlanId: planId })
  await moveTodoApi(page, done, 'done')
  await createTodo(page, { title: '미분류 할일' })

  await page.goto('/')

  await expect(page.getByTestId(`dash-plan-progress-${planId}-percent`)).toHaveText('50%')
  await expect(page.getByTestId(`dash-goal-text-${goalId}`)).toHaveText('50% (경과 1주 기준)')
  await expect(page.getByTestId('dash-inbox-count')).toContainText('1건')
  await expect(page.getByTestId('inbox-badge')).toHaveText('1')

  // 활성 할일 3건 중 2건 연결 -> M1 67%
  await expect(page.getByTestId('metric-linkedRate')).toContainText('67%')
})

test('데이터가 없으면 지표를 미달이 아니라 표본 없음으로 표시한다', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('metric-linkedRate')).toContainText('표본 없음')
  await expect(page.getByTestId('metric-executionRate')).toContainText('표본 없음')
  await expect(page.getByTestId('today-empty')).toBeVisible()
})
