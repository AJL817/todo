import type {
  CarryOverResultDto,
  GoalDetailResponse,
  GoalDto,
  GoalListResponse,
  MetricsDto,
  SessionUserDto,
  TodoDto,
  TodoListResponse,
  WeekViewResponse,
  WeeklyPlanDetailResponse,
  WeeklyPlanDto,
  WeeklyPlanListResponse,
} from '@/lib/dto'
import type { TodoStatus } from '@/models/types'
import { runSerial } from './serial'

/** 서버가 돌려준 { error } 를 그대로 사용자에게 보여 주기 위한 오류 타입 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null

    // 세션이 끊겼다. 화면에 오류만 띄우면 사용자가 할 수 있는 일이 없으므로
    // 로그인으로 보낸다. 미들웨어는 Edge 라 쿠키 유무만 보므로 만료된 쿠키를 들고
    // 있는 동안에는 이 경로로만 걸러진다.
    // 이미 로그인 화면이면 다시 보내지 않는다. 그 순간 진행 중인 인증 리다이렉트가
    // 취소돼(ERR_ABORTED) 로그인이 영영 끝나지 않는다.
    if (
      response.status === 401 &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/login') &&
      !window.location.pathname.startsWith('/auth')
    ) {
      window.location.assign('/login')
    }

    throw new ApiError(body?.error ?? '요청을 처리하지 못했습니다', response.status)
  }

  return response.json() as Promise<T>
}

/** 현재 로그인한 사용자. 사이드바가 쓴다. */
export const fetchMe = () => request<{ user: SessionUserDto }>('/api/me')

export const fetchTodos = () => request<TodoListResponse>('/api/todos')
export const fetchDayTodos = (date: string) => request<TodoListResponse>(`/api/todos?view=day&date=${date}`)
export const fetchInbox = () => request<TodoListResponse>('/api/todos?view=inbox')
export const fetchWeek = (weekStart: string) =>
  request<WeekViewResponse>(`/api/todos?view=week&weekStart=${weekStart}`)

export interface CreateTodoPayload {
  title: string
  dueDate?: string | null
  weeklyPlanId?: string | null
}

export const createTodo = (payload: CreateTodoPayload) =>
  request<TodoDto>('/api/todos', { method: 'POST', body: JSON.stringify(payload) })

export interface UpdateTodoPayload {
  title?: string
  dueDate?: string | null
  weeklyPlanId?: string | null
}

export const updateTodo = (id: string, payload: UpdateTodoPayload) =>
  request<TodoDto>(`/api/todos/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })

export const deleteTodo = (id: string) => request<{ deleted: true }>(`/api/todos/${id}`, { method: 'DELETE' })

export interface MovePayload {
  toStatus: TodoStatus
  beforeId?: string | null
  afterId?: string | null
}

/**
 * 카드 단위로 직렬화해 보낸다. 연속 이동 시 응답 역전으로 카드가 튀는 것을 막는다 (R1).
 */
export const moveTodo = (id: string, payload: MovePayload) =>
  runSerial(`move:${id}`, () =>
    request<TodoDto>(`/api/todos/${id}/move`, { method: 'POST', body: JSON.stringify(payload) }),
  )

export const fetchWeeklyPlans = (params: { weekStart?: string; unassignedOnly?: boolean } = {}) => {
  const search = new URLSearchParams()
  if (params.weekStart) search.set('weekStart', params.weekStart)
  if (params.unassignedOnly) search.set('unassignedOnly', 'true')
  const query = search.toString()
  return request<WeeklyPlanListResponse>(`/api/weekly-plans${query ? `?${query}` : ''}`)
}

export const fetchWeeklyPlan = (id: string) => request<WeeklyPlanDetailResponse>(`/api/weekly-plans/${id}`)

export const createWeeklyPlan = (payload: { title: string; weekStart: string; goalId?: string | null }) =>
  request<WeeklyPlanDto>('/api/weekly-plans', { method: 'POST', body: JSON.stringify(payload) })

export const updateWeeklyPlan = (id: string, payload: { title?: string; goalId?: string | null }) =>
  request<WeeklyPlanDto>(`/api/weekly-plans/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })

export const deleteWeeklyPlan = (id: string) =>
  request<{ deleted: true; detachedTodos: number }>(`/api/weekly-plans/${id}`, { method: 'DELETE' })

export const fetchCarryOverPreview = (planId: string) =>
  request<TodoListResponse>(`/api/weekly-plans/${planId}/carryover-preview`)

export const carryOver = (planId: string, todoIds: string[]) =>
  request<CarryOverResultDto>(`/api/weekly-plans/${planId}/carryover`, {
    method: 'POST',
    body: JSON.stringify({ todoIds }),
  })

export const fetchGoals = () => request<GoalListResponse>('/api/goals')
export const fetchGoal = (id: string) => request<GoalDetailResponse>(`/api/goals/${id}`)

export const createGoal = (payload: {
  title: string
  year: number
  startDate: string
  endDate: string
  description?: string | null
}) => request<GoalDto>('/api/goals', { method: 'POST', body: JSON.stringify(payload) })

export const updateGoal = (id: string, payload: { title?: string; description?: string | null }) =>
  request<GoalDto>(`/api/goals/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })

export const deleteGoal = (id: string) =>
  request<{ deleted: true; detachedPlans: number }>(`/api/goals/${id}`, { method: 'DELETE' })

export const fetchMetrics = () => request<MetricsDto>('/api/stats')
