export interface ProgressBarProps {
  percent: number
  label?: string
  testId?: string
  title?: string
  /**
   * 숫자를 바 위에 다시 적을지. 목표 상세처럼 같은 숫자가 이미 크게 떠 있는
   * 화면에서는 끈다 — 한 화면에 같은 값이 세 번 나오면 읽는 사람이 셋을 비교한다.
   */
  showPercent?: boolean
}

export function ProgressBar({ percent, label, testId, title, showPercent = true }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent))

  return (
    <div className="flex flex-col gap-1" title={title}>
      {/* 둘 다 없으면 행 자체를 만들지 않는다. 빈 행이 남으면 위쪽 간격만 벌어진다 */}
      {(showPercent || label) && (
        <div className="flex items-baseline justify-between t-caption-sm">
          {showPercent && (
            <span data-testid={testId ? `${testId}-percent` : undefined} className="font-semibold text-ink">
              {clamped}%
            </span>
          )}
          {label && (
            <span data-testid={testId ? `${testId}-label` : undefined} className="ml-auto text-muted">
              {label}
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        data-testid={testId}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-strong"
      >
        {/* 강조색은 하나다. 진행률도 브랜드 Rausch 를 쓴다 */}
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  )
}
