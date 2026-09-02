'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { use } from 'react'
import { ProgressBar } from '@/components/ProgressBar'
import { goalProgressText } from '@/components/GoalCard'
import { fetchGoal } from '@/lib/client/api'
import { formatKstDate } from '@/lib/date'
import { queryKeys } from '@/lib/queryKeys'

export default function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const goalQuery = useQuery({ queryKey: queryKeys.goal(id), queryFn: () => fetchGoal(id) })

  if (goalQuery.isPending) {
    return (
      <p data-testid="goal-loading" className="t-body text-muted">
        불러오는 중…
      </p>
    )
  }

  if (goalQuery.isError || !goalQuery.data) {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" data-testid="goal-error" className="text-sm text-danger">
          목표를 불러오지 못했습니다.
        </p>
        <Link href="/goals" className="text-sm text-primary-accent underline">
          목록으로
        </Link>
      </div>
    )
  }

  const { goal, progress, plans } = goalQuery.data

  return (
    <div className="flex flex-col gap-16">
      <header className="flex flex-col gap-2">
        <Link href="/goals" data-testid="goal-back" className="text-xs text-muted underline hover:text-ink">
          ← 1년 목표 목록
        </Link>
        <h1 data-testid="goal-detail-title" className="t-display text-ink">
          {goal.title}
        </h1>
        <p className="t-body text-muted">
          {goal.year}년 · {formatKstDate(goal.startDate)} ~ {formatKstDate(goal.endDate)}
        </p>
        {goal.description && <p className="t-body text-muted">{goal.description}</p>}
      </header>

      <section className="card flex flex-col gap-4 p-6">
        <ProgressBar percent={progress.percent} testId="goal-detail-bar" />
        <p data-testid="goal-detail-progress" className="text-sm font-semibold text-ink">
          {goalProgressText(progress)}
        </p>
        <p className="text-xs text-muted">
          아직 오지 않은 주는 분모에서 빠집니다. 경과했지만 비어 있는 주는 0% 로 그대로 반영됩니다.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="t-section text-ink">하위 주간 계획</h2>

        {plans.length === 0 ? (
          <p data-testid="goal-plans-empty" className="t-body text-muted">
            연결된 주간 계획이 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="goal-plan-list">
            {plans.map((entry) => (
              <li
                key={entry.plan.id}
                data-testid={`goal-plan-${entry.plan.id}`}
                data-title={entry.plan.title}
                className="card flex flex-col gap-3 p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/week/${formatKstDate(entry.plan.weekStart)}`} className="text-sm font-medium text-ink hover:text-primary-accent">
                    {entry.plan.title}
                  </Link>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-muted">{formatKstDate(entry.plan.weekStart)}</span>
                    {/* 할일 건수를 함께 보여 준다. 1~2건짜리 주로 진행률을 부풀리는 것은 산식으로
                        막을 수 없으므로, 사용자가 스스로 판단할 재료를 준다 (PLAN R14). */}
                    <span
                      data-testid={`goal-plan-todocount-${entry.plan.id}`}
                      className="badge badge-neutral"
                    >
                      할일 {entry.todoCount}건
                    </span>
                    <span
                      data-testid={`goal-plan-counted-${entry.plan.id}`}
                      title={entry.counted ? '이 주는 목표 진행률 분모에 포함됩니다' : '아직 오지 않은 주라 분모에서 빠집니다'}
                      className={`badge ${entry.counted ? 'badge-primary' : 'badge-neutral'}`}
                    >
                      {entry.counted ? '집계 대상' : '미도래'}
                    </span>
                  </div>
                </div>

                <ProgressBar
                  percent={entry.progress.percent}
                  label={`${entry.progress.done}/${entry.progress.denominator}`}
                  testId={`goal-plan-progress-${entry.plan.id}`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
