import { requireUser } from '@/lib/auth/require-user'
import { handleError, ok, parseBody, parseQuery } from '@/lib/api'
import { weeklyPlanRepo } from '@/lib/repositories'
import { createWeeklyPlanSchema, weeklyPlanQuerySchema } from '@/lib/schemas'

export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const query = parseQuery(request, weeklyPlanQuerySchema)
    const plans = await weeklyPlanRepo.listWeeklyPlans(user.id, query)
    const progress = await weeklyPlanRepo.progressForPlans(
      user.id,
      plans.map((plan) => plan._id.toString()),
    )

    return ok({ plans, progress: Object.fromEntries(progress) })
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = await parseBody(request, createWeeklyPlanSchema)
    return ok(await weeklyPlanRepo.createWeeklyPlan(user.id, body), 201)
  } catch (error) {
    return handleError(error)
  }
}
