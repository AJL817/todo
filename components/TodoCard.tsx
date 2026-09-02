'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import { formatKstDate, formatKstDateTime } from '@/lib/date'
import type { TodoDto } from '@/lib/dto'

export interface TodoCardProps {
  todo: TodoDto & { dueOutsideWeek?: boolean }
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  /** 드래그 없이 상태만 바꾸는 경로. 접근성과 E2E 안정성을 위해 항상 함께 제공한다 */
  onQuickMove?: (id: string, direction: -1 | 1) => void
}

export function TodoCard({ todo, onRename, onDelete, onQuickMove }: TodoCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(todo.title)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todo.id,
    data: { status: todo.status },
  })

  const commit = () => {
    const trimmed = draft.trim()
    setEditing(false)
    // 빈 제목은 서버에 보내지 않는다. 제목은 필수 필드다 (PRD P0).
    if (trimmed === '' || trimmed === todo.title) {
      setDraft(todo.title)
      return
    }
    onRename(todo.id, trimmed)
  }

  const carriedCount = todo.carriedFrom.length
  // 날짜 계산은 예외 없이 lib/date.ts 를 거친다 (docs/CLAUDE.md 컨벤션)
  const dueLabel = todo.dueDate === null ? null : formatKstDate(todo.dueDate)
  const completedLabel = todo.completedAt === null ? null : formatKstDateTime(todo.completedAt)

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid={`card-${todo.id}`}
      data-title={todo.title}
      data-status={todo.status}
      className={`rounded-lg border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-slate-800 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label={`${todo.title} 카드 이동 손잡이`}
          data-testid={`handle-${todo.id}`}
          className="mt-0.5 cursor-grab touch-none px-1 text-xs opacity-50 hover:opacity-100"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>

        {editing ? (
          <input
            autoFocus
            value={draft}
            aria-label="할일 제목 수정"
            data-testid={`edit-${todo.id}`}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit()
              if (event.key === 'Escape') {
                setDraft(todo.title)
                setEditing(false)
              }
            }}
            className="w-full rounded border border-black/20 px-2 py-1 text-sm dark:border-white/20 dark:bg-slate-900"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            data-testid={`title-${todo.id}`}
            className="flex-1 text-left text-sm font-medium"
          >
            {todo.title}
          </button>
        )}

        <button
          type="button"
          aria-label={`${todo.title} 삭제`}
          data-testid={`delete-${todo.id}`}
          onClick={() => onDelete(todo.id)}
          className="px-1 text-xs opacity-50 hover:opacity-100"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        {dueLabel && (
          <span
            data-testid={`due-${todo.id}`}
            className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-200"
          >
            {dueLabel}
          </span>
        )}

        {todo.dueOutsideWeek && (
          // 목록에서 빼지 않고 배지로만 알린다. 이월과 장기 과제가 정상적으로 만드는 상태다 (PLAN A10).
          <span
            data-testid={`due-outside-${todo.id}`}
            title="마감일이 이 주간 계획의 주 범위를 벗어납니다"
            className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-900 dark:text-amber-100"
          >
            주 범위 밖
          </span>
        )}

        {carriedCount > 0 && (
          <span
            data-testid={`carried-${todo.id}`}
            title={`${carriedCount}번 이월된 할일입니다`}
            className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-800 dark:bg-purple-900 dark:text-purple-100"
          >
            이월 {carriedCount}
          </span>
        )}

        {completedLabel && (
          <span
            data-testid={`completed-${todo.id}`}
            className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100"
          >
            완료 {completedLabel}
          </span>
        )}
      </div>

      {onQuickMove && (
        <div className="mt-2 flex gap-1">
          <button
            type="button"
            data-testid={`move-left-${todo.id}`}
            aria-label={`${todo.title} 이전 상태로`}
            disabled={todo.status === 'todo'}
            onClick={() => onQuickMove(todo.id, -1)}
            className="rounded border border-black/10 px-1.5 py-0.5 text-[11px] disabled:opacity-30 dark:border-white/10"
          >
            ←
          </button>
          <button
            type="button"
            data-testid={`move-right-${todo.id}`}
            aria-label={`${todo.title} 다음 상태로`}
            disabled={todo.status === 'done'}
            onClick={() => onQuickMove(todo.id, 1)}
            className="rounded border border-black/10 px-1.5 py-0.5 text-[11px] disabled:opacity-30 dark:border-white/10"
          >
            →
          </button>
        </div>
      )}
    </li>
  )
}
