/**
 * 지표 목표값 (PLAN §1.5).
 *
 * 산출 로직(lib/metrics.ts)과 분리해 둔다. 그쪽은 mongoose 를 끌고 오므로
 * 클라이언트 컴포넌트에서 임포트하면 브라우저 번들에 서버 코드가 딸려 들어간다.
 *
 * 70 / 60 / 15 는 근거 있는 수치가 아니라 출발점이다. PLAN §11 Q6 참조.
 */
export const METRIC_TARGETS = {
  linkedRate: { target: 70, direction: 'atLeast' },
  executionRate: { target: 60, direction: 'atLeast' },
  carryOverBacklogRate: { target: 15, direction: 'atMost' },
} as const

export type MetricKey = keyof typeof METRIC_TARGETS

export function meetsTarget(key: MetricKey, value: number): boolean {
  const { target, direction } = METRIC_TARGETS[key]
  return direction === 'atLeast' ? value >= target : value <= target
}
