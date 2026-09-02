import { requireUser } from '@/lib/auth/require-user'
import { handleError, ok, parseBody, routeId, type RouteContext } from '@/lib/api'
import { todoRepo, weeklyPlanRepo } from '@/lib/repositories'
import { updateWeeklyPlanSchema } from '@/lib/schemas'

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request)
    const id = await routeId(context)
    const plan = await weeklyPlanRepo.getWeeklyPlan(user.id, id)
    const [progress, todos] = await Promise.all([
      weeklyPlanRepo.progressForPlans(user.id, [id]),
      todoRepo.listByPlan(user.id, id),
    ])

    return ok({ plan, progress: progress.get(id), todos })
  } catch (error) {
    return handleError(error)
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request)
    const body = await parseBody(request, updateWeeklyPlanSchema)
    return ok(await weeklyPlanRepo.updateWeeklyPlan(user.id, await routeId(context), body))
  } catch (error) {
    return handleError(error)
  }
}

/** 하위 할일은 연쇄 삭제하지 않고 미분류로 전환된다 (PRD P0) */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request)
    const result = await weeklyPlanRepo.softDeleteWeeklyPlanWithDetach(user.id, await routeId(context))
    return ok({ deleted: true, ...result })
  } catch (error) {
    return handleError(error)
  }
}
