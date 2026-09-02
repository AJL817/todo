import { UnauthorizedError } from '@/lib/repositories/shared'
import { SESSION_COOKIE } from './constants'
import { readCookie } from './cookies'
import { findUserBySessionToken, type SessionUser } from './session'

/**
 * 보호된 API 의 첫 줄에서 부른다 (docs/LOGIN.md).
 *
 * 미들웨어는 Edge 라 쿠키 유무만 볼 수 있다. 위조되거나 만료된 쿠키를 실제로 걸러내는
 * 곳은 여기다. 반환된 user.id 가 리포지토리의 소유자 스코프로 그대로 들어간다.
 */
export async function requireUser(request: Request): Promise<SessionUser> {
  const user = await findUserBySessionToken(readCookie(request, SESSION_COOKIE))
  if (!user) throw new UnauthorizedError()
  return user
}
