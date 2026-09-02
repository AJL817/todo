import { describe, expect, it } from 'vitest'
import {
  type CarryOverTodo,
  applyCarryOver,
  decideCarryOver,
  isCarryOverEligible,
  selectCarryOverTargets,
} from '@/lib/carryover'
import { weeklyDenominator, weeklyProgress, type ProgressTodo } from '@/lib/progress'
import type { TodoStatus } from '@/models/types'

function todo(overrides: Partial<CarryOverTodo> = {}): CarryOverTodo {
  return {
    id: 'T1',
    status: 'todo' as TodoStatus,
    weeklyPlanId: 'P1',
    carriedFrom: [],
    deletedAt: null,
    ...overrides,
  }
}

describe('decideCarryOver — 이월 대상 판정 (PLAN §4.5)', () => {
  it('P1 소속 미완료 항목은 이월 대상이다', () => {
    expect(decideCarryOver(todo(), 'P1')).toEqual({ kind: 'apply' })
    expect(decideCarryOver(todo({ status: 'doing' }), 'P1')).toEqual({ kind: 'apply' })
  })

  it('done 항목은 그 주의 성과이므로 이월하지 않는다', () => {
    expect(decideCarryOver(todo({ status: 'done' }), 'P1')).toEqual({ kind: 'skip', reason: 'done' })
  })

  it('미분류 항목은 옮길 주가 없으므로 거부된다', () => {
    expect(decideCarryOver(todo({ weeklyPlanId: null }), 'P1')).toEqual({
      kind: 'skip',
      reason: 'unassigned',
    })
  })

  it('출발 주의 소속이 아니면 거부된다', () => {
    expect(decideCarryOver(todo({ weeklyPlanId: 'P2' }), 'P1')).toEqual({
      kind: 'skip',
      reason: 'not-in-source',
    })
  })

  it('소프트 삭제된 항목은 거부된다', () => {
    expect(decideCarryOver(todo({ deletedAt: new Date() }), 'P1')).toEqual({
      kind: 'skip',
      reason: 'deleted',
    })
  })

  it('이미 이 주에서 이월된 적이 있으면 건너뛴다 (멱등성 보장)', () => {
    expect(decideCarryOver(todo({ carriedFrom: ['P1'] }), 'P1')).toEqual({
      kind: 'skip',
      reason: 'already-carried',
    })
  })
})

describe('selectCarryOverTargets — 다이얼로그가 보여 줄 목록', () => {
  it('미완료 소속 항목만 고른다', () => {
    const todos = [
      todo({ id: 'A' }),
      todo({ id: 'B', status: 'doing' }),
      todo({ id: 'C', status: 'done' }),
      todo({ id: 'D', weeklyPlanId: null }),
      todo({ id: 'E', weeklyPlanId: 'P2' }),
      todo({ id: 'F', deletedAt: new Date() }),
    ]

    expect(selectCarryOverTargets(todos, 'P1').map((t) => t.id)).toEqual(['A', 'B'])
  })
})

describe('applyCarryOver — 이월 결과 계산', () => {
  it('weeklyPlanId 가 대상 주로 바뀌고 carriedFrom 에 이전 주가 1회 추가된다', () => {
    const patch = applyCarryOver(todo(), 'P1', 'P2', 1024)

    expect(patch).toEqual({ weeklyPlanId: 'P2', carriedFrom: ['P1'], position: 1024 })
  })

  it('대상이 아니면 null 을 돌려주므로 재실행이 안전하다', () => {
    expect(applyCarryOver(todo({ status: 'done' }), 'P1', 'P2', 1024)).toBeNull()
    expect(applyCarryOver(todo({ weeklyPlanId: null }), 'P1', 'P2', 1024)).toBeNull()
  })

  it('같은 이월을 2회 실행해도 carriedFrom 길이가 1 이다 (멱등성)', () => {
    const original = todo()
    const first = applyCarryOver(original, 'P1', 'P2', 1024)
    expect(first).not.toBeNull()

    const afterFirst: CarryOverTodo = { ...original, ...first! }
    expect(afterFirst.carriedFrom).toEqual(['P1'])

    // 두 번째 실행: 이미 P2 소속이라 'not-in-source', 설령 P1 로 되돌려도 'already-carried'
    expect(applyCarryOver(afterFirst, 'P1', 'P2', 2048)).toBeNull()
    expect(applyCarryOver({ ...afterFirst, weeklyPlanId: 'P1' }, 'P1', 'P2', 2048)).toBeNull()
    expect(afterFirst.carriedFrom).toHaveLength(1)
  })

  it('이월은 dueDate 를 건드리지 않는다 (패치에 dueDate 키가 없다)', () => {
    const patch = applyCarryOver(todo(), 'P1', 'P2', 1024)
    expect(patch).not.toBeNull()
    expect(Object.keys(patch!).sort()).toEqual(['carriedFrom', 'position', 'weeklyPlanId'])
  })

  it('3주 연속 이월하면 carriedFrom.length 가 3 이고 순서가 이월 순서다', () => {
    let current = todo({ weeklyPlanId: 'W1' })

    for (const [from, to] of [
      ['W1', 'W2'],
      ['W2', 'W3'],
      ['W3', 'W4'],
    ] as const) {
      const patch = applyCarryOver(current, from, to, 1024)
      expect(patch).not.toBeNull()
      current = { ...current, ...patch! }
    }

    expect(current.carriedFrom).toEqual(['W1', 'W2', 'W3'])
    expect(current.weeklyPlanId).toBe('W4')
  })

  it('3주 연속 이월된 할일이 네 주 모두의 분모에 잡힌다', () => {
    const carried: ProgressTodo = {
      weeklyPlanId: 'W4',
      carriedFrom: ['W1', 'W2', 'W3'],
      status: 'todo',
      deletedAt: null,
    }

    for (const planId of ['W1', 'W2', 'W3', 'W4']) {
      expect(weeklyDenominator(planId, [carried])).toBe(1)
      expect(weeklyProgress({ id: planId }, [carried])).toBe(0)
    }
  })

  it('완료 후에도 지나온 주들의 분자에는 들어가지 않는다', () => {
    const carriedDone: ProgressTodo = {
      weeklyPlanId: 'W4',
      carriedFrom: ['W1', 'W2', 'W3'],
      status: 'done',
      deletedAt: null,
    }

    for (const planId of ['W1', 'W2', 'W3']) {
      expect(weeklyProgress({ id: planId }, [carriedDone])).toBe(0)
    }
    expect(weeklyProgress({ id: 'W4' }, [carriedDone])).toBe(100)
  })

  it('isCarryOverEligible 이 decideCarryOver 와 일관된다', () => {
    expect(isCarryOverEligible(todo(), 'P1')).toBe(true)
    expect(isCarryOverEligible(todo({ status: 'done' }), 'P1')).toBe(false)
  })
})
