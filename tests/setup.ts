import { afterAll, afterEach, beforeAll, beforeEach, inject } from 'vitest'
import mongoose from 'mongoose'
import { connectDb, disconnectDb } from '@/lib/db'
import { clearCurrentPrincipal, makePrincipal, setCurrentPrincipal } from './helpers/owner'

beforeAll(async () => {
  process.env.MONGODB_URI = inject('mongoUri')
  await connectDb()
})

// 리포지토리가 소유자를 필수로 받으므로(docs/LOGIN.md) 테스트마다 사용자가 하나 필요하다.
// afterEach 가 컬렉션을 비우니 매번 새로 만든다.
beforeEach(async () => {
  setCurrentPrincipal(await makePrincipal())
})

// 케이스마다 컬렉션을 비워 테스트끼리 간섭하지 않게 한다.
afterEach(async () => {
  clearCurrentPrincipal()

  const db = mongoose.connection.db
  if (!db) return
  const collections = await db.collections()
  await Promise.all(collections.map((c) => c.deleteMany({})))
})

afterAll(async () => {
  await disconnectDb()
})
