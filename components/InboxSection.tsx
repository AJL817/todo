'use client'

import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import type { TodoDto, WeeklyPlanDto } from '@/lib/dto'

/**
 * 미분류는 조회 가능한 상태가 아니라 해소해야 할 큐다 (PLAN §4.6).
 * 그래서 목록만 보여 주지 않고, 이번 주 계획으로 바로 끌어다 붙일 수 있게 한다.
 * 드래그를 못 쓰는 상황을 위해 셀렉트 경로도 함께 둔다.
 */

export interface InboxSectionProps {
  todos: TodoDto[]
  plans: WeeklyPlanDto[]
  onAssign: (todoId: string, planId: string) => void
  heading?: string
}

function InboxChip({ todo }: { todo: TodoDto }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: todo.id })

  return (
    <span
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      data-testid={`inbox-item-${todo.id}`}
      data-title={todo.title}
      className={`inline-flex cursor-grab touch-none items-center gap-1 rounded-full border border-hairline bg-surface px-3.5 py-1.5 text-sm text-ink transition-shadow hover:shadow-float ${
        isDragging ? 'opacity-50' : ''
      }`}
      {...attributes}
      {...listeners}
    >
      {todo.title}
    </span>
  )
}

function PlanDropTarget({ plan }: { plan: WeeklyPlanDto }) {
  const { setNodeRef, isOver } = useDroppable({ id: `plan-${plan.id}` })

  return (
    <span
      ref={setNodeRef}
      data-testid={`inbox-drop-${plan.id}`}
      className={`rounded-control border border-dashed px-3 py-2 text-xs transition-colors ${
        isOver ? 'border-primary bg-primary-soft text-primary-accent' : 'border-border-strong text-muted'
      }`}
    >
      {plan.title}
    </span>
  )
}

export function InboxSection({ todos, plans, onAssign, heading = '미분류' }: InboxSectionProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // 칩이 작아 사각형 교차 판정은 흔들린다. 포인터 위치를 그대로 쓰는 pointerWithin 이 정확하다.

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const overId = String(over.id)
    if (!overId.startsWith('plan-')) return

    onAssign(String(active.id), overId.slice('plan-'.length))
  }

  return (
    <section data-testid="inbox-section" className="card flex flex-col gap-4 p-5">
      <header className="flex items-baseline gap-2">
        <h2 className="text-[15px] font-semibold text-ink">{heading}</h2>
        <span data-testid="inbox-count" className="text-xs text-muted">
          {todos.length}건
        </span>
      </header>

      {todos.length === 0 ? (
        <p data-testid="inbox-empty" className="text-xs text-muted">
          미분류 할일이 없습니다.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {todos.map((todo) => (
                <InboxChip key={todo.id} todo={todo} />
              ))}
            </div>

            {plans.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted">아래 계획으로 끌어다 놓으면 연결됩니다.</p>
                <div className="flex flex-wrap gap-2">
                  {plans.map((plan) => (
                    <PlanDropTarget key={plan.id} plan={plan} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </DndContext>
      )}

      {todos.length > 0 && plans.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-hairline pt-4">
          {todos.map((todo) => (
            <label key={todo.id} className="flex items-center gap-2 text-xs">
              <span className="min-w-32 truncate text-sm text-body">{todo.title}</span>
              <select
                aria-label={`${todo.title} 을 연결할 주간 계획`}
                data-testid={`inbox-assign-${todo.id}`}
                defaultValue=""
                onChange={(event) => {
                  if (event.target.value !== '') onAssign(todo.id, event.target.value)
                }}
                className="field min-h-0 w-auto px-2 py-1.5 text-xs"
              >
                <option value="">연결할 계획 선택</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.title}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
    </section>
  )
}
