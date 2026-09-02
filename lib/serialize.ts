import { Types } from 'mongoose'

/**
 * API 응답 직렬화 (PLAN §3.2).
 * 라우트 핸들러는 반드시 이 함수를 경유한다.
 *   _id: ObjectId -> id: string,  Date -> ISO 문자열,  ObjectId -> string
 */

function isObjectId(value: unknown): value is Types.ObjectId {
  if (value instanceof Types.ObjectId) return true
  // 드라이버 버전이 달라 instanceof 가 어긋나는 경우를 대비한 덕 타이핑
  return (
    typeof value === 'object' &&
    value !== null &&
    '_bsontype' in value &&
    (value as { _bsontype: unknown })._bsontype === 'ObjectId'
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value) as unknown
  return proto === Object.prototype || proto === null
}

export type Serialized<T> = T extends Date
  ? string
  : T extends Types.ObjectId
    ? string
    : T extends readonly (infer U)[]
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T as K extends '_id' ? 'id' : K]: Serialized<T[K]> }
        : T

export function serialize<T>(input: T): Serialized<T> {
  return serializeValue(input) as Serialized<T>
}

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (value instanceof Date) return value.toISOString()
  if (isObjectId(value)) return value.toString()
  if (Array.isArray(value)) return value.map(serializeValue)

  // Mongoose 문서는 plain object 가 아니므로 먼저 평문으로 낮춘다.
  if (typeof value === 'object' && !isPlainObject(value)) {
    const maybeDoc = value as { toObject?: () => unknown }
    if (typeof maybeDoc.toObject === 'function') return serializeValue(maybeDoc.toObject())
    return value
  }

  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (key === '__v') continue
      output[key === '_id' ? 'id' : key] = serializeValue(item)
    }
    return output
  }

  return value
}
