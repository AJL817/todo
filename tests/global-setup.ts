import { MongoMemoryServer } from 'mongodb-memory-server'
import type { GlobalSetupContext } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string
  }
}

let server: MongoMemoryServer | undefined

export async function setup({ provide }: GlobalSetupContext): Promise<void> {
  // replica set 이 아닌 standalone. PLAN §3.1 의 "트랜잭션 없이 동작한다" 전제를
  // 테스트가 실제로 강제하게 만든다.
  server = await MongoMemoryServer.create()
  const uri = server.getUri('vitest')
  provide('mongoUri', uri)
  process.env.MONGODB_URI = uri
}

export async function teardown(): Promise<void> {
  await server?.stop()
  server = undefined
}
