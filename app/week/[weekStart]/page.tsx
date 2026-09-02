'use client'

import { useQuery } from '@tanstack/react-query'
import { use, useState } from 'react'
import { CarryOverDialog } from '@/components/CarryOverDialog'
import { InboxSection } from '@/components/InboxSection'
import { KanbanBoard } from '@/components/KanbanBoard'
import { TodoForm } from '@/components/TodoForm'
import { WeekNavigator } from '@/components/WeekNavigator'
import { WeeklyPlanCard } from '@/components/WeeklyPlanCard'
import { useCreateTodo, useDeleteTodo, useMoveTodo, useUpdateTodo } from '@/hooks/useTodoMutations'
import { useCarryOver, useCarryOverPreview } from '@/hooks/useCarryOver'
import { useAssignTodo, useCreatePlan, useDeletePlan, useUpdatePlan } from '@/hooks/usePlanMutations'
import { fetchGoals, fetchWeek, fetchWeeklyPlans } from '@/lib/client/api'
import { addWeeks, formatKstDate, weekStartOf } from '@/lib/date'
import { queryKeys } from '@/lib/queryKeys'

export default function WeekPage({ params }: { params: Promise<{ weekStart: string }> }) {
  const { weekStart: rawWeekStart } = use(params)
  // URL 이 주중 아무 날이어도 그 주의 월요일로 접어 쓴다 (PLAN A2).
  const weekStart = formatKstDate(weekStartOf(rawWeekStart))

  const [planTitle, setPlanTitle] = useState('')
  // 이월 다이얼로그를 연 계획. null 이면 닫혀 있다.
  const [carryOverPlanId, setCarryOverPlanId] = useState<string | null>(null)

  const weekQuery = useQuery({ queryKey: queryKeys.week(weekStart), queryFn: () => fetchWeek(weekStart) })
  const plansQuery = useQuery({
    queryKey: queryKeys.weeklyPlans({ weekStart }),
    queryFn: () => fetchWeeklyPlans({ weekStart }),
  })
  const goalsQuery = useQuery({ queryKey: queryKeys.goals, queryFn: fetchGoals })

  const affected = [queryKeys.week(weekStart), queryKeys.weeklyPlans({ weekStart }), queryKeys.todos]
  const scope = { queryKey: queryKeys.week(weekStart), alsoInvalidate: affected.slice(1) }

  const move = useMoveTodo(scope)
  const createTodo = useCreateTodo(scope)
  const updateTodo = useUpdateTodo(scope)
  const deleteTodo = useDeleteTodo(scope)

  const createPlan = useCreatePlan(affected)
  const updatePlan = useUpdatePlan(affected)
  const deletePlan = useDeletePlan(affected)
  const assign = useAssignTodo(affected)
  const carryOver = useCarryOver(weekStart)
  const carryOverPreview = useCarryOverPreview(carryOverPlanId)

  const plans = plansQuery.data?.plans ?? []
  const progress = plansQuery.data?.progress ?? {}
  const goals = (goalsQuery.data?.goals ?? []).map((entry) => entry.goal)
  const carriedOut = weekQuery.data?.carriedOut ?? []
  const carryOverPlan = plans.find((plan) => plan.id === carryOverPlanId) ?? null

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">주간 뷰</h1>
        <WeekNavigator weekStart={weekStart} />
        <p className="text-sm opacity-70">
          이 주 계획에 <strong>소속된</strong> 할일을 모읍니다. 마감일 기준이 아니므로 마감일이 없는 할일도 보입니다.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">주간 계획</h2>

        <form
          data-testid="plan-form"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmed = planTitle.trim()
            if (trimmed === '') return
            createPlan.mutate({ title: trimmed, weekStart })
            setPlanTitle('')
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            value={planTitle}
            onChange={(event) => setPlanTitle(event.target.value)}
            placeholder="주간 계획 제목"
            aria-label="주간 계획 제목"
            data-testid="plan-title"
            className="min-w-[12rem] flex-1 rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-900"
          />
          <button
            type="submit"
            data-testid="plan-submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
          >
            계획 추가
          </button>
        </form>

        {plans.length === 0 ? (
          <p data-testid="plan-empty" className="text-sm opacity-60">
            이 주에는 계획이 없습니다.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3" data-testid="plan-list">
            {plans.map((plan) => (
              <WeeklyPlanCard
                key={plan.id}
                plan={plan}
                progress={progress[plan.id] ?? { percent: 0, done: 0, denominator: 0 }}
                goals={goals}
                onLinkGoal={(planId, goalId) => updatePlan.mutate({ id: planId, goalId })}
                onDelete={(planId) => deletePlan.mutate(planId)}
                onCarryOver={(planId) => setCarryOverPlanId(planId)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">이 주의 할일</h2>

        <TodoForm
          onCreate={(payload) => createTodo.mutate(payload)}
          plans={plans}
          defaultPlanId={plans[0]?.id ?? null}
          // 계획 목록이 오기 전에 제출하면 기본 선택이 비어 있어 미분류로 저장되고,
          // 주간 뷰는 소속 기준이라 방금 만든 할일이 화면에서 사라진다.
          pending={createTodo.isPending || plansQuery.isPending}
        />

        {weekQuery.isPending ? (
          <p data-testid="week-loading" className="text-sm opacity-60">
            불러오는 중…
          </p>
        ) : (
          <KanbanBoard
            todos={weekQuery.data?.todos ?? []}
            onMove={(intent) => move.mutate(intent)}
            onRename={(todoId, title) => updateTodo.mutate({ id: todoId, title })}
            onDelete={(todoId) => deleteTodo.mutate(todoId)}
          />
        )}
      </section>

      {carriedOut.length > 0 && (
        <section
          data-testid="carried-out-section"
          className="flex flex-col gap-2 rounded-xl border border-black/10 p-4 dark:border-white/10"
        >
          <header className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">이 주에서 이월돼 나간 할일</h2>
            <span data-testid="carried-out-count" className="text-xs opacity-60">
              {carriedOut.length}건
            </span>
          </header>
          <p className="text-xs opacity-60">
            다음 주로 옮겨졌지만 <strong>이 주의 진행률 분모에는 그대로 남습니다.</strong> 그 주 안에 끝내지 못했다는
            사실은 나중에 완료해도 바뀌지 않기 때문입니다.
          </p>
          <ul className="flex flex-wrap gap-2">
            {carriedOut.map((todo) => (
              <li
                key={todo.id}
                data-testid={`carried-out-${todo.id}`}
                data-title={todo.title}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/15 px-3 py-1 text-sm opacity-70 dark:border-white/15"
              >
                {todo.title}
                <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-800 dark:bg-purple-900 dark:text-purple-100">
                  이월됨
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <InboxSection
        todos={weekQuery.data?.inbox ?? []}
        plans={plans}
        onAssign={(todoId, planId) => assign.mutate({ todoId, planId })}
      />

      {carryOverPlan && (
        <CarryOverDialog
          plan={carryOverPlan}
          targetWeekLabel={formatKstDate(addWeeks(weekStartOf(weekStart), 1))}
          todos={carryOverPreview.data?.todos ?? []}
          loading={carryOverPreview.isPending}
          pending={carryOver.isPending}
          onClose={() => setCarryOverPlanId(null)}
          onConfirm={(todoIds) => {
            carryOver.mutate(
              { planId: carryOverPlan.id, todoIds },
              { onSettled: () => setCarryOverPlanId(null) },
            )
          }}
        />
      )}
    </div>
  )
}
