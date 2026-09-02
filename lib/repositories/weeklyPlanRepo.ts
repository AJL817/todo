import { connectDb } from '@/lib/db'
import { addWeeks, weekStartOf } from '@/lib/date'
import { applyCarryOver, selectCarryOverTargets, type CarryOverSkipReason, decideCarryOver } from '@/lib/carryover'
import { computePosition } from '@/lib/position'
import { doneCount, weeklyDenominator, weeklyProgress } from '@/lib/progress'
import { Todo, WeeklyPlan } from '@/models'
import type { TodoDoc, TodoStatus, WeeklyPlanDoc } from '@/models/types'
import { NotFoundError, activeFilter, toObjectId, toObjectIdOrNull, toProgressTodo } from './shared'
import { listForPlans } from './todoRepo'

export interface CreateWeeklyPlanInput {
  title: string
  weekStart: string | Date
  goalId?: string | null
}

export interface UpdateWeeklyPlanInput {
  title?: string
  weekStart?: string | Date
  goalId?: string | null
}

export interface PlanProgress {
  percent: number
  done: number
  denominator: number
}

export async function createWeeklyPlan(ownerId: string, input: CreateWeeklyPlanInput): Promise<WeeklyPlanDoc> {
  await connectDb()

  const created = await WeeklyPlan.create({
    userId: toObjectId(ownerId),
    title: input.title,
    // 주 시작일은 항상 그 주의 월요일 KST 자정으로 접는다.
    weekStart: weekStartOf(input.weekStart),
    goalId: toObjectIdOrNull(input.goalId ?? null),
  })

  return created.toObject()
}

export async function getWeeklyPlan(ownerId: string, id: string): Promise<WeeklyPlanDoc> {
  await connectDb()
  const found = await WeeklyPlan.findOne(activeFilter(ownerId, { _id: toObjectId(id) })).lean()
  if (!found) throw new NotFoundError('주간 계획')
  return found
}

export async function updateWeeklyPlan(
  ownerId: string,
  id: string,
  patch: UpdateWeeklyPlanInput,
): Promise<WeeklyPlanDoc> {
  await connectDb()

  const update: Partial<Pick<WeeklyPlanDoc, 'title' | 'weekStart' | 'goalId'>> = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.weekStart !== undefined) update.weekStart = weekStartOf(patch.weekStart)
  if (patch.goalId !== undefined) update.goalId = toObjectIdOrNull(patch.goalId)

  const updated = await WeeklyPlan.findOneAndUpdate(
    activeFilter(ownerId, { _id: toObjectId(id) }),
    { $set: update },
    { new: true },
  ).lean()

  if (!updated) throw new NotFoundError('주간 계획')
  return updated
}

/**
 * 소프트 삭제. 하위 할일은 연쇄 삭제하지 않고 미분류로 전환한다 (PRD P0).
 *
 * 하위 FK 를 먼저 끊고 상위 deletedAt 을 나중에 쓴다. 중간에 실패해도 하위는 이미
 * 미분류 상태로 살아 있어 PRD 가 요구하는 최종 상태와 같으므로, 실패 모드가 양성이다.
 * 그래서 트랜잭션이 필요 없다 (PLAN §3.1).
 */
export async function softDeleteWeeklyPlanWithDetach(
  ownerId: string,
  id: string,
): Promise<{ detachedTodos: number }> {
  await connectDb()

  const objectId = toObjectId(id)
  const plan = await WeeklyPlan.findOne(activeFilter(ownerId, { _id: objectId })).lean()
  if (!plan) throw new NotFoundError('주간 계획')

  const detached = await Todo.updateMany(activeFilter(ownerId, { weeklyPlanId: objectId }), {
    $set: { weeklyPlanId: null },
  })

  await WeeklyPlan.updateOne(activeFilter(ownerId, { _id: objectId }), { $set: { deletedAt: new Date() } })

  return { detachedTodos: detached.modifiedCount }
}

export interface ListWeeklyPlanFilter {
  weekStart?: string | Date
  goalId?: string | null
  /** goalId 조건을 "미분류만" 으로 쓰고 싶을 때 */
  unassignedOnly?: boolean
}

export async function listWeeklyPlans(ownerId: string, filter: ListWeeklyPlanFilter = {}): Promise<WeeklyPlanDoc[]> {
  await connectDb()

  const query: Record<string, unknown> = {}
  if (filter.weekStart !== undefined) query.weekStart = weekStartOf(filter.weekStart)
  if (filter.unassignedOnly) query.goalId = null
  else if (filter.goalId !== undefined) query.goalId = toObjectIdOrNull(filter.goalId)

  return WeeklyPlan.find(activeFilter(ownerId, query)).sort({ weekStart: 1, createdAt: 1 }).lean()
}

/**
 * 계획별 진행률. 분모에는 "지금 소속된 할일"과 "이 주에서 이월돼 나간 할일"이 함께 들어간다
 * (PLAN §4.1.1). 그래서 소속 할일만 조회해서는 계산할 수 없다.
 */
export async function progressForPlans(
  ownerId: string,
  planIds: readonly string[],
): Promise<Map<string, PlanProgress>> {
  const result = new Map<string, PlanProgress>()
  if (planIds.length === 0) return result

  const todos = await listForPlans(ownerId, planIds)
  const progressTodos = todos.map(toProgressTodo)

  for (const planId of planIds) {
    result.set(planId, {
      percent: weeklyProgress({ id: planId }, progressTodos),
      done: doneCount(planId, progressTodos),
      denominator: weeklyDenominator(planId, progressTodos),
    })
  }

  return result
}

export interface CarryOverSkip {
  id: string
  reason: CarryOverSkipReason
}

export interface CarryOverResult {
  targetPlanId: string
  targetWeekStart: Date
  /** 실제로 이월된 할일 id */
  carriedIds: string[]
  skipped: CarryOverSkip[]
  /** 대상 주 계획을 이번 호출에서 새로 만들었는지 */
  createdTargetPlan: boolean
}

const toCarryOverTodo = (doc: TodoDoc) => ({
  id: doc._id.toString(),
  status: doc.status,
  weeklyPlanId: doc.weeklyPlanId === null ? null : doc.weeklyPlanId.toString(),
  carriedFrom: doc.carriedFrom.map((planId) => planId.toString()),
  deletedAt: doc.deletedAt,
})

/** 이월 다이얼로그가 실행 전에 보여 줄 대상 목록 (PLAN §4.5) */
export async function carryOverPreview(ownerId: string, planId: string): Promise<TodoDoc[]> {
  await connectDb()

  const objectId = toObjectId(planId)
  const plan = await WeeklyPlan.findOne(activeFilter(ownerId, { _id: objectId })).lean()
  if (!plan) throw new NotFoundError('주간 계획')

  const todos = await Todo.find(activeFilter(ownerId, { weeklyPlanId: objectId }))
    .sort({ status: 1, position: 1 })
    .lean()
  const eligibleIds = new Set(selectCarryOverTargets(todos.map(toCarryOverTodo), planId).map((t) => t.id))

  return todos.filter((todo) => eligibleIds.has(todo._id.toString()))
}

/**
 * 대상 주의 계획을 찾거나 만든다.
 * 제목과 목표 연결을 승계한다. 목표 연결이 끊긴 채 이월되면 진행률 반영에서
 * 누락되기 때문이다 (PLAN §4.5).
 */
async function resolveTargetPlan(
  ownerId: string,
  source: WeeklyPlanDoc,
  targetWeekStart: Date,
): Promise<{ plan: WeeklyPlanDoc; created: boolean }> {
  const existing = await WeeklyPlan.findOne(
    activeFilter(ownerId, { weekStart: targetWeekStart, title: source.title, goalId: source.goalId }),
  ).lean()

  if (existing) return { plan: existing, created: false }

  const created = await WeeklyPlan.create({
    userId: toObjectId(ownerId),
    title: source.title,
    weekStart: targetWeekStart,
    goalId: source.goalId,
  })

  return { plan: created.toObject(), created: true }
}

/**
 * 미완료 할일을 다음 주로 일괄 이월한다 (PLAN §4.5, A8).
 *
 * 할일별 갱신이 서로 독립이고 멱등이라 트랜잭션이 필요 없다. 부분 적용되면 일부만
 * 이월된 상태로 남고, 재실행으로 나머지가 처리된다 (PLAN §3.1).
 */
export async function carryOverBatch(
  ownerId: string,
  planId: string,
  todoIds: readonly string[],
): Promise<CarryOverResult> {
  await connectDb()

  const sourceId = toObjectId(planId)
  const source = await WeeklyPlan.findOne(activeFilter(ownerId, { _id: sourceId })).lean()
  if (!source) throw new NotFoundError('주간 계획')

  const targetWeekStart = addWeeks(source.weekStart, 1)
  const { plan: target, created } = await resolveTargetPlan(ownerId, source, targetWeekStart)
  const targetPlanId = target._id.toString()

  // 남의 할일 id 를 섞어 보내도 소유자 필터에서 걸러진다.
  const requested = await Todo.find(activeFilter(ownerId, { _id: { $in: todoIds.map(toObjectId) } })).lean()

  // 이월된 카드는 대상 주의 같은 상태 열 맨 뒤에 붙는다.
  const nextPosition = new Map<TodoStatus, number>()
  for (const status of ['todo', 'doing', 'done'] as const) {
    const last = await Todo.findOne(activeFilter(ownerId, { status })).sort({ position: -1 }).select('position').lean()
    nextPosition.set(status, computePosition(last?.position ?? null, null))
  }

  const operations: Parameters<typeof Todo.bulkWrite>[0] = []
  const carriedIds: string[] = []
  const skipped: CarryOverSkip[] = []

  for (const doc of requested) {
    const todo = toCarryOverTodo(doc)
    const decision = decideCarryOver(todo, planId)

    if (decision.kind === 'skip') {
      skipped.push({ id: todo.id, reason: decision.reason })
      continue
    }

    const position = nextPosition.get(doc.status) ?? 1024
    nextPosition.set(doc.status, position + 1024)

    const patch = applyCarryOver(todo, planId, targetPlanId, position)
    if (patch === null) continue

    operations.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            weeklyPlanId: toObjectId(patch.weeklyPlanId),
            position: patch.position,
          },
          // $addToSet 이라 재실행에도 carriedFrom 이 중복으로 늘지 않는다.
          $addToSet: { carriedFrom: sourceId },
        },
      },
    })
    carriedIds.push(todo.id)
  }

  if (operations.length > 0) await Todo.bulkWrite(operations)

  return { targetPlanId, targetWeekStart, carriedIds, skipped, createdTargetPlan: created }
}
