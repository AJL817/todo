import crypto from 'node:crypto'
import { connectDb } from '@/lib/db'
import { Session, User } from '@/models'
import type { SessionDoc, UserDoc } from '@/models/types'
import type { GithubProfile } from './github'

/**
 * 서버 측 세션 (docs/LOGIN.md "로그아웃 시 세션 완전 삭제").
 *
 * 쿠키에는 난수 토큰만 담고 DB 에는 그 SHA-256 해시를 저장한다.
 *  - DB 가 유출돼도 그 값으로 세션을 만들 수 없다
 *  - 로그아웃은 문서를 지우는 것이므로 그 순간 무효가 된다
 * stateless JWT 라면 쿠키를 지워도 토큰은 만료까지 유효해 "완전 삭제" 가 성립하지 않는다.
 */

export { OAUTH_STATE_COOKIE, SESSION_COOKIE } from './constants'

const DEFAULT_TTL_DAYS = 14

export function sessionTtlMs(): number {
  const raw = process.env.SESSION_TTL_DAYS
  const days = raw === undefined ? Number.NaN : Number(raw)
  const effective = Number.isFinite(days) && days > 0 ? days : DEFAULT_TTL_DAYS
  return effective * 24 * 60 * 60 * 1000
}

/** 쿠키에 담을 불투명 토큰. 추측 불가능해야 하므로 32바이트 난수를 쓴다. */
export function createSessionToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function upsertGithubUser(profile: GithubProfile): Promise<UserDoc> {
  await connectDb()

  // githubId 로 찾는다. username 은 사용자가 바꿀 수 있어 동일인 판정 기준이 될 수 없다.
  const updated = await User.findOneAndUpdate(
    { githubId: profile.githubId },
    { $set: { username: profile.username, avatarUrl: profile.avatarUrl } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean()

  if (!updated) throw new Error('사용자를 저장하지 못했습니다')
  return updated
}

/** 세션을 만들고 쿠키에 담을 원문 토큰을 돌려준다. 원문은 여기서만 존재한다. */
export async function createSession(userId: string, now: Date = new Date()): Promise<{ token: string; expiresAt: Date }> {
  await connectDb()

  const token = createSessionToken()
  const expiresAt = new Date(now.getTime() + sessionTtlMs())

  await Session.create({ tokenHash: hashSessionToken(token), userId, expiresAt })

  return { token, expiresAt }
}

export interface SessionUser {
  id: string
  githubId: number
  username: string
  avatarUrl: string
}

/** 토큰으로 사용자를 찾는다. 만료됐거나 없는 토큰이면 null. */
export async function findUserBySessionToken(
  token: string | undefined,
  now: Date = new Date(),
): Promise<SessionUser | null> {
  if (token === undefined || token === '') return null

  await connectDb()

  const session = await Session.findOne({ tokenHash: hashSessionToken(token) }).lean()
  if (!session) return null

  if (session.expiresAt.getTime() <= now.getTime()) {
    // 만료된 세션은 남겨 둘 이유가 없다. 조회하는 김에 정리한다.
    await Session.deleteOne({ _id: session._id })
    return null
  }

  const user = await User.findById(session.userId).lean()
  if (!user) return null

  return {
    id: user._id.toString(),
    githubId: user.githubId,
    username: user.username,
    avatarUrl: user.avatarUrl,
  }
}

/** 로그아웃. 문서를 실제로 지운다. */
export async function destroySession(token: string | undefined): Promise<boolean> {
  if (token === undefined || token === '') return false

  await connectDb()
  const result = await Session.deleteOne({ tokenHash: hashSessionToken(token) })
  return result.deletedCount > 0
}

/** 그 사용자의 모든 기기에서 로그아웃시킨다. */
export async function destroyAllSessionsOfUser(userId: string): Promise<number> {
  await connectDb()
  const result = await Session.deleteMany({ userId })
  return result.deletedCount
}

/** 만료된 세션 일괄 정리. 보관 정리와 함께 돌리기 위한 것 */
export async function purgeExpiredSessions(now: Date = new Date()): Promise<number> {
  await connectDb()
  const result = await Session.deleteMany({ expiresAt: { $lte: now } })
  return result.deletedCount
}

export type { SessionDoc }
