import { connectDb } from './db'
// 목표값은 클라이언트도 쓰므로 서버 의존이 없는 모듈에 둔다.
export { METRIC_TARGETS, meetsTarget, type MetricKey } from './metric-targets'
import { todayKst, weekStartOf } from './date'
import { weeklyProgress } from './progress'
import { activeFilter, toProgressTodo } from './repositories/shared'
import { listForPlans } from './repositories/todoRepo'
import { Todo, WeeklyPlan } from '@/models'

/**
 * 성공 지표 (PLAN §1.5).
 * 1인용 로컬 앱이라 행동 분석 인프라를 두지 않고, DB 질의만으로 산출 가능한 3개로 한정한다.
 */

export interface Metrics {
  /** M1 주간 계획 연결률. 활성 할일 중 weeklyPlanId 가 있는 비율. 목표 70% 이상 */
  linkedRate: number
  /** M2 주간 실행률. 경과 주간 계획 중 진행률 1% 이상인 주의 비율. 목표 60% 이상 */
  executionRate: number
  /** M3 이월 적체율. 활성 할일 중 2회 이상 이월된 비율. 목표 15% 이하 */
  carryOverBacklogRate: number
  detail: {
    activeTodos: number
    linkedTodos: number
    elapsedPlans: number
    startedPlans: number
    repeatedlyCarried: number
  }
}

/** 표본이 없으면 NaN 이 아니라 0 을 돌려준다 (PLAN §1.5 수락 기준) */
function rate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 100)
}

export async function computeMetrics(ownerId: string, now: Date = new Date()): Promise<Metrics> {
  await connectDb()

  const currentWeekStart = weekStartOf(todayKst(now))

  const [activeTodos, linkedTodos, repeatedlyCarried] = await Promise.all([
    Todo.countDocuments(activeFilter(ownerId)),
    Todo.countDocuments(activeFilter(ownerId, { weeklyPlanId: { $ne: null } })),
    // carriedFrom 의 순서가 곧 이월 순서이므로 길이만으로 이월 횟수를 알 수 있다.
    Todo.countDocuments(activeFilter(ownerId, { 'carriedFrom.1': { $exists: true } })),
  ])

  // M2 는 "경과한" 주만 본다. 아직 오지 않은 주를 방치로 세면 안 된다 (A5 와 같은 이유).
  const elapsedPlans = await WeeklyPlan.find(activeFilter(ownerId, { weekStart: { $lte: currentWeekStart } }))
    .select('_id')
    .lean()

  const planIds = elapsedPlans.map((plan) => plan._id.toString())
  const progressTodos = (await listForPlans(ownerId, planIds)).map(toProgressTodo)
  const startedPlans = planIds.filter((planId) => weeklyProgress({ id: planId }, progressTodos) >= 1).length

  return {
    linkedRate: rate(linkedTodos, activeTodos),
    executionRate: rate(startedPlans, planIds.length),
    carryOverBacklogRate: rate(repeatedlyCarried, activeTodos),
    detail: {
      activeTodos,
      linkedTodos,
      elapsedPlans: planIds.length,
      startedPlans,
      repeatedlyCarried,
    },
  }
}
