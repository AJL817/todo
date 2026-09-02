import mongoose from 'mongoose'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatKstDate, toKstDateOnly } from '@/lib/date'
import { InvalidIdError, NotFoundError, todoRepo, weeklyPlanRepo } from '@/lib/repositories'
import { Todo } from '@/models'
import { owner } from './helpers/owner'
import { id, makePlan, makeTodo } from './helpers/factories'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('standalone mongod 전제 (PLAN §3.1 / R8)', () => {
  it('테스트가 replica set 이 아닌 standalone 에서 돈다', async () => {
    const admin = mongoose.connection.db?.admin()
    const info = await admin?.command({ hello: 1 })

    // replica set 이면 setName 이 들어 있다. 트랜잭션을 쓸 수 없는 환경임을 고정한다.
    expect(info?.setName).toBeUndefined()
  })

  it('케이스마다 컬렉션이 초기화돼 서로 격리된다', async () => {
    expect(await Todo.countDocuments({})).toBe(0)
    await makeTodo()
    expect(await Todo.countDocuments({})).toBe(1)
  })
})

describe('createTodo', () => {
  it('마감일을 KST 자정으로 정규화해 저장한다 (R9)', async () => {
    const created = await todoRepo.createTodo(owner(), { title: '운동', dueDate: '2026-09-01' })
    expect(created.dueDate?.toISOString()).toBe('2026-08-31T15:00:00.000Z')
  })

  it('KST 23:00 인스턴트를 넣어도 그 날짜로 접힌다', async () => {
    const created = await todoRepo.createTodo(owner(), { title: '야간 등록', dueDate: new Date('2026-09-01T14:00:00Z') })
    expect(formatKstDate(created.dueDate!)).toBe('2026-09-01')
  })

  it('같은 상태 열의 맨 뒤에 붙는다', async () => {
    const first = await makeTodo({ title: 'A' })
    const second = await makeTodo({ title: 'B' })

    expect(first.position).toBe(1024)
    expect(second.position).toBe(2048)
  })

  it('열마다 position 이 독립적으로 시작한다', async () => {
    const todo = await makeTodo({ status: 'todo' })
    const doing = await makeTodo({ status: 'doing' })

    expect(todo.position).toBe(1024)
    expect(doing.position).toBe(1024)
  })

  it('done 으로 바로 만들면 완료 시각이 찍힌다', async () => {
    const created = await todoRepo.createTodo(owner(), { title: '이미 끝남', status: 'done' })
    expect(created.completedAt).not.toBeNull()
  })

  it('마감일 없이 만들면 null 이고 carriedFrom 은 빈 배열이다', async () => {
    const created = await makeTodo()
    expect(created.dueDate).toBeNull()
    expect(created.carriedFrom).toEqual([])
  })
})

describe('moveTodo — 상태 + 순서 + 완료 시각 (PLAN §4.1 / A6)', () => {
  it("done 으로 옮기면 completedAt 이 채워진다", async () => {
    const todo = await makeTodo()
    const moved = await todoRepo.moveTodo(owner(), id(todo), { toStatus: 'done' })

    expect(moved.status).toBe('done')
    expect(moved.completedAt).not.toBeNull()
  })

  it('done 에서 doing 으로 나오면 completedAt 이 null 로 초기화된다 (A6)', async () => {
    const todo = await makeTodo()
    await todoRepo.moveTodo(owner(), id(todo), { toStatus: 'done' })
    const back = await todoRepo.moveTodo(owner(), id(todo), { toStatus: 'doing' })

    expect(back.status).toBe('doing')
    expect(back.completedAt).toBeNull()
  })

  it('done 안에서 순서만 바꾸면 원래 완료 시각을 보존한다', async () => {
    const todo = await makeTodo()
    const first = await todoRepo.moveTodo(owner(), id(todo), { toStatus: 'done' })
    const again = await todoRepo.moveTodo(owner(), id(todo), { toStatus: 'done' })

    expect(again.completedAt?.getTime()).toBe(first.completedAt?.getTime())
  })

  it('상태 전환에 방향 제약이 없다 (PRD P0)', async () => {
    const todo = await makeTodo()

    for (const status of ['done', 'todo', 'doing', 'todo', 'done'] as const) {
      const moved = await todoRepo.moveTodo(owner(), id(todo), { toStatus: status })
      expect(moved.status).toBe(status)
    }
  })

  it('상태/position/completedAt 을 쓰기 1회로 갱신한다 (다중 write 없음)', async () => {
    const todo = await makeTodo()

    const findOneAndUpdate = vi.spyOn(Todo, 'findOneAndUpdate')
    const updateOne = vi.spyOn(Todo, 'updateOne')
    const updateMany = vi.spyOn(Todo, 'updateMany')
    const bulkWrite = vi.spyOn(Todo, 'bulkWrite')

    await todoRepo.moveTodo(owner(), id(todo), { toStatus: 'done' })

    const writes =
      findOneAndUpdate.mock.calls.length +
      updateOne.mock.calls.length +
      updateMany.mock.calls.length +
      bulkWrite.mock.calls.length

    expect(writes).toBe(1)
  })

  it('열 내 이동으로 순서가 바뀌고 새로고침 후에도 유지된다', async () => {
    const a = await makeTodo({ title: 'A' })
    const b = await makeTodo({ title: 'B' })
    const c = await makeTodo({ title: 'C' })

    // C 를 A 와 B 사이로 옮긴다
    await todoRepo.moveTodo(owner(), id(c), { toStatus: 'todo', beforeId: id(a), afterId: id(b) })

    const reloaded = await todoRepo.listAllActive(owner())
    expect(reloaded.map((t) => t.title)).toEqual(['A', 'C', 'B'])
  })

  it('간격이 소진되면 리밸런스가 실제로 실행되고 순서가 보존된다 (R4)', async () => {
    const a = await makeTodo({ title: 'A' })
    const b = await makeTodo({ title: 'B' })
    const bulkWrite = vi.spyOn(Todo, 'bulkWrite')

    // A 와 B 사이에 반복해서 끼워 넣어 간격을 소진시킨다.
    // 간격은 삽입마다 절반이 되므로 1024 / 2^n < 1e-6, 즉 31회쯤에서 임계에 닿는다.
    const inserted: string[] = []
    let previous = b
    for (let i = 0; i < 40; i += 1) {
      const card = await makeTodo({ title: `X${i}` })
      await todoRepo.moveTodo(owner(), id(card), { toStatus: 'todo', beforeId: id(a), afterId: id(previous) })
      inserted.push(`X${i}`)
      previous = card
    }

    expect(bulkWrite).toHaveBeenCalled() // 리밸런스가 실제로 일어났다

    const ordered = await todoRepo.listAllActive(owner())
    // A, 가장 최근 삽입분부터 역순, B 순서여야 한다
    expect(ordered.map((t) => t.title)).toEqual(['A', ...[...inserted].reverse(), 'B'])

    // 리밸런스 이후에도 모든 position 이 서로 구분 가능한 간격을 유지한다
    const positions = ordered.map((t) => t.position)
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]! - positions[i - 1]!).toBeGreaterThan(0)
    }
  })

  it('없는 id 를 옮기면 NotFoundError', async () => {
    await expect(todoRepo.moveTodo(owner(), new mongoose.Types.ObjectId().toString(), { toStatus: 'done' })).rejects.toThrow(
      NotFoundError,
    )
  })

  it('형식이 잘못된 id 는 InvalidIdError (500 이 아니라 400 으로 이어진다)', async () => {
    await expect(todoRepo.moveTodo(owner(), 'not-an-id', { toStatus: 'done' })).rejects.toThrow(InvalidIdError)
  })
})

describe('updateTodo — 재지정은 carriedFrom 을 건드리지 않는다 (PLAN §5)', () => {
  it('주간 계획 재지정 후에도 carriedFrom 이 그대로다', async () => {
    const planA = await makePlan({ title: 'A주' })
    const planB = await makePlan({ title: 'B주' })
    const todo = await makeTodo({ weeklyPlanId: id(planA) })

    const updated = await todoRepo.updateTodo(owner(), id(todo), { weeklyPlanId: id(planB) })

    expect(updated.weeklyPlanId?.toString()).toBe(id(planB))
    expect(updated.carriedFrom).toEqual([])
  })

  it('이미 이월 이력이 있는 할일을 재지정해도 이력이 늘지 않는다', async () => {
    const planA = await makePlan({ title: 'A주' })
    const planB = await makePlan({ title: 'B주' })
    const todo = await makeTodo({ weeklyPlanId: id(planA) })

    await Todo.updateOne({ _id: todo._id }, { $set: { carriedFrom: [planA._id] } })
    const updated = await todoRepo.updateTodo(owner(), id(todo), { weeklyPlanId: id(planB) })

    expect(updated.carriedFrom.map(String)).toEqual([id(planA)])
  })

  it('미분류로 되돌릴 수 있다', async () => {
    const plan = await makePlan()
    const todo = await makeTodo({ weeklyPlanId: id(plan) })

    const updated = await todoRepo.updateTodo(owner(), id(todo), { weeklyPlanId: null })
    expect(updated.weeklyPlanId).toBeNull()
  })

  it('마감일도 KST 자정으로 정규화된다', async () => {
    const todo = await makeTodo()
    const updated = await todoRepo.updateTodo(owner(), id(todo), { dueDate: '2026-09-01' })

    expect(updated.dueDate?.toISOString()).toBe('2026-08-31T15:00:00.000Z')
  })
})

describe('softDeleteTodo — 소프트 삭제 (PLAN R3)', () => {
  it('조회에서 사라지지만 문서는 deletedAt 이 채워진 채 남는다', async () => {
    const todo = await makeTodo()
    await todoRepo.softDeleteTodo(owner(), id(todo))

    expect(await todoRepo.listAllActive(owner())).toHaveLength(0)

    const raw = await Todo.findById(todo._id).lean()
    expect(raw).not.toBeNull()
    expect(raw?.deletedAt).not.toBeNull()
  })

  it('삭제된 항목은 인박스와 일일 뷰에도 나타나지 않는다', async () => {
    const todo = await makeTodo({ dueDate: '2026-09-01', status: 'doing' })
    await todoRepo.softDeleteTodo(owner(), id(todo))

    expect(await todoRepo.listInbox(owner())).toHaveLength(0)
    expect(await todoRepo.listForDay(owner(), '2026-09-01')).toHaveLength(0)
  })

  it('이미 삭제된 항목을 또 지우면 NotFoundError', async () => {
    const todo = await makeTodo()
    await todoRepo.softDeleteTodo(owner(), id(todo))

    await expect(todoRepo.softDeleteTodo(owner(), id(todo))).rejects.toThrow(NotFoundError)
  })
})

describe('listForDay — 일일 뷰 (PLAN §4.4.2)', () => {
  it('오늘 마감 / 지연 미완료 / 진행 중만 모은다', async () => {
    await makeTodo({ title: '오늘', dueDate: '2026-09-01' })
    await makeTodo({ title: '지연', dueDate: '2026-08-20' })
    await makeTodo({ title: '진행중', status: 'doing' })
    await makeTodo({ title: '미래', dueDate: '2026-09-20' })
    await makeTodo({ title: '마감없는todo' })
    await todoRepo.createTodo(owner(), { title: '지연했지만완료', dueDate: '2026-08-20', status: 'done' })

    const titles = (await todoRepo.listForDay(owner(), '2026-09-01')).map((t) => t.title)

    expect(titles.sort()).toEqual(['오늘', '지연', '진행중'])
  })

  it('KST 23:00 에 만든 오늘 마감 항목이 같은 날 뷰에 나타난다 (R9)', async () => {
    const created = await todoRepo.createTodo(owner(), {
      title: '야간 등록',
      dueDate: new Date('2026-09-01T14:00:00Z'),
    })

    const result = await todoRepo.listForDay(owner(), new Date('2026-09-01T14:30:00Z'))
    expect(result.map((t) => t.title)).toContain('야간 등록')
    expect(created.dueDate?.toISOString()).toBe('2026-08-31T15:00:00.000Z')
  })
})

describe('listForWeek — 소속 기준 (PLAN A9 / A10)', () => {
  it('마감일이 없어도 계획에 연결됐으면 포함된다 (A9 핵심)', async () => {
    const plan = await makePlan({ weekStart: '2026-08-31' })
    await makeTodo({ title: '마감일 없음', weeklyPlanId: id(plan) })

    const { todos } = await todoRepo.listForWeek(owner(), '2026-09-01')

    expect(todos.map((t) => t.title)).toEqual(['마감일 없음'])
    expect(todos[0]?.dueOutsideWeek).toBe(false)
  })

  it('마감일이 주 범위 밖이어도 포함하되 dueOutsideWeek 플래그를 붙인다 (A10)', async () => {
    const plan = await makePlan({ weekStart: '2026-08-31' })
    await makeTodo({ title: '범위 안', weeklyPlanId: id(plan), dueDate: '2026-09-03' })
    await makeTodo({ title: '범위 밖', weeklyPlanId: id(plan), dueDate: '2026-09-20' })

    const { todos } = await todoRepo.listForWeek(owner(), '2026-08-31')
    const flags = Object.fromEntries(todos.map((t) => [t.title, t.dueOutsideWeek]))

    expect(flags).toEqual({ '범위 안': false, '범위 밖': true })
  })

  it('미분류 할일은 주간 목록에 섞이지 않는다', async () => {
    const plan = await makePlan({ weekStart: '2026-08-31' })
    await makeTodo({ title: '소속됨', weeklyPlanId: id(plan) })
    await makeTodo({ title: '미분류' })

    const { todos } = await todoRepo.listForWeek(owner(), '2026-08-31')

    expect(todos.map((t) => t.title)).toEqual(['소속됨'])
    expect((await todoRepo.listInbox(owner())).map((t) => t.title)).toEqual(['미분류'])
  })

  it('다른 주 계획의 할일은 포함되지 않는다', async () => {
    const thisWeek = await makePlan({ title: '이번 주', weekStart: '2026-08-31' })
    const nextWeek = await makePlan({ title: '다음 주', weekStart: '2026-09-07' })
    await makeTodo({ title: '이번 주 할일', weeklyPlanId: id(thisWeek) })
    await makeTodo({ title: '다음 주 할일', weeklyPlanId: id(nextWeek) })

    const { todos } = await todoRepo.listForWeek(owner(), '2026-09-02')
    expect(todos.map((t) => t.title)).toEqual(['이번 주 할일'])
  })

  it('이월돼 나간 할일은 칸반 목록이 아니라 carriedOut 으로 분리된다 (A8)', async () => {
    const plan = await makePlan({ title: '이번 주', weekStart: '2026-08-31' })
    const stays = await makeTodo({ title: '남는 할일', weeklyPlanId: id(plan) })
    const leaves = await makeTodo({ title: '떠나는 할일', weeklyPlanId: id(plan) })

    await weeklyPlanRepo.carryOverBatch(owner(), id(plan), [id(leaves)])

    const week = await todoRepo.listForWeek(owner(), '2026-08-31')

    // 칸반에는 지금 소속된 것만 들어간다. 이월된 카드가 아직 이 주에 있는 것처럼 보이면 안 된다.
    expect(week.todos.map((t) => t.title)).toEqual(['남는 할일'])
    expect(week.carriedOut.map((t) => t.title)).toEqual(['떠나는 할일'])
    expect(id(stays)).toBe(week.todos[0]?._id.toString())
  })

  it('이월된 할일은 도착한 주에서는 정상 소속으로 잡힌다', async () => {
    const plan = await makePlan({ title: '이번 주', weekStart: '2026-08-31' })
    const todo = await makeTodo({ title: '옮겨간 할일', weeklyPlanId: id(plan) })

    await weeklyPlanRepo.carryOverBatch(owner(), id(plan), [id(todo)])

    const nextWeek = await todoRepo.listForWeek(owner(), '2026-09-07')
    expect(nextWeek.todos.map((t) => t.title)).toEqual(['옮겨간 할일'])
    expect(nextWeek.carriedOut).toHaveLength(0)
  })

  it('일요일에 조회해도 직전 월요일 시작 주가 잡힌다 (A2)', async () => {
    const plan = await makePlan({ weekStart: '2026-08-31' })
    await makeTodo({ title: '주간 할일', weeklyPlanId: id(plan) })

    const result = await todoRepo.listForWeek(owner(), '2026-09-06')
    expect(formatKstDate(result.weekStart)).toBe('2026-08-31')
    expect(result.todos).toHaveLength(1)
  })
})

describe('listInbox — 미분류 큐 (PLAN §4.6)', () => {
  it('weeklyPlanId 가 null 인 활성 항목만 반환한다', async () => {
    const plan = await makePlan()
    await makeTodo({ title: '소속됨', weeklyPlanId: id(plan) })
    await makeTodo({ title: '미분류1' })
    const deleted = await makeTodo({ title: '삭제된 미분류' })
    await todoRepo.softDeleteTodo(owner(), id(deleted))

    expect((await todoRepo.listInbox(owner())).map((t) => t.title)).toEqual(['미분류1'])
  })

  it('마감일이 미래여도 미분류면 인박스에 남는다', async () => {
    await makeTodo({ title: '미래 미분류', dueDate: '2026-12-31' })
    expect(await todoRepo.listInbox(owner())).toHaveLength(1)
  })
})

describe('getTodo', () => {
  it('삭제된 항목은 조회되지 않는다', async () => {
    const todo = await makeTodo()
    await todoRepo.softDeleteTodo(owner(), id(todo))

    await expect(todoRepo.getTodo(owner(), id(todo))).rejects.toThrow(NotFoundError)
  })

  it('저장된 마감일이 KST 자정 인스턴트다', async () => {
    const todo = await makeTodo({ dueDate: '2026-09-01' })
    const found = await todoRepo.getTodo(owner(), id(todo))

    expect(found.dueDate?.getTime()).toBe(toKstDateOnly('2026-09-01').getTime())
  })
})
