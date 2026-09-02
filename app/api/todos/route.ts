import { requireUser } from '@/lib/auth/require-user'
import { handleError, ok, parseBody, parseQuery } from '@/lib/api'
import { todoRepo, weeklyPlanRepo } from '@/lib/repositories'
import { createTodoSchema, todoQuerySchema } from '@/lib/schemas'

export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const query = parseQuery(request, todoQuerySchema)

    switch (query.view) {
      case 'day':
        return ok({ todos: await todoRepo.listForDay(user.id, query.date ?? new Date()) })

      case 'week': {
        // 소속 기준이다. 마감일 기준이 아니다 (PLAN A9)
        const week = await todoRepo.listForWeek(user.id, query.weekStart)
        const progress = await weeklyPlanRepo.progressForPlans(user.id, week.planIds)
        return ok({
          weekStart: week.weekStart,
          todos: week.todos,
          carriedOut: week.carriedOut,
          progress: Object.fromEntries(progress),
          inbox: await todoRepo.listInbox(user.id),
        })
      }

      case 'inbox':
        return ok({ todos: await todoRepo.listInbox(user.id) })

      default:
        return ok({ todos: await todoRepo.listAllActive(user.id) })
    }
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = await parseBody(request, createTodoSchema)
    return ok(await todoRepo.createTodo(user.id, body), 201)
  } catch (error) {
    return handleError(error)
  }
}
