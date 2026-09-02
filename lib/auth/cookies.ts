import type { NextResponse } from 'next/server'
import { OAUTH_STATE_COOKIE, SESSION_COOKIE } from './constants'

/**
 * 쿠키 설정을 한 곳에 모은다. HttpOnly 를 한 군데라도 빠뜨리면
 * 스크립트가 세션 토큰을 읽을 수 있게 된다.
 */
/**
 * 호출 시점에 만든다. 모듈 로드 시점에 굳히면 NODE_ENV 를 바꿔 가며 검증할 수 없고,
 * 빌드와 실행 환경이 다를 때 잘못된 값이 박힌다.
 */
function baseOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // 로컬 http 개발에서도 쿠키가 붙어야 하므로 프로덕션에서만 Secure 를 요구한다.
    secure: process.env.NODE_ENV === 'production',
  } as const
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
  response.cookies.set(SESSION_COOKIE, token, { ...baseOptions(), expires: expiresAt })
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', { ...baseOptions(), maxAge: 0 })
}

/** OAuth state 는 콜백까지만 살면 된다. 짧게 잡는다. */
export function setStateCookie(response: NextResponse, state: string): void {
  response.cookies.set(OAUTH_STATE_COOKIE, state, { ...baseOptions(), maxAge: 10 * 60 })
}

export function clearStateCookie(response: NextResponse): void {
  response.cookies.set(OAUTH_STATE_COOKIE, '', { ...baseOptions(), maxAge: 0 })
}

/**
 * 요청 헤더에서 쿠키를 읽는다.
 * next/headers 의 cookies() 대신 이걸 쓰면 라우트 핸들러를 평범한 Request 로 테스트할 수 있다.
 */
export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined

  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim())
    }
  }
  return undefined
}
