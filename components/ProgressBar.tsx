export interface ProgressBarProps {
  percent: number
  label?: string
  testId?: string
  title?: string
}

export function ProgressBar({ percent, label, testId, title }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent))

  return (
    <div className="flex flex-col gap-1" title={title}>
      <div className="flex items-baseline justify-between text-xs">
        <span data-testid={testId ? `${testId}-percent` : undefined} className="font-semibold text-ink">
          {clamped}%
        </span>
        {label && (
          <span data-testid={testId ? `${testId}-label` : undefined} className="text-muted">
            {label}
          </span>
        )}
      </div>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        data-testid={testId}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-strong"
      >
        {/* 강조색은 하나다. 진행률도 브랜드 인디고를 쓴다 */}
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  )
}
