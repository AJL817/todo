import { NextResponse } from 'next/server'

/**
 * DB 를 건드리지 않는 생존 확인 엔드포인트.
 * Playwright 의 webServer 준비 대기가 DB 접속에 묶이지 않게 하려는 목적이다.
 */
export function GET() {
  return NextResponse.json({ ok: true })
}
