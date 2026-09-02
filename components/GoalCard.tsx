'use client'

import Link from 'next/link'
import { ProgressBar } from '@/components/ProgressBar'
import type { GoalDto, GoalProgressDto } from '@/lib/dto'

/**
 * 숫자만 보면 분모를 알 수 없다. "경과 N주 기준" 을 항상 함께 적는다 (PLAN §0.2).
 * 미래 주를 미리 만들어 둔 사용자가 진행률을 오해하지 않게 하는 장치다.
 */
export function goalProgressText(progress: GoalProgressDto): string {
  return `${progress.percent}% (경과 ${progress.countedWeeks}주 기준)`
}

export interface GoalCardProps {
  goal: GoalDto
  progress: GoalProgressDto
  onDelete: (id: string) => void
}

export function GoalCard({ goal, progress, onDelete }: GoalCardProps) {
  return (
    <article
      data-testid={`goal-${goal.id}`}
      data-title={goal.title}
      className="card flex flex-col gap-4 p-6"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <Link href={`/goals/${goal.id}`} data-testid={`goal-link-${goal.id}`} className="t-title text-ink hover:text-primary-accent">
            {goal.title}
          </Link>
          <span className="mt-0.5 text-xs text-muted">{goal.year}년</span>
        </div>
        <button
          type="button"
          aria-label={`${goal.title} 삭제`}
          data-testid={`goal-delete-${goal.id}`}
          onClick={() => onDelete(goal.id)}
          className="btn btn-ghost btn-sm text-xs"
        >
          삭제
        </button>
      </header>

      <ProgressBar percent={progress.percent} testId={`goal-bar-${goal.id}`} />

      <p data-testid={`goal-progress-${goal.id}`} className="text-xs font-medium text-body">
        {goalProgressText(progress)}
      </p>

      {goal.description && <p className="text-xs leading-relaxed text-muted">{goal.description}</p>}
    </article>
  )
}
