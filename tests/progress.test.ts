import { describe, expect, it } from 'vitest'
import { addWeeks, weekStartOf } from '@/lib/date'
import {
  type PlanWithTodos,
  type ProgressPlan,
  type ProgressTodo,
  doneCount,
  goalProgress,
  isCounted,
  weeklyDenominator,
  weeklyProgress,
} from '@/lib/progress'
import type { TodoStatus } from '@/models/types'

const TODAY = new Date('2026-09-01T14:00:00Z') // KST 2026-09-01(화) 23:00
const THIS_WEEK = weekStartOf(TODAY) // 2026-08-31(월)

function plan(id: string, weekStart: Date = THIS_WEEK, deletedAt: Date | null = null): ProgressPlan {
  return { id, weekStart, deletedAt }
}

function todo(
  overrides: Partial<ProgressTodo> & Pick<ProgressTodo, 'weeklyPlanId'>,
): ProgressTodo {
  return {
    carriedFrom: [],
    status: 'todo' as TodoStatus,
    deletedAt: null,
    ...overrides,
  }
}

/** 지정한 진행률이 나오도록 total 건 중 done 건을 만든 계획 */
function planWith(id: string, weekStart: Date, total: number, done: number): PlanWithTodos {
  const todos = Array.from({ length: total }, (_, index) =>
    todo({ weeklyPlanId: id, status: index < done ? 'done' : 'todo' }),
  )
  return { plan: plan(id, weekStart), todos }
}

describe('weeklyProgress — 주간 진행률 (PLAN §4.1.1)', () => {
  it('연결 할일이 0건이면 0 을 반환한다 (NaN 아님)', () => {
    expect(weeklyProgress(plan('P1'), [])).toBe(0)
  })

  it('할일 3건 중 1건이 done 이면 33', () => {
    const todos = [
      todo({ weeklyPlanId: 'P1', status: 'done' }),
      todo({ weeklyPlanId: 'P1' }),
      todo({ weeklyPlanId: 'P1', status: 'doing' }),
    ]
    expect(weeklyProgress(plan('P1'), todos)).toBe(33)
  })

  it('다른 계획 소속 할일은 분모에 섞이지 않는다', () => {
    const todos = [
      todo({ weeklyPlanId: 'P1', status: 'done' }),
      todo({ weeklyPlanId: 'P2' }),
      todo({ weeklyPlanId: null }),
    ]
    expect(weeklyProgress(plan('P1'), todos)).toBe(100)
  })

  it('할일 3건 중 1건 done, 1건 소프트 삭제면 50 (분모에서 즉시 제외)', () => {
    const todos = [
      todo({ weeklyPlanId: 'P1', status: 'done' }),
      todo({ weeklyPlanId: 'P1' }),
      todo({ weeklyPlanId: 'P1', deletedAt: new Date('2026-09-01T00:00:00Z') }),
    ]
    expect(weeklyDenominator('P1', todos)).toBe(2)
    expect(weeklyProgress(plan('P1'), todos)).toBe(50)
  })

  it('소프트 삭제된 done 항목은 분자에서도 빠진다', () => {
    const todos = [
      todo({ weeklyPlanId: 'P1', status: 'done', deletedAt: new Date() }),
      todo({ weeklyPlanId: 'P1' }),
    ]
    expect(weeklyProgress(plan('P1'), todos)).toBe(0)
  })

  describe('이월 이력 (PLAN A8 / R12) — 미완료를 밀어내도 지난 주가 오르지 않는다', () => {
    // P1 의 3건 중 1건은 done 으로 남고, 나머지 2건을 P2 로 이월했다.
    const todos = [
      todo({ weeklyPlanId: 'P1', status: 'done' }),
      todo({ weeklyPlanId: 'P2', carriedFrom: ['P1'] }),
      todo({ weeklyPlanId: 'P2', carriedFrom: ['P1'] }),
    ]

    it('이월해도 떠나온 주의 진행률이 33 그대로다', () => {
      expect(weeklyDenominator('P1', todos)).toBe(3)
      expect(weeklyProgress(plan('P1'), todos)).toBe(33)
    })

    it('이월돼 온 할일은 새 주의 분모에 포함된다', () => {
      expect(weeklyDenominator('P2', todos)).toBe(2)
      expect(weeklyProgress(plan('P2'), todos)).toBe(0)
    })

    it('이월된 할일을 새 주에서 완료해도 떠나온 주의 분자에는 절대 들어가지 않는다', () => {
      const completedLater = [
        todo({ weeklyPlanId: 'P1', status: 'done' }),
        todo({ weeklyPlanId: 'P2', carriedFrom: ['P1'], status: 'done' }),
        todo({ weeklyPlanId: 'P2', carriedFrom: ['P1'], status: 'done' }),
      ]

      expect(doneCount('P1', completedLater)).toBe(1)
      expect(weeklyProgress(plan('P1'), completedLater)).toBe(33) // 오르지 않았다
      expect(weeklyProgress(plan('P2'), completedLater)).toBe(100)
    })

    it('이월된 항목을 소프트 삭제하면 떠나온 주의 분모에서도 빠진다', () => {
      const deleted = [
        todo({ weeklyPlanId: 'P1', status: 'done' }),
        todo({ weeklyPlanId: 'P2', carriedFrom: ['P1'], deletedAt: new Date() }),
        todo({ weeklyPlanId: 'P2', carriedFrom: ['P1'], deletedAt: new Date() }),
      ]
      expect(weeklyDenominator('P1', deleted)).toBe(1)
      expect(weeklyProgress(plan('P1'), deleted)).toBe(100)
    })
  })
})

describe('isCounted — 분모 자격 (PLAN A5 / §0.2)', () => {
  it('이번 주를 포함해 이미 도래한 주는 집계 대상이다', () => {
    expect(isCounted({ plan: plan('P1', THIS_WEEK), todos: [] }, THIS_WEEK)).toBe(true)
    expect(isCounted({ plan: plan('P0', addWeeks(THIS_WEEK, -1)), todos: [] }, THIS_WEEK)).toBe(true)
  })

  it('아직 오지 않은 주는 비어 있으면 집계 대상이 아니다', () => {
    expect(isCounted({ plan: plan('P9', addWeeks(THIS_WEEK, 1)), todos: [] }, THIS_WEEK)).toBe(false)
  })

  it('미래 주라도 done 이 1건 있으면 즉시 인정한다', () => {
    const entry = {
      plan: plan('P9', addWeeks(THIS_WEEK, 1)),
      todos: [todo({ weeklyPlanId: 'P9', status: 'done' })],
    }
    expect(isCounted(entry, THIS_WEEK)).toBe(true)
  })

  it('미래 주에 done 이 아닌 할일만 있으면 집계 대상이 아니다', () => {
    const entry = {
      plan: plan('P9', addWeeks(THIS_WEEK, 1)),
      todos: [todo({ weeklyPlanId: 'P9', status: 'doing' })],
    }
    expect(isCounted(entry, THIS_WEEK)).toBe(false)
  })

  it('소프트 삭제된 계획은 어떤 경우에도 집계 대상이 아니다', () => {
    const entry = {
      plan: plan('P1', THIS_WEEK, new Date()),
      todos: [todo({ weeklyPlanId: 'P1', status: 'done' })],
    }
    expect(isCounted(entry, THIS_WEEK)).toBe(false)
  })
})

describe('goalProgress — 1년 목표 진행률 (PLAN §4.1.2)', () => {
  it('하위 계획이 없으면 { percent: 0, countedWeeks: 0 }', () => {
    expect(goalProgress([], TODAY)).toEqual({ percent: 0, countedWeeks: 0 })
  })

  it('경과 주 2개(100%, 0%)면 { percent: 50, countedWeeks: 2 }', () => {
    const entries = [
      planWith('P1', addWeeks(THIS_WEEK, -1), 2, 2),
      planWith('P2', THIS_WEEK, 2, 0),
    ]
    expect(goalProgress(entries, TODAY)).toEqual({ percent: 50, countedWeeks: 2 })
  })

  it('미래 주 51개(전부 빈 계획) + 경과 주 1개(100%) → 100%, 분모 1 (1.9% 왜곡 없음)', () => {
    const entries: PlanWithTodos[] = [
      planWith('P1', THIS_WEEK, 2, 2),
      ...Array.from({ length: 51 }, (_, index) => ({
        plan: plan(`F${index}`, addWeeks(THIS_WEEK, index + 1)),
        todos: [],
      })),
    ]
    expect(goalProgress(entries, TODAY)).toEqual({ percent: 100, countedWeeks: 1 })
  })

  it('경과했지만 할일 0건인 주는 분모에 포함되어 0% 로 반영된다 (100% 왜곡 없음)', () => {
    const entries: PlanWithTodos[] = [
      planWith('P1', addWeeks(THIS_WEEK, -3), 2, 2),
      { plan: plan('P2', addWeeks(THIS_WEEK, -2)), todos: [] },
      { plan: plan('P3', addWeeks(THIS_WEEK, -1)), todos: [] },
      { plan: plan('P4', THIS_WEEK), todos: [] },
    ]
    expect(goalProgress(entries, TODAY)).toEqual({ percent: 25, countedWeeks: 4 })
  })

  it('할일 1건짜리 주(100%)와 20건짜리 주(10%)의 목표 진행률은 55 다 (가중 평균 아님)', () => {
    const entries = [
      planWith('P1', addWeeks(THIS_WEEK, -1), 1, 1), // 100%
      planWith('P2', THIS_WEEK, 20, 2), // 10%
    ]
    expect(goalProgress(entries, TODAY)).toEqual({ percent: 55, countedWeeks: 2 })
  })

  it('가중 평균이었다면 나왔을 값(14%)과 명확히 다르다', () => {
    const entries = [planWith('P1', addWeeks(THIS_WEEK, -1), 1, 1), planWith('P2', THIS_WEEK, 20, 2)]
    const weighted = Math.round(((1 + 2) / (1 + 20)) * 100)

    expect(weighted).toBe(14)
    expect(goalProgress(entries, TODAY).percent).toBe(55)
  })

  it('삭제된 계획은 분모에서 빠진다', () => {
    const alive = planWith('P1', THIS_WEEK, 2, 2)
    const dead: PlanWithTodos = {
      plan: plan('P2', THIS_WEEK, new Date()),
      todos: [todo({ weeklyPlanId: 'P2' })],
    }
    expect(goalProgress([alive, dead], TODAY)).toEqual({ percent: 100, countedWeeks: 1 })
  })

  it('today 를 연말로 옮기면 모든 주가 집계되어 PRD 원식(전체 단순 평균)과 값이 일치한다', () => {
    const entries: PlanWithTodos[] = [
      planWith('P1', weekStartOf('2026-01-05'), 4, 4), // 100%
      planWith('P2', weekStartOf('2026-04-06'), 4, 1), // 25%
      planWith('P3', weekStartOf('2026-08-31'), 4, 0), // 0%
      planWith('P4', weekStartOf('2026-11-30'), 3, 2), // 67%
      { plan: plan('P5', weekStartOf('2026-12-28')), todos: [] }, // 0%
    ]

    const yearEnd = new Date('2026-12-31T12:00:00Z')

    // PRD 원식: 하위 주간 계획 진행률의 단순 평균 (자격 조건 없이 전부)
    const literal = Math.round(
      entries.reduce((sum, entry) => sum + weeklyProgress(entry.plan, entry.todos), 0) / entries.length,
    )

    expect(goalProgress(entries, yearEnd)).toEqual({ percent: literal, countedWeeks: entries.length })
    expect(literal).toBe(38)
  })

  it('연중에는 미래 주를 빼고, 연말이 되면 같은 데이터가 PRD 원식으로 수렴한다', () => {
    const entries: PlanWithTodos[] = [
      planWith('P1', THIS_WEEK, 2, 2), // 100%, 경과
      { plan: plan('P2', addWeeks(THIS_WEEK, 5)), todos: [] }, // 미래, 비어 있음
    ]

    expect(goalProgress(entries, TODAY)).toEqual({ percent: 100, countedWeeks: 1 })
    expect(goalProgress(entries, addWeeks(THIS_WEEK, 6))).toEqual({ percent: 50, countedWeeks: 2 })
  })
})
