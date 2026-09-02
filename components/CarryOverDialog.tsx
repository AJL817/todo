'use client'

import { useEffect, useState } from 'react'
import type { TodoDto, WeeklyPlanDto } from '@/lib/dto'
import { STATUS_LABELS } from '@/lib/dto'

/**
 * 이월 확인 다이얼로그 (PLAN §4.5).
 *
 * 이월은 되돌릴 수 없다. 그래서 무엇이 옮겨지는지 먼저 보여 주고 항목별로 뺄 수 있게 한다.
 * 완료된 할일은 이미 그 주의 성과이므로 서버가 목록에서 제외해 준다.
 */

export interface CarryOverDialogProps {
  plan: WeeklyPlanDto
  targetWeekLabel: string
  todos: TodoDto[]
  loading: boolean
  pending: boolean
  onConfirm: (todoIds: string[]) => void
  onClose: () => void
}

export function CarryOverDialog({
  plan,
  targetWeekLabel,
  todos,
  loading,
  pending,
  onConfirm,
  onClose,
}: CarryOverDialogProps) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  // 목록이 바뀌면 선택 상태를 초기화한다. 기본값은 전부 선택이다.
  useEffect(() => {
    setExcluded(new Set())
  }, [todos])

  const selectedIds = todos.filter((todo) => !excluded.has(todo.id)).map((todo) => todo.id)

  const toggle = (todoId: string) => {
    setExcluded((current) => {
      const next = new Set(current)
      if (next.has(todoId)) next.delete(todoId)
      else next.add(todoId)
      return next
    })
  }

  return (
    <div
      data-testid="carryover-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={`${plan.title} 이월`}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="flex max-h-[80vh] w-full max-w-md flex-col gap-4 overflow-auto rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <header className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">다음 주로 이월</h2>
          <p className="text-xs opacity-70">
            <strong>{plan.title}</strong> 의 미완료 할일을 <strong>{targetWeekLabel}</strong> 주로 옮깁니다.
          </p>
          <p className="text-xs opacity-60">
            옮겨도 이번 주 진행률은 오르지 않습니다. 이 주 안에 끝내지 못했다는 사실은 그대로 남습니다.
          </p>
        </header>

        {loading ? (
          <p data-testid="carryover-loading" className="text-sm opacity-60">
            대상을 불러오는 중…
          </p>
        ) : todos.length === 0 ? (
          <p data-testid="carryover-empty" className="text-sm opacity-60">
            이월할 미완료 할일이 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="carryover-list">
            {todos.map((todo) => (
              <li key={todo.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  id={`carryover-check-${todo.id}`}
                  data-testid={`carryover-check-${todo.id}`}
                  checked={!excluded.has(todo.id)}
                  onChange={() => toggle(todo.id)}
                />
                <label htmlFor={`carryover-check-${todo.id}`} data-title={todo.title} className="flex-1">
                  {todo.title}
                </label>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                  {STATUS_LABELS[todo.status]}
                </span>
              </li>
            ))}
          </ul>
        )}

        <footer className="flex justify-end gap-2">
          <button
            type="button"
            data-testid="carryover-cancel"
            onClick={onClose}
            className="rounded-md border border-black/15 px-4 py-2 text-sm dark:border-white/15"
          >
            취소
          </button>
          <button
            type="button"
            data-testid="carryover-confirm"
            disabled={pending || loading || selectedIds.length === 0}
            onClick={() => onConfirm(selectedIds)}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
          >
            {selectedIds.length}건 이월
          </button>
        </footer>
      </div>
    </div>
  )
}
