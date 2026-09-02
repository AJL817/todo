import { requireUser } from '@/lib/auth/require-user'
import { handleError, ok } from '@/lib/api'
import { computeMetrics } from '@/lib/metrics'

/** M1 / M2 / M3 (PLAN §1.5). 표본이 없으면 null 이 아니라 0 을 반환한다. */
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    return ok(await computeMetrics(user.id))
  } catch (error) {
    return handleError(error)
  }
}
