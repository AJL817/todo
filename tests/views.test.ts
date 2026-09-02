import { describe, expect, it } from 'vitest'
import { toKstDateOnly, todayKst, weekStartOf } from '@/lib/date'
import { type DayViewTodo, filterDayView, isInDayView, isInbox, withDueOutsideWeek } from '@/lib/views'
import type { TodoStatus } from '@/models/types'

const TODAY = toKstDateOnly('2026-09-01')

function todo(overrides: Partial<DayViewTodo> = {}): DayViewTodo {
  return { dueDate: null, status: 'todo' as TodoStatus, deletedAt: null, ...overrides }
}

describe('isInDayView — 일일 뷰 (PLAN §4.4.2)', () => {
  it('마감일이 오늘이면 포함된다', () => {
    expect(isInDayView(todo({ dueDate: toKstDateOnly('2026-09-01') }), TODAY)).toBe(true)
  })

  it('마감일이 지났고 완료되지 않았으면 포함된다 (지연 항목)', () => {
    expect(isInDayView(todo({ dueDate: toKstDateOnly('2026-08-28') }), TODAY)).toBe(true)
    expect(isInDayView(todo({ dueDate: toKstDateOnly('2026-08-28'), status: 'doing' }), TODAY)).toBe(true)
  })

  it('마감일이 지났어도 완료됐으면 제외된다', () => {
    expect(isInDayView(todo({ dueDate: toKstDateOnly('2026-08-28'), status: 'done' }), TODAY)).toBe(false)
  })

  it('진행 중이면 마감일과 무관하게 항상 포함된다', () => {
    expect(isInDayView(todo({ status: 'doing' }), TODAY)).toBe(true)
    expect(isInDayView(todo({ status: 'doing', dueDate: toKstDateOnly('2026-12-31') }), TODAY)).toBe(true)
  })

  it('마감일이 미래면 제외된다', () => {
    expect(isInDayView(todo({ dueDate: toKstDateOnly('2026-09-02') }), TODAY)).toBe(false)
  })

  it('마감일이 없고 상태가 todo 면 제외된다 (주간 뷰에서만 노출)', () => {
    expect(isInDayView(todo(), TODAY)).toBe(false)
  })

  it('마감일이 오늘이어도 소프트 삭제됐으면 항상 제외된다', () => {
    const deleted = todo({ dueDate: toKstDateOnly('2026-09-01'), deletedAt: new Date() })
    expect(isInDayView(deleted, TODAY)).toBe(false)
  })

  it('진행 중이어도 소프트 삭제됐으면 제외된다', () => {
    expect(isInDayView(todo({ status: 'doing', deletedAt: new Date() }), TODAY)).toBe(false)
  })

  it('KST 23:00 에 만든 오늘 마감 할일이 같은 날 일일 뷰에 나타난다 (UTC 밀림 없음, R9)', () => {
    const nowKst2300 = new Date('2026-09-01T14:00:00Z')
    const today = todayKst(nowKst2300)
    const created = todo({ dueDate: toKstDateOnly(nowKst2300) })

    expect(isInDayView(created, today)).toBe(true)
  })

  it('KST 00:01 에 만든 오늘 마감 할일도 같은 날 일일 뷰에 나타난다', () => {
    const nowKst0001 = new Date('2026-08-31T15:01:00Z')
    const today = todayKst(nowKst0001)

    expect(isInDayView(todo({ dueDate: toKstDateOnly(nowKst0001) }), today)).toBe(true)
  })

  it('filterDayView 가 조건에 맞는 항목만 남긴다', () => {
    const todos = [
      todo({ dueDate: toKstDateOnly('2026-09-01') }), // 오늘
      todo({ dueDate: toKstDateOnly('2026-08-25') }), // 지연
      todo({ status: 'doing' }), // 진행 중
      todo({ dueDate: toKstDateOnly('2026-09-05') }), // 미래
      todo(), // 마감일 없는 todo
      todo({ dueDate: toKstDateOnly('2026-09-01'), deletedAt: new Date() }), // 삭제
    ]

    expect(filterDayView(todos, TODAY)).toHaveLength(3)
  })
})

describe('withDueOutsideWeek — 마감일 이탈 배지 (PLAN A10)', () => {
  const weekStart = weekStartOf('2026-08-31')

  it('주 범위 밖 마감일에 플래그를 붙이되 목록에서 빼지 않는다', () => {
    const result = withDueOutsideWeek(
      [
        { id: 'inside', dueDate: toKstDateOnly('2026-09-03'), deletedAt: null },
        { id: 'outside', dueDate: toKstDateOnly('2026-09-20'), deletedAt: null },
        { id: 'nodue', dueDate: null, deletedAt: null },
      ],
      weekStart,
    )

    expect(result).toHaveLength(3)
    expect(result.map((r) => r.dueOutsideWeek)).toEqual([false, true, false])
  })
})

describe('isInbox — 미분류 판정 (PLAN §4.6)', () => {
  it('소속이 없고 살아 있으면 미분류다', () => {
    expect(isInbox({ weeklyPlanId: null, deletedAt: null })).toBe(true)
  })

  it('소속이 있으면 미분류가 아니다', () => {
    expect(isInbox({ weeklyPlanId: 'P1', deletedAt: null })).toBe(false)
  })

  it('삭제된 항목은 미분류로 세지 않는다', () => {
    expect(isInbox({ weeklyPlanId: null, deletedAt: new Date() })).toBe(false)
  })
})
