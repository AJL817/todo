'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/Toast'
import * as api from '@/lib/client/api'
import { queryKeys } from '@/lib/queryKeys'

function useInvalidateGoals() {
  const queryClient = useQueryClient()

  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.goals })
    void queryClient.invalidateQueries({ queryKey: ['weeklyPlans'] })
    void queryClient.invalidateQueries({ queryKey: queryKeys.metrics })
  }
}

export function useCreateGoal() {
  const invalidate = useInvalidateGoals()
  const { showError } = useToast()

  return useMutation({
    mutationFn: (payload: Parameters<typeof api.createGoal>[0]) => api.createGoal(payload),
    onSuccess: invalidate,
    onError: (error) => showError(error instanceof Error ? error.message : '목표를 만들지 못했습니다'),
  })
}

export function useDeleteGoal() {
  const invalidate = useInvalidateGoals()
  const { showError, showInfo } = useToast()

  return useMutation({
    mutationFn: (id: string) => api.deleteGoal(id),
    onSuccess: (result) => {
      invalidate()
      // 하위 주간 계획은 연쇄 삭제되지 않는다. 어디로 갔는지 알려 준다 (PRD P0).
      if (result.detachedPlans > 0) showInfo(`주간 계획 ${result.detachedPlans}건이 미분류로 이동했습니다`)
    },
    onError: (error) => showError(error instanceof Error ? error.message : '목표를 삭제하지 못했습니다'),
  })
}

/** 미분류 주간 계획을 목표에 붙인다. */
export function useLinkPlanToGoal() {
  const invalidate = useInvalidateGoals()
  const { showError } = useToast()

  return useMutation({
    mutationFn: ({ planId, goalId }: { planId: string; goalId: string | null }) =>
      api.updateWeeklyPlan(planId, { goalId }),
    onSuccess: invalidate,
    onError: (error) => showError(error instanceof Error ? error.message : '연결하지 못했습니다'),
  })
}
