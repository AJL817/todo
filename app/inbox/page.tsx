'use client'

import { useQuery } from '@tanstack/react-query'
import { InboxSection } from '@/components/InboxSection'
import { useAssignTodo } from '@/hooks/usePlanMutations'
import { fetchInbox, fetchWeeklyPlans } from '@/lib/client/api'
import { formatKstDate, weekStartOf } from '@/lib/date'
import { queryKeys } from '@/lib/queryKeys'

/**
 * 미분류 전용 뷰 (PLAN §4.6).
 * 미분류를 방치하면 목표와 단절된 할일이 쌓여 제품 목적 자체가 무력화되므로,
 * 해소 경로를 별도 화면으로 둔다.
 */
export default function InboxPage() {
  const weekStart = formatKstDate(weekStartOf(new Date()))

  const inboxQuery = useQuery({ queryKey: queryKeys.inbox, queryFn: fetchInbox })
  const plansQuery = useQuery({
    queryKey: queryKeys.weeklyPlans({ weekStart }),
    queryFn: () => fetchWeeklyPlans({ weekStart }),
  })

  const assign = useAssignTodo([queryKeys.inbox, queryKeys.week(weekStart), queryKeys.todos])

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-1.5 mb-4">
        <h1 className="t-display text-ink">미분류</h1>
        <p className="t-body text-muted">
          주간 계획에 연결되지 않은 할일입니다. 어떤 진행률에도 반영되지 않으므로 이번 주 계획에 붙여 주세요.
        </p>
      </header>

      {inboxQuery.isPending ? (
        <p data-testid="inbox-loading" className="t-body text-muted">
          불러오는 중…
        </p>
      ) : (
        <InboxSection
          todos={inboxQuery.data?.todos ?? []}
          plans={plansQuery.data?.plans ?? []}
          onAssign={(todoId, planId) => assign.mutate({ todoId, planId })}
          heading="연결되지 않은 할일"
        />
      )}
    </div>
  )
}
