import { requireUser } from '@/lib/auth/require-user'
import { handleError, ok, parseBody, routeId, type RouteContext } from '@/lib/api'
import { todoRepo } from '@/lib/repositories'
import { updateTodoSchema } from '@/lib/schemas'

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request)
    return ok(await todoRepo.getTodo(user.id, await routeId(context)))
  } catch (error) {
    return handleError(error)
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request)
    const body = await parseBody(request, updateTodoSchema)
    return ok(await todoRepo.updateTodo(user.id, await routeId(context), body))
  } catch (error) {
    return handleError(error)
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request)
    await todoRepo.softDeleteTodo(user.id, await routeId(context))
    return ok({ deleted: true })
  } catch (error) {
    return handleError(error)
  }
}
