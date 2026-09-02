import { requireUser } from '@/lib/auth/require-user'
import { handleError, ok, parseBody, parseQuery } from '@/lib/api'
import { goalRepo } from '@/lib/repositories'
import { createGoalSchema, goalQuerySchema } from '@/lib/schemas'

export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    const { year } = parseQuery(request, goalQuerySchema)
    return ok({ goals: await goalRepo.listGoalsWithProgress(user.id, year) })
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request)
    const body = await parseBody(request, createGoalSchema)
    return ok(await goalRepo.createGoal(user.id, body), 201)
  } catch (error) {
    return handleError(error)
  }
}
