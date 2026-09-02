import { NextResponse } from 'next/server'
import { ZodError, type TypeOf, type ZodTypeAny } from 'zod'
import { DomainError, InvalidIdError, NotFoundError, UnauthorizedError } from './repositories/shared'
import { serialize } from './serialize'

/**
 * 라우트 핸들러 공용 응답과 에러 매핑 (PLAN §5).
 * 검증 실패는 400, 미존재는 404, 그 외는 500. 본문은 항상 { error: string }.
 */

export function ok<T>(data: T, status = 200): NextResponse {
  // 응답은 예외 없이 serialize 를 경유한다. _id 나 ObjectId 가 새어 나가지 않게 한다.
  return NextResponse.json(serialize(data), { status })
}

export function fail(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.')
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join(', ')
}

/** 잘못된 입력을 500 으로 흘리지 않는 것이 이 함수의 목적이다. */
export function handleError(error: unknown): NextResponse {
  // 인증 실패를 가장 먼저 본다. 로그인하지 않은 요청이 다른 오류로 위장되면 안 된다.
  if (error instanceof UnauthorizedError) return fail(error.message, 401)
  if (error instanceof ZodError) return fail(formatZodError(error), 400)
  if (error instanceof InvalidIdError) return fail(error.message, 400)
  if (error instanceof NotFoundError) return fail(error.message, 404)
  if (error instanceof DomainError) return fail(error.message, 400)

  if (error instanceof Error) {
    // Mongoose 스키마 검증 실패도 클라이언트 잘못이므로 400 이다.
    if (['ValidationError', 'StrictModeError', 'CastError'].includes(error.name)) {
      return fail(error.message, 400)
    }
  }

  console.error('[api] 처리하지 못한 오류', error)
  return fail('서버 오류가 발생했습니다', 500)
}

// 제네릭을 스키마 자체로 잡는다. .default() 나 .transform() 처럼 입력 타입과 출력 타입이
// 다른 스키마도 그대로 받을 수 있어야 하기 때문이다.
export async function parseBody<S extends ZodTypeAny>(request: Request, schema: S): Promise<TypeOf<S>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new DomainError('요청 본문이 올바른 JSON 이 아닙니다')
  }
  return schema.parse(raw) as TypeOf<S>
}

export function parseQuery<S extends ZodTypeAny>(request: Request, schema: S): TypeOf<S> {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries())
  return schema.parse(params) as TypeOf<S>
}

/** Next 15 의 동적 세그먼트는 Promise 로 전달된다. */
export type RouteContext = { params: Promise<{ id: string }> }

export async function routeId(context: RouteContext): Promise<string> {
  return (await context.params).id
}
