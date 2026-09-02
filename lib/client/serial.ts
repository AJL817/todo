/**
 * 같은 키의 작업을 순서대로 하나씩 실행한다 (PLAN R1).
 *
 * 카드를 빠르게 연속으로 옮기면 요청이 병렬로 나가고, 응답 순서가 뒤바뀌면
 * 마지막 조작이 아닌 값이 최종 상태가 되어 카드가 튄다. 카드 ID 단위로 직렬화해
 * 서버가 보는 순서를 사용자가 조작한 순서와 일치시킨다.
 */

const chains = new Map<string, Promise<unknown>>()

export function runSerial<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve()

  // 앞 작업이 실패해도 뒤 작업은 진행해야 하므로 사슬에서는 실패를 삼킨다.
  const next = previous.then(task, task)

  chains.set(
    key,
    next.then(
      () => undefined,
      () => undefined,
    ),
  )

  return next
}

/** 테스트에서 상태를 초기화할 때 쓴다. */
export function resetSerialQueues(): void {
  chains.clear()
}

export function pendingKeys(): string[] {
  return [...chains.keys()]
}
