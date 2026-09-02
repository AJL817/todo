import { beforeAll, describe, expect, it } from 'vitest'
import { Goal, Todo, WeeklyPlan } from '@/models'
import { indexKeysOf, syncAllIndexes } from './helpers/db'
import { owner } from './helpers/owner'

beforeAll(async () => {
  await syncAllIndexes()
})

describe('스키마 인덱스 (PLAN §3.2)', () => {
  it('goals 에 { deletedAt, year } 인덱스가 생성된다', async () => {
    const keys = await indexKeysOf('goals')
    expect(keys).toContain(JSON.stringify({ deletedAt: 1, year: 1 }))
  })

  it('weeklyplans 에 { deletedAt, weekStart } 와 { goalId } 인덱스가 생성된다', async () => {
    const keys = await indexKeysOf('weeklyplans')
    expect(keys).toContain(JSON.stringify({ deletedAt: 1, weekStart: 1 }))
    expect(keys).toContain(JSON.stringify({ goalId: 1 }))
  })

  it('todos 에 선언한 인덱스 4종이 모두 생성된다', async () => {
    const keys = await indexKeysOf('todos')
    expect(keys).toContain(JSON.stringify({ deletedAt: 1, status: 1, position: 1 }))
    expect(keys).toContain(JSON.stringify({ weeklyPlanId: 1 }))
    expect(keys).toContain(JSON.stringify({ dueDate: 1 }))
    expect(keys).toContain(JSON.stringify({ carriedFrom: 1 }))
  })
})

describe("strict: 'throw' — 스키마 드리프트 차단 (PLAN R10)", () => {
  it('Goal 에 스키마 외 필드를 넣으면 예외가 난다', () => {
    expect(
      () =>
        new Goal({
          userId: owner(),
          title: '체력 만들기',
          year: 2026,
          startDate: new Date(),
          endDate: new Date(),
          bogusField: 1,
        } as never),
    ).toThrow()
  })

  it('WeeklyPlan 에 스키마 외 필드를 넣으면 예외가 난다', () => {
    expect(() => new WeeklyPlan({ userId: owner(), title: '1주차', weekStart: new Date(), bogusField: 1 } as never)).toThrow()
  })

  it('Todo 에 스키마 외 필드를 넣으면 예외가 난다', () => {
    expect(() => new Todo({ userId: owner(), title: '운동', position: 1024, bogusField: 1 } as never)).toThrow()
  })
})

describe('기본값', () => {
  it('carriedFrom 을 지정하지 않으면 빈 배열로 저장된다', async () => {
    const saved = await Todo.create({ userId: owner(), title: '운동', position: 1024 })
    const loaded = await Todo.findById(saved._id).lean()

    expect(loaded?.carriedFrom).toEqual([])
  })

  it('status 기본값은 todo, 나머지 nullable 필드는 null 로 저장된다', async () => {
    const saved = await Todo.create({ userId: owner(), title: '독서', position: 2048 })
    const loaded = await Todo.findById(saved._id).lean()

    expect(loaded?.status).toBe('todo')
    expect(loaded?.dueDate).toBeNull()
    expect(loaded?.weeklyPlanId).toBeNull()
    expect(loaded?.completedAt).toBeNull()
    expect(loaded?.deletedAt).toBeNull()
  })

  it('status 에 허용되지 않은 값을 넣으면 검증에서 걸린다', async () => {
    await expect(Todo.create({ userId: owner(), title: '잘못된 상태', position: 1024, status: 'archived' as never })).rejects.toThrow()
  })

  it('제목 없이 저장하면 검증에서 걸린다', async () => {
    await expect(Todo.create({ position: 1024 } as never)).rejects.toThrow()
  })

  it('timestamps 가 자동으로 채워진다', async () => {
    const saved = await Todo.create({ userId: owner(), title: '타임스탬프', position: 1024 })

    expect(saved.createdAt).toBeInstanceOf(Date)
    expect(saved.updatedAt).toBeInstanceOf(Date)
  })
})
