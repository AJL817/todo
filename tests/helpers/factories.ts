import { goalRepo, todoRepo, weeklyPlanRepo } from '@/lib/repositories'
import type { GoalDoc, TodoDoc, TodoStatus, WeeklyPlanDoc } from '@/models/types'
import { owner } from './owner'

export const id = (doc: { _id: { toString: () => string } }): string => doc._id.toString()

type GoalInput = Parameters<typeof goalRepo.createGoal>[1]
type PlanInput = Parameters<typeof weeklyPlanRepo.createWeeklyPlan>[1]
type TodoInput = Parameters<typeof todoRepo.createTodo>[1]

/**
 * 소유자를 생략하면 현재 테스트의 기본 사용자에게 귀속된다.
 * 격리 테스트처럼 다른 사용자로 만들어야 할 때만 명시한다.
 */
export async function makeGoal(overrides: Partial<GoalInput> = {}, ownerId = owner()): Promise<GoalDoc> {
  return goalRepo.createGoal(ownerId, {
    title: '2026년 체력 만들기',
    year: 2026,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    ...overrides,
  })
}

export async function makePlan(overrides: Partial<PlanInput> = {}, ownerId = owner()): Promise<WeeklyPlanDoc> {
  return weeklyPlanRepo.createWeeklyPlan(ownerId, {
    title: '이번 주 계획',
    weekStart: '2026-08-31',
    ...overrides,
  })
}

export async function makeTodo(overrides: Partial<TodoInput> = {}, ownerId = owner()): Promise<TodoDoc> {
  return todoRepo.createTodo(ownerId, { title: '할일', ...overrides })
}

/** 지정한 계획에 total 건을 만들고 앞에서 done 건만 완료 처리한다. */
export async function makeTodos(
  planId: string | null,
  total: number,
  done = 0,
  status: TodoStatus = 'todo',
  ownerId = owner(),
): Promise<TodoDoc[]> {
  const created: TodoDoc[] = []
  for (let index = 0; index < total; index += 1) {
    created.push(
      await todoRepo.createTodo(ownerId, {
        title: `할일 ${index + 1}`,
        weeklyPlanId: planId,
        status: index < done ? 'done' : status,
      }),
    )
  }
  return created
}
