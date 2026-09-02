/**
 * 쿼리 키를 한 곳에 모은다.
 * 진행률은 저장하지 않고 조회 시 계산하므로(PLAN A4), "재계산"은 곧 이 키들의 무효화다.
 */
export const queryKeys = {
  me: ['me'] as const,
  todos: ['todos'] as const,
  day: (date: string) => ['todos', 'day', date] as const,
  week: (weekStart: string) => ['todos', 'week', weekStart] as const,
  inbox: ['todos', 'inbox'] as const,
  /**
   * 주간 계획 관련 전부. 할일이 바뀌면 계획 진행률도 바뀌므로,
   * 목록이든 상세든 한 번에 무효화할 수 있게 접두사 키를 둔다.
   */
  weeklyPlansRoot: ['weeklyPlans'] as const,
  weeklyPlans: (params?: { weekStart?: string; unassignedOnly?: boolean }) =>
    ['weeklyPlans', params ?? {}] as const,
  weeklyPlan: (id: string) => ['weeklyPlans', 'detail', id] as const,
  goals: ['goals'] as const,
  goal: (id: string) => ['goals', id] as const,
  metrics: ['metrics'] as const,
}
