import { requireUser } from '@/lib/auth/require-user'
import { handleError, ok, parseBody, routeId, type RouteContext } from '@/lib/api'
import { todoRepo } from '@/lib/repositories'
import { moveTodoSchema } from '@/lib/schemas'

/**
 * 일반 PATCH 와 분리한 이유: position 계산, 리밸런스, completedAt 전이라는 고유 로직을
 * 가지며 낙관적 업데이트의 롤백 단위이기도 하다 (PLAN §5).
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request)
    const body = await parseBody(request, moveTodoSchema)
    return ok(await todoRepo.moveTodo(user.id, await routeId(context), body))
  } catch (error) {
    return handleError(error)
  }
}
