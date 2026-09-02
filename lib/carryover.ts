import type { TodoStatus } from '@/models/types'

/**
 * 이월 (PLAN §4.5, A8).
 *
 * 일반 재지정과 겉보기에 같지만 진행률 의미가 정반대다. 이월은 떠나온 주를
 * carriedFrom 에 남겨 그 주의 분모를 유지한다. 이 이력이 없으면 미완료를 다음 주로
 * 밀어내는 것만으로 지난 주가 100% 가 된다 (R12).
 */

export interface CarryOverTodo {
  id: string
  status: TodoStatus
  weeklyPlanId: string | null
  carriedFrom: string[]
  deletedAt: Date | null
}

export type CarryOverSkipReason =
  /** 소프트 삭제된 항목 */
  | 'deleted'
  /** 이미 그 주의 성과다. 그대로 둔다 */
  | 'done'
  /** 소속이 없으므로 옮길 주도 없다 */
  | 'unassigned'
  /** 요청한 출발 주의 소속이 아니다 */
  | 'not-in-source'
  /** 이미 이 주에서 이월된 적이 있다. 재실행이어도 carriedFrom 이 중복으로 늘지 않는다 */
  | 'already-carried'

export type CarryOverDecision = { kind: 'apply' } | { kind: 'skip'; reason: CarryOverSkipReason }

export function decideCarryOver(todo: CarryOverTodo, fromPlanId: string): CarryOverDecision {
  if (todo.deletedAt !== null) return { kind: 'skip', reason: 'deleted' }
  if (todo.weeklyPlanId === null) return { kind: 'skip', reason: 'unassigned' }
  if (todo.weeklyPlanId !== fromPlanId) return { kind: 'skip', reason: 'not-in-source' }
  if (todo.status === 'done') return { kind: 'skip', reason: 'done' }
  if (todo.carriedFrom.includes(fromPlanId)) return { kind: 'skip', reason: 'already-carried' }
  return { kind: 'apply' }
}

export function isCarryOverEligible(todo: CarryOverTodo, fromPlanId: string): boolean {
  return decideCarryOver(todo, fromPlanId).kind === 'apply'
}

/** 이월 대상 목록. 다이얼로그가 실행 전에 보여 주는 그 목록이다. */
export function selectCarryOverTargets<T extends CarryOverTodo>(
  todos: readonly T[],
  fromPlanId: string,
): T[] {
  return todos.filter((todo) => isCarryOverEligible(todo, fromPlanId))
}

export interface CarryOverPatch {
  weeklyPlanId: string
  carriedFrom: string[]
  position: number
}

/**
 * 이월 후 바뀌어야 할 필드만 계산한다. 대상이 아니면 null 을 돌려주므로
 * 일괄 실행이 중간에 실패해 재실행돼도 같은 결과에 수렴한다 (멱등).
 *
 * dueDate 는 손대지 않는다. 마감일은 사용자가 정한 약속이고 이월은 실행 주를 옮기는
 * 행위이기 때문이다. 결과적으로 마감일이 지난 항목이 다음 주에 놓이는데, 이는 A10 에
 * 따라 경고 배지로 보이며 그대로가 정확한 상태 표현이다.
 */
export function applyCarryOver(
  todo: CarryOverTodo,
  fromPlanId: string,
  toPlanId: string,
  positionInTarget: number,
): CarryOverPatch | null {
  if (!isCarryOverEligible(todo, fromPlanId)) return null
  return {
    weeklyPlanId: toPlanId,
    carriedFrom: [...todo.carriedFrom, fromPlanId],
    position: positionInTarget,
  }
}
