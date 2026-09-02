import { describe, expect, it } from 'vitest'
import {
  addWeeks,
  formatKstDate,
  isDueOutsideWeek,
  kstWeekday,
  toKstDateOnly,
  todayKst,
  weekRangeOf,
  weekStartOf,
} from '@/lib/date'

const iso = (d: Date) => d.toISOString()

describe('toKstDateOnly — KST 자정 정규화 (PLAN R9)', () => {
  it("'2026-09-01' 을 2026-08-31T15:00:00.000Z 로 정규화한다", () => {
    expect(iso(toKstDateOnly('2026-09-01'))).toBe('2026-08-31T15:00:00.000Z')
  })

  it('KST 23:00 인 인스턴트도 그 날(KST) 자정으로 접힌다', () => {
    // 2026-09-01T14:00Z == KST 2026-09-01 23:00
    expect(iso(toKstDateOnly(new Date('2026-09-01T14:00:00Z')))).toBe('2026-08-31T15:00:00.000Z')
  })

  it('KST 00:01 인 인스턴트도 같은 날 자정으로 접힌다', () => {
    // 2026-08-31T15:01Z == KST 2026-09-01 00:01
    expect(iso(toKstDateOnly(new Date('2026-08-31T15:01:00Z')))).toBe('2026-08-31T15:00:00.000Z')
  })

  it('KST 23:59 와 그 1분 뒤는 서로 다른 날로 갈린다', () => {
    const before = toKstDateOnly(new Date('2026-09-01T14:59:00Z')) // KST 09-01 23:59
    const after = toKstDateOnly(new Date('2026-09-01T15:00:00Z')) // KST 09-02 00:00
    expect(iso(before)).toBe('2026-08-31T15:00:00.000Z')
    expect(iso(after)).toBe('2026-09-01T15:00:00.000Z')
  })

  it('이미 정규화된 값을 다시 넣어도 그대로다 (멱등)', () => {
    const once = toKstDateOnly('2026-09-01')
    expect(iso(toKstDateOnly(once))).toBe(iso(once))
  })

  it('해석할 수 없는 입력은 예외를 던진다', () => {
    expect(() => toKstDateOnly('내일')).toThrow()
    expect(() => toKstDateOnly(new Date('nope'))).toThrow()
  })
})

describe('todayKst', () => {
  it('now 를 주입할 수 있어 시간 경계를 테스트할 수 있다', () => {
    expect(iso(todayKst(new Date('2026-09-01T14:00:00Z')))).toBe('2026-08-31T15:00:00.000Z')
  })
})

describe('weekStartOf — 월요일 시작 (PLAN A2)', () => {
  it('화요일 2026-09-01 은 2026-08-31 로 접힌다', () => {
    expect(formatKstDate(weekStartOf('2026-09-01'))).toBe('2026-08-31')
  })

  it('월요일 2026-08-31 은 자기 자신이다', () => {
    expect(formatKstDate(weekStartOf('2026-08-31'))).toBe('2026-08-31')
  })

  it('일요일 2026-09-06 은 직전 월요일 2026-08-31 로 접힌다', () => {
    expect(formatKstDate(weekStartOf('2026-09-06'))).toBe('2026-08-31')
  })

  it('연말 경계: 금요일 2027-01-01 은 2026-12-28 로 접힌다', () => {
    expect(formatKstDate(weekStartOf('2027-01-01'))).toBe('2026-12-28')
  })

  it('요일 계산이 KST 기준이다', () => {
    expect(kstWeekday('2026-08-31')).toBe(1) // 월
    expect(kstWeekday('2026-09-06')).toBe(0) // 일
  })
})

describe('weekRangeOf — 반열린 구간 [start, end)', () => {
  it('일요일 23:59 와 월요일 00:00 이 서로 다른 주에 배정된다', () => {
    const sundayLate = new Date('2026-09-06T14:59:00Z') // KST 09-06(일) 23:59
    const mondayStart = new Date('2026-09-06T15:00:00Z') // KST 09-07(월) 00:00

    expect(formatKstDate(weekStartOf(sundayLate))).toBe('2026-08-31')
    expect(formatKstDate(weekStartOf(mondayStart))).toBe('2026-09-07')
  })

  it('구간의 end 는 다음 주 월요일이며 포함되지 않는다', () => {
    const { start, end } = weekRangeOf('2026-09-01')
    const mondayStart = new Date('2026-09-06T15:00:00Z')

    expect(formatKstDate(start)).toBe('2026-08-31')
    expect(formatKstDate(end)).toBe('2026-09-07')
    expect(mondayStart.getTime()).toBe(end.getTime()) // $lt 이므로 제외된다
    expect(new Date('2026-09-06T14:59:00Z').getTime()).toBeLessThan(end.getTime())
  })

  it('addWeeks 가 정확히 7일씩 움직인다', () => {
    expect(formatKstDate(addWeeks(weekStartOf('2026-08-31'), 1))).toBe('2026-09-07')
    expect(formatKstDate(addWeeks(weekStartOf('2026-08-31'), -1))).toBe('2026-08-24')
    expect(formatKstDate(addWeeks(weekStartOf('2026-12-28'), 1))).toBe('2027-01-04')
  })
})

describe('isDueOutsideWeek — 마감일 이탈 판정 (PLAN A10)', () => {
  const weekStart = weekStartOf('2026-08-31')

  it('마감일이 없으면 false', () => {
    expect(isDueOutsideWeek(null, weekStart)).toBe(false)
  })

  it('주 범위 안이면 false (월요일과 일요일 양 끝 포함)', () => {
    expect(isDueOutsideWeek(toKstDateOnly('2026-08-31'), weekStart)).toBe(false)
    expect(isDueOutsideWeek(toKstDateOnly('2026-09-03'), weekStart)).toBe(false)
    expect(isDueOutsideWeek(toKstDateOnly('2026-09-06'), weekStart)).toBe(false)
  })

  it('주 범위 밖이면 true (직전 일요일과 다음 월요일)', () => {
    expect(isDueOutsideWeek(toKstDateOnly('2026-08-30'), weekStart)).toBe(true)
    expect(isDueOutsideWeek(toKstDateOnly('2026-09-07'), weekStart)).toBe(true)
  })
})

describe('formatKstDate', () => {
  it('KST 기준 YYYY-MM-DD 를 반환한다', () => {
    expect(formatKstDate(new Date('2026-09-01T14:00:00Z'))).toBe('2026-09-01')
    expect(formatKstDate(new Date('2026-09-01T15:00:00Z'))).toBe('2026-09-02')
  })
})
