'use client'

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useMemo } from 'react'
import { TodoCard } from '@/components/TodoCard'
import { resolveDrop, type MoveIntent } from '@/lib/client/optimistic'
import { STATUS_LABELS, STATUS_ORDER, type TodoDto } from '@/lib/dto'
import { sortByPosition } from '@/lib/position'
import type { TodoStatus } from '@/models/types'

export type BoardTodo = TodoDto & { dueOutsideWeek?: boolean }

export interface KanbanBoardProps {
  todos: BoardTodo[]
  onMove: (move: MoveIntent) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

function Column({
  status,
  todos,
  onRename,
  onDelete,
  onQuickMove,
}: {
  status: TodoStatus
  todos: BoardTodo[]
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onQuickMove: (id: string, direction: -1 | 1) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <section
      ref={setNodeRef}
      data-testid={`column-${status}`}
      data-count={todos.length}
      className={`well flex min-h-64 flex-1 flex-col gap-2 p-3 transition-colors ${
        isOver ? 'bg-primary-soft' : ''
      }`}
    >
      <header className="flex items-center justify-between px-1 pb-1">
        <h2 className="t-display-sm text-ink">{STATUS_LABELS[status]}</h2>
        <span className="t-caption-sm tabular-nums text-muted" data-testid={`count-${status}`}>
          {todos.length}
        </span>
      </header>

      <SortableContext items={todos.map((todo) => todo.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-1 flex-col gap-2">
          {todos.map((todo) => (
            <TodoCard
              key={todo.id}
              todo={todo}
              onRename={onRename}
              onDelete={onDelete}
              onQuickMove={onQuickMove}
            />
          ))}
        </ul>
      </SortableContext>
    </section>
  )
}

export function KanbanBoard({ todos, onMove, onRename, onDelete }: KanbanBoardProps) {
  // 충돌 판정은 closestCenter 를 쓴다. closestCorners 는 넓은 열 사각형과 카드 사각형을
  // 함께 견주기 때문에 열의 카드 수에 따라 판정이 흔들린다.
  const sensors = useSensors(
    // 클릭과 드래그를 구분하기 위한 최소 이동 거리. 카드 안의 버튼이 눌리지 않게 한다.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const columns = useMemo(() => {
    const grouped = new Map<TodoStatus, BoardTodo[]>(STATUS_ORDER.map((status) => [status, []]))
    for (const todo of todos) grouped.get(todo.status)?.push(todo)
    for (const [status, list] of grouped) grouped.set(status, sortByPosition(list))
    return grouped
  }, [todos])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const move = resolveDrop(todos, String(active.id), String(over.id), STATUS_ORDER)
    if (!move) return

    const current = todos.find((todo) => todo.id === move.id)
    // 같은 열의 같은 자리로 떨어뜨렸으면 요청을 낭비하지 않는다.
    if (current?.status === move.toStatus && move.beforeId === null && move.afterId === null) return

    onMove(move)
  }

  /** 드래그 없이 상태를 한 칸 옮긴다. 열 맨 뒤에 붙는다. */
  const handleQuickMove = (todoId: string, direction: -1 | 1) => {
    const todo = todos.find((item) => item.id === todoId)
    if (!todo) return

    const nextIndex = STATUS_ORDER.indexOf(todo.status) + direction
    const toStatus = STATUS_ORDER[nextIndex]
    if (!toStatus) return

    const column = columns.get(toStatus) ?? []
    onMove({ id: todoId, toStatus, beforeId: column.at(-1)?.id ?? null, afterId: null })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-4 md:flex-row" data-testid="board">
        {STATUS_ORDER.map((status) => (
          <Column
            key={status}
            status={status}
            todos={columns.get(status) ?? []}
            onRename={onRename}
            onDelete={onDelete}
            onQuickMove={handleQuickMove}
          />
        ))}
      </div>
    </DndContext>
  )
}
