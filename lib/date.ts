/**
 * 모든 날짜 연산의 유일한 출입구 (PLAN §4.2).
 *
 * MongoDB 는 BSON Date 를 UTC 인스턴트로 저장한다. 그런데 dueDate/weekStart/
 * startDate/endDate 는 "시각"이 아니라 "날짜"다. 정규화 없이 저장하면 KST 기준으로
 * 하루가 밀려 주 경계나 일일 조회에서 항목이 통째로 사라진다 (PLAN R9).
 *
 * 그래서 날짜 필드는 항상 "KST 자정에 해당하는 UTC 인스턴트"로 저장한다.
 *   2026-09-01 (KST) -> 2026-08-31T15:00:00.000Z
 *
 * 대한민국은 1988년 이후 서머타임을 쓰지 않으므로 오프셋을 +9 로 고정해도 안전하다.
 */

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000
export const DAY_MS = 24 * 60 * 60 * 1000

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type DateInput = Date | string

function toInstant(input: DateInput): Date {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new TypeError('유효하지 않은 Date 입니다')
    return input
  }

  if (DATE_ONLY_PATTERN.test(input)) {
    // 'YYYY-MM-DD' 는 그 날짜의 KST 자정을 뜻하는 것으로 해석한다.
    const [year, month, day] = input.split('-').map(Number) as [number, number, number]
    return new Date(Date.UTC(year, month - 1, day) - KST_OFFSET_MS)
  }

  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`날짜로 해석할 수 없습니다: ${input}`)
  return parsed
}

/** 임의 입력을 그 입력이 속한 KST 날짜의 자정 인스턴트로 정규화한다. 저장 직전 필수 통과. */
export function toKstDateOnly(input: DateInput): Date {
  const instant = toInstant(input)
  const shifted = new Date(instant.getTime() + KST_OFFSET_MS)
  const utcMidnight = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
  return new Date(utcMidnight - KST_OFFSET_MS)
}

/** KST 기준 오늘 00:00 의 UTC 인스턴트. now 를 주입할 수 있어야 시간 경계 테스트가 가능하다. */
export function todayKst(now: Date = new Date()): Date {
  return toKstDateOnly(now)
}

/** KST 기준 요일. 0=일요일 ... 6=토요일 */
export function kstWeekday(input: DateInput): number {
  return new Date(toInstant(input).getTime() + KST_OFFSET_MS).getUTCDay()
}

/** 해당 날짜가 속한 주의 월요일 KST 00:00 (ISO-8601, PLAN A2) */
export function weekStartOf(input: DateInput): Date {
  const dateOnly = toKstDateOnly(input)
  const weekday = kstWeekday(dateOnly)
  const daysFromMonday = (weekday + 6) % 7 // 월=0 ... 일=6
  return new Date(dateOnly.getTime() - daysFromMonday * DAY_MS)
}

/**
 * 주 범위. 반열린 구간 [start, end) 이다.
 * `$lte: 일요일 23:59:59.999` 를 쓰면 밀리초 경계 버그가 생기므로 쓰지 않는다.
 */
export function weekRangeOf(input: DateInput): { start: Date; end: Date } {
  const start = weekStartOf(input)
  return { start, end: addWeeks(start, 1) }
}

/** 서머타임이 없으므로 단순 밀리초 덧셈으로 정확하다. */
export function addWeeks(weekStart: Date, weeks: number): Date {
  return new Date(weekStart.getTime() + weeks * 7 * DAY_MS)
}

/** 마감일이 소속 주간 계획의 주 범위를 벗어나는지 (PLAN A10 경고 배지용) */
export function isDueOutsideWeek(dueDate: Date | null, weekStart: Date): boolean {
  if (dueDate === null) return false
  const due = toKstDateOnly(dueDate)
  const start = weekStartOf(weekStart)
  const end = addWeeks(start, 1)
  return due.getTime() < start.getTime() || due.getTime() >= end.getTime()
}

/** KST 기준 'YYYY-MM-DD HH:mm'. 완료 시각처럼 시각까지 보여 줄 때 쓴다. */
export function formatKstDateTime(input: DateInput): string {
  const shifted = new Date(toInstant(input).getTime() + KST_OFFSET_MS)
  const hours = String(shifted.getUTCHours()).padStart(2, '0')
  const minutes = String(shifted.getUTCMinutes()).padStart(2, '0')
  return `${formatKstDate(input)} ${hours}:${minutes}`
}

/** KST 기준 'YYYY-MM-DD'. URL 세그먼트와 화면 표기에 쓴다. */
export function formatKstDate(input: DateInput): string {
  const shifted = new Date(toKstDateOnly(input).getTime() + KST_OFFSET_MS)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
