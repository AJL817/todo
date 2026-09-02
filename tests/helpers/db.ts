import mongoose from 'mongoose'

/** 지정한 컬렉션에 실제로 만들어진 인덱스 키 목록을 반환한다. */
export async function indexKeysOf(collectionName: string): Promise<string[]> {
  const db = mongoose.connection.db
  if (!db) throw new Error('DB 에 연결돼 있지 않습니다')
  const indexes = await db.collection(collectionName).indexes()
  return indexes.map((idx) => JSON.stringify(idx.key))
}

/** Mongoose 가 스키마에 선언한 인덱스를 실제 DB 에 반영하도록 강제한다. */
export async function syncAllIndexes(): Promise<void> {
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()))
}
