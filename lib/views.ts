import type { TodoStatus } from '@/models/types'
import { isDueOutsideWeek, toKstDateOnly } from './date'

/**
 * 뷰 필터 (PLAN §4.4).
 *
 * 주간 뷰는 "마감일"이 아니라 "소속"으로 모은다 (A9). 마감일 기준으로 잡으면
 * 계획에 연결됐지만 마감일이 없는 할일이 주간 뷰에서 통째로 사라지는데,
 * 마감일은 선택 필드라 이 경우가 흔하다.
 */

export interface DayViewTodo {
  dueDate: Date | null
  status: TodoStatus
  deletedAt: Date | null
}

/**
 * 일일 뷰 포함 조건 (PLAN §4.4.2). 아래 셋의 OR 이고, 소프트 삭제는 항상 제외한다.
 *  1. 마감일이 오늘
 *  2. 마감일이 지났고 아직 완료되지 않음 (지연 항목)
 *  3. 진행 중이면 마감일과 무관하게 항상 노출
 */
export function isInDayView(todo: DayViewTodo, today: Date): boolean {
  if (todo.deletedAt !== null) return false

  const todayOnly = toKstDateOnly(today).getTime()

  if (todo.status === 'doing') return true

  if (todo.dueDate === null) return false

  const due = toKstDateOnly(todo.dueDate).getTime()
  if (due === todayOnly) return true
  return due < todayOnly && todo.status !== 'done'
}

export function filterDayView<T extends DayViewTodo>(todos: readonly T[], today: Date): T[] {
  return todos.filter((todo) => isInDayView(todo, today))
}

export interface WeekViewTodo {
  dueDate: Date | null
  deletedAt: Date | null
}

/**
 * 주간 뷰 항목에 붙는 경고 플래그 (PLAN A10).
 * 마감일이 소속 주 범위를 벗어나도 목록에서 빼지 않고 배지로만 알린다.
 * 이월된 할일과 장기 과제가 정상적으로 불일치를 만들기 때문이다.
 */
export function withDueOutsideWeek<T extends WeekViewTodo>(
  todos: readonly T[],
  weekStart: Date,
): (T & { dueOutsideWeek: boolean })[] {
  return todos.map((todo) => ({ ...todo, dueOutsideWeek: isDueOutsideWeek(todo.dueDate, weekStart) }))
}

export function isInbox(todo: { weeklyPlanId: string | null; deletedAt: Date | null }): boolean {
  return todo.deletedAt === null && todo.weeklyPlanId === null
}
