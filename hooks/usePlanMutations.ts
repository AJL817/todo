'use client'

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useToast } from '@/components/Toast'
import * as api from '@/lib/client/api'
import { queryKeys } from '@/lib/queryKeys'

/**
 * 진행률은 저장하지 않고 조회 시 계산하므로(PLAN A4), "재계산"은 곧 캐시 무효화다.
 * 재지정과 이월은 이전 계획과 새 계획 양쪽을 함께 무효화해야 한다 (PRD P0).
 */
function useAfterChange(keys: QueryKey[]) {
  const queryClient = useQueryClient()

  return () => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: key })
    void queryClient.invalidateQueries({ queryKey: queryKeys.weeklyPlansRoot })
    void queryClient.invalidateQueries({ queryKey: queryKeys.inbox })
    void queryClient.invalidateQueries({ queryKey: queryKeys.goals })
    void queryClient.invalidateQueries({ queryKey: queryKeys.metrics })
  }
}

export function useCreatePlan(keys: QueryKey[]) {
  const invalidate = useAfterChange(keys)
  const { showError } = useToast()

  return useMutation({
    mutationFn: (payload: { title: string; weekStart: string; goalId?: string | null }) =>
      api.createWeeklyPlan(payload),
    onSuccess: invalidate,
    onError: (error) => showError(error instanceof Error ? error.message : '주간 계획을 만들지 못했습니다'),
  })
}

export function useUpdatePlan(keys: QueryKey[]) {
  const invalidate = useAfterChange(keys)
  const { showError } = useToast()

  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; title?: string; goalId?: string | null }) =>
      api.updateWeeklyPlan(id, payload),
    onSuccess: invalidate,
    onError: (error) => showError(error instanceof Error ? error.message : '주간 계획을 수정하지 못했습니다'),
  })
}

export function useDeletePlan(keys: QueryKey[]) {
  const invalidate = useAfterChange(keys)
  const { showError, showInfo } = useToast()

  return useMutation({
    mutationFn: (id: string) => api.deleteWeeklyPlan(id),
    onSuccess: (result) => {
      invalidate()
      // 하위 할일은 연쇄 삭제되지 않는다. 어디로 갔는지 알려 줘야 사용자가 찾을 수 있다.
      if (result.detachedTodos > 0) showInfo(`할일 ${result.detachedTodos}건이 미분류로 이동했습니다`)
    },
    onError: (error) => showError(error instanceof Error ? error.message : '주간 계획을 삭제하지 못했습니다'),
  })
}

/** 미분류 할일을 주간 계획에 붙인다. 이월이 아니므로 carriedFrom 은 건드리지 않는다. */
export function useAssignTodo(keys: QueryKey[]) {
  const invalidate = useAfterChange(keys)
  const { showError } = useToast()

  return useMutation({
    mutationFn: ({ todoId, planId }: { todoId: string; planId: string | null }) =>
      api.updateTodo(todoId, { weeklyPlanId: planId }),
    onSuccess: invalidate,
    onError: (error) => showError(error instanceof Error ? error.message : '연결하지 못했습니다'),
  })
}
