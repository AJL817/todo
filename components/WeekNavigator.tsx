'use client'

import Link from 'next/link'
import { addWeeks, formatKstDate, weekStartOf } from '@/lib/date'

export function WeekNavigator({ weekStart }: { weekStart: string }) {
  const start = weekStartOf(weekStart)
  const previous = formatKstDate(addWeeks(start, -1))
  const next = formatKstDate(addWeeks(start, 1))
  const sunday = formatKstDate(new Date(addWeeks(start, 1).getTime() - 24 * 60 * 60 * 1000))
  const thisWeek = formatKstDate(weekStartOf(new Date()))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/week/${previous}`}
        data-testid="week-prev"
        className="btn btn-secondary btn-sm"
      >
        ← 이전 주
      </Link>

      <span data-testid="week-range" className="px-1 text-sm font-semibold text-ink">
        {formatKstDate(start)} ~ {sunday}
      </span>

      <Link
        href={`/week/${next}`}
        data-testid="week-next"
        className="btn btn-secondary btn-sm"
      >
        다음 주 →
      </Link>

      {formatKstDate(start) !== thisWeek && (
        <Link
          href={`/week/${thisWeek}`}
          data-testid="week-today"
          className="btn btn-ghost btn-sm underline"
        >
          이번 주로
        </Link>
      )}
    </div>
  )
}
