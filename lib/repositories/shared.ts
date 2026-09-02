import { Types } from 'mongoose'
import type { ProgressPlan, ProgressTodo } from '@/lib/progress'
import type { TodoDoc, WeeklyPlanDoc } from '@/models/types'

/** 잘못된 형식의 id. 라우트 계층에서 400 으로 옮긴다 (500 이 아니다) */
export class InvalidIdError extends Error {
  constructor(value: string) {
    super(`올바른 id 형식이 아닙니다: ${value}`)
    this.name = 'InvalidIdError'
  }
}

/** 대상 문서 없음. 라우트 계층에서 404 로 옮긴다 */
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} 을(를) 찾을 수 없습니다`)
    this.name = 'NotFoundError'
  }
}

/** 세션이 없거나 유효하지 않다. 라우트 계층에서 401 로 옮긴다 */
export class UnauthorizedError extends Error {
  constructor(message = '로그인이 필요합니다') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/** 도메인 규칙 위반. 라우트 계층에서 400 으로 옮긴다 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainError'
  }
}

export function toObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw new InvalidIdError(id)
  return new Types.ObjectId(id)
}

export function toObjectIdOrNull(id: string | null | undefined): Types.ObjectId | null {
  if (id === null || id === undefined) return null
  return toObjectId(id)
}

/**
 * 살아 있는 "그 사용자의" 문서만 고르는 공용 필터 (PLAN R3 + docs/LOGIN.md).
 *
 * 조회할 때 deletedAt 이나 userId 조건을 직접 쓰지 말고 반드시 이 함수를 경유한다.
 * 소유자를 필수 인자로 둔 이유는, 한 군데라도 빠뜨리면 사용자 간 데이터 유출이 되기
 * 때문이다. 인자로 강제하면 누락을 타입 검사가 잡는다. 암묵적 컨텍스트 전달로는
 * 그 보장을 얻을 수 없다.
 */
export function activeFilter<T extends Record<string, unknown>>(
  ownerId: string,
  extra?: T,
): T & { deletedAt: null; userId: Types.ObjectId } {
  return { ...(extra ?? ({} as T)), deletedAt: null, userId: toObjectId(ownerId) }
}

const idToString = (value: Types.ObjectId | null): string | null => (value === null ? null : value.toString())

/** Mongoose 문서를 진행률 계산용 순수 입력으로 낮춘다. */
export function toProgressTodo(doc: Pick<TodoDoc, 'weeklyPlanId' | 'carriedFrom' | 'status' | 'deletedAt'>): ProgressTodo {
  return {
    weeklyPlanId: idToString(doc.weeklyPlanId),
    carriedFrom: doc.carriedFrom.map((id) => id.toString()),
    status: doc.status,
    deletedAt: doc.deletedAt,
  }
}

export function toProgressPlan(doc: Pick<WeeklyPlanDoc, '_id' | 'weekStart' | 'deletedAt'>): ProgressPlan {
  return { id: doc._id.toString(), weekStart: doc.weekStart, deletedAt: doc.deletedAt }
}
