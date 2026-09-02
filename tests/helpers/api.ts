import type { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/constants'
import { sessionToken } from './owner'

const BASE = 'http://127.0.0.1:3000'

export interface ReqOptions extends RequestInit {
  /** 세션 쿠키를 붙이지 않는다. 401 을 확인할 때 쓴다 */
  anonymous?: boolean
  /** 다른 사용자의 세션으로 호출한다 (격리 테스트) */
  asToken?: string
}

function withAuth(init: ReqOptions = {}): RequestInit {
  const { anonymous, asToken, headers, ...rest } = init
  if (anonymous) return { ...rest, headers }

  const token = asToken ?? sessionToken()
  return { ...rest, headers: { ...(headers as Record<string, string>), cookie: `${SESSION_COOKIE}=${token}` } }
}

export function req(path: string, init?: ReqOptions): Request {
  return new Request(`${BASE}${path}`, withAuth(init))
}

export function jsonReq(path: string, method: string, body: unknown, init?: ReqOptions): Request {
  return new Request(
    `${BASE}${path}`,
    withAuth({ ...init, method, headers: { 'content-type': 'application/json', ...(init?.headers as Record<string, string>) }, body: JSON.stringify(body) }),
  )
}

/** 본문이 JSON 이 아닌 요청. 400 처리를 확인할 때 쓴다. */
export function rawReq(path: string, method: string, body: string, init?: ReqOptions): Request {
  return new Request(
    `${BASE}${path}`,
    withAuth({ ...init, method, headers: { 'content-type': 'application/json' }, body }),
  )
}

/** Next 15 의 동적 세그먼트 컨텍스트 */
export function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

export async function read<T = Record<string, unknown>>(
  response: NextResponse | Response,
): Promise<{ status: number; body: T }> {
  return { status: response.status, body: (await response.json()) as T }
}
