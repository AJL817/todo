'use client'

import { ProgressBar } from '@/components/ProgressBar'
import type { GoalDto, PlanProgressDto, WeeklyPlanDto } from '@/lib/dto'

export interface WeeklyPlanCardProps {
  plan: WeeklyPlanDto
  progress: PlanProgressDto
  goals: GoalDto[]
  onLinkGoal: (planId: string, goalId: string | null) => void
  onDelete: (planId: string) => void
  /** 이월 다이얼로그를 여는 콜백. 주어지지 않으면 버튼을 숨긴다 (US-008 에서 연결) */
  onCarryOver?: (planId: string) => void
}

export function WeeklyPlanCard({
  plan,
  progress,
  goals,
  onLinkGoal,
  onDelete,
  onCarryOver,
}: WeeklyPlanCardProps) {
  const carriedOut = Math.max(0, progress.denominator - progress.done)

  return (
    <article
      data-testid={`plan-${plan.id}`}
      data-title={plan.title}
      className="card-liftable flex flex-col gap-4 p-5"
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="t-title-md text-ink">{plan.title}</h3>
        <div className="flex gap-1">
          {onCarryOver && (
            <button
              type="button"
              data-testid={`plan-carryover-${plan.id}`}
              onClick={() => onCarryOver(plan.id)}
              className="btn btn-ghost btn-sm"
            >
              다음 주로 이월
            </button>
          )}
          <button
            type="button"
            aria-label={`${plan.title} 삭제`}
            data-testid={`plan-delete-${plan.id}`}
            onClick={() => onDelete(plan.id)}
            className="btn btn-ghost btn-sm"
          >
            삭제
          </button>
        </div>
      </header>

      <ProgressBar
        percent={progress.percent}
        label={`${progress.done}/${progress.denominator}`}
        testId={`plan-progress-${plan.id}`}
        title={
          // 분모에 이월돼 나간 건수가 포함된다는 사실을 숨기면 숫자가 이상해 보인다 (PLAN A8).
          carriedOut > 0
            ? '분모에는 이 주에서 이월돼 나간 할일도 포함됩니다. 그 주 안에 끝내지 못했다는 사실은 나중에 완료해도 바뀌지 않습니다.'
            : undefined
        }
      />

      <label className="flex items-center gap-2 t-caption-sm">
        <span className="t-caption shrink-0 text-muted">1년 목표</span>
        <select
          aria-label={`${plan.title} 의 1년 목표`}
          data-testid={`plan-goal-${plan.id}`}
          value={plan.goalId ?? ''}
          onChange={(event) => onLinkGoal(plan.id, event.target.value === '' ? null : event.target.value)}
          className="field min-h-0 flex-1 px-2 py-1.5 t-caption-sm"
        >
          <option value="">미분류</option>
          {goals.map((goal) => (
            <option key={goal.id} value={goal.id}>
              {goal.title}
            </option>
          ))}
        </select>
      </label>
    </article>
  )
}
