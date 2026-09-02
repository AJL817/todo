import { describe, expect, it } from 'vitest'
import { GET as listTodos, POST as createTodo } from '@/app/api/todos/route'
import { DELETE as deleteTodo, PATCH as patchTodo } from '@/app/api/todos/[id]/route'
import { POST as moveTodo } from '@/app/api/todos/[id]/move/route'
import { Todo } from '@/models'
import { id, makePlan, makeTodo, makeTodos } from './helpers/factories'
import { ctx, jsonReq, rawReq, read, req } from './helpers/api'

interface TodoBody {
  id: string
  title: string
  status: string
  position: number
  dueDate: string | null
  completedAt: string | null
  weeklyPlanId: string | null
  carriedFrom: string[]
}

describe('POST /api/todos', () => {
  it('제목 없이 요청하면 400 이고 DB 에 문서가 생기지 않는다', async () => {
    const { status, body } = await read(await createTodo(jsonReq('/api/todos', 'POST', { dueDate: '2026-09-01' })))

    expect(status).toBe(400)
    expect(body.error).toBeTypeOf('string')
    expect(await Todo.countDocuments({})).toBe(0)
  })

  it('제목이 공백뿐이어도 400 이다', async () => {
    const { status } = await read(await createTodo(jsonReq('/api/todos', 'POST', { title: '   ' })))
    expect(status).toBe(400)
    expect(await Todo.countDocuments({})).toBe(0)
  })

  it('스키마 외 필드를 포함하면 400 이다 (Zod strict, R10)', async () => {
    const { status } = await read(
      await createTodo(jsonReq('/api/todos', 'POST', { title: '운동', priority: 'high' })),
    )

    expect(status).toBe(400)
    expect(await Todo.countDocuments({})).toBe(0)
  })

  it('carriedFrom 을 직접 밀어 넣으려 해도 400 이다 (이월 경로 우회 차단)', async () => {
    const plan = await makePlan()
    const { status } = await read(
      await createTodo(jsonReq('/api/todos', 'POST', { title: '우회', carriedFrom: [id(plan)] })),
    )

    expect(status).toBe(400)
  })

  it('정상 생성 시 201 과 직렬화된 문서를 반환한다', async () => {
    const response = await createTodo(jsonReq('/api/todos', 'POST', { title: '운동', dueDate: '2026-09-01' }))
    const { status, body } = await read<TodoBody>(response)

    expect(status).toBe(201)
    expect(body.title).toBe('운동')
    expect(body.status).toBe('todo')
    expect(body.dueDate).toBe('2026-08-31T15:00:00.000Z') // KST 자정 정규화
    expect(body).not.toHaveProperty('_id')
    expect(body.id).toMatch(/^[0-9a-f]{24}$/)
  })

  it('본문이 JSON 이 아니면 400 이다 (500 아님)', async () => {
    const { status } = await read(await createTodo(rawReq('/api/todos', 'POST', '{not json')))
    expect(status).toBe(400)
  })

  it('잘못된 형식의 weeklyPlanId 는 400 이다', async () => {
    const { status } = await read(
      await createTodo(jsonReq('/api/todos', 'POST', { title: '운동', weeklyPlanId: 'nope' })),
    )
    expect(status).toBe(400)
  })

  it('날짜 형식이 YYYY-MM-DD 가 아니면 400 이다', async () => {
    const { status } = await read(
      await createTodo(jsonReq('/api/todos', 'POST', { title: '운동', dueDate: '2026/09/01' })),
    )
    expect(status).toBe(400)
  })
})

describe('GET /api/todos', () => {
  it('view 를 생략하면 활성 할일 전체를 반환한다', async () => {
    await makeTodos(null, 2)
    const { status, body } = await read<{ todos: TodoBody[] }>(await listTodos(req('/api/todos')))

    expect(status).toBe(200)
    expect(body.todos).toHaveLength(2)
  })

  it('view=week 이 해당 주 소속 항목만 반환한다 (마감일 기준 아님, A9)', async () => {
    const thisWeek = await makePlan({ title: '이번 주', weekStart: '2026-08-31' })
    const nextWeek = await makePlan({ title: '다음 주', weekStart: '2026-09-07' })

    await makeTodo({ title: '소속-마감일없음', weeklyPlanId: id(thisWeek) })
    await makeTodo({ title: '소속-주밖마감', weeklyPlanId: id(thisWeek), dueDate: '2026-10-01' })
    await makeTodo({ title: '다음주소속', weeklyPlanId: id(nextWeek), dueDate: '2026-09-02' })
    await makeTodo({ title: '미분류', dueDate: '2026-09-02' })

    const { body } = await read<{
      todos: (TodoBody & { dueOutsideWeek: boolean })[]
      inbox: TodoBody[]
      progress: Record<string, { percent: number }>
    }>(await listTodos(req('/api/todos?view=week&weekStart=2026-08-31')))

    expect(body.todos.map((t) => t.title).sort()).toEqual(['소속-마감일없음', '소속-주밖마감'])
    expect(Object.fromEntries(body.todos.map((t) => [t.title, t.dueOutsideWeek]))).toEqual({
      '소속-마감일없음': false,
      '소속-주밖마감': true,
    })
    expect(body.inbox.map((t) => t.title)).toEqual(['미분류'])
    expect(body.progress[id(thisWeek)]?.percent).toBe(0)
  })

  it('view=week 에 weekStart 가 없으면 400 이다', async () => {
    const { status } = await read(await listTodos(req('/api/todos?view=week')))
    expect(status).toBe(400)
  })

  it('view=day 가 오늘 마감 / 지연 미완료 / 진행 중만 반환한다', async () => {
    await makeTodo({ title: '오늘', dueDate: '2026-09-01' })
    await makeTodo({ title: '지연', dueDate: '2026-08-20' })
    await makeTodo({ title: '진행중', status: 'doing' })
    await makeTodo({ title: '미래', dueDate: '2026-09-20' })
    await makeTodo({ title: '마감없는todo' })

    const { body } = await read<{ todos: TodoBody[] }>(await listTodos(req('/api/todos?view=day&date=2026-09-01')))

    expect(body.todos.map((t) => t.title).sort()).toEqual(['오늘', '지연', '진행중'])
  })

  it('view=inbox 가 미분류 활성 항목만 반환한다', async () => {
    const plan = await makePlan()
    await makeTodo({ title: '소속됨', weeklyPlanId: id(plan) })
    await makeTodo({ title: '미분류' })

    const { body } = await read<{ todos: TodoBody[] }>(await listTodos(req('/api/todos?view=inbox')))
    expect(body.todos.map((t) => t.title)).toEqual(['미분류'])
  })

  it('알 수 없는 view 값은 400 이다', async () => {
    const { status } = await read(await listTodos(req('/api/todos?view=nope')))
    expect(status).toBe(400)
  })

  it('응답 어디에도 _id 나 __v 가 없다', async () => {
    await makeTodo()
    const { body } = await read<{ todos: Record<string, unknown>[] }>(await listTodos(req('/api/todos')))

    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('"_id"')
    expect(serialized).not.toContain('"__v"')
  })
})

describe('PATCH /api/todos/[id]', () => {
  it('제목과 마감일을 수정한다', async () => {
    const todo = await makeTodo()
    const { status, body } = await read<TodoBody>(
      await patchTodo(jsonReq(`/api/todos/${id(todo)}`, 'PATCH', { title: '수정됨', dueDate: '2026-09-01' }), ctx(id(todo))),
    )

    expect(status).toBe(200)
    expect(body.title).toBe('수정됨')
    expect(body.dueDate).toBe('2026-08-31T15:00:00.000Z')
  })

  it('재지정해도 carriedFrom 이 바뀌지 않는다', async () => {
    const planA = await makePlan({ title: 'A' })
    const planB = await makePlan({ title: 'B' })
    const todo = await makeTodo({ weeklyPlanId: id(planA) })

    const { body } = await read<TodoBody>(
      await patchTodo(jsonReq(`/api/todos/${id(todo)}`, 'PATCH', { weeklyPlanId: id(planB) }), ctx(id(todo))),
    )

    expect(body.weeklyPlanId).toBe(id(planB))
    expect(body.carriedFrom).toEqual([])
  })

  it('존재하지 않는 id 는 404 다', async () => {
    const missing = '0123456789abcdef01234567'
    const { status } = await read(
      await patchTodo(jsonReq(`/api/todos/${missing}`, 'PATCH', { title: 'x' }), ctx(missing)),
    )

    expect(status).toBe(404)
  })

  it('형식이 잘못된 ObjectId 는 400 이다 (500 아님)', async () => {
    const { status, body } = await read(
      await patchTodo(jsonReq('/api/todos/not-an-id', 'PATCH', { title: 'x' }), ctx('not-an-id')),
    )

    expect(status).toBe(400)
    expect(body.error).toBeTypeOf('string')
  })

  it('수정할 필드가 하나도 없으면 400 이다', async () => {
    const todo = await makeTodo()
    const { status } = await read(await patchTodo(jsonReq(`/api/todos/${id(todo)}`, 'PATCH', {}), ctx(id(todo))))

    expect(status).toBe(400)
  })

  it('스키마 외 필드는 400 이다', async () => {
    const todo = await makeTodo()
    const { status } = await read(
      await patchTodo(jsonReq(`/api/todos/${id(todo)}`, 'PATCH', { status: 'done' }), ctx(id(todo))),
    )

    // 상태 변경은 move 엔드포인트의 몫이다. PATCH 로는 바꿀 수 없다.
    expect(status).toBe(400)
  })
})

describe('DELETE /api/todos/[id]', () => {
  it('목록에서 사라지지만 문서는 deletedAt 이 채워진 채 남는다', async () => {
    const todo = await makeTodo()

    const { status } = await read(await deleteTodo(req(`/api/todos/${id(todo)}`, { method: 'DELETE' }), ctx(id(todo))))
    expect(status).toBe(200)

    const { body } = await read<{ todos: TodoBody[] }>(await listTodos(req('/api/todos')))
    expect(body.todos).toHaveLength(0)

    const raw = await Todo.findById(todo._id).lean()
    expect(raw).not.toBeNull()
    expect(raw?.deletedAt).not.toBeNull()
  })

  it('이미 삭제된 항목을 또 지우면 404 다', async () => {
    const todo = await makeTodo()
    await deleteTodo(req(`/api/todos/${id(todo)}`, { method: 'DELETE' }), ctx(id(todo)))

    const { status } = await read(await deleteTodo(req(`/api/todos/${id(todo)}`, { method: 'DELETE' }), ctx(id(todo))))
    expect(status).toBe(404)
  })
})

describe('POST /api/todos/[id]/move', () => {
  it('상태와 완료 시각과 순서를 한 번에 갱신하고 갱신된 문서를 반환한다', async () => {
    const todo = await makeTodo()

    const { status, body } = await read<TodoBody>(
      await moveTodo(jsonReq(`/api/todos/${id(todo)}/move`, 'POST', { toStatus: 'done' }), ctx(id(todo))),
    )

    expect(status).toBe(200)
    expect(body.status).toBe('done')
    expect(body.completedAt).not.toBeNull()
    expect(body.position).toBeGreaterThan(0)
  })

  it('done 에서 나오면 완료 시각이 지워진다 (A6)', async () => {
    const todo = await makeTodo()
    await moveTodo(jsonReq(`/api/todos/${id(todo)}/move`, 'POST', { toStatus: 'done' }), ctx(id(todo)))

    const { body } = await read<TodoBody>(
      await moveTodo(jsonReq(`/api/todos/${id(todo)}/move`, 'POST', { toStatus: 'todo' }), ctx(id(todo))),
    )

    expect(body.completedAt).toBeNull()
  })

  it('beforeId 와 afterId 로 열 내 순서를 지정한다', async () => {
    const a = await makeTodo({ title: 'A' })
    const b = await makeTodo({ title: 'B' })
    const c = await makeTodo({ title: 'C' })

    await moveTodo(
      jsonReq(`/api/todos/${id(c)}/move`, 'POST', { toStatus: 'todo', beforeId: id(a), afterId: id(b) }),
      ctx(id(c)),
    )

    const { body } = await read<{ todos: TodoBody[] }>(await listTodos(req('/api/todos')))
    expect(body.todos.map((t) => t.title)).toEqual(['A', 'C', 'B'])
  })

  it('허용되지 않은 상태값은 400 이다', async () => {
    const todo = await makeTodo()
    const { status } = await read(
      await moveTodo(jsonReq(`/api/todos/${id(todo)}/move`, 'POST', { toStatus: 'archived' }), ctx(id(todo))),
    )

    expect(status).toBe(400)
  })

  it('없는 할일을 옮기면 404 다', async () => {
    const missing = '0123456789abcdef01234567'
    const { status } = await read(
      await moveTodo(jsonReq(`/api/todos/${missing}/move`, 'POST', { toStatus: 'done' }), ctx(missing)),
    )

    expect(status).toBe(404)
  })
})
