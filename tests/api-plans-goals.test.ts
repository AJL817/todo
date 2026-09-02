import { describe, expect, it } from 'vitest'
import { GET as listPlans, POST as createPlan } from '@/app/api/weekly-plans/route'
import { DELETE as deletePlan, PATCH as patchPlan } from '@/app/api/weekly-plans/[id]/route'
import { GET as carryOverPreview } from '@/app/api/weekly-plans/[id]/carryover-preview/route'
import { POST as carryOver } from '@/app/api/weekly-plans/[id]/carryover/route'
import { GET as listGoals, POST as createGoal } from '@/app/api/goals/route'
import { DELETE as deleteGoal, GET as getGoal } from '@/app/api/goals/[id]/route'
import { GET as getStats } from '@/app/api/stats/route'
import { Todo, WeeklyPlan } from '@/models'
import { id, makeGoal, makePlan, makeTodo, makeTodos } from './helpers/factories'
import { ctx, jsonReq, read, req } from './helpers/api'

const MISSING = '0123456789abcdef01234567'

interface PlanBody {
  id: string
  title: string
  weekStart: string
  goalId: string | null
}

describe('/api/weekly-plans', () => {
  it('생성 시 주 시작일이 월요일로 접힌다', async () => {
    const { status, body } = await read<PlanBody>(
      await createPlan(jsonReq('/api/weekly-plans', 'POST', { title: '주간', weekStart: '2026-09-03' })),
    )

    expect(status).toBe(201)
    expect(body.weekStart).toBe('2026-08-30T15:00:00.000Z') // 2026-08-31 KST 자정
  })

  it('제목이 없으면 400 이고 문서가 생기지 않는다', async () => {
    const { status } = await read(await createPlan(jsonReq('/api/weekly-plans', 'POST', { weekStart: '2026-08-31' })))

    expect(status).toBe(400)
    expect(await WeeklyPlan.countDocuments({})).toBe(0)
  })

  it('목록에 계획별 진행률이 함께 실린다', async () => {
    const plan = await makePlan({ weekStart: '2026-08-31' })
    await makeTodos(id(plan), 4, 1)

    const { body } = await read<{ plans: PlanBody[]; progress: Record<string, { percent: number; denominator: number }> }>(
      await listPlans(req('/api/weekly-plans?weekStart=2026-08-31')),
    )

    expect(body.plans).toHaveLength(1)
    expect(body.progress[id(plan)]).toEqual({ percent: 25, done: 1, denominator: 4 })
  })

  it('unassignedOnly=true 로 미분류 계획만 고른다', async () => {
    const goal = await makeGoal()
    await makePlan({ title: '연결됨', goalId: id(goal) })
    await makePlan({ title: '미분류' })

    const { body } = await read<{ plans: PlanBody[] }>(await listPlans(req('/api/weekly-plans?unassignedOnly=true')))
    expect(body.plans.map((p) => p.title)).toEqual(['미분류'])
  })

  it('PATCH 로 목표 연결을 바꾼다', async () => {
    const goal = await makeGoal()
    const plan = await makePlan()

    const { status, body } = await read<PlanBody>(
      await patchPlan(jsonReq(`/api/weekly-plans/${id(plan)}`, 'PATCH', { goalId: id(goal) }), ctx(id(plan))),
    )

    expect(status).toBe(200)
    expect(body.goalId).toBe(id(goal))
  })

  it('DELETE 가 하위 할일을 미분류로 전환하고 살려 둔다', async () => {
    const plan = await makePlan()
    await makeTodos(id(plan), 3)

    const { status, body } = await read<{ detachedTodos: number }>(
      await deletePlan(req(`/api/weekly-plans/${id(plan)}`, { method: 'DELETE' }), ctx(id(plan))),
    )

    expect(status).toBe(200)
    expect(body.detachedTodos).toBe(3)
    expect(await Todo.countDocuments({ deletedAt: null, weeklyPlanId: null })).toBe(3)
  })

  it('없는 계획은 404, 잘못된 id 는 400 이다', async () => {
    expect((await read(await patchPlan(jsonReq(`/api/weekly-plans/${MISSING}`, 'PATCH', { title: 'x' }), ctx(MISSING)))).status).toBe(404)
    expect((await read(await patchPlan(jsonReq('/api/weekly-plans/bad', 'PATCH', { title: 'x' }), ctx('bad')))).status).toBe(400)
  })
})

describe('/api/weekly-plans/[id]/carryover', () => {
  it('미리보기가 미완료 항목만 반환한다', async () => {
    const plan = await makePlan({ weekStart: '2026-08-31' })
    await makeTodos(id(plan), 3, 1) // 1건 done

    const { status, body } = await read<{ todos: { status: string }[] }>(
      await carryOverPreview(req(`/api/weekly-plans/${id(plan)}/carryover-preview`), ctx(id(plan))),
    )

    expect(status).toBe(200)
    expect(body.todos).toHaveLength(2)
    expect(body.todos.every((t) => t.status !== 'done')).toBe(true)
  })

  it('요청한 할일만 다음 주로 이월한다', async () => {
    const plan = await makePlan({ weekStart: '2026-08-31' })
    const todos = await makeTodos(id(plan), 3)

    const { status, body } = await read<{ carriedIds: string[]; targetPlanId: string; createdTargetPlan: boolean }>(
      await carryOver(
        jsonReq(`/api/weekly-plans/${id(plan)}/carryover`, 'POST', { todoIds: [id(todos[0]!)] }),
        ctx(id(plan)),
      ),
    )

    expect(status).toBe(200)
    expect(body.carriedIds).toEqual([id(todos[0]!)])
    expect(body.createdTargetPlan).toBe(true)
  })

  it('동일 본문으로 2회 호출해도 DB 상태가 같다 (멱등성)', async () => {
    const plan = await makePlan({ weekStart: '2026-08-31' })
    const todos = await makeTodos(id(plan), 2)
    const payload = { todoIds: todos.map(id) }

    const first = await read<{ targetPlanId: string }>(
      await carryOver(jsonReq(`/api/weekly-plans/${id(plan)}/carryover`, 'POST', payload), ctx(id(plan))),
    )
    const snapshot = await Todo.find({}).sort({ _id: 1 }).lean()

    const second = await read<{ targetPlanId: string; carriedIds: string[] }>(
      await carryOver(jsonReq(`/api/weekly-plans/${id(plan)}/carryover`, 'POST', payload), ctx(id(plan))),
    )

    expect(second.status).toBe(200)
    expect(second.body.targetPlanId).toBe(first.body.targetPlanId)
    expect(second.body.carriedIds).toEqual([])
    expect(await WeeklyPlan.countDocuments({ deletedAt: null })).toBe(2)

    const after = await Todo.find({}).sort({ _id: 1 }).lean()
    expect(after.map((t) => t.carriedFrom.length)).toEqual(snapshot.map((t) => t.carriedFrom.length))
  })

  it('빈 todoIds 는 400 이다', async () => {
    const plan = await makePlan()
    const { status } = await read(
      await carryOver(jsonReq(`/api/weekly-plans/${id(plan)}/carryover`, 'POST', { todoIds: [] }), ctx(id(plan))),
    )

    expect(status).toBe(400)
  })
})

describe('/api/goals', () => {
  it('생성 시 201 과 정규화된 기간을 반환한다', async () => {
    const { status, body } = await read<{ id: string; startDate: string }>(
      await createGoal(
        jsonReq('/api/goals', 'POST', {
          title: '2026년 체력',
          year: 2026,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        }),
      ),
    )

    expect(status).toBe(201)
    expect(body.startDate).toBe('2025-12-31T15:00:00.000Z')
  })

  it('시작일이 종료일보다 늦으면 400 이다', async () => {
    const { status } = await read(
      await createGoal(
        jsonReq('/api/goals', 'POST', {
          title: '거꾸로',
          year: 2026,
          startDate: '2026-12-31',
          endDate: '2026-01-01',
        }),
      ),
    )

    expect(status).toBe(400)
  })

  it('year 가 문자열이면 400 이다 (본문은 강제 변환하지 않는다)', async () => {
    const { status } = await read(
      await createGoal(
        jsonReq('/api/goals', 'POST', {
          title: '문자열 연도',
          year: '2026',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        }),
      ),
    )

    expect(status).toBe(400)
  })

  it('목록이 목표별 진행률을 함께 반환한다', async () => {
    const goal = await makeGoal()
    const plan = await makePlan({ weekStart: '2026-08-31', goalId: id(goal) })
    await makeTodos(id(plan), 2, 2)

    const { body } = await read<{ goals: { goal: { title: string }; progress: { percent: number; countedWeeks: number } }[] }>(
      await listGoals(req('/api/goals')),
    )

    expect(body.goals).toHaveLength(1)
    expect(body.goals[0]?.progress.countedWeeks).toBeGreaterThanOrEqual(0)
  })

  it('상세가 분모(countedWeeks)와 계획별 요약을 함께 반환한다', async () => {
    const goal = await makeGoal()
    await makePlan({ title: '주간', weekStart: '2026-08-31', goalId: id(goal) })

    const { status, body } = await read<{
      goal: { title: string }
      progress: { percent: number; countedWeeks: number }
      plans: { plan: PlanBody; progress: { percent: number }; todoCount: number; counted: boolean }[]
    }>(await getGoal(req(`/api/goals/${id(goal)}`), ctx(id(goal))))

    expect(status).toBe(200)
    expect(body.progress).toHaveProperty('countedWeeks')
    expect(body.plans[0]).toHaveProperty('todoCount')
    expect(body.plans[0]).toHaveProperty('counted')
  })

  it('DELETE 가 하위 주간 계획을 미분류로 전환하고 살려 둔다', async () => {
    const goal = await makeGoal()
    await makePlan({ goalId: id(goal) })

    const { status, body } = await read<{ detachedPlans: number }>(
      await deleteGoal(req(`/api/goals/${id(goal)}`, { method: 'DELETE' }), ctx(id(goal))),
    )

    expect(status).toBe(200)
    expect(body.detachedPlans).toBe(1)
    expect(await WeeklyPlan.countDocuments({ deletedAt: null, goalId: null })).toBe(1)
  })

  it('없는 목표는 404, 잘못된 id 는 400 이다', async () => {
    expect((await read(await getGoal(req(`/api/goals/${MISSING}`), ctx(MISSING)))).status).toBe(404)
    expect((await read(await getGoal(req('/api/goals/bad'), ctx('bad')))).status).toBe(400)
  })
})

describe('GET /api/stats — 성공 지표 (PLAN §1.5)', () => {
  it('데이터가 없으면 세 지표 모두 0 을 반환한다 (null 이나 NaN 아님)', async () => {
    const { status, body } = await read<{
      linkedRate: number
      executionRate: number
      carryOverBacklogRate: number
    }>(await getStats(req('/api/stats')))

    expect(status).toBe(200)
    expect(body.linkedRate).toBe(0)
    expect(body.executionRate).toBe(0)
    expect(body.carryOverBacklogRate).toBe(0)
  })

  it('M1 이 활성 할일 10건 중 7건 연결 상태에서 70 을 반환한다', async () => {
    const plan = await makePlan({ weekStart: '2026-08-31' })
    await makeTodos(id(plan), 7)
    await makeTodos(null, 3)

    const { body } = await read<{ linkedRate: number; detail: { activeTodos: number } }>(await getStats(req('/api/stats')))

    expect(body.linkedRate).toBe(70)
    expect(body.detail.activeTodos).toBe(10)
  })

  it('삭제된 할일은 M1 분모에서 빠진다', async () => {
    const plan = await makePlan({ weekStart: '2026-08-31' })
    await makeTodos(id(plan), 1)
    const orphan = await makeTodo()
    await Todo.updateOne({ _id: orphan._id }, { $set: { deletedAt: new Date() } })

    const { body } = await read<{ linkedRate: number }>(await getStats(req('/api/stats')))
    expect(body.linkedRate).toBe(100)
  })
})
