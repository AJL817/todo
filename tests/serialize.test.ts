import { describe, expect, it } from 'vitest'
import { Types } from 'mongoose'
import { serialize } from '@/lib/serialize'
import { Todo } from '@/models'
import { owner } from './helpers/owner'

/** 결과 어디에도 ObjectId / Date 인스턴스나 _id 키가 남아 있지 않은지 재귀 확인 */
function assertFullySerialized(value: unknown, path = '$'): void {
  expect(value, `${path} 에 Date 인스턴스가 남아 있다`).not.toBeInstanceOf(Date)
  expect(value, `${path} 에 ObjectId 인스턴스가 남아 있다`).not.toBeInstanceOf(Types.ObjectId)

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFullySerialized(item, `${path}[${index}]`))
    return
  }

  if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      expect(key, `${path} 에 _id 키가 남아 있다`).not.toBe('_id')
      assertFullySerialized(item, `${path}.${key}`)
    }
  }
}

describe('serialize — API 응답 직렬화 (PLAN §3.2)', () => {
  it('_id 를 id 문자열로 바꾼다', () => {
    const id = new Types.ObjectId()
    expect(serialize({ _id: id, title: '운동' })).toEqual({ id: id.toString(), title: '운동' })
  })

  it('Date 를 ISO 문자열로 바꾼다', () => {
    const result = serialize({ dueDate: new Date('2026-08-31T15:00:00Z') })
    expect(result).toEqual({ dueDate: '2026-08-31T15:00:00.000Z' })
  })

  it('null 과 undefined 를 그대로 보존한다', () => {
    expect(serialize({ dueDate: null, completedAt: null })).toEqual({ dueDate: null, completedAt: null })
  })

  it('ObjectId 배열을 문자열 배열로 바꾼다', () => {
    const a = new Types.ObjectId()
    const b = new Types.ObjectId()
    expect(serialize({ carriedFrom: [a, b] })).toEqual({ carriedFrom: [a.toString(), b.toString()] })
  })

  it('중첩 객체와 배열까지 재귀적으로 변환한다', () => {
    const planId = new Types.ObjectId()
    const result = serialize({
      _id: new Types.ObjectId(),
      plan: { _id: planId, weekStart: new Date('2026-08-30T15:00:00Z') },
      todos: [{ _id: new Types.ObjectId(), completedAt: new Date('2026-09-01T00:00:00Z') }],
    })

    assertFullySerialized(result)
    expect((result as { plan: { id: string } }).plan.id).toBe(planId.toString())
  })

  it('__v 는 응답에서 제거한다', () => {
    expect(serialize({ _id: new Types.ObjectId(), __v: 0, title: 'x' })).not.toHaveProperty('__v')
  })

  it('Mongoose 문서를 넣어도 평문으로 낮춰 직렬화한다', async () => {
    const saved = await Todo.create({
      userId: owner(),
      title: '통합 직렬화',
      position: 1024,
      status: 'done',
      completedAt: new Date('2026-09-01T00:00:00Z'),
      carriedFrom: [new Types.ObjectId()],
    })

    const result = serialize(saved)

    assertFullySerialized(result)
    expect(result).toMatchObject({ id: saved._id.toString(), title: '통합 직렬화', status: 'done' })
  })

  it('lean() 결과도 동일하게 직렬화된다', async () => {
    await Todo.create({ userId: owner(), title: 'lean 검증', position: 1024 })
    const docs = await Todo.find({}).lean()

    const result = serialize(docs)

    assertFullySerialized(result)
    expect(Array.isArray(result)).toBe(true)
  })

  it('원시값은 그대로 통과시킨다', () => {
    expect(serialize(42)).toBe(42)
    expect(serialize('문자열')).toBe('문자열')
    expect(serialize(true)).toBe(true)
    expect(serialize(null)).toBeNull()
  })
})
