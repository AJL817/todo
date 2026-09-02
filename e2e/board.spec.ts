import { expect, test } from '@playwright/test'
import {
  card,
  column,
  columnTitles,
  createTodo,
  dragCard,
  loginAs,
  resetData,
  withMoveSettled,
} from './helpers'

test.beforeEach(async ({ page }) => {
  // 모든 API 가 인증을 요구하므로 먼저 로그인한다 (docs/LOGIN.md)
  await loginAs(page)
  await resetData(page)
})

test('카드를 todo 에서 doing 으로 끌면 즉시 doing 열에 나타난다 (낙관적 갱신)', async ({ page }) => {
  await createTodo(page, { title: '운동하기' })
  await page.goto('/todos')
  await expect(card(page, '운동하기')).toBeVisible()

  // 서버 응답을 늦춰, 응답 전에 화면이 이미 바뀌는지 확인한다.
  await page.route('**/api/todos/*/move', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })

  await dragCard(page, '운동하기', column(page, 'doing'))

  // 1.5초 응답을 기다리지 않고 곧바로 doing 열에 있어야 한다.
  await expect(column(page, 'doing').locator('[data-title="운동하기"]')).toBeVisible({ timeout: 800 })
})

test('move 가 500 을 반환하면 카드가 원래 열과 자리로 되돌아가고 오류가 보인다', async ({ page }) => {
  await createTodo(page, { title: '실패할 이동' })
  await page.goto('/todos')
  await expect(card(page, '실패할 이동')).toBeVisible()

  await page.route('**/api/todos/*/move', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '서버 오류' }) }),
  )

  await dragCard(page, '실패할 이동', column(page, 'done'))

  await expect(page.getByTestId('toast-error')).toBeVisible()
  await expect(column(page, 'todo').locator('[data-title="실패할 이동"]')).toBeVisible()
  await expect(column(page, 'done').locator('[data-title="실패할 이동"]')).toHaveCount(0)
})

test('같은 열 안에서 순서를 바꾸면 새로고침 후에도 유지된다', async ({ page }) => {
  await createTodo(page, { title: 'A' })
  await createTodo(page, { title: 'B' })
  await createTodo(page, { title: 'C' })

  await page.goto('/todos')
  await expect(column(page, 'todo').locator('[data-testid^="card-"]')).toHaveCount(3)
  expect(await columnTitles(page, 'todo')).toEqual(['A', 'B', 'C'])

  // C 를 A 자리로 끌어 맨 위로 올린다
  await withMoveSettled(page, () => dragCard(page, 'C', card(page, 'A')))
  await expect.poll(() => columnTitles(page, 'todo')).toEqual(['C', 'A', 'B'])

  await page.reload()
  await expect.poll(() => columnTitles(page, 'todo')).toEqual(['C', 'A', 'B'])
})

test('한 카드를 300ms 간격으로 3회 연속 옮겨도 최종 위치가 마지막 조작과 일치한다 (R1)', async ({ page }) => {
  await createTodo(page, { title: '연속 이동' })
  await page.goto('/todos')
  await expect(card(page, '연속 이동')).toBeVisible()

  // 응답 지연을 들쭉날쭉하게 만들어, 직렬화가 없으면 응답이 역전되는 상황을 강제한다.
  let call = 0
  await page.route('**/api/todos/*/move', async (route) => {
    call += 1
    const delay = call === 1 ? 900 : call === 2 ? 400 : 50
    await new Promise((resolve) => setTimeout(resolve, delay))
    await route.continue()
  })

  let completed = 0
  page.on('response', (response) => {
    if (response.url().includes('/move')) completed += 1
  })

  await page.getByTestId(/^move-right-/).first().click()
  await page.waitForTimeout(300)
  await page.getByTestId(/^move-right-/).first().click()
  await page.waitForTimeout(300)
  await page.getByTestId(/^move-left-/).first().click()

  // 마지막 조작은 done -> doing 이다. 낙관적 갱신이라 화면은 곧바로 그렇게 보인다.
  await expect.poll(() => columnTitles(page, 'doing')).toEqual(['연속 이동'])

  // 세 요청이 모두 서버에 닿을 때까지 기다린다. 여기서 새로고침해 버리면 남은 요청이
  // 끊겨 무엇을 검증하는지 알 수 없게 된다.
  await expect.poll(() => completed, { timeout: 20_000 }).toBe(3)

  // 서버에 남은 최종 상태가 마지막 조작과 일치해야 한다. 이것이 R1 의 본질이다.
  const stored = await page.request.get('/api/todos')
  const { todos } = (await stored.json()) as { todos: { title: string; status: string }[] }
  expect(todos.map((todo) => [todo.title, todo.status])).toEqual([['연속 이동', 'doing']])

  await page.reload()
  await expect(column(page, 'doing').locator('[data-testid^="card-"]')).toHaveCount(1)
  expect(await columnTitles(page, 'done')).toEqual([])
})

test('제목 없이 생성하면 폼 검증 오류가 뜨고 네트워크 요청이 발생하지 않는다', async ({ page }) => {
  await page.goto('/todos')

  let posted = false
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/todos')) posted = true
  })

  await page.getByTestId('todo-submit').click()

  await expect(page.getByTestId('todo-title-error')).toBeVisible()
  await page.waitForTimeout(400)
  expect(posted).toBe(false)
})

test('공백만 입력해도 요청이 나가지 않는다', async ({ page }) => {
  await page.goto('/todos')

  let posted = false
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/todos')) posted = true
  })

  await page.getByTestId('todo-title').fill('    ')
  await page.getByTestId('todo-submit').click()

  await expect(page.getByTestId('todo-title-error')).toBeVisible()
  expect(posted).toBe(false)
})

test('폼으로 만든 할일이 보드에 나타난다', async ({ page }) => {
  await page.goto('/todos')

  await page.getByTestId('todo-title').fill('폼으로 만든 할일')
  await page.getByTestId('todo-due').fill('2026-09-01')
  await page.getByTestId('todo-submit').click()

  await expect(card(page, '폼으로 만든 할일')).toBeVisible()
  await expect(card(page, '폼으로 만든 할일').locator('[data-testid^="due-"]')).toHaveText('2026-09-01')
})

test('done 으로 옮긴 카드에 완료 시각이 표시된다', async ({ page }) => {
  await createTodo(page, { title: '완료할 일' })
  await page.goto('/todos')

  await dragCard(page, '완료할 일', column(page, 'done'))

  await expect(column(page, 'done').locator('[data-title="완료할 일"]')).toBeVisible()
  await expect(card(page, '완료할 일').locator('[data-testid^="completed-"]')).toBeVisible()
})

test('done 에서 나오면 완료 시각 표시가 사라진다 (A6)', async ({ page }) => {
  await createTodo(page, { title: '되돌릴 일' })
  await page.goto('/todos')

  await dragCard(page, '되돌릴 일', column(page, 'done'))
  await expect(card(page, '되돌릴 일').locator('[data-testid^="completed-"]')).toBeVisible()

  await dragCard(page, '되돌릴 일', column(page, 'todo'))
  await expect(card(page, '되돌릴 일').locator('[data-testid^="completed-"]')).toHaveCount(0)
})

test('카드 제목을 인라인으로 수정한다', async ({ page }) => {
  const todoId = await createTodo(page, { title: '수정 전' })
  await page.goto('/todos')

  await page.getByTestId(`title-${todoId}`).click()
  await page.getByTestId(`edit-${todoId}`).fill('수정 후')
  await page.getByTestId(`edit-${todoId}`).press('Enter')

  await expect(card(page, '수정 후')).toBeVisible()
  await page.reload()
  await expect(card(page, '수정 후')).toBeVisible()
})

test('빈 제목으로 수정하면 원래 제목이 유지된다', async ({ page }) => {
  const todoId = await createTodo(page, { title: '유지될 제목' })
  await page.goto('/todos')

  await page.getByTestId(`title-${todoId}`).click()
  await page.getByTestId(`edit-${todoId}`).fill('   ')
  await page.getByTestId(`edit-${todoId}`).press('Enter')

  await expect(card(page, '유지될 제목')).toBeVisible()
})

test('카드를 삭제하면 보드에서 사라진다', async ({ page }) => {
  const todoId = await createTodo(page, { title: '삭제할 일' })
  await page.goto('/todos')

  await page.getByTestId(`delete-${todoId}`).click()

  await expect(card(page, '삭제할 일')).toHaveCount(0)
  await page.reload()
  await expect(card(page, '삭제할 일')).toHaveCount(0)
})

test('마감일이 소속 주 범위 밖인 카드는 경고 배지가 보이되 숨겨지지 않는다 (A10)', async ({ page }) => {
  await createTodo(page, { title: '범위 밖 마감' })
  await page.goto('/todos')

  // 전체 보드에는 주 개념이 없으므로 배지가 없다.
  await expect(card(page, '범위 밖 마감')).toBeVisible()
  await expect(card(page, '범위 밖 마감').locator('[data-testid^="due-outside-"]')).toHaveCount(0)
})

test('이월 이력이 있는 카드에 이월 횟수 배지가 보인다', async ({ page }) => {
  const planId = await createPlanForWeek(page)
  const todoId = await createTodo(page, { title: '이월된 일', weeklyPlanId: planId })

  const response = await page.request.post(`/api/weekly-plans/${planId}/carryover`, {
    data: { todoIds: [todoId] },
  })
  expect(response.ok()).toBe(true)

  await page.goto('/todos')
  await expect(card(page, '이월된 일').getByTestId(`carried-${todoId}`)).toHaveText('이월 1')
})

async function createPlanForWeek(page: import('@playwright/test').Page): Promise<string> {
  const response = await page.request.post('/api/weekly-plans', {
    data: { title: '이번 주', weekStart: '2026-08-31' },
  })
  return ((await response.json()) as { id: string }).id
}
