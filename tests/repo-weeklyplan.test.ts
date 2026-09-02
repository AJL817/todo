import { afterEach, describe, expect, it, vi } from 'vitest'
import { addWeeks, formatKstDate, weekStartOf } from '@/lib/date'
import { NotFoundError, todoRepo, weeklyPlanRepo } from '@/lib/repositories'
import { Todo, WeeklyPlan } from '@/models'
import { owner } from './helpers/owner'
import { id, makeGoal, makePlan, makeTodo, makeTodos } from './helpers/factories'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createWeeklyPlan', () => {
  it('주 시작일을 그 주의 월요일 KST 자정으로 접는다 (A2)', async () => {
    const plan = await weeklyPlanRepo.createWeeklyPlan(owner(), { title: '주간', weekStart: '2026-09-03' })
    expect(formatKstDate(plan.weekStart)).toBe('2026-08-31')
  })

  it('목표를 지정하지 않으면 미분류로 만들어진다', async () => {
    const plan = await makePlan()
    expect(plan.goalId).toBeNull()
  })
})

describe('softDeleteWeeklyPlanWithDetach — 연쇄 삭제 금지 (PRD P0)', () => {
  it('하위 할일이 미분류로 전환되고 살아 있다', async () => {
    const plan = await makePlan()
    const todos = await makeTodos(id(plan), 3)

    const result = await weeklyPlanRepo.softDeleteWeeklyPlanWithDetach(owner(), id(plan))

    expect(result.detachedTodos).toBe(3)

    for (const todo of todos) {
      const reloaded = await todoRepo.getTodo(owner(), id(todo))
      expect(reloaded.weeklyPlanId).toBeNull()
      expect(reloaded.deletedAt).toBeNull()
    }
  })

  it('삭제 후 하위 할일이 인박스에 나타난다 (PLAN §4.6)', async () => {
    const plan = await makePlan()
    await makeTodos(id(plan), 2)

    expect(await todoRepo.listInbox(owner())).toHaveLength(0)
    await weeklyPlanRepo.softDeleteWeeklyPlanWithDetach(owner(), id(plan))
    expect(await todoRepo.listInbox(owner())).toHaveLength(2)
  })

  it('계획 자체는 deletedAt 이 채워진 채 남고 조회에서만 빠진다', async () => {
    const plan = await makePlan()
    await weeklyPlanRepo.softDeleteWeeklyPlanWithDetach(owner(), id(plan))

    expect(await weeklyPlanRepo.listWeeklyPlans(owner())).toHaveLength(0)

    const raw = await WeeklyPlan.findById(plan._id).lean()
    expect(raw?.deletedAt).not.toBeNull()
  })

  it('하위 FK 를 먼저 끊고 상위 deletedAt 을 나중에 쓴다 (실패 모드가 양성, PLAN §3.1)', async () => {
    const plan = await makePlan()
    await makeTodos(id(plan), 1)

    const order: string[] = []
    const detachChildren = Todo.updateMany.bind(Todo)
    const markParentDeleted = WeeklyPlan.updateOne.bind(WeeklyPlan)

    vi.spyOn(Todo, 'updateMany').mockImplementation(((...args: Parameters<typeof Todo.updateMany>) => {
      order.push('detach-children')
      return detachChildren(...args)
    }) as typeof Todo.updateMany)

    vi.spyOn(WeeklyPlan, 'updateOne').mockImplementation(((...args: Parameters<typeof WeeklyPlan.updateOne>) => {
      order.push('mark-parent-deleted')
      return markParentDeleted(...args)
    }) as typeof WeeklyPlan.updateOne)

    await weeklyPlanRepo.softDeleteWeeklyPlanWithDetach(owner(), id(plan))

    // 순서가 뒤바뀌면 중간 실패 시 소속을 잃지 못한 고아 할일이 남는다
    expect(order).toEqual(['detach-children', 'mark-parent-deleted'])
  })

  it('없는 계획을 삭제하면 NotFoundError', async () => {
    const plan = await makePlan()
    await weeklyPlanRepo.softDeleteWeeklyPlanWithDetach(owner(), id(plan))

    await expect(weeklyPlanRepo.softDeleteWeeklyPlanWithDetach(owner(), id(plan))).rejects.toThrow(NotFoundError)
  })
})

describe('progressForPlans — 계획별 진행률 (PLAN §4.1.1)', () => {
  it('연결 할일이 0건이면 0% 를 반환한다 (NaN 아님)', async () => {
    const plan = await makePlan()
    const progress = await weeklyPlanRepo.progressForPlans(owner(), [id(plan)])

    expect(progress.get(id(plan))).toEqual({ percent: 0, done: 0, denominator: 0 })
  })

  it('3건 중 1건 done 이면 33%', async () => {
    const plan = await makePlan()
    await makeTodos(id(plan), 3, 1)

    expect(await weeklyPlanRepo.progressForPlans(owner(), [id(plan)]).then((m) => m.get(id(plan))?.percent)).toBe(33)
  })

  it('1건을 소프트 삭제하면 분모에서 즉시 빠져 50% 가 된다', async () => {
    const plan = await makePlan()
    const todos = await makeTodos(id(plan), 3, 1)
    await todoRepo.softDeleteTodo(owner(), id(todos[2]!))

    const progress = await weeklyPlanRepo.progressForPlans(owner(), [id(plan)])
    expect(progress.get(id(plan))).toEqual({ percent: 50, done: 1, denominator: 2 })
  })

  it('할일을 A 에서 B 로 재지정하면 양쪽 진행률이 모두 새 값이 된다 (PRD P0)', async () => {
    const planA = await makePlan({ title: 'A주' })
    const planB = await makePlan({ title: 'B주' })
    const todos = await makeTodos(id(planA), 2, 1)

    const before = await weeklyPlanRepo.progressForPlans(owner(), [id(planA), id(planB)])
    expect(before.get(id(planA))?.percent).toBe(50)
    expect(before.get(id(planB))?.percent).toBe(0)

    // 완료된 1건을 B 로 옮긴다
    await todoRepo.updateTodo(owner(), id(todos[0]!), { weeklyPlanId: id(planB) })

    const after = await weeklyPlanRepo.progressForPlans(owner(), [id(planA), id(planB)])
    expect(after.get(id(planA))).toEqual({ percent: 0, done: 0, denominator: 1 })
    expect(after.get(id(planB))).toEqual({ percent: 100, done: 1, denominator: 1 })
  })
})

describe('carryOverPreview — 이월 대상 미리보기 (PLAN §4.5)', () => {
  it('미완료 항목만 보여 준다', async () => {
    const plan = await makePlan()
    await makeTodos(id(plan), 3, 1) // 1건 done
    await makeTodo({ title: '진행중', weeklyPlanId: id(plan), status: 'doing' })
    await makeTodo({ title: '미분류' })

    const preview = await weeklyPlanRepo.carryOverPreview(owner(), id(plan))

    expect(preview.every((todo) => todo.status !== 'done')).toBe(true)
    expect(preview).toHaveLength(3)
  })

  it('소프트 삭제된 항목은 나타나지 않는다', async () => {
    const plan = await makePlan()
    const todos = await makeTodos(id(plan), 2)
    await todoRepo.softDeleteTodo(owner(), id(todos[0]!))

    expect(await weeklyPlanRepo.carryOverPreview(owner(), id(plan))).toHaveLength(1)
  })
})

describe('carryOverBatch — 일괄 이월 (PLAN §4.5 / A8 / R12)', () => {
  it('요청한 할일만 다음 주로 옮기고 carriedFrom 에 이전 주를 남긴다', async () => {
    const plan = await makePlan({ weekStart: '2026-08-31' })
    const todos = await makeTodos(id(plan), 3)

    const result = await weeklyPlanRepo.carryOverBatch(owner(), id(plan), [id(todos[0]!), id(todos[1]!)])

    expect(result.carriedIds).toHaveLength(2)
    expect(formatKstDate(result.targetWeekStart)).toBe('2026-09-07')

    const moved = await todoRepo.getTodo(owner(), id(todos[0]!))
    expect(moved.weeklyPlanId?.toString()).toBe(result.targetPlanId)
    expect(moved.carriedFrom.map(String)).toEqual([id(plan)])

    const stayed = await todoRepo.getTodo(owner(), id(todos[2]!))
    expect(stayed.weeklyPlanId?.toString()).toBe(id(plan))
    expect(stayed.carriedFrom).toEqual([])
  })

  it('이월 직후 이전 주 진행률이 이월 전과 동일하다 (A8 핵심, 게이밍 차단)', async () => {
    const plan = await makePlan({ weekStart: '2026-08-31' })
    const todos = await makeTodos(id(plan), 3, 1) // 1건 done -> 33%

    const before = (await weeklyPlanRepo.progressForPlans(owner(), [id(plan)])).get(id(plan))
    expect(before).toEqual({ percent: 33, done: 1, denominator: 3 })

    await weeklyPlanRepo.carryOverBatch(owner(), id(plan), [id(todos[1]!), id(todos[2]!)])

    const after = (await weeklyPlanRepo.progressForPlans(owner(), [id(plan)])).get(id(plan))
    expect(after).toEqual({ percent: 33, done: 1, denominator: 3 })
  })

  it('이월된 할일은 새 주의 분모에 들어간다', async () => {
    const plan = await makePlan({ weekStart: '2026-08-31' })
    const todos = await makeTodos(id(plan), 2)

    const result = await weeklyPlanRepo.carryOverBatch(owner(), id(plan), [id(todos[0]!)])
    const progress = await weeklyPlanRepo.progressForPlans(owner(), [result.targetPlanId])

    expect(progress.get(result.targetPlanId)).toEqual({ percent: 0, done: 0, denominator: 1 })
  })

  it('done 항목은 이월되지 않는다', async () => {
    const plan = await makePlan()
    const todos = await makeTodos(id(plan), 2, 2) // 둘 다 done

    const result = await weeklyPlanRepo.carryOverBatch(owner(), id(plan), todos.map(id))

    expect(result.carriedIds).toHaveLength(0)
    expect(result.skipped.map((s) => s.reason)).toEqual(['done', 'done'])
  })

  it('미분류 할일은 거부된다', async () => {
    const plan = await makePlan()
    const orphan = await makeTodo({ title: '미분류' })

    const result = await weeklyPlanRepo.carryOverBatch(owner(), id(plan), [id(orphan)])

    expect(result.carriedIds).toHaveLength(0)
    expect(result.skipped[0]?.reason).toBe('unassigned')
  })

  it('이월해도 마감일이 바뀌지 않는다', async () => {
    const plan = await makePlan({ weekStart: '2026-08-31' })
    const todo = await makeTodo({ weeklyPlanId: id(plan), dueDate: '2026-09-03' })

    await weeklyPlanRepo.carryOverBatch(owner(), id(plan), [id(todo)])

    const moved = await todoRepo.getTodo(owner(), id(todo))
    expect(formatKstDate(moved.dueDate!)).toBe('2026-09-03')
  })

  it('같은 요청을 2회 실행해도 DB 상태가 동일하다 (멱등성)', async () => {
    const plan = await makePlan({ weekStart: '2026-08-31' })
    const todos = await makeTodos(id(plan), 2)
    const todoIds = todos.map(id)

    const first = await weeklyPlanRepo.carryOverBatch(owner(), id(plan), todoIds)
    const snapshot = await Todo.find({}).sort({ _id: 1 }).lean()

    const second = await weeklyPlanRepo.carryOverBatch(owner(), id(plan), todoIds)

    expect(second.targetPlanId).toBe(first.targetPlanId)
    expect(second.createdTargetPlan).toBe(false)
    expect(second.carriedIds).toHaveLength(0)
    expect(second.skipped.every((s) => s.reason === 'not-in-source')).toBe(true)

    const after = await Todo.find({}).sort({ _id: 1 }).lean()
    expect(after.map((t) => t.carriedFrom.map(String))).toEqual(snapshot.map((t) => t.carriedFrom.map(String)))
    expect(after.map((t) => t.weeklyPlanId?.toString())).toEqual(snapshot.map((t) => t.weeklyPlanId?.toString()))

    // 계획이 중복 생성되지 않았다
    expect(await WeeklyPlan.countDocuments({ deletedAt: null })).toBe(2)
  })

  it('대상 주 계획이 없으면 자동 생성하고 제목과 목표 연결을 승계한다', async () => {
    const goal = await makeGoal()
    const plan = await makePlan({ title: '체력 주간', weekStart: '2026-08-31', goalId: id(goal) })
    const todo = await makeTodo({ weeklyPlanId: id(plan) })

    const result = await weeklyPlanRepo.carryOverBatch(owner(), id(plan), [id(todo)])

    expect(result.createdTargetPlan).toBe(true)

    const target = await weeklyPlanRepo.getWeeklyPlan(owner(), result.targetPlanId)
    expect(target.title).toBe('체력 주간')
    expect(target.goalId?.toString()).toBe(id(goal))
    expect(formatKstDate(target.weekStart)).toBe('2026-09-07')
  })

  it('대상 주에 같은 계획이 이미 있으면 새로 만들지 않는다', async () => {
    const plan = await makePlan({ title: '체력 주간', weekStart: '2026-08-31' })
    const existing = await makePlan({ title: '체력 주간', weekStart: '2026-09-07' })
    const todo = await makeTodo({ weeklyPlanId: id(plan) })

    const result = await weeklyPlanRepo.carryOverBatch(owner(), id(plan), [id(todo)])

    expect(result.createdTargetPlan).toBe(false)
    expect(result.targetPlanId).toBe(id(existing))
  })

  it('3주 연속 이월하면 carriedFrom 이 3개가 되고 세 주 모두의 분모에 잡힌다', async () => {
    let currentPlan = await makePlan({ title: '연속', weekStart: '2026-08-31' })
    const todo = await makeTodo({ weeklyPlanId: id(currentPlan) })
    const visited = [id(currentPlan)]

    for (let week = 0; week < 3; week += 1) {
      const result = await weeklyPlanRepo.carryOverBatch(owner(), id(currentPlan), [id(todo)])
      currentPlan = await weeklyPlanRepo.getWeeklyPlan(owner(), result.targetPlanId)
      visited.push(id(currentPlan))
    }

    const final = await todoRepo.getTodo(owner(), id(todo))
    expect(final.carriedFrom).toHaveLength(3)
    expect(final.carriedFrom.map(String)).toEqual(visited.slice(0, 3))

    const progress = await weeklyPlanRepo.progressForPlans(owner(), visited)
    for (const planId of visited) {
      expect(progress.get(planId)?.denominator).toBe(1)
      expect(progress.get(planId)?.percent).toBe(0)
    }
  })

  it('이월 후 완료해도 지나온 주들의 진행률은 오르지 않는다 (R12)', async () => {
    const plan = await makePlan({ weekStart: '2026-08-31' })
    const todo = await makeTodo({ weeklyPlanId: id(plan) })

    const result = await weeklyPlanRepo.carryOverBatch(owner(), id(plan), [id(todo)])
    await todoRepo.moveTodo(owner(), id(todo), { toStatus: 'done' })

    const progress = await weeklyPlanRepo.progressForPlans(owner(), [id(plan), result.targetPlanId])
    expect(progress.get(id(plan))).toEqual({ percent: 0, done: 0, denominator: 1 })
    expect(progress.get(result.targetPlanId)).toEqual({ percent: 100, done: 1, denominator: 1 })
  })

  it('없는 계획에서 이월하면 NotFoundError', async () => {
    const plan = await makePlan()
    await weeklyPlanRepo.softDeleteWeeklyPlanWithDetach(owner(), id(plan))

    await expect(weeklyPlanRepo.carryOverBatch(owner(), id(plan), [])).rejects.toThrow(NotFoundError)
  })
})

describe('listWeeklyPlans', () => {
  it('주 시작일로 거를 수 있고 삭제된 계획은 제외된다', async () => {
    await makePlan({ title: '이번 주', weekStart: '2026-08-31' })
    await makePlan({ title: '다음 주', weekStart: '2026-09-07' })
    const deleted = await makePlan({ title: '삭제될 계획', weekStart: '2026-08-31' })
    await weeklyPlanRepo.softDeleteWeeklyPlanWithDetach(owner(), id(deleted))

    const plans = await weeklyPlanRepo.listWeeklyPlans(owner(), { weekStart: '2026-09-02' })
    expect(plans.map((p) => p.title)).toEqual(['이번 주'])
  })

  it('미분류 계획만 골라낼 수 있다', async () => {
    const goal = await makeGoal()
    await makePlan({ title: '연결됨', goalId: id(goal) })
    await makePlan({ title: '미분류' })

    const plans = await weeklyPlanRepo.listWeeklyPlans(owner(), { unassignedOnly: true })
    expect(plans.map((p) => p.title)).toEqual(['미분류'])
  })

  it('다음 주 계산이 addWeeks 와 일치한다', async () => {
    const start = weekStartOf('2026-08-31')
    expect(formatKstDate(addWeeks(start, 1))).toBe('2026-09-07')
  })
})
