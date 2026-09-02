import { describe, expect, it } from 'vitest'
import {
  MIN_GAP,
  POSITION_STEP,
  computePosition,
  needsRebalance,
  rebalance,
  rebalancedPositions,
  sortByPosition,
} from '@/lib/position'

describe('computePosition — 삽입 위치 계산 (PLAN §4.3)', () => {
  it('빈 열에 넣으면 1024', () => {
    expect(computePosition(null, null)).toBe(POSITION_STEP)
  })

  it('맨 뒤에 붙이면 최댓값 + 1024', () => {
    expect(computePosition(3072, null)).toBe(3072 + POSITION_STEP)
  })

  it('맨 앞에 붙이면 최솟값의 절반', () => {
    expect(computePosition(null, 1024)).toBe(512)
  })

  it('두 카드 사이에 넣으면 중앙값', () => {
    expect(computePosition(1024, 2048)).toBe(1536)
  })

  it('맨 앞/중간/맨 뒤 삽입 후 오름차순이 의도한 카드 순서와 일치한다', () => {
    const column = [
      { id: 'a', position: 1024 },
      { id: 'b', position: 2048 },
      { id: 'c', position: 3072 },
    ]

    const head = { id: 'head', position: computePosition(null, 1024) }
    const middle = { id: 'middle', position: computePosition(2048, 3072) }
    const tail = { id: 'tail', position: computePosition(3072, null) }

    const ordered = sortByPosition([...column, head, middle, tail]).map((item) => item.id)
    expect(ordered).toEqual(['head', 'a', 'b', 'middle', 'c', 'tail'])
  })
})

describe('needsRebalance — 정밀도 소진 감지 (PLAN R4)', () => {
  it('열 양 끝 삽입은 리밸런스가 필요 없다', () => {
    expect(needsRebalance(null, 1024)).toBe(false)
    expect(needsRebalance(1024, null)).toBe(false)
  })

  it('간격이 충분하면 false', () => {
    expect(needsRebalance(1024, 2048)).toBe(false)
  })

  it('간격이 1e-6 미만이면 true', () => {
    expect(needsRebalance(1, 1 + MIN_GAP / 2)).toBe(true)
  })

  it('같은 지점에 반복 삽입하면 결국 리밸런스가 트리거된다', () => {
    const before = 1024
    let after = 2048
    let iterations = 0

    while (!needsRebalance(before, after) && iterations < 100) {
      after = computePosition(before, after)
      iterations += 1
    }

    expect(needsRebalance(before, after)).toBe(true)
    expect(iterations).toBeLessThan(100)
  })
})

describe('rebalance — 재배치 (PLAN §4.3)', () => {
  it('모든 position 이 1024 배수로 재배치되고 순서가 보존된다', () => {
    const column = [
      { id: 'a', position: 1 },
      { id: 'b', position: 1.0000001 },
      { id: 'c', position: 1.0000002 },
    ]

    const result = rebalance(column)

    expect(result.map((r) => r.item.id)).toEqual(['a', 'b', 'c'])
    expect(result.map((r) => r.position)).toEqual([1024, 2048, 3072])
    for (const { position } of result) expect(position % POSITION_STEP).toBe(0)
  })

  it('입력 순서가 뒤죽박죽이어도 position 오름차순으로 정렬해 배치한다', () => {
    const result = rebalance([
      { id: 'c', position: 30 },
      { id: 'a', position: 10 },
      { id: 'b', position: 20 },
    ])
    expect(result.map((r) => r.item.id)).toEqual(['a', 'b', 'c'])
  })

  it('연속 2회 실행해도 결과가 동일하다 (멱등성)', () => {
    const column = [
      { id: 'a', position: 1 },
      { id: 'b', position: 1.0000001 },
      { id: 'c', position: 1.0000002 },
    ]

    const once = rebalance(column).map((r) => ({ id: r.item.id, position: r.position }))
    const twice = rebalance(once).map((r) => ({ id: r.item.id, position: r.position }))

    expect(twice).toEqual(once)
  })

  it('빈 열을 재배치해도 안전하다', () => {
    expect(rebalance([])).toEqual([])
    expect(rebalancedPositions(0)).toEqual([])
  })

  it('rebalancedPositions 가 1024 배수 수열을 만든다', () => {
    expect(rebalancedPositions(3)).toEqual([1024, 2048, 3072])
  })
})
