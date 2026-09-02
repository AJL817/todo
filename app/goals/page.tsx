'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { GoalCard } from '@/components/GoalCard'
import { useCreateGoal, useDeleteGoal, useLinkPlanToGoal } from '@/hooks/useGoalMutations'
import { fetchGoals, fetchWeeklyPlans } from '@/lib/client/api'
import { formatKstDate } from '@/lib/date'
import { queryKeys } from '@/lib/queryKeys'

const UNASSIGNED_PLANS = { unassignedOnly: true } as const

export default function GoalsPage() {
  const currentYear = Number(formatKstDate(new Date()).slice(0, 4))

  const [title, setTitle] = useState('')
  const [year, setYear] = useState(String(currentYear))
  const [error, setError] = useState<string | null>(null)

  const goalsQuery = useQuery({ queryKey: queryKeys.goals, queryFn: fetchGoals })
  const orphanPlansQuery = useQuery({
    queryKey: queryKeys.weeklyPlans(UNASSIGNED_PLANS),
    queryFn: () => fetchWeeklyPlans(UNASSIGNED_PLANS),
  })

  const createGoal = useCreateGoal()
  const deleteGoal = useDeleteGoal()
  const linkPlan = useLinkPlanToGoal()

  const goals = goalsQuery.data?.goals ?? []
  const orphanPlans = orphanPlansQuery.data?.plans ?? []

  const submit = (event: FormEvent) => {
    event.preventDefault()

    const trimmed = title.trim()
    if (trimmed === '') {
      setError('제목을 입력하세요')
      return
    }

    const parsedYear = Number(year)
    if (!Number.isInteger(parsedYear)) {
      setError('연도를 숫자로 입력하세요')
      return
    }

    setError(null)
    createGoal.mutate({
      title: trimmed,
      year: parsedYear,
      startDate: `${parsedYear}-01-01`,
      endDate: `${parsedYear}-12-31`,
    })
    setTitle('')
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">1년 목표</h1>
        <p className="text-sm opacity-70">
          진행률은 <strong>경과한 주</strong>만 세어 평균 냅니다. 미래 주를 미리 만들어 둬도 오늘의 성과가 깎이지 않습니다.
        </p>
      </header>

      <form onSubmit={submit} data-testid="goal-form" noValidate className="flex flex-wrap items-start gap-2">
        <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value)
              if (error) setError(null)
            }}
            placeholder="1년 목표 제목"
            aria-label="1년 목표 제목"
            data-testid="goal-title"
            className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-900"
          />
          {error && (
            <p role="alert" data-testid="goal-title-error" className="text-xs text-red-600">
              {error}
            </p>
          )}
        </div>

        <input
          value={year}
          onChange={(event) => setYear(event.target.value)}
          inputMode="numeric"
          aria-label="연도"
          data-testid="goal-year"
          className="w-24 rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-900"
        />

        <button
          type="submit"
          disabled={createGoal.isPending}
          data-testid="goal-submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          목표 추가
        </button>
      </form>

      {goalsQuery.isPending ? (
        <p data-testid="goals-loading" className="text-sm opacity-60">
          불러오는 중…
        </p>
      ) : goals.length === 0 ? (
        <p data-testid="goals-empty" className="text-sm opacity-60">
          아직 1년 목표가 없습니다.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3" data-testid="goal-list">
          {goals.map((entry) => (
            <GoalCard
              key={entry.goal.id}
              goal={entry.goal}
              progress={entry.progress}
              onDelete={(id) => deleteGoal.mutate(id)}
            />
          ))}
        </div>
      )}

      <section
        data-testid="orphan-plans"
        className="flex flex-col gap-3 rounded-xl border border-black/10 p-4 dark:border-white/10"
      >
        <header className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">미분류 주간 계획</h2>
          <span data-testid="orphan-plan-count" className="text-xs opacity-60">
            {orphanPlans.length}건
          </span>
        </header>

        <p className="text-xs opacity-60">
          목표에 연결되지 않은 주간 계획입니다. 목표를 삭제해도 하위 계획은 지워지지 않고 여기로 옵니다.
        </p>

        {orphanPlans.length === 0 ? (
          <p data-testid="orphan-plans-empty" className="text-xs opacity-60">
            미분류 주간 계획이 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {orphanPlans.map((plan) => (
              <li key={plan.id} data-testid={`orphan-plan-${plan.id}`} data-title={plan.title} className="flex items-center gap-2 text-xs">
                <span className="min-w-[10rem] truncate font-medium">{plan.title}</span>
                <span className="opacity-60">{formatKstDate(plan.weekStart)}</span>
                <select
                  aria-label={`${plan.title} 을 연결할 1년 목표`}
                  data-testid={`orphan-plan-assign-${plan.id}`}
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value !== '') linkPlan.mutate({ planId: plan.id, goalId: event.target.value })
                  }}
                  className="rounded border border-black/15 px-2 py-1 dark:border-white/15 dark:bg-slate-900"
                >
                  <option value="">연결할 목표 선택</option>
                  {goals.map((entry) => (
                    <option key={entry.goal.id} value={entry.goal.id}>
                      {entry.goal.title}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
