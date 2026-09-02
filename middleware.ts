import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/constants'

/**
 * 화면 접근 차단 (docs/LOGIN.md "로그인하지 않은 사용자는 접근 불가").
 *
 * 미들웨어는 Edge 런타임이라 MongoDB 를 조회할 수 없다. 그래서 여기서는 쿠키 유무만 본다.
 * 위조되거나 만료된 쿠키를 걸러내는 것은 API 라우트의 requireUser 가 맡는다.
 * 즉 이 미들웨어는 보안 경계가 아니라 "로그인 화면으로 안내" 하는 장치다.
 */
const PUBLIC_PREFIXES = ['/login', '/auth', '/api/health', '/_next', '/favicon']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }

  // API 는 리다이렉트하지 않는다. 라우트 핸들러가 401 을 돌려주게 둔다.
  if (pathname.startsWith('/api/')) return NextResponse.next()

  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    const login = new URL('/login', request.url)
    return NextResponse.redirect(login)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
