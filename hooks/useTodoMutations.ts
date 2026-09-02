'use client'

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useToast } from '@/components/Toast'
import * as api from '@/lib/client/api'
import { applyMoveToCache, type MoveIntent } from '@/lib/client/optimistic'
import type { TodoDto } from '@/lib/dto'
import { queryKeys } from '@/lib/queryKeys'

const MOVE_MUTATION_KEY = ['moveTodo'] as const

interface MutationScope {
  /** 낙관적으로 고칠 캐시 */
  queryKey: QueryKey
  /** 성공 후 함께 무효화할 키들. 진행률 재계산이 여기서 일어난다 (PLAN §4.1.3) */
  alsoInvalidate?: QueryKey[]
}

function useInvalidator(scope: MutationScope) {
  const queryClient = useQueryClient()

  return () => {
    void queryClient.invalidateQueries({ queryKey: scope.queryKey })
    // 할일이 바뀌면 그 할일이 속한 계획의 진행률도 바뀐다. 목록과 상세를 함께 무효화한다.
    void queryClient.invalidateQueries({ queryKey: queryKeys.weeklyPlansRoot })
    for (const key of scope.alsoInvalidate ?? []) {
      void queryClient.invalidateQueries({ queryKey: key })
    }
  }
}

/**
 * 카드 이동. 드롭 즉시 캐시를 고치고, 실패하면 스냅샷으로 되돌린다 (PRD P0).
 */
export function useMoveTodo(scope: MutationScope) {
  const queryClient = useQueryClient()
  const invalidate = useInvalidator(scope)
  const { showError } = useToast()

  return useMutation({
    mutationKey: MOVE_MUTATION_KEY,
    mutationFn: (move: MoveIntent) =>
      api.moveTodo(move.id, { toStatus: move.toStatus, beforeId: move.beforeId, afterId: move.afterId }),

    onMutate: async (move) => {
      // 진행 중인 요청이 낡은 값으로 캐시를 덮어쓰지 못하게 먼저 취소한다.
      await queryClient.cancelQueries({ queryKey: scope.queryKey })
      const snapshot = queryClient.getQueryData<{ todos: TodoDto[] }>(scope.queryKey)

      queryClient.setQueryData<{ todos: TodoDto[] }>(scope.queryKey, (cache) => applyMoveToCache(cache, move))

      return { snapshot }
    },

    onError: (error, _move, context) => {
      if (context?.snapshot) queryClient.setQueryData(scope.queryKey, context.snapshot)
      showError(error instanceof Error ? error.message : '이동에 실패해 원래 자리로 되돌렸습니다')
    },

    onSettled: () => {
      // 같은 카드를 연속으로 옮기는 중이면 마지막 요청이 끝날 때만 서버 값을 다시 읽는다.
      // 중간에 무효화하면 아직 반영되지 않은 서버 상태가 화면을 덮어써 카드가 튄다 (R1).
      if (queryClient.isMutating({ mutationKey: MOVE_MUTATION_KEY }) === 1) invalidate()
    },
  })
}

export function useCreateTodo(scope: MutationScope) {
  const invalidate = useInvalidator(scope)
  const { showError } = useToast()

  return useMutation({
    mutationFn: (payload: api.CreateTodoPayload) => api.createTodo(payload),
    onSuccess: invalidate,
    onError: (error) => showError(error instanceof Error ? error.message : '할일을 만들지 못했습니다'),
  })
}

export function useUpdateTodo(scope: MutationScope) {
  const invalidate = useInvalidator(scope)
  const { showError } = useToast()

  return useMutation({
    mutationFn: ({ id, ...payload }: api.UpdateTodoPayload & { id: string }) => api.updateTodo(id, payload),
    onSuccess: invalidate,
    onError: (error) => showError(error instanceof Error ? error.message : '수정하지 못했습니다'),
  })
}

export function useDeleteTodo(scope: MutationScope) {
  const queryClient = useQueryClient()
  const invalidate = useInvalidator(scope)
  const { showError } = useToast()

  return useMutation({
    mutationFn: (id: string) => api.deleteTodo(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: scope.queryKey })
      const snapshot = queryClient.getQueryData<{ todos: TodoDto[] }>(scope.queryKey)

      // 소프트 삭제는 진행률 분모에서 즉시 빠져야 하므로 화면에서도 즉시 사라진다 (PRD P0).
      queryClient.setQueryData<{ todos: TodoDto[] }>(scope.queryKey, (cache) =>
        cache ? { ...cache, todos: cache.todos.filter((todo) => todo.id !== id) } : cache,
      )

      return { snapshot }
    },

    onError: (error, _id, context) => {
      if (context?.snapshot) queryClient.setQueryData(scope.queryKey, context.snapshot)
      showError(error instanceof Error ? error.message : '삭제하지 못했습니다')
    },

    onSettled: invalidate,
  })
}

/** 보드 화면이 쓰는 기본 스코프 */
export const boardScope: MutationScope = {
  queryKey: queryKeys.todos,
  alsoInvalidate: [queryKeys.inbox, queryKeys.goals, queryKeys.metrics],
}
