import mongoose from 'mongoose'
import { resolveMongoUri } from './mongo-uri'

/**
 * Next.js dev 의 HMR 은 매 리로드마다 모듈을 새로 평가한다. 커넥션을 모듈 스코프에만
 * 두면 리로드마다 새 커넥션이 생겨 풀이 고갈된다 (PLAN §8 R11).
 * globalThis 에 캐시해 프로세스당 커넥션을 1개로 고정한다.
 */
type MongooseCache = {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
  /** 실제로 mongoose.connect 를 호출한 횟수. 캐싱 동작 검증용 */
  connectCount: number
}

const globalForMongoose = globalThis as unknown as { __mongooseCache?: MongooseCache }

const cache: MongooseCache = (globalForMongoose.__mongooseCache ??= {
  conn: null,
  promise: null,
  connectCount: 0,
})

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn

  cache.promise ??= resolveMongoUri().then((uri) => {
    cache.connectCount += 1
    return mongoose.connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10_000,
    })
  })

  try {
    cache.conn = await cache.promise
  } catch (err) {
    // 실패한 promise 를 남기면 이후 호출이 전부 같은 실패를 재사용한다.
    cache.promise = null
    throw err
  }

  scheduleDailyMaintenance()
  return cache.conn
}

let maintenanceScheduled = false

/**
 * 보관 정리를 앱의 첫 요청 시점에 한 번 태운다 (PLAN Phase 7).
 *
 * 상시 구동 서버가 없으므로 스케줄러를 둘 수 없다. 실제 정리 여부는 retention 쪽에서
 * "오늘 이미 돌았는지" 로 다시 거르므로 하루 한 번만 수행된다.
 * 요청을 붙잡지 않도록 기다리지 않고, 실패해도 앱 동작을 막지 않는다.
 *
 * 동적 import 인 이유: retention 이 다시 이 모듈을 참조하므로 정적으로 엮으면 순환이 된다.
 */
function scheduleDailyMaintenance(): void {
  if (maintenanceScheduled) return
  maintenanceScheduled = true

  // 웹 앱의 요청 경로에서만 돈다. Next 서버 밖(테스트, CLI 스크립트)에서는 켜지 않는다.
  //  - 테스트: 자기 데이터를 스스로 통제해야 한다. 백그라운드 삭제가 끼어들면 안 된다
  //  - 스크립트: npm run purge 가 이미 명시적으로 정리한다. 여기서 또 태우면 스크립트가
  //    커넥션을 닫은 뒤에 뒷북 쿼리가 날아가 오류 로그만 남는다
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  void import('./retention')
    .then(({ runDailyMaintenance }) => runDailyMaintenance())
    .catch((error: unknown) => {
      console.error('[retention] 정리를 건너뜁니다:', error instanceof Error ? error.message : error)
    })
}

export async function disconnectDb(): Promise<void> {
  if (!cache.conn && !cache.promise) return
  cache.conn = null
  cache.promise = null
  await mongoose.disconnect()
}

/** 테스트 전용. connectDb 가 실제 커넥션을 몇 번 열었는지 반환한다. */
export function connectCount(): number {
  return cache.connectCount
}

/** 테스트 전용. 캐시를 비우되 커넥션 카운터는 유지한다. */
export function resetConnectionCacheForTest(): void {
  cache.conn = null
  cache.promise = null
  cache.connectCount = 0
  maintenanceScheduled = false
}
