import net from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { connectCount, connectDb, resetConnectionCacheForTest } from '@/lib/db'
import { isPortOpen, localMongoPort, localUri, resolveMongoUri } from '@/lib/mongo-uri'

describe('lib/db — 커넥션 캐싱 (PLAN R11)', () => {
  it('같은 프로세스에서 10회 연속 호출해도 실제 커넥션은 1개만 열린다', async () => {
    resetConnectionCacheForTest()

    const connections = await Promise.all(Array.from({ length: 10 }, () => connectDb()))

    expect(connectCount()).toBe(1)
    // 모두 같은 mongoose 인스턴스를 돌려받아야 한다
    for (const conn of connections) expect(conn).toBe(connections[0])
  })

  it('순차 호출에서도 커넥션을 재사용한다', async () => {
    resetConnectionCacheForTest()

    for (let i = 0; i < 10; i += 1) await connectDb()

    expect(connectCount()).toBe(1)
  })
})

/**
 * 27017 을 직접 잡으면 개발 서버가 떠 있을 때 EADDRINUSE 로 깨진다.
 * 비어 있는 포트를 하나 열고 그 번호를 MONGO_LOCAL_PORT 로 알려 준다.
 */
async function occupyFreePort(): Promise<{ port: number; release: () => Promise<void> }> {
  const server = net.createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('포트를 확보하지 못했습니다')

  return {
    port: address.port,
    release: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe('lib/mongo-uri — 접속 문자열 결정 (PLAN Q4)', () => {
  const originalUri = process.env.MONGODB_URI
  const originalDbName = process.env.MONGO_DB_NAME
  const originalPort = process.env.MONGO_LOCAL_PORT

  afterEach(() => {
    process.env.MONGODB_URI = originalUri
    if (originalDbName === undefined) delete process.env.MONGO_DB_NAME
    else process.env.MONGO_DB_NAME = originalDbName
    if (originalPort === undefined) delete process.env.MONGO_LOCAL_PORT
    else process.env.MONGO_LOCAL_PORT = originalPort
  })

  it('MONGO_LOCAL_PORT 로 포트를 바꿀 수 있고, 없으면 27017 이다', () => {
    delete process.env.MONGO_LOCAL_PORT
    expect(localMongoPort()).toBe(27017)

    process.env.MONGO_LOCAL_PORT = '31017'
    expect(localMongoPort()).toBe(31017)

    // 숫자가 아니면 기본값으로 되돌린다
    process.env.MONGO_LOCAL_PORT = 'nope'
    expect(localMongoPort()).toBe(27017)
  })

  it('MONGODB_URI 가 설정돼 있으면 그 값을 그대로 쓴다', async () => {
    process.env.MONGODB_URI = 'mongodb://example.test:27017/custom'
    await expect(resolveMongoUri()).resolves.toBe('mongodb://example.test:27017/custom')
  })

  it('MONGODB_URI 가 공백뿐이면 설정되지 않은 것으로 본다', async () => {
    process.env.MONGODB_URI = '   '
    process.env.MONGO_DB_NAME = 'blank-check'

    const { port, release } = await occupyFreePort()
    process.env.MONGO_LOCAL_PORT = String(port)
    try {
      await expect(resolveMongoUri()).resolves.toBe(`mongodb://127.0.0.1:${port}/blank-check`)
    } finally {
      await release()
    }
  })

  it('MONGODB_URI 가 없고 그 포트가 이미 열려 있으면 mongod 를 새로 띄우지 않고 붙는다', async () => {
    delete process.env.MONGODB_URI
    process.env.MONGO_DB_NAME = 'reuse-check'

    const { port, release } = await occupyFreePort()
    process.env.MONGO_LOCAL_PORT = String(port)
    try {
      await expect(isPortOpen('127.0.0.1', port)).resolves.toBe(true)
      await expect(resolveMongoUri()).resolves.toBe(localUri('reuse-check'))
    } finally {
      await release()
    }
  })

  it('isPortOpen 이 닫힌 포트에 false 를 반환한다', async () => {
    await expect(isPortOpen('127.0.0.1', 1, 200)).resolves.toBe(false)
  })
})
