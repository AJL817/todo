import { connectDb } from '@/lib/db'
import { toKstDateOnly, todayKst, weekStartOf } from '@/lib/date'
import {
  doneCount,
  goalProgress,
  isCounted,
  weeklyDenominator,
  weeklyProgress,
  type GoalProgress,
  type PlanWithTodos,
  type ProgressTodo,
} from '@/lib/progress'
import { Goal, WeeklyPlan } from '@/models'
import type { GoalDoc, TodoDoc, WeeklyPlanDoc } from '@/models/types'
import { NotFoundError, activeFilter, toObjectId, toProgressPlan, toProgressTodo } from './shared'
import { listForPlans } from './todoRepo'
import type { PlanProgress } from './weeklyPlanRepo'

export interface CreateGoalInput {
  title: string
  year: number
  startDate: string | Date
  endDate: string | Date
  description?: string | null
}

export interface UpdateGoalInput {
  title?: string
  year?: number
  startDate?: string | Date
  endDate?: string | Date
  description?: string | null
}

export async function createGoal(ownerId: string, input: CreateGoalInput): Promise<GoalDoc> {
  await connectDb()

  const created = await Goal.create({
    userId: toObjectId(ownerId),
    title: input.title,
    year: input.year,
    startDate: toKstDateOnly(input.startDate),
    endDate: toKstDateOnly(input.endDate),
    description: input.description ?? null,
  })

  return created.toObject()
}

export async function getGoal(ownerId: string, id: string): Promise<GoalDoc> {
  await connectDb()
  const found = await Goal.findOne(activeFilter(ownerId, { _id: toObjectId(id) })).lean()
  if (!found) throw new NotFoundError('1년 목표')
  return found
}

export async function updateGoal(ownerId: string, id: string, patch: UpdateGoalInput): Promise<GoalDoc> {
  await connectDb()

  const update: Partial<Pick<GoalDoc, 'title' | 'year' | 'startDate' | 'endDate' | 'description'>> = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.year !== undefined) update.year = patch.year
  if (patch.startDate !== undefined) update.startDate = toKstDateOnly(patch.startDate)
  if (patch.endDate !== undefined) update.endDate = toKstDateOnly(patch.endDate)
  if (patch.description !== undefined) update.description = patch.description

  const updated = await Goal.findOneAndUpdate(
    activeFilter(ownerId, { _id: toObjectId(id) }),
    { $set: update },
    { new: true },
  ).lean()

  if (!updated) throw new NotFoundError('1년 목표')
  return updated
}

/**
 * 소프트 삭제. 하위 주간 계획은 연쇄 삭제하지 않고 미분류로 전환한다 (PRD P0).
 * 하위 FK 를 먼저 끊고 상위를 나중에 지우는 순서는 weeklyPlanRepo 와 같은 이유다 (PLAN §3.1).
 */
export async function softDeleteGoalWithDetach(ownerId: string, id: string): Promise<{ detachedPlans: number }> {
  await connectDb()

  const objectId = toObjectId(id)
  const goal = await Goal.findOne(activeFilter(ownerId, { _id: objectId })).lean()
  if (!goal) throw new NotFoundError('1년 목표')

  const detached = await WeeklyPlan.updateMany(activeFilter(ownerId, { goalId: objectId }), {
    $set: { goalId: null },
  })
  await Goal.updateOne(activeFilter(ownerId, { _id: objectId }), { $set: { deletedAt: new Date() } })

  return { detachedPlans: detached.modifiedCount }
}

export async function listGoals(ownerId: string, year?: number): Promise<GoalDoc[]> {
  await connectDb()
  const query = year === undefined ? {} : { year }
  return Goal.find(activeFilter(ownerId, query)).sort({ year: -1, createdAt: 1 }).lean()
}

/**
 * 목표 하위 계획과 그 계획들에 얽힌 할일을 한 번만 읽어 온다.
 * 진행률 분모에는 "이 주에서 이월돼 나간 할일"도 들어가므로 소속 할일만으로는 부족하다
 * (PLAN §4.1.1).
 */
async function loadGoalPlans(
  ownerId: string,
  goalId: string,
): Promise<{ plans: WeeklyPlanDoc[]; todos: TodoDoc[]; progressTodos: ProgressTodo[] }> {
  const plans = await WeeklyPlan.find(activeFilter(ownerId, { goalId: toObjectId(goalId) }))
    .sort({ weekStart: 1 })
    .lean()
  if (plans.length === 0) return { plans, todos: [], progressTodos: [] }

  const todos = await listForPlans(
    ownerId,
    plans.map((plan) => plan._id.toString()),
  )
  return { plans, todos, progressTodos: todos.map(toProgressTodo) }
}

function toEntries(plans: readonly WeeklyPlanDoc[], progressTodos: readonly ProgressTodo[]): PlanWithTodos[] {
  // weeklyProgress 가 planId 로 자체 필터링하므로 전체 목록을 그대로 넘겨도 된다.
  return plans.map((plan) => ({ plan: toProgressPlan(plan), todos: [...progressTodos] }))
}

export interface GoalWithProgress {
  goal: GoalDoc
  progress: GoalProgress
}

export async function listGoalsWithProgress(
  ownerId: string,
  year?: number,
  now: Date = new Date(),
): Promise<GoalWithProgress[]> {
  await connectDb()

  const today = todayKst(now)
  const goals = await listGoals(ownerId, year)

  return Promise.all(
    goals.map(async (goal) => {
      const { plans, progressTodos } = await loadGoalPlans(ownerId, goal._id.toString())
      return { goal, progress: goalProgress(toEntries(plans, progressTodos), today) }
    }),
  )
}

export interface GoalPlanSummary {
  plan: WeeklyPlanDoc
  progress: PlanProgress
  /** 이 주를 몇 건으로 쪼갰는지. 진행률 부풀리기를 사용자가 스스로 판단하게 한다 (PLAN R14) */
  todoCount: number
  /** 목표 진행률의 분모에 실제로 포함됐는지 (PLAN A5) */
  counted: boolean
}

export interface GoalDetail {
  goal: GoalDoc
  progress: GoalProgress
  plans: GoalPlanSummary[]
}

export async function getGoalWithProgress(
  ownerId: string,
  id: string,
  now: Date = new Date(),
): Promise<GoalDetail> {
  await connectDb()

  const today = todayKst(now)
  const currentWeekStart = weekStartOf(today)
  const goal = await getGoal(ownerId, id)
  const { plans, todos, progressTodos } = await loadGoalPlans(ownerId, id)

  const entries = toEntries(plans, progressTodos)

  const summaries: GoalPlanSummary[] = entries.map((entry, index) => {
    const plan = plans[index]
    if (!plan) throw new Error('계획과 진행률 항목의 개수가 어긋났습니다')

    const planId = entry.plan.id

    return {
      plan,
      progress: {
        percent: weeklyProgress(entry.plan, progressTodos),
        done: doneCount(planId, progressTodos),
        denominator: weeklyDenominator(planId, progressTodos),
      },
      todoCount: todos.filter((todo) => todo.weeklyPlanId?.toString() === planId).length,
      // 목표 진행률과 같은 판정을 쓴다. 여기서 따로 구현하면 두 값이 어긋난다.
      counted: isCounted(entry, currentWeekStart),
    }
  })

  return { goal, progress: goalProgress(entries, today), plans: summaries }
}
