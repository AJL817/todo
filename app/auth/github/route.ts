import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { setStateCookie } from '@/lib/auth/cookies'
import { appOrigin, authorizeUrl, callbackUrl } from '@/lib/auth/github'

/**
 * GitHub 로그인 시작점 (docs/LOGIN.md).
 * state 를 만들어 쿠키에 심고 authorize 로 보낸다. 콜백에서 이 값을 대조해
 * 제3자가 유도한 콜백(CSRF)을 걸러낸다.
 */
export function GET(request: Request) {
  try {
    const state = crypto.randomBytes(16).toString('hex')
    const redirectUri = callbackUrl(request)

    const response = NextResponse.redirect(authorizeUrl(state, redirectUri))
    setStateCookie(response, state)
    return response
  } catch (error) {
    // 설정 누락(CLIENT_ID 등)은 사용자에게 원인을 알려 주는 편이 낫다.
    const message = error instanceof Error ? error.message : 'GitHub 로그인을 시작하지 못했습니다'
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, appOrigin(request)))
  }
}
