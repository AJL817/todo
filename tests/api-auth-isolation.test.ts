import { describe, expect, it } from 'vitest'
import { GET as listTodos, POST as createTodoRoute } from '@/app/api/todos/route'
import { DELETE as deleteTodo, PATCH as patchTodo } from '@/app/api/todos/[id]/route'
import { POST as moveTodo } from '@/app/api/todos/[id]/move/route'
import { GET as listPlans, POST as createPlanRoute } from '@/app/api/weekly-plans/route'
import { DELETE as deletePlan, PATCH as patchPlan } from '@/app/api/weekly-plans/[id]/route'
import { GET as carryOverPreview } from '@/app/api/weekly-plans/[id]/carryover-preview/route'
import { POST as carryOver } from '@/app/api/weekly-plans/[id]/carryover/route'
import { GET as listGoals } from '@/app/api/goals/route'
import { DELETE as deleteGoal, GET as getGoal } from '@/app/api/goals/[id]/route'
import { GET as getStats } from '@/app/api/stats/route'
import { GET as health } from '@/app/api/health/route'
import { createSession } from '@/lib/auth/session'
import { computeMetrics } from '@/lib/metrics'
import { todoRepo } from '@/lib/repositories'
import { Todo } from '@/models'
import { ctx, jsonReq, read, req } from './helpers/api'
import { id, makePlan, makeTodo, makeTodos } from './helpers/factories'
import { makePrincipal, owner } from './helpers/owner'

/** 남(other)의 세션으로 호출하기 위한 두 번째 사용자 */
async function makeOther() {
  return makePrincipal('other-user', 999)
}

describe('미인증 요청은 401 (docs/LOGIN.md)', () => {
  it('세션 없이 /api/todos 를 호출하면 401 이고 { error } 를 돌려준다', async () => {
    const { status, body } = await read<{ error: string }>(
      await listTodos(req('/api/todos', { anonymous: true })),
    )

    expect(status).toBe(401)
    expect(body.error).toBeTypeOf('string')
  })

  it('보호된 API 가 모두 401 을 돌려준다', async () => {
    const anonymous = { anonymous: true } as const
    const someId = '0123456789abcdef01234567'

    const responses = await Promise.all([
      listTodos(req('/api/todos', anonymous)),
      createTodoRoute(jsonReq('/api/todos', 'POST', { title: 'x' }, anonymous)),
      patchTodo(jsonReq(`/api/todos/${someId}`, 'PATCH', { title: 'x' }, anonymous), ctx(someId)),
      deleteTodo(req(`/api/todos/${someId}`, { method: 'DELETE', ...anonymous }), ctx(someId)),
      moveTodo(jsonReq(`/api/todos/${someId}/move`, 'POST', { toStatus: 'done' }, anonymous), ctx(someId)),
      listPlans(req('/api/weekly-plans', anonymous)),
      createPlanRoute(jsonReq('/api/weekly-plans', 'POST', { title: 'x', weekStart: '2026-08-31' }, anonymous)),
      patchPlan(jsonReq(`/api/weekly-plans/${someId}`, 'PATCH', { title: 'x' }, anonymous), ctx(someId)),
      deletePlan(req(`/api/weekly-plans/${someId}`, { method: 'DELETE', ...anonymous }), ctx(someId)),
      carryOverPreview(req(`/api/weekly-plans/${someId}/carryover-preview`, anonymous), ctx(someId)),
      carryOver(jsonReq(`/api/weekly-plans/${someId}/carryover`, 'POST', { todoIds: [someId] }, anonymous), ctx(someId)),
      listGoals(req('/api/goals', anonymous)),
      getGoal(req(`/api/goals/${someId}`, anonymous), ctx(someId)),
      deleteGoal(req(`/api/goals/${someId}`, { method: 'DELETE', ...anonymous }), ctx(someId)),
      getStats(req('/api/stats', anonymous)),
    ])

    expect(responses.map((response) => response.status)).toEqual(responses.map(() => 401))
  })

  it('/api/health 는 인증 없이도 200 이다', () => {
    expect(health().status).toBe(200)
  })

  it('위조된 세션 쿠키는 401 이다', async () => {
    const { status } = await read(await listTodos(req('/api/todos', { asToken: 'f'.repeat(64) })))
    expect(status).toBe(401)
  })

  it('만료된 세션 쿠키는 401 이다', async () => {
    const stale = await makePrincipal('stale-user', 555)
    // 이 세션을 이미 지난 시점으로 만든다
    const { Session } = await import('@/models')
    await Session.updateOne({ userId: stale.ownerId }, { $set: { expiresAt: new Date(Date.now() - 1000) } })

    const { status } = await read(await listTodos(req('/api/todos', { asToken: stale.sessionToken })))
    expect(status).toBe(401)
  })

  it('미인증 요청은 DB 를 건드리지 않는다', async () => {
    await createTodoRoute(jsonReq('/api/todos', 'POST', { title: '만들어지면 안 됨' }, { anonymous: true }))
    expect(await Todo.countDocuments({})).toBe(0)
  })
})

describe('사용자 간 데이터 격리 (docs/LOGIN.md "본인의 할 일만")', () => {
  it('남의 할일은 목록에 나타나지 않는다', async () => {
    await makeTodo({ title: '내 할일' })

    const other = await makeOther()
    await todoRepo.createTodo(other.ownerId, { title: '남의 할일' })

    const mine = await read<{ todos: { title: string }[] }>(await listTodos(req('/api/todos')))
    expect(mine.body.todos.map((todo) => todo.title)).toEqual(['내 할일'])

    const theirs = await read<{ todos: { title: string }[] }>(
      await listTodos(req('/api/todos', { asToken: other.sessionToken })),
    )
    expect(theirs.body.todos.map((todo) => todo.title)).toEqual(['남의 할일'])
  })

  it('남의 할일을 PATCH 하면 404 이고 문서가 그대로다', async () => {
    const todo = await makeTodo({ title: '건드리면 안 됨' })
    const other = await makeOther()

    const { status } = await read(
      await patchTodo(
        jsonReq(`/api/todos/${id(todo)}`, 'PATCH', { title: '탈취' }, { asToken: other.sessionToken }),
        ctx(id(todo)),
      ),
    )

    expect(status).toBe(404)
    expect((await Todo.findById(todo._id).lean())?.title).toBe('건드리면 안 됨')
  })

  it('남의 할일을 DELETE 하면 404 이고 삭제되지 않는다', async () => {
    const todo = await makeTodo()
    const other = await makeOther()

    const { status } = await read(
      await deleteTodo(req(`/api/todos/${id(todo)}`, { method: 'DELETE', asToken: other.sessionToken }), ctx(id(todo))),
    )

    expect(status).toBe(404)
    expect((await Todo.findById(todo._id).lean())?.deletedAt).toBeNull()
  })

  it('남의 할일을 move 하면 404 이고 상태가 그대로다', async () => {
    const todo = await makeTodo()
    const other = await makeOther()

    const { status } = await read(
      await moveTodo(
        jsonReq(`/api/todos/${id(todo)}/move`, 'POST', { toStatus: 'done' }, { asToken: other.sessionToken }),
        ctx(id(todo)),
      ),
    )

    expect(status).toBe(404)
    const reloaded = await Todo.findById(todo._id).lean()
    expect(reloaded?.status).toBe('todo')
    expect(reloaded?.completedAt).toBeNull()
  })

  it('남의 주간 계획으로 이월을 호출하면 404 이고 데이터가 변하지 않는다', async () => {
    const plan = await makePlan({ weekStart: '2026-08-31' })
    const todos = await makeTodos(id(plan), 2)
    const other = await makeOther()

    const { status } = await read(
      await carryOver(
        jsonReq(
          `/api/weekly-plans/${id(plan)}/carryover`,
          'POST',
          { todoIds: todos.map(id) },
          { asToken: other.sessionToken },
        ),
        ctx(id(plan)),
      ),
    )

    expect(status).toBe(404)
    for (const todo of todos) {
      const reloaded = await Todo.findById(todo._id).lean()
      expect(reloaded?.weeklyPlanId?.toString()).toBe(id(plan))
      expect(reloaded?.carriedFrom).toEqual([])
    }
  })

  it('남의 계획 미리보기도 404 다', async () => {
    const plan = await makePlan()
    const other = await makeOther()

    const { status } = await read(
      await carryOverPreview(
        req(`/api/weekly-plans/${id(plan)}/carryover-preview`, { asToken: other.sessionToken }),
        ctx(id(plan)),
      ),
    )

    expect(status).toBe(404)
  })

  it('남의 목표를 조회하거나 지울 수 없다', async () => {
    const { makeGoal } = await import('./helpers/factories')
    const goal = await makeGoal()
    const other = await makeOther()

    expect((await read(await getGoal(req(`/api/goals/${id(goal)}`, { asToken: other.sessionToken }), ctx(id(goal))))).status).toBe(404)
    expect(
      (await read(await deleteGoal(req(`/api/goals/${id(goal)}`, { method: 'DELETE', asToken: other.sessionToken }), ctx(id(goal))))).status,
    ).toBe(404)
  })

  it('자기 할일 id 를 남의 계획 이월에 섞어 보내도 옮겨지지 않는다', async () => {
    const other = await makeOther()

    // 공격자(other)가 자기 계획으로 이월하면서 남(기본 사용자)의 할일 id 를 끼워 넣는다
    const otherPlan = await makePlan({ title: '공격자 계획', weekStart: '2026-08-31' }, other.ownerId)
    const victimTodo = await makeTodo({ title: '피해자 할일' })

    const { status, body } = await read<{ carriedIds: string[] }>(
      await carryOver(
        jsonReq(
          `/api/weekly-plans/${id(otherPlan)}/carryover`,
          'POST',
          { todoIds: [id(victimTodo)] },
          { asToken: other.sessionToken },
        ),
        ctx(id(otherPlan)),
      ),
    )

    expect(status).toBe(200)
    expect(body.carriedIds).toEqual([]) // 소유자 필터에서 걸러졌다

    const reloaded = await Todo.findById(victimTodo._id).lean()
    expect(reloaded?.weeklyPlanId).toBeNull()
    expect(reloaded?.carriedFrom).toEqual([])
  })

  it('지표는 호출한 사용자 기준으로만 집계된다', async () => {
    const plan = await makePlan({ weekStart: '2026-08-31' })
    await makeTodos(id(plan), 3) // 내 것: 연결 3건

    const other = await makeOther()
    await todoRepo.createTodo(other.ownerId, { title: '남의 미분류 1' })
    await todoRepo.createTodo(other.ownerId, { title: '남의 미분류 2' })

    const mine = await computeMetrics(owner())
    expect(mine.detail).toMatchObject({ activeTodos: 3, linkedTodos: 3 })
    expect(mine.linkedRate).toBe(100)

    const theirs = await computeMetrics(other.ownerId)
    expect(theirs.detail).toMatchObject({ activeTodos: 2, linkedTodos: 0 })
    expect(theirs.linkedRate).toBe(0)
  })

  it('같은 사용자의 새 세션으로는 자기 데이터를 그대로 본다', async () => {
    await makeTodo({ title: '내 할일' })

    // 다른 기기에서 로그인한 상황
    const second = await createSession(owner())

    const { body } = await read<{ todos: { title: string }[] }>(
      await listTodos(req('/api/todos', { asToken: second.token })),
    )
    expect(body.todos.map((todo) => todo.title)).toEqual(['내 할일'])
  })
})
