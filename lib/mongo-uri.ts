import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

/**
 * 접속 문자열 결정 규칙 (docs/PLAN.md §11 Q4 결정)
 *
 *  1. MONGODB_URI 가 있으면 무조건 그것을 쓴다 (직접 설치한 mongod, Atlas 등)
 *  2. 없으면 127.0.0.1:27017 이 이미 열려 있는지 본다. 열려 있으면 그 인스턴스에 붙는다
 *     (dev 서버와 스크립트가 동시에 도는 경우 dbPath 잠금 충돌을 피하기 위함)
 *  3. 그것도 아니면 mongodb-memory-server 로 실제 mongod 바이너리를 27017 에 띄운다.
 *     dbPath 를 .mongo-data 로 고정하므로 재시작해도 데이터가 남는다.
 *
 * 2, 3 은 standalone 모드다. PLAN §3.1 에 따라 이 앱은 트랜잭션을 쓰지 않으므로
 * replica set 이 필요 없다.
 */

export const LOCAL_MONGO_HOST = '127.0.0.1'
export const DEFAULT_LOCAL_MONGO_PORT = 27017
export const LOCAL_DB_PATH = '.mongo-data'

/**
 * 로컬 mongod 포트. 27017 이 이미 다른 것에 쓰이면 MONGO_LOCAL_PORT 로 바꾼다.
 * 호출 시점에 읽는다. 모듈 상수로 굳히면 테스트가 포트를 바꿔 끼울 수 없다.
 */
export function localMongoPort(): number {
  const raw = process.env.MONGO_LOCAL_PORT
  const parsed = raw === undefined ? Number.NaN : Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_LOCAL_MONGO_PORT
}

function defaultDbName(): string {
  const name = process.env.MONGO_DB_NAME
  return name && name.trim() !== '' ? name.trim() : 'todo-app'
}

export function localUri(dbName = defaultDbName()): string {
  return `mongodb://${LOCAL_MONGO_HOST}:${localMongoPort()}/${dbName}`
}

export function isPortOpen(host: string, port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const finish = (open: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, host)
  })
}

// 띄운 서버 핸들을 전역에 붙잡아 둔다. 놓치면 GC 나 HMR 리로드 때 프로세스가 정리되어
// 다음 요청에서 접속이 끊긴다.
type MemoryServerHandle = { stop: () => Promise<unknown> }
const globalForMongo = globalThis as unknown as {
  __localMongoServer?: MemoryServerHandle
  __localMongoStarting?: Promise<string>
}

async function startLocalMongo(): Promise<string> {
  // mongod 는 dbPath 를 스스로 만들지 않는다. 없으면 시작 자체가 ENOENT 로 실패한다.
  // cwd 에 따라 위치가 달라지지 않도록 절대 경로로 고정한다.
  const dbPath = path.resolve(process.cwd(), LOCAL_DB_PATH)
  await fs.promises.mkdir(dbPath, { recursive: true })

  const { MongoMemoryServer } = await import('mongodb-memory-server')
  const server = await MongoMemoryServer.create({
    instance: {
      port: localMongoPort(),
      dbPath,
      storageEngine: 'wiredTiger',
    },
  })

  globalForMongo.__localMongoServer = server
  registerShutdownHooks()
  return localUri()
}

let shutdownHooksRegistered = false

/**
 * mongod 를 급하게 죽이면 아직 체크포인트되지 않은 쓰기가 사라진다.
 * 실제로 스크립트가 process.exit() 로 끝났을 때 직전에 만든 문서들이 유실됐다.
 * 이 프로세스가 mongod 의 주인이므로, 종료 경로에서 반드시 정상 종료를 거치게 한다.
 */
function registerShutdownHooks(): void {
  if (shutdownHooksRegistered) return
  shutdownHooksRegistered = true

  const shutdown = (signal: NodeJS.Signals) => {
    void stopLocalMongo().finally(() => {
      // 다른 종료 핸들러(예: Next dev 서버)를 지우지 않는다. 남아 있으면 그쪽이 이어서
      // 정리하고, 아무도 없으면 기본 동작대로 끝나도록 신호를 다시 올린다.
      if (process.listenerCount(signal) === 0) process.kill(process.pid, signal)
    })
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  process.once('beforeExit', () => {
    void stopLocalMongo()
  })
}

export async function resolveMongoUri(): Promise<string> {
  const explicit = process.env.MONGODB_URI
  if (explicit && explicit.trim() !== '') return explicit.trim()

  // 서버리스/프로덕션에는 로컬 mongod 로 물러설 곳이 없다. mongodb-memory-server 는
  // devDependency 라 배포본에 아예 없어서, 여기서 막지 않으면 한참 뒤 DB 를 쓰는
  // 지점에서 터진다. 실제로 Vercel 배포에서 그 예외가 "GitHub 로그인 실패" 로
  // 둔갑해 원인을 찾는 데 오래 걸렸다.
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    throw new Error(
      '환경변수 MONGODB_URI 가 필요합니다. 배포 환경에는 로컬 mongod 대체 경로가 없습니다 ' +
        '(docs/LOGIN-SETUP.md 참고).',
    )
  }

  if (await isPortOpen(LOCAL_MONGO_HOST, localMongoPort())) return localUri()

  // 동시 호출이 각자 mongod 를 띄우려 하면 포트가 충돌한다. 한 번만 시작하도록 묶는다.
  globalForMongo.__localMongoStarting ??= startLocalMongo().catch(async (err: unknown) => {
    globalForMongo.__localMongoStarting = undefined
    // 경합에서 밀려 포트를 뺏겼다면 이미 떠 있는 인스턴스에 붙는다.
    // 서버리스/프로덕션에는 로컬 mongod 로 물러설 곳이 없다. mongodb-memory-server 는
  // devDependency 라 배포본에 아예 없어서, 여기서 막지 않으면 한참 뒤 DB 를 쓰는
  // 지점에서 터진다. 실제로 Vercel 배포에서 그 예외가 "GitHub 로그인 실패" 로
  // 둔갑해 원인을 찾는 데 오래 걸렸다.
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    throw new Error(
      '환경변수 MONGODB_URI 가 필요합니다. 배포 환경에는 로컬 mongod 대체 경로가 없습니다 ' +
        '(docs/LOGIN-SETUP.md 참고).',
    )
  }

  if (await isPortOpen(LOCAL_MONGO_HOST, localMongoPort())) return localUri()
    throw err
  })

  return globalForMongo.__localMongoStarting
}

export async function stopLocalMongo(): Promise<void> {
  const server = globalForMongo.__localMongoServer
  globalForMongo.__localMongoServer = undefined
  globalForMongo.__localMongoStarting = undefined
  if (server) await server.stop()
}
