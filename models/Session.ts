import mongoose, { Schema } from 'mongoose'
import type { SessionDoc } from './types'

/**
 * 서버 측 세션. 쿠키에는 불투명 토큰만 담고 여기에는 그 해시만 저장한다.
 * DB 가 유출돼도 세션을 재현할 수 없고, 로그아웃 때 문서를 지우면 그 세션은 즉시 무효가 된다.
 * stateless JWT 였다면 쿠키를 지워도 토큰 자체는 만료까지 살아 있다.
 */
const sessionSchema = new Schema<SessionDoc>(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
  },
  { strict: 'throw', timestamps: true, collection: 'sessions' },
)

sessionSchema.index({ userId: 1 })

export const Session =
  (mongoose.models.Session as mongoose.Model<SessionDoc>) ?? mongoose.model<SessionDoc>('Session', sessionSchema)
