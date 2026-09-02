import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addWeeks, weekStartOf } from '@/lib/date'
import { computeMetrics } from '@/lib/metrics'
import { Maintenance, RETENTION_DAYS, purgeExpired, resetMaintenanceRecord, runDailyMaintenance } from '@/lib/retention'
import { todoRepo, weeklyPlanRepo } from '@/lib/repositories'
import { Goal, Session, Todo, WeeklyPlan } from '@/models'
import { owner } from './helpers/owner'
import { id, makeGoal, makePlan, makeTodo, makeTodos } from './helpers/factories'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-09-01T03:00:00Z')

const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY)

beforeEach(async () => {
  await resetMaintenanceRecord()
})

describe('purgeExpired — 30일 보관 (PRD P0)', () => {
  it(`deletedAt 이 ${RETENTION_DAYS - 1}일 전인 문서는 살아남는다`, async () => {
    const todo = await makeTodo({ title: '아직 보관 중' })
    await Todo.updateOne({ _id: todo._id }, { $set: { deletedAt: daysAgo(29) } })

    await purgeExpired(NOW)

    expect(await Todo.countDocuments({ _id: todo._id })).toBe(1)
  })

  it(`deletedAt 이 ${RETENTION_DAYS + 1}일 전인 문서는 하드 삭제된다`, async () => {
    const todo = await makeTodo({ title: '보관 기한 만료' })
    await Todo.updateOne({ _id: todo._id }, { $set: { deletedAt: daysAgo(31) } })

    const result = await purgeExpired(NOW)

    expect(result.todos).toBe(1)
    expect(await Todo.countDocuments({ _id: todo._id })).toBe(0)
  })

  it('deletedAt 이 null 인 문서는 아무리 오래돼도 삭제되지 않는다', async () => {
    const alive = await makeTodo({ title: '살아 있는 할일' })
    await Todo.updateOne({ _id: alive._id }, { $set: { createdAt: daysAgo(400) } })

    const result = await purgeExpired(NOW)

    expect(result.todos).toBe(0)
    expect(await Todo.countDocuments({ _id: alive._id })).toBe(1)
  })

  it('세 컬렉션을 모두 정리한다', async () => {
    const goal = await makeGoal()
    const plan = await makePlan()
    const todo = await makeTodo()

    for (const [model, doc] of [
      [Goal, goal],
      [WeeklyPlan, plan],
      [Todo, todo],
    ] as const) {
      await (model as typeof Todo).updateOne({ _id: doc._id }, { $set: { deletedAt: daysAgo(31) } })
    }

    const result = await purgeExpired(NOW)

    expect(result).toMatchObject({ todos: 1, weeklyPlans: 1, goals: 1 })
  })

  it('경계값 하루 차이를 정확히 가른다', async () => {
    const justInside = await makeTodo({ title: '경계 안' })
    const justOutside = await makeTodo({ title: '경계 밖' })

    // 정확히 30일 전은 cutoff 와 같아 $lt 에 걸리지 않는다.
    await Todo.updateOne({ _id: justInside._id }, { $set: { deletedAt: daysAgo(RETENTION_DAYS) } })
    await Todo.updateOne({ _id: justOutside._id }, { $set: { deletedAt: daysAgo(RETENTION_DAYS + 0.01) } })

    await purgeExpired(NOW)

    expect(await Todo.countDocuments({ _id: justInside._id })).toBe(1)
    expect(await Todo.countDocuments({ _id: justOutside._id })).toBe(0)
  })

  it('TTL 인덱스를 쓰지 않는다 (삭제 시점을 앱이 통제한다)', async () => {
    for (const collection of ['todos', 'weeklyplans', 'goals']) {
      const indexes = await Todo.db.collection(collection).indexes()
      expect(indexes.some((index) => 'expireAfterSeconds' in index)).toBe(false)
    }
  })
})

describe('runDailyMaintenance — 하루 한 번 (PLAN Phase 7)', () => {
  it('처음 호출하면 정리를 실행하고 시각을 기록한다', async () => {
    const outcome = await runDailyMaintenance(NOW)

    expect(outcome.ran).toBe(true)
    expect(await Maintenance.countDocuments({ key: 'purge' })).toBe(1)
  })

  it('같은 날 두 번째 호출은 DB 쓰기 없이 조기 반환한다', async () => {
    await runDailyMaintenance(NOW)

    const deleteMany = vi.spyOn(Todo, 'deleteMany')
    const updateOne = vi.spyOn(Maintenance, 'updateOne')

    const outcome = await runDailyMaintenance(new Date(NOW.getTime() + 60_000))

    expect(outcome).toMatchObject({ ran: false, reason: 'already-ran-today' })
    expect(deleteMany).not.toHaveBeenCalled()
    expect(updateOne).not.toHaveBeenCalled()

    vi.restoreAllMocks()
  })

  it('날짜가 바뀌면 다시 실행한다', async () => {
    await runDailyMaintenance(NOW)

    const nextDay = await runDailyMaintenance(new Date(NOW.getTime() + DAY))
    expect(nextDay.ran).toBe(true)
  })

  it('KST 자정을 넘겨야 다시 실행된다 (UTC 자정 기준이 아니다)', async () => {
    // KST 2026-09-01 12:00 == UTC 03:00
    await runDailyMaintenance(NOW)

    // UTC 로는 다음 날이지만 KST 로는 아직 같은 날(2026-09-01 22:00)
    const stillSameKstDay = await runDailyMaintenance(new Date('2026-09-01T13:00:00Z'))
    expect(stillSameKstDay.ran).toBe(false)

    // KST 2026-09-02 00:30
    const nextKstDay = await runDailyMaintenance(new Date('2026-09-01T15:30:00Z'))
    expect(nextKstDay.ran).toBe(true)
  })
})

describe('만료 세션 정리', () => {
  // 세션은 접근할 때마다 하나씩 치워지지만, 다시 오지 않는 세션은 그대로 쌓인다.
  // 그래서 보관 정리가 함께 걷어 간다. 보관 기한(30일)과는 무관하게 만료 시각만 본다.
  it('만료 시각이 지난 세션은 삭제되고 유효한 세션은 남는다', async () => {
    const before = await Session.countDocuments({})

    await Session.create({
      tokenHash: 'expired-hash',
      userId: owner(),
      expiresAt: daysAgo(1),
    })
    await Session.create({
      tokenHash: 'live-hash',
      userId: owner(),
      expiresAt: new Date(NOW.getTime() + DAY),
    })

    const result = await purgeExpired(NOW)

    expect(result.sessions).toBe(1)
    expect(await Session.countDocuments({ tokenHash: 'expired-hash' })).toBe(0)
    expect(await Session.countDocuments({ tokenHash: 'live-hash' })).toBe(1)
    // 테스트 셋업이 만들어 둔 유효 세션도 건드리지 않는다.
    expect(await Session.countDocuments({})).toBe(before + 1)
  })

  it('삭제되지 않은 할일만 있어도 세션 정리는 별개로 수행된다', async () => {
    await Session.create({
      tokenHash: 'orphan-expired',
      userId: owner(),
      expiresAt: daysAgo(40),
    })
    await makeTodo({ title: '살아 있는 할일' })

    const outcome = await runDailyMaintenance(NOW)

    expect(outcome.ran).toBe(true)
    if (outcome.ran) {
      expect(outcome.result.todos).toBe(0)
      expect(outcome.result.sessions).toBe(1)
    }
  })
})

describe('유령 분모 방지 (PLAN R15)', () => {
  it('하드 삭제된 할일은 carriedFrom 으로 참조하던 주의 분모에서도 사라진다', async () => {
    const plan = await makePlan({ title: '원본 주', weekStart: '2026-08-31' })
    const kept = await makeTodo({ title: '남는 할일', weeklyPlanId: id(plan) })
    const carried = await makeTodo({ title: '이월될 할일', weeklyPlanId: id(plan) })

    await weeklyPlanRepo.carryOverBatch(owner(), id(plan), [id(carried)])

    // 이월 직후: 소속 1건 + 이월돼 나간 1건 = 분모 2
    expect((await weeklyPlanRepo.progressForPlans(owner(), [id(plan)])).get(id(plan))?.denominator).toBe(2)

    // 소프트 삭제하면 즉시 분모에서 빠지고
    await todoRepo.softDeleteTodo(owner(), id(carried))
    expect((await weeklyPlanRepo.progressForPlans(owner(), [id(plan)])).get(id(plan))?.denominator).toBe(1)

    // 보관 기한이 지나 하드 삭제돼도 되살아나지 않는다
    await Todo.updateOne({ _id: carried._id }, { $set: { deletedAt: daysAgo(31) } })
    await purgeExpired(NOW)

    expect(await Todo.countDocuments({ _id: carried._id })).toBe(0)
    expect((await weeklyPlanRepo.progressForPlans(owner(), [id(plan)])).get(id(plan))?.denominator).toBe(1)
    expect(await Todo.countDocuments({ _id: kept._id })).toBe(1)
  })

  it('주간 계획이 하드 삭제돼도 남은 carriedFrom 참조가 다른 계획의 분모를 오염시키지 않는다', async () => {
    const source = await makePlan({ title: '사라질 주', weekStart: '2026-08-31' })
    const todo = await makeTodo({ title: '이월된 할일', weeklyPlanId: id(source) })
    const result = await weeklyPlanRepo.carryOverBatch(owner(), id(source), [id(todo)])

    await WeeklyPlan.updateOne({ _id: source._id }, { $set: { deletedAt: daysAgo(31) } })
    await purgeExpired(NOW)

    expect(await WeeklyPlan.countDocuments({ _id: source._id })).toBe(0)

    // 도착한 주는 영향을 받지 않는다
    const progress = await weeklyPlanRepo.progressForPlans(owner(), [result.targetPlanId])
    expect(progress.get(result.targetPlanId)).toEqual({ percent: 0, done: 0, denominator: 1 })
  })
})

describe('성공 지표 M1 / M2 / M3 (PLAN §1.5)', () => {
  const THIS_WEEK = weekStartOf(NOW)

  it('데이터가 전혀 없으면 세 지표 모두 0 이다 (NaN 아님)', async () => {
    const metrics = await computeMetrics(owner(), NOW)

    expect(metrics.linkedRate).toBe(0)
    expect(metrics.executionRate).toBe(0)
    expect(metrics.carryOverBacklogRate).toBe(0)
  })

  it('M1: 활성 할일 10건 중 7건이 연결돼 있으면 70 이다', async () => {
    const plan = await makePlan({ weekStart: THIS_WEEK })
    await makeTodos(id(plan), 7)
    await makeTodos(null, 3)

    const metrics = await computeMetrics(owner(), NOW)

    expect(metrics.linkedRate).toBe(70)
    expect(metrics.detail).toMatchObject({ activeTodos: 10, linkedTodos: 7 })
  })

  it('M1: 소프트 삭제된 할일은 분모와 분자 양쪽에서 빠진다', async () => {
    const plan = await makePlan({ weekStart: THIS_WEEK })
    await makeTodos(id(plan), 1)
    const orphan = await makeTodo()
    await todoRepo.softDeleteTodo(owner(), id(orphan))

    expect((await computeMetrics(owner(), NOW)).linkedRate).toBe(100)
  })

  it('M2: 경과 주 5개 중 3개만 진행률 1% 이상이면 60 이다', async () => {
    for (let index = 0; index < 5; index += 1) {
      const plan = await makePlan({ title: `경과 ${index}`, weekStart: addWeeks(THIS_WEEK, -index) })
      // 앞 3개만 착수한다
      await makeTodos(id(plan), 2, index < 3 ? 1 : 0)
    }

    const metrics = await computeMetrics(owner(), NOW)

    expect(metrics.executionRate).toBe(60)
    expect(metrics.detail).toMatchObject({ elapsedPlans: 5, startedPlans: 3 })
  })

  it('M2: 아직 오지 않은 주는 분모에 들어가지 않는다', async () => {
    const elapsed = await makePlan({ title: '경과', weekStart: THIS_WEEK })
    await makeTodos(id(elapsed), 2, 1)
    await makePlan({ title: '미래', weekStart: addWeeks(THIS_WEEK, 3) })

    const metrics = await computeMetrics(owner(), NOW)

    expect(metrics.detail.elapsedPlans).toBe(1)
    expect(metrics.executionRate).toBe(100)
  })

  it('M3: 2회 이상 이월된 건만 세고 1회 이월 건은 세지 않는다', async () => {
    let plan = await makePlan({ title: '연속 이월', weekStart: addWeeks(THIS_WEEK, -3) })
    const twice = await makeTodo({ title: '두 번 이월', weeklyPlanId: id(plan) })
    const once = await makeTodo({ title: '한 번 이월', weeklyPlanId: id(plan) })

    // 두 건 모두 1회 이월
    const first = await weeklyPlanRepo.carryOverBatch(owner(), id(plan), [id(twice), id(once)])
    plan = await weeklyPlanRepo.getWeeklyPlan(owner(), first.targetPlanId)

    // 한 건만 추가로 이월
    await weeklyPlanRepo.carryOverBatch(owner(), id(plan), [id(twice)])

    await makeTodo({ title: '이월 없음' })

    const metrics = await computeMetrics(owner(), NOW)

    expect(metrics.detail.repeatedlyCarried).toBe(1)
    expect(metrics.detail.activeTodos).toBe(3)
    expect(metrics.carryOverBacklogRate).toBe(33)
  })
})
