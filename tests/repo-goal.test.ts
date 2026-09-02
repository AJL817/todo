import { describe, expect, it } from 'vitest'
import { addWeeks, formatKstDate, weekStartOf } from '@/lib/date'
import { NotFoundError, goalRepo, todoRepo, weeklyPlanRepo } from '@/lib/repositories'
import { Goal } from '@/models'
import { owner } from './helpers/owner'
import { id, makeGoal, makePlan, makeTodos } from './helpers/factories'

const NOW = new Date('2026-09-01T14:00:00Z') // KST 2026-09-01(화) 23:00
const THIS_WEEK = weekStartOf(NOW)

describe('createGoal / updateGoal', () => {
  it('기간을 KST 자정으로 정규화해 저장한다', async () => {
    const goal = await goalRepo.createGoal(owner(), {
      title: '2026년 체력',
      year: 2026,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    })

    expect(formatKstDate(goal.startDate)).toBe('2026-01-01')
    expect(formatKstDate(goal.endDate)).toBe('2026-12-31')
    expect(goal.startDate.toISOString()).toBe('2025-12-31T15:00:00.000Z')
  })

  it('설명을 지정하지 않으면 null 이다', async () => {
    expect((await makeGoal()).description).toBeNull()
  })

  it('제목과 설명을 수정할 수 있다', async () => {
    const goal = await makeGoal()
    const updated = await goalRepo.updateGoal(owner(), id(goal), { title: '수정됨', description: '메모' })

    expect(updated.title).toBe('수정됨')
    expect(updated.description).toBe('메모')
  })
})

describe('softDeleteGoalWithDetach — 연쇄 삭제 금지 (PRD P0)', () => {
  it('하위 주간 계획이 미분류로 전환되고 살아 있다', async () => {
    const goal = await makeGoal()
    const planA = await makePlan({ title: 'A주', goalId: id(goal) })
    const planB = await makePlan({ title: 'B주', goalId: id(goal) })

    const result = await goalRepo.softDeleteGoalWithDetach(owner(), id(goal))
    expect(result.detachedPlans).toBe(2)

    for (const plan of [planA, planB]) {
      const reloaded = await weeklyPlanRepo.getWeeklyPlan(owner(), id(plan))
      expect(reloaded.goalId).toBeNull()
      expect(reloaded.deletedAt).toBeNull()
    }
  })

  it('목표 삭제 후 하위 계획이 미분류 목록에 나타난다', async () => {
    const goal = await makeGoal()
    await makePlan({ title: '살아남을 계획', goalId: id(goal) })

    expect(await weeklyPlanRepo.listWeeklyPlans(owner(), { unassignedOnly: true })).toHaveLength(0)
    await goalRepo.softDeleteGoalWithDetach(owner(), id(goal))

    const orphans = await weeklyPlanRepo.listWeeklyPlans(owner(), { unassignedOnly: true })
    expect(orphans.map((p) => p.title)).toEqual(['살아남을 계획'])
  })

  it('손자 할일까지 내려가 지우지 않는다 (2단계 연쇄 없음)', async () => {
    const goal = await makeGoal()
    const plan = await makePlan({ goalId: id(goal) })
    await makeTodos(id(plan), 2)

    await goalRepo.softDeleteGoalWithDetach(owner(), id(goal))

    const todos = await todoRepo.listAllActive(owner())
    expect(todos).toHaveLength(2)
    // 할일은 여전히 그 주간 계획 소속이다. 미분류로 내려가지 않는다.
    expect(todos.every((todo) => todo.weeklyPlanId?.toString() === id(plan))).toBe(true)
  })

  it('목표 문서는 deletedAt 이 채워진 채 남고 조회에서만 빠진다', async () => {
    const goal = await makeGoal()
    await goalRepo.softDeleteGoalWithDetach(owner(), id(goal))

    expect(await goalRepo.listGoals(owner())).toHaveLength(0)
    expect((await Goal.findById(goal._id).lean())?.deletedAt).not.toBeNull()
  })

  it('없는 목표를 삭제하면 NotFoundError', async () => {
    const goal = await makeGoal()
    await goalRepo.softDeleteGoalWithDetach(owner(), id(goal))

    await expect(goalRepo.softDeleteGoalWithDetach(owner(), id(goal))).rejects.toThrow(NotFoundError)
  })
})

describe('getGoalWithProgress — 경과 주 기준 평균 (PLAN A5)', () => {
  it('하위 계획이 없으면 0% / 경과 0주', async () => {
    const goal = await makeGoal()
    const detail = await goalRepo.getGoalWithProgress(owner(), id(goal), NOW)

    expect(detail.progress).toEqual({ percent: 0, countedWeeks: 0 })
    expect(detail.plans).toHaveLength(0)
  })

  it('경과 주 100% 와 0% 두 계획이면 50% / 경과 2주', async () => {
    const goal = await makeGoal()
    const done = await makePlan({ title: '지난 주', weekStart: addWeeks(THIS_WEEK, -1), goalId: id(goal) })
    const empty = await makePlan({ title: '이번 주', weekStart: THIS_WEEK, goalId: id(goal) })

    await makeTodos(id(done), 2, 2)
    await makeTodos(id(empty), 2, 0)

    const detail = await goalRepo.getGoalWithProgress(owner(), id(goal), NOW)
    expect(detail.progress).toEqual({ percent: 50, countedWeeks: 2 })
  })

  it('미래 주간 계획을 50개 추가해도 진행률이 변하지 않는다 (A5 핵심)', async () => {
    const goal = await makeGoal()
    const current = await makePlan({ title: '이번 주', weekStart: THIS_WEEK, goalId: id(goal) })
    await makeTodos(id(current), 3, 1) // 33%

    const before = await goalRepo.getGoalWithProgress(owner(), id(goal), NOW)
    expect(before.progress).toEqual({ percent: 33, countedWeeks: 1 })

    for (let week = 1; week <= 50; week += 1) {
      await makePlan({ title: `미래 ${week}주`, weekStart: addWeeks(THIS_WEEK, week), goalId: id(goal) })
    }

    const after = await goalRepo.getGoalWithProgress(owner(), id(goal), NOW)
    expect(after.progress).toEqual({ percent: 33, countedWeeks: 1 })
    expect(after.plans).toHaveLength(51) // 계획 자체는 전부 보인다
  })

  it('경과했지만 비어 있는 주는 0% 로 분모에 들어간다 (반대 방향 왜곡 차단)', async () => {
    const goal = await makeGoal()
    const filled = await makePlan({ weekStart: addWeeks(THIS_WEEK, -3), goalId: id(goal), title: '채운 주' })
    await makeTodos(id(filled), 2, 2)

    for (let week = 2; week >= 0; week -= 1) {
      await makePlan({ title: `빈 주 ${week}`, weekStart: addWeeks(THIS_WEEK, -week), goalId: id(goal) })
    }

    const detail = await goalRepo.getGoalWithProgress(owner(), id(goal), NOW)
    expect(detail.progress).toEqual({ percent: 25, countedWeeks: 4 })
  })

  it('미래 주라도 done 이 1건 있으면 분모에 포함된다', async () => {
    const goal = await makeGoal()
    const future = await makePlan({ title: '미리 끝낸 주', weekStart: addWeeks(THIS_WEEK, 2), goalId: id(goal) })
    await makeTodos(id(future), 2, 2)

    const detail = await goalRepo.getGoalWithProgress(owner(), id(goal), NOW)
    expect(detail.progress).toEqual({ percent: 100, countedWeeks: 1 })
    expect(detail.plans[0]?.counted).toBe(true)
  })

  it('계획별 counted 플래그가 목표 진행률 분모와 정확히 일치한다', async () => {
    const goal = await makeGoal()
    await makePlan({ title: '경과', weekStart: addWeeks(THIS_WEEK, -1), goalId: id(goal) })
    await makePlan({ title: '미래', weekStart: addWeeks(THIS_WEEK, 3), goalId: id(goal) })

    const detail = await goalRepo.getGoalWithProgress(owner(), id(goal), NOW)

    expect(detail.plans.filter((p) => p.counted)).toHaveLength(detail.progress.countedWeeks)
    expect(Object.fromEntries(detail.plans.map((p) => [p.plan.title, p.counted]))).toEqual({
      경과: true,
      미래: false,
    })
  })

  it('할일 1건짜리 주와 20건짜리 주가 동등한 지분을 갖는다 (가중 평균 아님, §0.2)', async () => {
    const goal = await makeGoal()
    const small = await makePlan({ title: '1건', weekStart: addWeeks(THIS_WEEK, -1), goalId: id(goal) })
    const big = await makePlan({ title: '20건', weekStart: THIS_WEEK, goalId: id(goal) })

    await makeTodos(id(small), 1, 1) // 100%
    await makeTodos(id(big), 20, 2) // 10%

    const detail = await goalRepo.getGoalWithProgress(owner(), id(goal), NOW)
    expect(detail.progress.percent).toBe(55)

    // 주별 할일 건수를 함께 노출해 사용자가 스스로 판단할 수 있게 한다 (R14)
    expect(Object.fromEntries(detail.plans.map((p) => [p.plan.title, p.todoCount]))).toEqual({
      '1건': 1,
      '20건': 20,
    })
  })

  it('이월돼 나간 할일이 목표 진행률에도 반영된다 (A8)', async () => {
    const goal = await makeGoal()
    const plan = await makePlan({ title: '이월 원본', weekStart: addWeeks(THIS_WEEK, -1), goalId: id(goal) })
    const todos = await makeTodos(id(plan), 3, 1) // 33%

    const before = await goalRepo.getGoalWithProgress(owner(), id(goal), NOW)
    expect(before.progress.percent).toBe(33)

    await weeklyPlanRepo.carryOverBatch(owner(), id(plan), [id(todos[1]!), id(todos[2]!)])

    // 이월 대상 주 계획이 goalId 를 승계했으므로 목표 아래 계획이 2개가 된다.
    const after = await goalRepo.getGoalWithProgress(owner(), id(goal), NOW)
    const original = after.plans.find((p) => p.plan._id.toString() === id(plan))

    expect(original?.progress).toEqual({ percent: 33, done: 1, denominator: 3 })
    expect(after.plans).toHaveLength(2)
  })

  it('삭제된 계획은 목표 상세와 분모 양쪽에서 빠진다', async () => {
    const goal = await makeGoal()
    const alive = await makePlan({ title: '살아 있음', weekStart: THIS_WEEK, goalId: id(goal) })
    const dead = await makePlan({ title: '삭제됨', weekStart: THIS_WEEK, goalId: id(goal) })

    await makeTodos(id(alive), 2, 2)
    await makeTodos(id(dead), 2, 0)

    await weeklyPlanRepo.softDeleteWeeklyPlanWithDetach(owner(), id(dead))

    const detail = await goalRepo.getGoalWithProgress(owner(), id(goal), NOW)
    expect(detail.plans).toHaveLength(1)
    expect(detail.progress).toEqual({ percent: 100, countedWeeks: 1 })
  })

  it('미분류 주간 계획을 목표에 연결하면 진행률에 즉시 반영된다', async () => {
    const goal = await makeGoal()
    const orphan = await makePlan({ title: '미분류 주', weekStart: THIS_WEEK })
    await makeTodos(id(orphan), 2, 1)

    expect((await goalRepo.getGoalWithProgress(owner(), id(goal), NOW)).progress.countedWeeks).toBe(0)

    await weeklyPlanRepo.updateWeeklyPlan(owner(), id(orphan), { goalId: id(goal) })

    expect(await goalRepo.getGoalWithProgress(owner(), id(goal), NOW)).toMatchObject({
      progress: { percent: 50, countedWeeks: 1 },
    })
  })

  it('삭제된 목표는 조회되지 않는다', async () => {
    const goal = await makeGoal()
    await goalRepo.softDeleteGoalWithDetach(owner(), id(goal))

    await expect(goalRepo.getGoalWithProgress(owner(), id(goal), NOW)).rejects.toThrow(NotFoundError)
  })
})

describe('listGoalsWithProgress', () => {
  it('목표별 진행률을 함께 반환하고 연도로 거를 수 있다', async () => {
    const goal2026 = await makeGoal({ title: '2026 목표', year: 2026 })
    await makeGoal({ title: '2027 목표', year: 2027, startDate: '2027-01-01', endDate: '2027-12-31' })

    const plan = await makePlan({ weekStart: THIS_WEEK, goalId: id(goal2026) })
    await makeTodos(id(plan), 4, 3) // 75%

    const all = await goalRepo.listGoalsWithProgress(owner(), undefined, NOW)
    expect(all).toHaveLength(2)

    const only2026 = await goalRepo.listGoalsWithProgress(owner(), 2026, NOW)
    expect(only2026).toHaveLength(1)
    expect(only2026[0]?.progress).toEqual({ percent: 75, countedWeeks: 1 })
  })

  it('삭제된 목표는 목록에서 빠진다', async () => {
    const goal = await makeGoal()
    await goalRepo.softDeleteGoalWithDetach(owner(), id(goal))

    expect(await goalRepo.listGoalsWithProgress(owner(), undefined, NOW)).toHaveLength(0)
  })
})
