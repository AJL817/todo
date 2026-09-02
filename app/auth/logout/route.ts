import { NextResponse } from 'next/server'
import { clearSessionCookie, readCookie } from '@/lib/auth/cookies'
import { appOrigin } from '@/lib/auth/github'
import { SESSION_COOKIE } from '@/lib/auth/constants'
import { destroySession } from '@/lib/auth/session'

/**
 * 로그아웃 (docs/LOGIN.md "세션 완전 삭제").
 * 쿠키만 지우면 토큰은 여전히 유효하다. 서버의 세션 문서를 먼저 지운다.
 */
export async function POST(request: Request) {
  const token = readCookie(request, SESSION_COOKIE)
  await destroySession(token)

  const response = NextResponse.redirect(new URL('/login', appOrigin(request)), { status: 303 })
  clearSessionCookie(response)
  return response
}
