/**
 * 열 내 정렬 키 (PLAN §4.3).
 *
 * 정수 인덱스를 쓰면 카드 하나를 끼워 넣을 때마다 열 전체를 UPDATE 해야 한다.
 * 분수 키를 쓰면 이웃 두 값의 중앙값만 계산하면 되지만, 같은 지점에 계속 끼워 넣으면
 * 배정밀도 부동소수점이 결국 소진된다. 간격이 임계 미만이 되면 열 전체를 재배치한다.
 */

export const POSITION_STEP = 1024
export const MIN_GAP = 1e-6

/**
 * 두 이웃 사이(또는 열의 양 끝)에 놓을 position 을 계산한다.
 * @param before 위쪽 이웃의 position. 맨 앞이면 null
 * @param after  아래쪽 이웃의 position. 맨 뒤면 null
 */
export function computePosition(before: number | null, after: number | null): number {
  if (before === null && after === null) return POSITION_STEP // 빈 열
  if (before === null) return (after as number) / 2 // 맨 앞
  if (after === null) return before + POSITION_STEP // 맨 뒤
  return (before + after) / 2
}

/** 이 위치에 삽입하면 정밀도가 위험한지 */
export function needsRebalance(before: number | null, after: number | null): boolean {
  if (before === null || after === null) return false
  return after - before < MIN_GAP
}

/** 열 전체를 1024, 2048, 3072 ... 로 재배치한다. 현재 순서는 보존한다. */
export function rebalance<T extends { position: number }>(items: readonly T[]): { item: T; position: number }[] {
  return [...items]
    .sort((a, b) => a.position - b.position)
    .map((item, index) => ({ item, position: (index + 1) * POSITION_STEP }))
}

/** 재배치 후의 position 값 목록만 필요할 때 */
export function rebalancedPositions(count: number): number[] {
  return Array.from({ length: count }, (_, index) => (index + 1) * POSITION_STEP)
}

export function sortByPosition<T extends { position: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position)
}
