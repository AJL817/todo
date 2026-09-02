import { computePosition, sortByPosition } from '@/lib/position'
import type { TodoDto } from '@/lib/dto'
import type { TodoStatus } from '@/models/types'

export interface MoveIntent {
  id: string
  toStatus: TodoStatus
  beforeId: string | null
  afterId: string | null
}

/**
 * 드롭 지점을 서버가 이해하는 형태(beforeId/afterId)로 환산한다.
 * over 가 열이면 그 열의 맨 뒤, 카드면 그 카드의 자리에 삽입한다.
 */
export function resolveDrop(
  todos: readonly TodoDto[],
  activeId: string,
  overId: string,
  statuses: readonly TodoStatus[],
): MoveIntent | null {
  const active = todos.find((todo) => todo.id === activeId)
  if (!active) return null

  const overIsColumn = (statuses as readonly string[]).includes(overId)
  const toStatus = overIsColumn
    ? (overId as TodoStatus)
    : todos.find((todo) => todo.id === overId)?.status
  if (!toStatus) return null

  const column = sortByPosition(todos.filter((todo) => todo.status === toStatus && todo.id !== activeId))

  if (overIsColumn) {
    return { id: activeId, toStatus, beforeId: column.at(-1)?.id ?? null, afterId: null }
  }

  const index = column.findIndex((todo) => todo.id === overId)
  if (index === -1) {
    return { id: activeId, toStatus, beforeId: column.at(-1)?.id ?? null, afterId: null }
  }

  return {
    id: activeId,
    toStatus,
    beforeId: column[index - 1]?.id ?? null,
    afterId: column[index]?.id ?? null,
  }
}

/**
 * 서버 응답을 기다리지 않고 캐시를 먼저 고친다 (PRD P0 낙관적 갱신).
 * 서버와 같은 position 계산을 써야 드롭 직후와 재요청 후의 순서가 어긋나지 않는다.
 */
export function applyMove<T extends TodoDto>(todos: readonly T[], move: MoveIntent): T[] {
  const target = todos.find((todo) => todo.id === move.id)
  if (!target) return [...todos]

  const before = move.beforeId ? (todos.find((todo) => todo.id === move.beforeId)?.position ?? null) : null
  const after = move.afterId ? (todos.find((todo) => todo.id === move.afterId)?.position ?? null) : null

  return todos.map((todo) =>
    todo.id === move.id
      ? {
          ...todo,
          status: move.toStatus,
          position: computePosition(before, after),
          // 서버의 completedAt 규칙(A6)을 화면에서도 똑같이 흉내 낸다.
          completedAt:
            move.toStatus === 'done'
              ? (todo.completedAt ?? new Date().toISOString())
              : null,
        }
      : todo,
  )
}

/** 캐시 모양이 { todos } 를 포함하기만 하면 보드든 주간 뷰든 같은 함수로 갱신할 수 있다. */
export function applyMoveToCache<C extends { todos: TodoDto[] }>(cache: C | undefined, move: MoveIntent): C | undefined {
  if (!cache) return cache
  return { ...cache, todos: applyMove(cache.todos, move) }
}
