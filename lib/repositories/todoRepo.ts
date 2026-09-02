import type { FilterQuery } from 'mongoose'
import { connectDb } from '@/lib/db'
import { toKstDateOnly, todayKst, weekStartOf } from '@/lib/date'
import { computePosition, needsRebalance, rebalance } from '@/lib/position'
import { filterDayView, withDueOutsideWeek } from '@/lib/views'
import { Todo, WeeklyPlan } from '@/models'
import type { TodoDoc, TodoStatus } from '@/models/types'
import { NotFoundError, activeFilter, toObjectId, toObjectIdOrNull } from './shared'

export interface CreateTodoInput {
  title: string
  dueDate?: string | Date | null
  status?: TodoStatus
  weeklyPlanId?: string | null
}

export interface UpdateTodoInput {
  title?: string
  dueDate?: string | Date | null
  /**
   * 주간 계획 재지정. 이월과 달리 carriedFrom 을 절대 건드리지 않는다.
   * 두 연산은 겉보기에 같지만 진행률 의미가 정반대다 (PLAN §5).
   */
  weeklyPlanId?: string | null
}

export interface MoveTodoInput {
  toStatus: TodoStatus
  /** 놓을 자리 바로 위 카드 */
  beforeId?: string | null
  /** 놓을 자리 바로 아래 카드 */
  afterId?: string | null
}

/** 같은 상태 열 안에서 맨 뒤 position 을 구한다. 열이 비어 있으면 null */
async function maxPositionOf(ownerId: string, status: TodoStatus): Promise<number | null> {
  const last = await Todo.findOne(activeFilter(ownerId, { status })).sort({ position: -1 }).select('position').lean()
  return last?.position ?? null
}

/**
 * 정밀도가 소진된 열을 1024 배수로 재배치한다 (PLAN §4.3).
 * 멱등하므로 부분 적용되어도 재실행으로 복구된다. 트랜잭션이 필요 없는 이유다 (§3.1).
 */
async function rebalanceColumn(ownerId: string, status: TodoStatus): Promise<void> {
  const column = await Todo.find(activeFilter(ownerId, { status })).sort({ position: 1 }).select('position').lean()
  if (column.length === 0) return

  const operations = rebalance(column).map(({ item, position }) => ({
    updateOne: { filter: { _id: item._id }, update: { $set: { position } } },
  }))

  await Todo.bulkWrite(operations)
}

async function positionAt(
  ownerId: string,
  status: TodoStatus,
  beforeId?: string | null,
  afterId?: string | null,
): Promise<number> {
  const [before, after] = await Promise.all([
    beforeId ? Todo.findOne(activeFilter(ownerId, { _id: toObjectId(beforeId) })).select('position').lean() : null,
    afterId ? Todo.findOne(activeFilter(ownerId, { _id: toObjectId(afterId) })).select('position').lean() : null,
  ])

  const beforePosition = before?.position ?? null
  const afterPosition = after?.position ?? null

  if (!needsRebalance(beforePosition, afterPosition)) {
    return computePosition(beforePosition, afterPosition)
  }

  // 간격이 소진됐다. 열을 재배치하고 이웃 값을 다시 읽어 계산한다.
  await rebalanceColumn(ownerId, status)
  const [freshBefore, freshAfter] = await Promise.all([
    beforeId ? Todo.findOne(activeFilter(ownerId, { _id: toObjectId(beforeId) })).select('position').lean() : null,
    afterId ? Todo.findOne(activeFilter(ownerId, { _id: toObjectId(afterId) })).select('position').lean() : null,
  ])
  return computePosition(freshBefore?.position ?? null, freshAfter?.position ?? null)
}

export async function createTodo(ownerId: string, input: CreateTodoInput): Promise<TodoDoc> {
  await connectDb()

  const status = input.status ?? 'todo'
  const maxPosition = await maxPositionOf(ownerId, status)

  const created = await Todo.create({
    userId: toObjectId(ownerId),
    title: input.title,
    // 저장되는 날짜는 예외 없이 KST 자정으로 정규화한다 (PLAN R9)
    dueDate: input.dueDate ? toKstDateOnly(input.dueDate) : null,
    status,
    position: computePosition(maxPosition, null),
    weeklyPlanId: toObjectIdOrNull(input.weeklyPlanId ?? null),
    completedAt: status === 'done' ? new Date() : null,
  })

  return created.toObject()
}

export async function getTodo(ownerId: string, id: string): Promise<TodoDoc> {
  await connectDb()
  const found = await Todo.findOne(activeFilter(ownerId, { _id: toObjectId(id) })).lean()
  if (!found) throw new NotFoundError('할일')
  return found
}

export async function updateTodo(ownerId: string, id: string, patch: UpdateTodoInput): Promise<TodoDoc> {
  await connectDb()

  const update: Partial<Pick<TodoDoc, 'title' | 'dueDate' | 'weeklyPlanId'>> = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.dueDate !== undefined) update.dueDate = patch.dueDate === null ? null : toKstDateOnly(patch.dueDate)
  if (patch.weeklyPlanId !== undefined) update.weeklyPlanId = toObjectIdOrNull(patch.weeklyPlanId)

  const updated = await Todo.findOneAndUpdate(
    activeFilter(ownerId, { _id: toObjectId(id) }),
    { $set: update },
    { new: true },
  ).lean()
  if (!updated) throw new NotFoundError('할일')
  return updated
}

/**
 * 상태 + 순서 + 완료 시각을 단일 문서 갱신으로 처리한다.
 * MongoDB 는 단일 문서 갱신이 원자적이므로 트랜잭션이 필요 없다 (PLAN §3.1).
 * 낙관적 업데이트의 롤백 단위이기도 하다.
 */
export async function moveTodo(ownerId: string, id: string, input: MoveTodoInput): Promise<TodoDoc> {
  await connectDb()

  const objectId = toObjectId(id)
  const current = await Todo.findOne(activeFilter(ownerId, { _id: objectId })).lean()
  if (!current) throw new NotFoundError('할일')

  const position = await positionAt(ownerId, input.toStatus, input.beforeId, input.afterId)

  // done 으로 들어가면 완료 시각을 찍고, done 에서 나오면 지운다 (PLAN A6).
  // 이미 done 인 채로 열 안에서만 움직이면 원래 시각을 보존한다.
  const completedAt =
    input.toStatus === 'done' ? (current.status === 'done' ? current.completedAt : new Date()) : null

  const updated = await Todo.findOneAndUpdate(
    activeFilter(ownerId, { _id: objectId }),
    { $set: { status: input.toStatus, position, completedAt } },
    { new: true },
  ).lean()

  if (!updated) throw new NotFoundError('할일')
  return updated
}

export async function softDeleteTodo(ownerId: string, id: string): Promise<void> {
  await connectDb()
  const result = await Todo.updateOne(
    activeFilter(ownerId, { _id: toObjectId(id) }),
    { $set: { deletedAt: new Date() } },
  )
  if (result.matchedCount === 0) throw new NotFoundError('할일')
}

export async function listAllActive(ownerId: string): Promise<TodoDoc[]> {
  await connectDb()
  return Todo.find(activeFilter(ownerId)).sort({ status: 1, position: 1 }).lean()
}

/** 일일 뷰 (PLAN §4.4.2). 오늘 마감 + 지연 미완료 + 진행 중 */
export async function listForDay(ownerId: string, date: string | Date = new Date()): Promise<TodoDoc[]> {
  await connectDb()

  const today = todayKst(typeof date === 'string' ? toKstDateOnly(date) : date)
  const query: FilterQuery<TodoDoc> = activeFilter(ownerId, {
    $or: [{ status: 'doing' }, { dueDate: { $lte: today } }],
  })

  const candidates = await Todo.find(query).sort({ status: 1, position: 1 }).lean()
  // 경계 판정은 순수 함수에 위임해 쿼리와 규칙이 어긋나지 않게 한다.
  return filterDayView(candidates, today)
}

/**
 * 한 주간 계획에 지금 소속된 할일 (이월돼 나간 것은 제외).
 * 할일을 만들 때 "이 계획에 이미 뭐가 있는지" 를 보여 주는 데 쓴다.
 */
export async function listByPlan(ownerId: string, planId: string): Promise<TodoDoc[]> {
  await connectDb()
  return Todo.find(activeFilter(ownerId, { weeklyPlanId: toObjectId(planId) }))
    .sort({ status: 1, position: 1 })
    .lean()
}

/** 미분류 인박스 (PLAN §4.6) */
export async function listInbox(ownerId: string): Promise<TodoDoc[]> {
  await connectDb()
  return Todo.find(activeFilter(ownerId, { weeklyPlanId: null })).sort({ status: 1, position: 1 }).lean()
}

/**
 * 주간 뷰 조회용 원본 (PLAN §4.4.1 / A9).
 * 소속 기준이며, 진행률 분모 계산을 위해 "이 주에서 이월돼 나간" 할일까지 함께 가져온다.
 */
export async function listForPlans(ownerId: string, planIds: readonly string[]): Promise<TodoDoc[]> {
  await connectDb()
  if (planIds.length === 0) return []

  const objectIds = planIds.map(toObjectId)
  return Todo.find(
    activeFilter(ownerId, { $or: [{ weeklyPlanId: { $in: objectIds } }, { carriedFrom: { $in: objectIds } }] }),
  )
    .sort({ status: 1, position: 1 })
    .lean()
}

export type WeekViewTodoDoc = TodoDoc & { dueOutsideWeek: boolean }

export interface WeekView {
  weekStart: Date
  planIds: string[]
  /** 이 주 계획에 지금 소속된 할일. 칸반에 렌더된다 */
  todos: WeekViewTodoDoc[]
  /**
   * 이 주에서 이월돼 나간 할일. 더 이상 이 주 소속이 아니므로 칸반에는 넣지 않지만,
   * 진행률 분모에는 계속 잡히므로(PLAN §4.1.1 / A8) 숫자의 근거로 함께 돌려준다.
   */
  carriedOut: TodoDoc[]
}

/**
 * 주 시작일로 그 주의 할일을 모은다 (PLAN §4.4.1 / A9).
 *
 * 소속 기준이다. 마감일이 그 주 범위를 벗어난 항목도 빼지 않고 dueOutsideWeek
 * 플래그만 붙인다. 이월된 할일과 장기 과제가 정상적으로 불일치를 만들기 때문이다 (A10).
 */
export async function listForWeek(ownerId: string, weekStart: string | Date): Promise<WeekView> {
  await connectDb()

  const start = weekStartOf(weekStart)
  const plans = await WeeklyPlan.find(activeFilter(ownerId, { weekStart: start })).select('_id').lean()
  const planIds = plans.map((plan) => plan._id.toString())
  const planIdSet = new Set(planIds)

  // listForPlans 는 분모 계산을 위해 "이월돼 나간" 할일까지 함께 가져온다.
  // 화면에서는 둘을 섞으면 안 된다. 이월된 카드가 아직 이 주에 있는 것처럼 보인다.
  const related = await listForPlans(ownerId, planIds)
  const members: TodoDoc[] = []
  const carriedOut: TodoDoc[] = []

  for (const todo of related) {
    const owner = todo.weeklyPlanId?.toString()
    if (owner !== undefined && planIdSet.has(owner)) members.push(todo)
    else carriedOut.push(todo)
  }

  return { weekStart: start, planIds, todos: withDueOutsideWeek(members, start), carriedOut }
}
