import { requireUser } from '@/lib/auth/require-user'
import { handleError, ok } from '@/lib/api'

/** 현재 로그인한 사용자. 사이드바가 avatar 와 username 을 그리는 데 쓴다. */
export async function GET(request: Request) {
  try {
    const user = await requireUser(request)
    return ok({ user })
  } catch (error) {
    return handleError(error)
  }
}
