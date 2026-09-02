import type { TodoStatus } from '@/models/types'

/**
 * API 응답의 형태. lib/serialize.ts 를 거친 뒤의 모습이므로
 * ObjectId 는 문자열, Date 는 ISO 문자열이다 (PLAN §3.2).
 */

export interface SessionUserDto {
  id: string
  githubId: number
  username: string
  avatarUrl: string
}

export interface TodoDto {
  id: string
  title: string
  dueDate: string | null
  status: TodoStatus
  position: number
  weeklyPlanId: string | null
  carriedFrom: string[]
  completedAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** 주간 뷰에서만 붙는 경고 플래그 (PLAN A10) */
export type WeekTodoDto = TodoDto & { dueOutsideWeek: boolean }

export interface WeeklyPlanDto {
  id: string
  title: string
  weekStart: string
  goalId: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface GoalDto {
  id: string
  title: string
  year: number
  startDate: string
  endDate: string
  description: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface PlanProgressDto {
  percent: number
  done: number
  denominator: number
}

export interface GoalProgressDto {
  percent: number
  /** 분모에 실제로 들어간 주의 수. 화면에 항상 함께 표기한다 (PLAN §0.2) */
  countedWeeks: number
}

export interface WeekViewResponse {
  weekStart: string
  /** 이 주 계획에 지금 소속된 할일 */
  todos: WeekTodoDto[]
  /** 이 주에서 이월돼 나간 할일. 칸반에는 없지만 진행률 분모에는 남아 있다 (PLAN A8) */
  carriedOut: TodoDto[]
  progress: Record<string, PlanProgressDto>
  inbox: TodoDto[]
}

export interface TodoListResponse {
  todos: TodoDto[]
}

export interface WeeklyPlanListResponse {
  plans: WeeklyPlanDto[]
  progress: Record<string, PlanProgressDto>
}

export interface WeeklyPlanDetailResponse {
  plan: WeeklyPlanDto
  progress: PlanProgressDto
  /** 이 계획에 지금 소속된 할일 */
  todos: TodoDto[]
}

export interface GoalListResponse {
  goals: { goal: GoalDto; progress: GoalProgressDto }[]
}

export interface GoalPlanSummaryDto {
  plan: WeeklyPlanDto
  progress: PlanProgressDto
  todoCount: number
  counted: boolean
}

export interface GoalDetailResponse {
  goal: GoalDto
  progress: GoalProgressDto
  plans: GoalPlanSummaryDto[]
}

export interface CarryOverResultDto {
  targetPlanId: string
  targetWeekStart: string
  carriedIds: string[]
  skipped: { id: string; reason: string }[]
  createdTargetPlan: boolean
}

export interface MetricsDto {
  linkedRate: number
  executionRate: number
  carryOverBacklogRate: number
  detail: {
    activeTodos: number
    linkedTodos: number
    elapsedPlans: number
    startedPlans: number
    repeatedlyCarried: number
  }
}

export const STATUS_LABELS: Record<TodoStatus, string> = {
  todo: '할 일',
  doing: '진행 중',
  done: '완료',
}

export const STATUS_ORDER: TodoStatus[] = ['todo', 'doing', 'done']
