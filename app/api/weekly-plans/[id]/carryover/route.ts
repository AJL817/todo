import { requireUser } from '@/lib/auth/require-user'
import { handleError, ok, parseBody, routeId, type RouteContext } from '@/lib/api'
import { weeklyPlanRepo } from '@/lib/repositories'
import { carryOverSchema } from '@/lib/schemas'

/**
 * PATCH 로 합치지 않은 이유: weeklyPlanId 변경과 carriedFrom 누적이 항상 함께 일어나야
 * 하는데, 일반 재지정은 carriedFrom 을 건드리면 안 된다. 두 연산은 겉보기에 같지만
 * 진행률 의미가 정반대다 (PLAN §5).
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request)
    const body = await parseBody(request, carryOverSchema)
    return ok(await weeklyPlanRepo.carryOverBatch(user.id, await routeId(context), body.todoIds))
  } catch (error) {
    return handleError(error)
  }
}
