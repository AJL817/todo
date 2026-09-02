import { describe, expect, it } from 'vitest'
import { applyMove, applyMoveToCache, resolveDrop, type MoveIntent } from '@/lib/client/optimistic'
import { pendingKeys, resetSerialQueues, runSerial } from '@/lib/client/serial'
import { STATUS_ORDER, type TodoDto } from '@/lib/dto'
import type { TodoStatus } from '@/models/types'

function todo(id: string, status: TodoStatus, position: number, overrides: Partial<TodoDto> = {}): TodoDto {
  return {
    id,
    title: id,
    dueDate: null,
    status,
    position,
    weeklyPlanId: null,
    carriedFrom: [],
    completedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

const board = [
  todo('a', 'todo', 1024),
  todo('b', 'todo', 2048),
  todo('c', 'todo', 3072),
  todo('x', 'doing', 1024),
]

describe('resolveDrop — 드롭 지점 환산', () => {
  it('열 위에 떨어뜨리면 그 열의 맨 뒤로 간다', () => {
    expect(resolveDrop(board, 'a', 'doing', STATUS_ORDER)).toEqual({
      id: 'a',
      toStatus: 'doing',
      beforeId: 'x',
      afterId: null,
    })
  })

  it('빈 열 위에 떨어뜨리면 이웃이 없다', () => {
    expect(resolveDrop(board, 'a', 'done', STATUS_ORDER)).toEqual({
      id: 'a',
      toStatus: 'done',
      beforeId: null,
      afterId: null,
    })
  })

  it('카드 위에 떨어뜨리면 그 카드의 자리에 들어간다', () => {
    // a 를 c 자리로: a 를 뺀 열은 [b, c] 이므로 b 와 c 사이
    expect(resolveDrop(board, 'a', 'c', STATUS_ORDER)).toEqual({
      id: 'a',
      toStatus: 'todo',
      beforeId: 'b',
      afterId: 'c',
    })
  })

  it('맨 위 카드 자리로 옮기면 앞 이웃이 없다', () => {
    expect(resolveDrop(board, 'c', 'a', STATUS_ORDER)).toEqual({
      id: 'c',
      toStatus: 'todo',
      beforeId: null,
      afterId: 'a',
    })
  })

  it('다른 열의 카드 위에 떨어뜨리면 그 열로 상태가 바뀐다', () => {
    expect(resolveDrop(board, 'a', 'x', STATUS_ORDER)).toEqual({
      id: 'a',
      toStatus: 'doing',
      beforeId: null,
      afterId: 'x',
    })
  })

  it('존재하지 않는 카드나 대상이면 null', () => {
    expect(resolveDrop(board, 'nope', 'a', STATUS_ORDER)).toBeNull()
    expect(resolveDrop(board, 'a', 'nope', STATUS_ORDER)).toBeNull()
  })
})

describe('applyMove — 낙관적 갱신', () => {
  it('상태와 position 을 서버와 같은 규칙으로 미리 고친다', () => {
    const move: MoveIntent = { id: 'a', toStatus: 'todo', beforeId: 'b', afterId: 'c' }
    const result = applyMove(board, move)
    const moved = result.find((t) => t.id === 'a')

    expect(moved?.position).toBe((2048 + 3072) / 2)
    expect(result.filter((t) => t.status === 'todo').length).toBe(3)
  })

  it('done 으로 옮기면 완료 시각이 즉시 채워진다 (A6)', () => {
    const result = applyMove(board, { id: 'a', toStatus: 'done', beforeId: null, afterId: null })
    expect(result.find((t) => t.id === 'a')?.completedAt).not.toBeNull()
  })

  it('done 에서 나오면 완료 시각이 즉시 지워진다 (A6)', () => {
    const withDone = [todo('a', 'done', 1024, { completedAt: '2026-09-01T00:00:00.000Z' })]
    const result = applyMove(withDone, { id: 'a', toStatus: 'doing', beforeId: null, afterId: null })

    expect(result[0]?.completedAt).toBeNull()
  })

  it('done 안에서 자리만 바꾸면 원래 완료 시각을 유지한다', () => {
    const withDone = [todo('a', 'done', 1024, { completedAt: '2026-09-01T00:00:00.000Z' })]
    const result = applyMove(withDone, { id: 'a', toStatus: 'done', beforeId: null, afterId: null })

    expect(result[0]?.completedAt).toBe('2026-09-01T00:00:00.000Z')
  })

  it('없는 카드를 옮기라고 하면 원본을 그대로 돌려준다', () => {
    expect(applyMove(board, { id: 'nope', toStatus: 'done', beforeId: null, afterId: null })).toEqual(board)
  })

  it('applyMoveToCache 가 { todos } 를 가진 어떤 캐시에도 동작한다', () => {
    const cache = { todos: [...board], progress: {}, inbox: [] }
    const updated = applyMoveToCache(cache, { id: 'a', toStatus: 'done', beforeId: null, afterId: null })

    expect(updated?.todos.find((t) => t.id === 'a')?.status).toBe('done')
    expect(updated?.progress).toEqual({}) // 나머지 필드는 보존된다
    expect(applyMoveToCache(undefined, { id: 'a', toStatus: 'done', beforeId: null, afterId: null })).toBeUndefined()
  })
})

describe('runSerial — 카드 단위 직렬화 (PLAN R1)', () => {
  it('같은 키의 작업이 순서대로 실행된다', async () => {
    resetSerialQueues()
    const order: string[] = []

    const slow = (label: string, ms: number) => () =>
      new Promise<string>((resolve) => {
        setTimeout(() => {
          order.push(label)
          resolve(label)
        }, ms)
      })

    // 첫 작업이 더 느리다. 병렬이면 순서가 뒤바뀐다.
    const first = runSerial('card-1', slow('first', 30))
    const second = runSerial('card-1', slow('second', 1))

    await Promise.all([first, second])
    expect(order).toEqual(['first', 'second'])
  })

  it('다른 키는 서로 막지 않는다', async () => {
    resetSerialQueues()
    const order: string[] = []

    const slow = (label: string, ms: number) => () =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          order.push(label)
          resolve()
        }, ms)
      })

    await Promise.all([runSerial('card-1', slow('slow', 25)), runSerial('card-2', slow('fast', 1))])

    expect(order).toEqual(['fast', 'slow'])
  })

  it('앞 작업이 실패해도 뒤 작업은 실행된다', async () => {
    resetSerialQueues()

    const failing = runSerial('card-1', () => Promise.reject(new Error('실패')))
    const following = runSerial('card-1', () => Promise.resolve('성공'))

    await expect(failing).rejects.toThrow('실패')
    await expect(following).resolves.toBe('성공')
  })

  it('세 번 연속 실행하면 마지막 작업이 마지막에 끝난다', async () => {
    resetSerialQueues()
    const finished: number[] = []

    const tasks = [40, 20, 1].map((delay, index) =>
      runSerial('card-1', () => new Promise<void>((resolve) => setTimeout(() => {
        finished.push(index)
        resolve()
      }, delay))),
    )

    await Promise.all(tasks)
    expect(finished).toEqual([0, 1, 2])
  })

  it('resetSerialQueues 가 상태를 비운다', async () => {
    resetSerialQueues()
    await runSerial('card-1', () => Promise.resolve())

    expect(pendingKeys()).toEqual(['card-1'])
    resetSerialQueues()
    expect(pendingKeys()).toEqual([])
  })
})
