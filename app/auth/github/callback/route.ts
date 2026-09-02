import { NextResponse } from 'next/server'
import { clearStateCookie, readCookie, setSessionCookie } from '@/lib/auth/cookies'
import { appOrigin, callbackUrl, exchangeCodeForToken, fetchGithubProfile } from '@/lib/auth/github'
import { OAUTH_STATE_COOKIE } from '@/lib/auth/constants'
import { createSession, upsertGithubUser } from '@/lib/auth/session'
import { isAllowedUser } from '@/lib/auth/allowlist'

function failure(request: Request, message: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, appOrigin(request)))
  clearStateCookie(response)
  return response
}

/**
 * GitHub 가 돌려보내는 지점. 순서가 중요하다.
 *  1. state 대조 (여기서 막지 못하면 남이 시작한 로그인을 내 세션으로 굳힐 수 있다)
 *  2. code -> 액세스 토큰
 *  3. 프로필 조회 -> 허용 명단 확인 -> 사용자 저장
 *  4. 세션 발급
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  const expectedState = readCookie(request, OAUTH_STATE_COOKIE)

  if (!expectedState || !state || state !== expectedState) {
    return failure(request, '로그인 요청을 확인하지 못했습니다. 다시 시도해 주세요.')
  }

  if (!code) {
    return failure(request, 'GitHub 가 인증 코드를 보내지 않았습니다.')
  }

  try {
    const accessToken = await exchangeCodeForToken(code, callbackUrl(request))
    const profile = await fetchGithubProfile(accessToken)

    // 사용자 문서를 만들기 전에 막는다. 통과시킨 뒤 지우면 그 사이에 만들어진
    // 데이터가 남는다.
    if (!isAllowedUser(profile.username)) {
      return failure(request, '이 앱을 사용할 수 있는 계정이 아닙니다.')
    }

    const user = await upsertGithubUser(profile)
    const { token, expiresAt } = await createSession(user._id.toString())

    const response = NextResponse.redirect(new URL('/', appOrigin(request)))
    setSessionCookie(response, token, expiresAt)
    clearStateCookie(response)
    return response
  } catch (error) {
    console.error('[auth] GitHub 콜백 처리 실패', error)
    return failure(request, 'GitHub 로그인에 실패했습니다.')
  }
}
