'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ProgressBar } from '@/components/ProgressBar'
import { goalProgressText } from '@/components/GoalCard'
import { useMoveTodo } from '@/hooks/useTodoMutations'
import { fetchDayTodos, fetchGoals, fetchInbox, fetchMetrics, fetchWeek, fetchWeeklyPlans } from '@/lib/client/api'
import { formatKstDate, todayKst, weekStartOf } from '@/lib/date'
import { METRIC_TARGETS, meetsTarget } from '@/lib/metric-targets'
import { STATUS_LABELS, type TodoDto } from '@/lib/dto'
import { queryKeys } from '@/lib/queryKeys'
import type { TodoStatus } from '@/models/types'

// 강조색은 하나뿐이다. 끝난 것만 Rausch 로 띄우고 나머지는 중립으로 둔다.
const STATUS_STYLE: Record<TodoStatus, string> = {
  todo: 'badge-neutral',
  doing: 'badge-neutral',
  done: 'badge-primary',
}

function Panel({
  title,
  action,
  children,
  testId,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
  testId: string
}) {
  return (
    <section
      data-testid={testId}
      className="flex flex-col gap-4"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="t-display-sm text-ink">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

/**
 * 대시보드 (PRD §P0 "조회 — 일일 뷰(오늘 기준)").
 * 오늘 해야 할 것과, 그것이 이번 주·올해 목표에 어떻게 얹히는지를 한 화면에서 본다.
 */
export default function DashboardPage() {
  const today = formatKstDate(todayKst())
  const thisWeek = formatKstDate(weekStartOf(new Date()))

  const dayQuery = useQuery({ queryKey: queryKeys.day(today), queryFn: () => fetchDayTodos(today) })
  const weekQuery = useQuery({ queryKey: queryKeys.week(thisWeek), queryFn: () => fetchWeek(thisWeek) })
  const plansQuery = useQuery({
    queryKey: queryKeys.weeklyPlans({ weekStart: thisWeek }),
    queryFn: () => fetchWeeklyPlans({ weekStart: thisWeek }),
  })
  const goalsQuery = useQuery({ queryKey: queryKeys.goals, queryFn: fetchGoals })
  const inboxQuery = useQuery({ queryKey: queryKeys.inbox, queryFn: fetchInbox })
  const metricsQuery = useQuery({ queryKey: queryKeys.metrics, queryFn: fetchMetrics })

  // 오늘 카드의 상태를 대시보드에서 바로 넘길 수 있게 한다.
  const move = useMoveTodo({
    queryKey: queryKeys.day(today),
    alsoInvalidate: [
      queryKeys.week(thisWeek),
      // 이 화면의 계획별 진행률은 weeklyPlans 쿼리에서 온다. 빠뜨리면 완료를 눌러도 막대가 그대로다.
      queryKeys.weeklyPlans({ weekStart: thisWeek }),
      queryKeys.todos,
      queryKeys.goals,
      queryKeys.metrics,
    ],
  })

  const dayTodos = dayQuery.data?.todos ?? []
  const plans = plansQuery.data?.plans ?? []
  const planProgress = plansQuery.data?.progress ?? {}
  const goals = goalsQuery.data?.goals ?? []
  const inboxCount = inboxQuery.data?.todos.length ?? 0
  const metrics = metricsQuery.data

  const planTitleOf = (todo: TodoDto): string =>
    plans.find((plan) => plan.id === todo.weeklyPlanId)?.title ?? '미분류'

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-1.5 mb-4">
        <h1 className="t-display-xl text-ink">대시보드</h1>
        <p className="t-body-md text-muted">
          {today} · 오늘 처리할 일과 그것이 이번 주와 올해 목표에 얼마나 기여하는지 함께 봅니다.
        </p>
      </header>

      <Panel
        testId="dashboard-today"
        title="오늘 할 일"
        action={
          <span className="t-caption-sm text-muted">
            오늘 마감 · 지난 미완료 · 진행 중
          </span>
        }
      >
        {dayQuery.isPending ? (
          <p className="t-body-md text-muted">불러오는 중…</p>
        ) : dayTodos.length === 0 ? (
          <p data-testid="today-empty" className="t-body-md text-muted">
            오늘 처리할 항목이 없습니다. <Link href="/todos" className="underline">할일</Link> 에서 추가하세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="today-list">
            {dayTodos.map((todo) => (
              <li
                key={todo.id}
                data-testid={`today-${todo.id}`}
                data-title={todo.title}
                className="rule flex flex-wrap items-center gap-3 py-3 first:border-t-0"
              >
                <span className={`badge ${STATUS_STYLE[todo.status]}`}>
                  {STATUS_LABELS[todo.status]}
                </span>
                <span className={`flex-1 t-body-sm ${todo.status === 'done' ? 'text-muted line-through' : 'text-body'}`}>
                  {todo.title}
                </span>
                <span className="t-caption-sm text-muted-soft">{planTitleOf(todo)}</span>
                {todo.dueDate && (
                  <span
                    data-testid={`today-due-${todo.id}`}
                    // 기한 지남을 색으로만 알리면 색각 이상에서 구분되지 않는다.
                    // 배지로 올리면 배경과 모양도 함께 바뀐다 (WCAG 1.4.1).
                    className={
                      formatKstDate(todo.dueDate) < today && todo.status !== 'done'
                        ? 'badge badge-danger'
                        : 't-caption-sm text-muted-soft'
                    }
                  >
                    {formatKstDate(todo.dueDate)}
                  </span>
                )}
                {todo.status !== 'done' && (
                  <button
                    type="button"
                    data-testid={`today-done-${todo.id}`}
                    onClick={() => move.mutate({ id: todo.id, toStatus: 'done', beforeId: null, afterId: null })}
                    className="btn btn-ghost btn-sm"
                  >
                    완료
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel
          testId="dashboard-week"
          title="이번 주"
          action={
            <Link href={`/week/${thisWeek}`} className="t-link text-muted underline hover:text-ink">
              주간 계획 열기
            </Link>
          }
        >
          {plans.length === 0 ? (
            <p data-testid="week-empty" className="t-body-md text-muted">
              이번 주 계획이 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {plans.map((plan) => {
                const progress = planProgress[plan.id] ?? { percent: 0, done: 0, denominator: 0 }
                return (
                  <li key={plan.id} data-testid={`dash-plan-${plan.id}`} data-title={plan.title}>
                    <ProgressBar
                      percent={progress.percent}
                      label={`${plan.title} · ${progress.done}/${progress.denominator}`}
                      testId={`dash-plan-progress-${plan.id}`}
                    />
                  </li>
                )
              })}
            </ul>
          )}

          {(weekQuery.data?.carriedOut.length ?? 0) > 0 && (
            <p data-testid="dash-carried-out" className="t-caption-sm text-muted">
              이 주에서 이월돼 나간 할일 {weekQuery.data?.carriedOut.length}건이 분모에 남아 있습니다.
            </p>
          )}
        </Panel>

        <Panel
          testId="dashboard-goals"
          title="1년 목표"
          action={
            <Link href="/goals" className="t-link text-muted underline hover:text-ink">
              목표 열기
            </Link>
          }
        >
          {goals.length === 0 ? (
            <p data-testid="goals-empty-dash" className="t-body-md text-muted">
              아직 1년 목표가 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {goals.map((entry) => (
                <li key={entry.goal.id} data-testid={`dash-goal-${entry.goal.id}`} data-title={entry.goal.title}>
                  <ProgressBar
                    percent={entry.progress.percent}
                    label={entry.goal.title}
                    testId={`dash-goal-progress-${entry.goal.id}`}
                  />
                  <p data-testid={`dash-goal-text-${entry.goal.id}`} className="mt-1 t-caption-sm text-muted">
                    {goalProgressText(entry.progress)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel
          testId="dashboard-inbox"
          title="미분류"
          action={
            <Link href="/inbox" className="t-link text-muted underline hover:text-ink">
              해소하러 가기
            </Link>
          }
        >
          <p data-testid="dash-inbox-count" className="t-body-sm">
            {inboxCount === 0 ? (
              <span className="text-muted">미분류 할일이 없습니다.</span>
            ) : (
              <>
                <strong>{inboxCount}건</strong> 이 주간 계획에 연결되지 않아 어떤 진행률에도 반영되지 않습니다.
              </>
            )}
          </p>
        </Panel>

        <Panel testId="dashboard-metrics" title="성공 지표">
          {!metrics ? (
            <p className="t-body-md text-muted">불러오는 중…</p>
          ) : (
            <ul className="flex flex-col gap-1.5 t-body-sm">
              {(
                [
                  ['M1', '주간 계획 연결률', metrics.linkedRate, 'linkedRate', metrics.detail.activeTodos],
                  ['M2', '주간 실행률', metrics.executionRate, 'executionRate', metrics.detail.elapsedPlans],
                  ['M3', '이월 적체율', metrics.carryOverBacklogRate, 'carryOverBacklogRate', metrics.detail.activeTodos],
                ] as const
              ).map(([id, label, value, key, sample]) => (
                <li key={id} data-testid={`metric-${key}`} className="flex items-center gap-2.5">
                  <span className="w-6 t-micro-label text-muted-soft">{id}</span>
                  <span className="flex-1 truncate text-body">{label}</span>
                  {/* 표본이 0이면 0% 는 미달이 아니라 잴 것이 없다는 뜻이다 */}
                  <span className="w-12 text-right t-caption tabular-nums text-ink">
                    {sample === 0 ? '—' : `${value}%`}
                  </span>
                  <span
                    className={`badge ${
                      sample === 0 ? 'badge-neutral' : meetsTarget(key, value) ? 'badge-primary' : 'badge-danger'
                    }`}
                  >
                    {sample === 0 ? '표본 없음' : meetsTarget(key, value) ? '달성' : '미달'}
                  </span>
                  <span className="w-20 shrink-0 text-right t-caption-sm tabular-nums text-muted-soft">
                    목표 {METRIC_TARGETS[key].direction === 'atLeast' ? '≥' : '≤'} {METRIC_TARGETS[key].target}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
