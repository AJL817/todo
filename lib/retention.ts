import mongoose, { Schema } from 'mongoose'
import { connectDb } from './db'
import { purgeExpiredSessions } from './auth/session'
import { DAY_MS, todayKst } from './date'
import { Goal, Todo, WeeklyPlan } from '@/models'

/**
 * 소프트 삭제 30일 보관 (PRD P0 / PLAN Phase 7).
 *
 * 상시 구동 서버가 없는 로컬 앱이라 스케줄러를 둘 수 없으므로 지연 정리로 구현한다.
 * MongoDB TTL 인덱스는 쓰지 않는다. 삭제 시점을 앱이 제어할 수 없고 테스트에서
 * 결정론적으로 검증할 수 없기 때문이다.
 */

export const RETENTION_DAYS = 30

interface MaintenanceDoc {
  key: string
  lastRunAt: Date
}

/**
 * 마지막 정리 시각 기록용. PLAN §3.0 의 세 컬렉션 외에 하나를 더 두는 이유는,
 * "하루 한 번만" 을 판정하려면 실행 이력을 어딘가에 남겨야 하는데 파일보다
 * 데이터베이스가 배포 형태(로컬/Atlas)에 무관하게 동작하기 때문이다.
 */
const maintenanceSchema = new Schema<MaintenanceDoc>(
  {
    key: { type: String, required: true, unique: true },
    lastRunAt: { type: Date, required: true },
  },
  { strict: 'throw', collection: 'maintenance', versionKey: false },
)

export const Maintenance =
  (mongoose.models.Maintenance as mongoose.Model<MaintenanceDoc>) ??
  mongoose.model<MaintenanceDoc>('Maintenance', maintenanceSchema)

const PURGE_KEY = 'purge'

export interface PurgeResult {
  todos: number
  weeklyPlans: number
  goals: number
  /** 만료된 세션. 보관 기한과 무관하게 이미 쓸 수 없는 것들이라 함께 치운다 */
  sessions: number
  cutoff: Date
}

/** 보관 기한을 넘긴 소프트 삭제 문서를 하드 삭제한다. */
export async function purgeExpired(now: Date = new Date()): Promise<PurgeResult> {
  await connectDb()

  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS)
  // deletedAt: null 인 문서는 이 조건에 절대 걸리지 않는다. $lt 는 null 과 비교되지 않는다.
  const expired = { deletedAt: { $ne: null, $lt: cutoff } }

  const [todos, weeklyPlans, goals, sessions] = await Promise.all([
    Todo.deleteMany(expired),
    WeeklyPlan.deleteMany(expired),
    Goal.deleteMany(expired),
    // 만료된 세션은 접근할 때마다 하나씩 치워지지만, 다시 오지 않는 세션은 그대로 쌓인다.
    purgeExpiredSessions(now),
  ])

  return {
    todos: todos.deletedCount,
    weeklyPlans: weeklyPlans.deletedCount,
    goals: goals.deletedCount,
    sessions,
    cutoff,
  }
}

export type MaintenanceOutcome =
  | { ran: true; result: PurgeResult }
  | { ran: false; reason: 'already-ran-today'; lastRunAt: Date }

/**
 * 하루 한 번만 정리한다. 이미 오늘 돌았으면 DB 쓰기 없이 조기 반환한다.
 * "오늘" 판정은 KST 날짜 기준이다.
 */
export async function runDailyMaintenance(now: Date = new Date()): Promise<MaintenanceOutcome> {
  await connectDb()

  const today = todayKst(now)
  const record = await Maintenance.findOne({ key: PURGE_KEY }).lean()

  if (record && todayKst(record.lastRunAt).getTime() === today.getTime()) {
    return { ran: false, reason: 'already-ran-today', lastRunAt: record.lastRunAt }
  }

  const result = await purgeExpired(now)
  await Maintenance.updateOne({ key: PURGE_KEY }, { $set: { lastRunAt: now } }, { upsert: true })

  return { ran: true, result }
}

/** 테스트에서 실행 이력을 지울 때 쓴다. */
export async function resetMaintenanceRecord(): Promise<void> {
  await connectDb()
  await Maintenance.deleteMany({})
}
