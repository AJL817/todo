import { requireUser } from '@/lib/auth/require-user'
import { handleError, ok, routeId, type RouteContext } from '@/lib/api'
import { weeklyPlanRepo } from '@/lib/repositories'

/** 이월 실행 전 대상 목록을 보여 준다. 되돌리기가 없으므로 확인 절차가 필수다 (PLAN §4.5) */
export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request)
    return ok({ todos: await weeklyPlanRepo.carryOverPreview(user.id, await routeId(context)) })
  } catch (error) {
    return handleError(error)
  }
}
