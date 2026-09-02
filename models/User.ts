import mongoose, { Schema } from 'mongoose'
import type { UserDoc } from './types'

const userSchema = new Schema<UserDoc>(
  {
    // GitHub 의 숫자 id. username 은 바뀔 수 있으므로 동일인 판정은 이 값으로 한다.
    githubId: { type: Number, required: true, unique: true },
    username: { type: String, required: true },
    avatarUrl: { type: String, required: true },
  },
  { strict: 'throw', timestamps: true, collection: 'users' },
)

export const User = (mongoose.models.User as mongoose.Model<UserDoc>) ?? mongoose.model<UserDoc>('User', userSchema)
