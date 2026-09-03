'use client'

import { useQuery } from '@tanstack/react-query'
import { KanbanBoard } from '@/components/KanbanBoard'
import { TodoForm } from '@/components/TodoForm'
import { fetchTodos, fetchWeeklyPlans } from '@/lib/client/api'
import { queryKeys } from '@/lib/queryKeys'
import {
  boardScope,
  useCreateTodo,
  useDeleteTodo,
  useMoveTodo,
  useUpdateTodo,
} from '@/hooks/useTodoMutations'

export default function BoardPage() {
  const todosQuery = useQuery({ queryKey: queryKeys.todos, queryFn: fetchTodos })
  const plansQuery = useQuery({ queryKey: queryKeys.weeklyPlans(), queryFn: () => fetchWeeklyPlans() })

  const move = useMoveTodo(boardScope)
  const create = useCreateTodo(boardScope)
  const update = useUpdateTodo(boardScope)
  const remove = useDeleteTodo(boardScope)

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-1.5 mb-4">
        <h1 className="t-display text-ink">전체 보드</h1>
        <p className="t-body text-muted">카드를 끌어 상태와 순서를 바꿉니다. 드롭 즉시 반영되고 실패하면 되돌아갑니다.</p>
      </header>

      <TodoForm
        onCreate={(payload) => create.mutate(payload)}
        plans={plansQuery.data?.plans ?? []}
        // 계획 목록이 오기 전에는 선택지가 비어 있다. 그 상태로 제출하면
        // 사용자가 고르려던 계획이 아니라 미분류로 저장된다.
        pending={create.isPending || plansQuery.isPending}
      />

      {todosQuery.isPending ? (
        <p data-testid="board-loading" className="t-body text-muted">
          불러오는 중…
        </p>
      ) : todosQuery.isError ? (
        <p role="alert" className="text-sm text-danger">
          할일을 불러오지 못했습니다.
        </p>
      ) : (
        <KanbanBoard
          todos={todosQuery.data?.todos ?? []}
          onMove={(intent) => move.mutate(intent)}
          onRename={(id, title) => update.mutate({ id, title })}
          onDelete={(id) => remove.mutate(id)}
        />
      )}
    </div>
  )
}
