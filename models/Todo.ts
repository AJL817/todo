import mongoose, { Schema } from 'mongoose'
import { TODO_STATUSES, type TodoDoc } from './types'

const todoSchema = new Schema<TodoDoc>(
  {
    title: { type: String, required: true, trim: true },
    // 소유자. 모든 조회가 이 값으로 좁혀진다 (docs/LOGIN.md)
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dueDate: { type: Date, default: null },
    status: { type: String, enum: TODO_STATUSES, default: 'todo', required: true },
    position: { type: Number, required: true },
    weeklyPlanId: { type: Schema.Types.ObjectId, ref: 'WeeklyPlan', default: null },
    carriedFrom: { type: [{ type: Schema.Types.ObjectId, ref: 'WeeklyPlan' }], default: [] },
    completedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { strict: 'throw', timestamps: true, collection: 'todos' },
)

todoSchema.index({ deletedAt: 1, status: 1, position: 1 })
todoSchema.index({ weeklyPlanId: 1 })
todoSchema.index({ dueDate: 1 })
todoSchema.index({ carriedFrom: 1 })

export const Todo = (mongoose.models.Todo as mongoose.Model<TodoDoc>) ?? mongoose.model<TodoDoc>('Todo', todoSchema)
