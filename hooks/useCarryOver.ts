'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/Toast'
import * as api from '@/lib/client/api'
import { addWeeks, formatKstDate, weekStartOf } from '@/lib/date'
import { queryKeys } from '@/lib/queryKeys'

/**
 * 이월 (PLAN §4.5 / A8).
 *
 * 되돌리기가 없으므로 실행 전에 대상 목록을 보여 주고 확인을 받는다.
 * 실행 후에는 떠난 주와 도착한 주 양쪽 진행률을 함께 무효화해야 한다.
 * 한쪽만 갱신하면 화면의 두 숫자가 어긋난다 (PRD P0 "양쪽 진행률 재계산").
 */

export function useCarryOverPreview(planId: string | null) {
  return useQuery({
    queryKey: ['carryOverPreview', planId],
    queryFn: () => api.fetchCarryOverPreview(planId as string),
    enabled: planId !== null,
    staleTime: 0,
  })
}

export function useCarryOver(weekStart: string) {
  const queryClient = useQueryClient()
  const { showError, showInfo } = useToast()

  const nextWeek = formatKstDate(addWeeks(weekStartOf(weekStart), 1))

  return useMutation({
    mutationFn: ({ planId, todoIds }: { planId: string; todoIds: string[] }) => api.carryOver(planId, todoIds),

    onSuccess: (result) => {
      // 떠난 주와 도착한 주 양쪽을 무효화한다.
      for (const key of [
        queryKeys.week(weekStart),
        queryKeys.week(nextWeek),
        queryKeys.weeklyPlans({ weekStart }),
        queryKeys.weeklyPlans({ weekStart: nextWeek }),
        queryKeys.todos,
        queryKeys.goals,
        queryKeys.metrics,
      ]) {
        void queryClient.invalidateQueries({ queryKey: key })
      }
      void queryClient.invalidateQueries({ queryKey: ['carryOverPreview'] })

      if (result.carriedIds.length === 0) {
        showInfo('이월할 항목이 없습니다')
        return
      }

      showInfo(
        result.createdTargetPlan
          ? `${result.carriedIds.length}건을 이월했습니다. 다음 주 계획을 새로 만들었습니다.`
          : `${result.carriedIds.length}건을 이월했습니다.`,
      )
    },

    onError: (error) => showError(error instanceof Error ? error.message : '이월하지 못했습니다'),
  })
}
