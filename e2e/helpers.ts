import { expect, type Locator, type Page } from '@playwright/test'

/** locator.boundingBox() 의 반환형. 화면 밖이면 null 이다 */
type Box = { x: number; y: number; width: number; height: number } | null

export const STUB_URL = process.env.GITHUB_STUB_URL ?? 'http://127.0.0.1:3199'

/**
 * GitHub 로그인 (docs/LOGIN.md).
 *
 * 실제 GitHub 대신 스텁이 곧바로 콜백으로 돌려보내므로, /auth/github 로 한 번 이동하면
 * 리다이렉트 사슬을 타고 로그인이 끝난다. 스텁에 "누구로 로그인할지" 를 먼저 알려 준다.
 */
export async function loginAs(page: Page, login = 'e2e-user', githubId = 1001): Promise<void> {
  const set = await page.request.post(`${STUB_URL}/__set-user`, { data: { login, id: githubId } })
  expect(set.ok(), await set.text()).toBe(true)

  await page.goto('/auth/github')
  // /auth/github -> 스텁 authorize -> /auth/github/callback -> /
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/') && url.pathname !== '/login')
}

/** 화면의 로그아웃 버튼을 누른다. 사이드바가 보이는 폭에서만 노출된다. */
export async function logoutViaUi(page: Page): Promise<void> {
  await page.getByTestId('logout').click()
  await page.waitForURL(/\/login$/)
}

/**
 * E2E 는 todo-e2e 데이터베이스를 쓴다 (playwright.config.ts 의 webServer env).
 * 테스트끼리 간섭하지 않도록 매 케이스 시작 시 전부 비운다.
 */
export async function resetData(page: Page): Promise<void> {
  const response = await page.request.get('/api/todos')
  // 여기서 실패하면 대개 서버가 DB 에 붙지 못한 것이다. 본문을 그대로 보여 준다.
  expect(response.ok(), `GET /api/todos 실패: ${await response.text()}`).toBe(true)
  const { todos } = (await response.json()) as { todos: { id: string }[] }
  for (const todo of todos) {
    await page.request.delete(`/api/todos/${todo.id}`)
  }

  const plans = await page.request.get('/api/weekly-plans')
  const { plans: planList } = (await plans.json()) as { plans: { id: string }[] }
  for (const plan of planList) {
    await page.request.delete(`/api/weekly-plans/${plan.id}`)
  }

  const goals = await page.request.get('/api/goals')
  const { goals: goalList } = (await goals.json()) as { goals: { goal: { id: string } }[] }
  for (const entry of goalList) {
    await page.request.delete(`/api/goals/${entry.goal.id}`)
  }
}

export async function createTodo(
  page: Page,
  payload: { title: string; dueDate?: string | null; weeklyPlanId?: string | null },
): Promise<string> {
  const response = await page.request.post('/api/todos', { data: payload })
  expect(response.status(), await response.text()).toBe(201)
  return ((await response.json()) as { id: string }).id
}

export async function createPlan(
  page: Page,
  payload: { title: string; weekStart: string; goalId?: string | null },
): Promise<string> {
  const response = await page.request.post('/api/weekly-plans', { data: payload })
  expect(response.status(), await response.text()).toBe(201)
  return ((await response.json()) as { id: string }).id
}

export async function createGoal(
  page: Page,
  payload: { title: string; year: number; startDate: string; endDate: string },
): Promise<string> {
  const response = await page.request.post('/api/goals', { data: payload })
  expect(response.status(), await response.text()).toBe(201)
  return ((await response.json()) as { id: string }).id
}

export async function moveTodoApi(
  page: Page,
  id: string,
  toStatus: 'todo' | 'doing' | 'done',
): Promise<void> {
  const response = await page.request.post(`/api/todos/${id}/move`, { data: { toStatus } })
  expect(response.ok(), await response.text()).toBe(true)
}

/**
 * dnd-kit 은 포인터 이벤트로 동작한다. Playwright 의 dragTo 는 중간 이동이 없어
 * activationConstraint 를 넘기지 못하는 경우가 있으므로 단계적으로 직접 움직인다.
 */
/**
 * 요소를 화면 세로 한가운데로 올린다.
 * dnd-kit 의 자동 스크롤은 뷰포트 위아래 가장자리 근처에서 발동하는데, 드래그 도중
 * 페이지가 스크롤되면 미리 읽어 둔 좌표가 전부 무의미해진다.
 */
async function centerInViewport(locator: Locator): Promise<void> {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }))
}

export async function dragTo(page: Page, source: Locator, target: Locator): Promise<void> {
  // page.mouse 는 좌표를 뷰포트 기준으로 해석하지만 boundingBox 는 문서 기준이다.
  // 화면 밖 요소를 그대로 끌면 엉뚱한 위치에 이벤트가 떨어져 드래그가 아예 시작되지 않는다.
  await centerInViewport(target)
  await centerInViewport(source)

  const from = await source.boundingBox()
  // 목적지 좌표는 드래그 시작 전에 읽는다. 드래그 중에는 sortable 이 항목을 밀어내므로
  // 그때 다시 읽으면 사용자가 조준한 자리가 아니라 밀려난 자리를 가리키게 된다.
  const to = await target.boundingBox()
  if (!from || !to) throw new Error('드래그 대상의 위치를 찾지 못했습니다')

  const viewport = page.viewportSize()
  if (viewport && (from.y < 0 || from.y + from.height > viewport.height)) {
    throw new Error(`출발점이 뷰포트 밖입니다 (y=${from.y}). 스크롤 후에도 보이지 않습니다.`)
  }

  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()

  // 활성화 임계(5px)를 넘긴 뒤 여러 단계로 나눠 이동한다.
  await page.mouse.move(start.x + 12, start.y + 12, { steps: 4 })
  await page.mouse.move(end.x, end.y, { steps: 12 })
  // 같은 지점에서 한 번 더 움직여 충돌 판정이 최종 위치를 보게 한다.
  await page.mouse.move(end.x, end.y, { steps: 2 })
  // dnd-kit 은 이동을 rAF 로 처리한다. 곧바로 놓으면 마지막 위치가 반영되기 전에
  // 드롭이 끝나 항목이 제자리로 돌아간다.
  await page.waitForTimeout(80)

  await page.mouse.up()
}

/**
 * 낙관적 갱신 때문에 화면은 드롭 즉시 바뀌지만 요청은 아직 날아가는 중이다.
 * 이 상태에서 새로고침하면 요청이 끊겨 "저장되지 않았다"는 잘못된 실패가 난다.
 * 새로고침으로 영속을 확인하려는 테스트는 반드시 이 헬퍼로 응답을 기다린다.
 */
export async function withMoveSettled(page: Page, action: () => Promise<void>): Promise<void> {
  await withApiSettled(page, (url, method) => url.includes('/move') && method === 'POST', action)
}

/**
 * 어떤 API 응답이든 기다린다. 낙관적 갱신 때문에 화면은 즉시 바뀌지만 요청은 진행 중이므로,
 * 그 상태로 reload() 하면 요청이 끊겨 "저장되지 않았다" 처럼 보인다.
 */
export async function withApiSettled(
  page: Page,
  matches: (url: string, method: string) => boolean,
  action: () => Promise<unknown>,
): Promise<void> {
  const settled = page.waitForResponse((response) => matches(response.url(), response.request().method()))
  await action()
  await settled
}

/**
 * 카드를 끌어다 놓는다.
 *
 * 포인터는 손잡이에서 시작하지만, 충돌 판정(closestCenter)이 보는 것은
 * "끌려가는 카드 사각형의 중심" 이다. 손잡이는 카드 위쪽에 있으므로 포인터를 그냥
 * 목적지 중심으로 옮기면 카드 중심은 목적지보다 아래에 놓여 자기 자리로 되돌아간다.
 * 그래서 이동량을 카드 사각형 기준으로 계산한다.
 */
export async function dragCard(page: Page, title: string, target: Locator): Promise<void> {
  const source = cardHandle(page, title)
  const body = card(page, title)

  // dnd-kit 은 뷰포트 가장자리 근처에서 자동 스크롤을 시작한다. 화면 아래쪽에 있는
  // 카드를 그대로 끌면 드래그 도중 페이지가 스크롤되어 절대 좌표가 통째로 어긋난다.
  // 조작 대상을 화면 한가운데로 올려 자동 스크롤 영역을 피한다.
  await centerInViewport(body)

  const [handleBox, cardBox, targetBox] = await Promise.all([
    source.boundingBox(),
    body.boundingBox(),
    target.boundingBox(),
  ])
  if (!handleBox || !cardBox || !targetBox) throw new Error('드래그 대상의 위치를 찾지 못했습니다')

  const point = (handle: Box, body: Box, target: Box) => {
    if (!handle || !body || !target) throw new Error('드래그 대상의 위치를 찾지 못했습니다')
    const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }
    return {
      start: from,
      end: {
        x: from.x + (target.x + target.width / 2 - (body.x + body.width / 2)),
        y: from.y + (target.y + target.height / 2 - (body.y + body.height / 2)),
      },
    }
  }

  let { start, end } = point(handleBox, cardBox, targetBox)

  // 출발점만 화면 가운데로 올려서는 부족하다. 카드가 커지거나 섹션 여백이 넓어지면
  // 목적지가 뷰포트 밖으로 밀려나고, 그러면 포인터가 화면 밖을 겨냥해 드롭이 통째로
  // 무시된다. 60초 타임아웃으로 나타나서 원인을 알아보기 어렵다.
  const viewport = page.viewportSize()
  if (viewport) {
    const overflow =
      end.y < 0 ? end.y - 8 : end.y > viewport.height ? end.y - viewport.height + 8 : 0

    if (overflow !== 0) {
      await page.evaluate((dy) => window.scrollBy(0, dy), overflow)
      const [h2, c2, t2] = await Promise.all([
        source.boundingBox(),
        body.boundingBox(),
        target.boundingBox(),
      ])
      ;({ start, end } = point(h2, c2, t2))
    }

    for (const [name, p] of [['출발점', start], ['목적지', end]] as const) {
      if (p.y < 0 || p.y > viewport.height) {
        throw new Error(`${name}이 뷰포트 밖입니다 (y=${Math.round(p.y)}). 스크롤해도 보이지 않습니다.`)
      }
    }
  }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 12, start.y + 12, { steps: 4 })
  await page.mouse.move(end.x, end.y, { steps: 12 })
  await page.mouse.move(end.x, end.y, { steps: 2 })
  await page.waitForTimeout(80)
  await page.mouse.up()
}

/**
 * 브라우저 기준 이번 주(또는 offset 주) 월요일을 'YYYY-MM-DD' 로 돌려준다.
 * 테스트가 특정 날짜에 고정되지 않도록 실제 오늘을 기준으로 계산한다.
 */
export async function mondayOf(page: Page, weekOffset = 0): Promise<string> {
  return page.evaluate((offset) => {
    const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
    const weekday = kstNow.getUTCDay()
    return new Date(
      Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() - ((weekday + 6) % 7) + offset * 7),
    )
      .toISOString()
      .slice(0, 10)
  }, weekOffset)
}

export function card(page: Page, title: string): Locator {
  return page.locator(`[data-testid^="card-"][data-title="${title}"]`)
}

/**
 * dnd-kit 의 드래그 리스너는 손잡이 버튼에만 붙어 있다.
 * 카드 본문에서 끌면 아무 일도 일어나지 않으므로 항상 손잡이를 잡는다.
 */
export function cardHandle(page: Page, title: string): Locator {
  return card(page, title).locator('[data-testid^="handle-"]')
}

export function column(page: Page, status: 'todo' | 'doing' | 'done'): Locator {
  return page.getByTestId(`column-${status}`)
}

/** 특정 열에 담긴 카드 제목을 화면 순서대로 반환한다. */
export async function columnTitles(page: Page, status: 'todo' | 'doing' | 'done'): Promise<string[]> {
  return column(page, status).locator('[data-testid^="card-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-title') ?? ''),
  )
}
