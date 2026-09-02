import type { TodoStatus } from '@/models/types'
import { weekStartOf } from './date'

/**
 * 진행률 (PLAN §4.1).
 *
 * 저장하지 않고 조회 시 계산한다 (A4). 데이터베이스에 의존하지 않는 순수 함수로 두어
 * 시간 경계와 이월 이력 같은 까다로운 케이스를 DB 없이 검증할 수 있게 한다.
 * 식별자는 문자열로 받는다. ObjectId 변환은 리포지토리 계층의 몫이다.
 */

export interface ProgressTodo {
  weeklyPlanId: string | null
  /** 이월돼 떠나온 주간 계획 id 들 */
  carriedFrom: string[]
  status: TodoStatus
  deletedAt: Date | null
}

export interface ProgressPlan {
  id: string
  /** 월요일 KST 자정 */
  weekStart: Date
  deletedAt: Date | null
}

export interface PlanWithTodos {
  plan: ProgressPlan
  todos: ProgressTodo[]
}

export interface GoalProgress {
  percent: number
  /** 분모에 실제로 들어간 주의 수. UI 가 "경과 N주 기준" 을 표기하는 데 쓴다 */
  countedWeeks: number
}

const isActive = (todo: ProgressTodo): boolean => todo.deletedAt === null

/** 지금 이 계획에 소속된 활성 할일 */
function currentMembers(planId: string, todos: readonly ProgressTodo[]): ProgressTodo[] {
  return todos.filter((todo) => isActive(todo) && todo.weeklyPlanId === planId)
}

/**
 * 이 계획에서 이월돼 나간 활성 할일.
 * 분모에만 들어간다. 그 주 안에 끝내지 못했다는 사실은 나중에 다른 주에서 완료해도
 * 바뀌지 않기 때문이다 (PLAN A8 / R12).
 */
function departedMembers(planId: string, todos: readonly ProgressTodo[]): ProgressTodo[] {
  return todos.filter(
    (todo) => isActive(todo) && todo.weeklyPlanId !== planId && todo.carriedFrom.includes(planId),
  )
}

export function doneCount(planId: string, todos: readonly ProgressTodo[]): number {
  return currentMembers(planId, todos).filter((todo) => todo.status === 'done').length
}

/** 분모: 지금 소속된 할일 + 이 주에서 이월돼 나간 할일 */
export function weeklyDenominator(planId: string, todos: readonly ProgressTodo[]): number {
  return currentMembers(planId, todos).length + departedMembers(planId, todos).length
}

/**
 * 주간 진행률 (PLAN §4.1.1).
 * 소프트 삭제 항목은 분자와 분모 양쪽에서 즉시 빠진다. 이월과 달리 삭제는
 * "없던 일이 됐다"는 뜻이므로 이력을 남기지 않는다.
 */
export function weeklyProgress(plan: Pick<ProgressPlan, 'id'>, todos: readonly ProgressTodo[]): number {
  const denominator = weeklyDenominator(plan.id, todos)
  if (denominator === 0) return 0
  return Math.round((doneCount(plan.id, todos) / denominator) * 100)
}

/**
 * 이 주간 계획이 목표 진행률의 분모에 들어갈 자격이 있는지 (PLAN A5 / §0.2).
 *
 * 아직 오지 않은 주는 실패가 아니므로 0% 로 세지 않는다. 다만 미리 끝낸 주는
 * 즉시 인정한다. 경과했는데 비어 있는 주는 그대로 0% 로 반영되므로 반대 방향
 * 왜곡(계획 하나만 채우고 100%)도 생기지 않는다.
 */
export function isCounted(entry: PlanWithTodos, currentWeekStart: Date): boolean {
  if (entry.plan.deletedAt !== null) return false
  if (entry.plan.weekStart.getTime() <= currentWeekStart.getTime()) return true
  return doneCount(entry.plan.id, entry.todos) > 0
}

/**
 * 1년 목표 진행률 (PLAN §4.1.2).
 * 각 주는 동등한 지분을 갖는다. 할일 건수로 가중하지 않는 근거는 PLAN §0.2.
 * today 를 인자로 받아야 시간 경계를 테스트할 수 있다.
 */
export function goalProgress(entries: readonly PlanWithTodos[], today: Date): GoalProgress {
  const currentWeekStart = weekStartOf(today)
  const targets = entries.filter((entry) => isCounted(entry, currentWeekStart))

  if (targets.length === 0) return { percent: 0, countedWeeks: 0 }

  const sum = targets.reduce((acc, entry) => acc + weeklyProgress(entry.plan, entry.todos), 0)
  return { percent: Math.round(sum / targets.length), countedWeeks: targets.length }
}
