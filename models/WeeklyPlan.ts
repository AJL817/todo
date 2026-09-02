import mongoose, { Schema } from 'mongoose'
import type { WeeklyPlanDoc } from './types'

const weeklyPlanSchema = new Schema<WeeklyPlanDoc>(
  {
    title: { type: String, required: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    weekStart: { type: Date, required: true },
    goalId: { type: Schema.Types.ObjectId, ref: 'Goal', default: null },
    deletedAt: { type: Date, default: null },
  },
  { strict: 'throw', timestamps: true, collection: 'weeklyplans' },
)

weeklyPlanSchema.index({ deletedAt: 1, weekStart: 1 })
weeklyPlanSchema.index({ goalId: 1 })

export const WeeklyPlan =
  (mongoose.models.WeeklyPlan as mongoose.Model<WeeklyPlanDoc>) ??
  mongoose.model<WeeklyPlanDoc>('WeeklyPlan', weeklyPlanSchema)
