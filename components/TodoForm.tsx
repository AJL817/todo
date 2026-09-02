'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { fetchWeeklyPlan } from '@/lib/client/api'
import { formatKstDate } from '@/lib/date'
import { STATUS_LABELS, type WeeklyPlanDto } from '@/lib/dto'
import { queryKeys } from '@/lib/queryKeys'

export interface TodoFormProps {
  onCreate: (payload: { title: string; dueDate: string | null; weeklyPlanId: string | null }) => void
  /** 주간 계획 선택지. 비어 있으면 셀렉트를 숨긴다 */
  plans?: WeeklyPlanDto[]
  defaultPlanId?: string | null
  pending?: boolean
}

export function TodoForm({ onCreate, plans = [], defaultPlanId = null, pending = false }: TodoFormProps) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  // 계획 목록은 비동기로 도착한다. useState 초기값으로만 쓰면 기본 선택이 영영 반영되지 않는다.
  // 사용자가 직접 고르기 전까지는 defaultPlanId 를 따른다.
  const [chosenPlanId, setChosenPlanId] = useState<string | null>(null)
  const planId = chosenPlanId ?? defaultPlanId ?? ''
  const [error, setError] = useState<string | null>(null)

  // 고른 계획에 이미 무엇이 들어 있는지 보여 준다. 중복 등록을 막고,
  // "이 할일이 어디에 붙는지" 를 저장 전에 확인할 수 있게 하는 것이 목적이다.
  const selectedPlan = useQuery({
    queryKey: queryKeys.weeklyPlan(planId),
    queryFn: () => fetchWeeklyPlan(planId),
    enabled: planId !== '',
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()

    const trimmed = title.trim()
    if (trimmed === '') {
      // 제목은 필수다 (PRD P0). 폼에서 막아 네트워크 요청 자체를 만들지 않는다.
      setError('제목을 입력하세요')
      return
    }

    setError(null)
    onCreate({
      title: trimmed,
      dueDate: dueDate === '' ? null : dueDate,
      weeklyPlanId: planId === '' ? null : planId,
    })
    setTitle('')
    setDueDate('')
  }

  const linked = selectedPlan.data

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} data-testid="todo-form" noValidate className="flex flex-wrap items-start gap-2.5">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value)
              if (error) setError(null)
            }}
            placeholder="할 일 제목"
            aria-label="할 일 제목"
            aria-invalid={error !== null}
            data-testid="todo-title"
            className="field"
          />
          {error && (
            <p role="alert" data-testid="todo-title-error" className="text-xs text-danger">
              {error}
            </p>
          )}
        </div>

        <input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          aria-label="마감일"
          data-testid="todo-due"
          className="field w-auto"
        />

        {plans.length > 0 && (
          <select
            value={planId}
            onChange={(event) => setChosenPlanId(event.target.value)}
            aria-label="주간 계획"
            data-testid="todo-plan"
            className="field w-auto"
          >
            <option value="">미분류</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {/* 같은 제목의 계획이 여러 주에 있을 수 있다. 주 시작일을 함께 적어 구분한다 */}
                {formatKstDate(plan.weekStart)} · {plan.title}
              </option>
            ))}
          </select>
        )}

        <button
          type="submit"
          disabled={pending}
          data-testid="todo-submit"
          className="btn btn-primary"
        >
          추가
        </button>
      </form>

      {planId !== '' && (
        <section
          data-testid="linked-plan-preview"
          className="card bg-surface-soft p-4"
        >
          {selectedPlan.isPending ? (
            <p className="text-xs text-muted">연결할 계획을 불러오는 중…</p>
          ) : selectedPlan.isError || !linked ? (
            <p role="alert" className="text-xs text-danger">
              계획 정보를 불러오지 못했습니다.
            </p>
          ) : (
            <>
              <header className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold text-ink" data-testid="linked-plan-title">
                  {linked.plan.title}
                </span>
                <span className="text-xs text-muted">{formatKstDate(linked.plan.weekStart)} 주</span>
                <span
                  data-testid="linked-plan-progress"
                  className="badge badge-primary"
                >
                  {linked.progress.percent}% · {linked.progress.done}/{linked.progress.denominator}
                </span>
              </header>

              {linked.todos.length === 0 ? (
                <p data-testid="linked-plan-empty" className="mt-3 text-xs text-muted">
                  이 계획에는 아직 할일이 없습니다. 추가하면 첫 번째가 됩니다.
                </p>
              ) : (
                <ul data-testid="linked-plan-todos" className="mt-3 flex flex-col gap-1.5">
                  {linked.todos.map((todo) => (
                    <li
                      key={todo.id}
                      data-testid={`linked-todo-${todo.id}`}
                      data-title={todo.title}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span
                        className={`badge ${todo.status === 'done' ? 'badge-primary' : 'badge-neutral'}`}
                      >
                        {STATUS_LABELS[todo.status]}
                      </span>
                      <span className={todo.status === 'done' ? 'text-muted line-through' : 'text-body'}>{todo.title}</span>
                      {todo.dueDate && <span className="text-xs text-muted-soft">{formatKstDate(todo.dueDate)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
