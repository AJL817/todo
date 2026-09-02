import { requireUser } from '@/lib/auth/require-user'
import { handleError, ok, parseBody, routeId, type RouteContext } from '@/lib/api'
import { goalRepo } from '@/lib/repositories'
import { updateGoalSchema } from '@/lib/schemas'

/** 상세 응답에는 하위 주간 계획 진행률과 분모(countedWeeks)가 함께 들어간다 (PLAN §0.2) */
export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request)
    return ok(await goalRepo.getGoalWithProgress(user.id, await routeId(context)))
  } catch (error) {
    return handleError(error)
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request)
    const body = await parseBody(request, updateGoalSchema)
    return ok(await goalRepo.updateGoal(user.id, await routeId(context), body))
  } catch (error) {
    return handleError(error)
  }
}

/** 하위 주간 계획은 연쇄 삭제하지 않고 미분류로 전환된다 (PRD P0) */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request)
    const result = await goalRepo.softDeleteGoalWithDetach(user.id, await routeId(context))
    return ok({ deleted: true, ...result })
  } catch (error) {
    return handleError(error)
  }
}
