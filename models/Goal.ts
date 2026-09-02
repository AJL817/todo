import mongoose, { Schema } from 'mongoose'
import type { GoalDoc } from './types'

const goalSchema = new Schema<GoalDoc>(
  {
    title: { type: String, required: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    year: { type: Number, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    description: { type: String, default: null },
    deletedAt: { type: Date, default: null },
  },
  { strict: 'throw', timestamps: true, collection: 'goals' },
)

goalSchema.index({ deletedAt: 1, year: 1 })

export const Goal = (mongoose.models.Goal as mongoose.Model<GoalDoc>) ?? mongoose.model<GoalDoc>('Goal', goalSchema)
