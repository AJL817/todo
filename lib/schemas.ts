import { z } from 'zod'
import { TODO_STATUSES } from '@/models/types'

/**
 * API 경계 검증 (PLAN §5).
 * 전부 .strict() 다. 스키마에 없는 필드가 오면 400 으로 막아 스키마리스 드리프트를
 * 데이터베이스 앞에서 차단한다 (R10). 클라이언트도 같은 스키마를 재사용한다.
 */

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, '올바른 id 형식이 아닙니다')

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜는 YYYY-MM-DD 형식이어야 합니다')

export const todoStatusSchema = z.enum(TODO_STATUSES)

export const titleSchema = z.string().trim().min(1, '제목은 필수입니다').max(200, '제목이 너무 깁니다')

export const createTodoSchema = z
  .object({
    title: titleSchema,
    dueDate: dateOnlySchema.nullable().optional(),
    status: todoStatusSchema.optional(),
    weeklyPlanId: objectIdSchema.nullable().optional(),
  })
  .strict()

export const updateTodoSchema = z
  .object({
    title: titleSchema.optional(),
    dueDate: dateOnlySchema.nullable().optional(),
    // 일반 재지정. carriedFrom 은 이 경로로 절대 바뀌지 않는다 (PLAN §5)
    weeklyPlanId: objectIdSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: '수정할 필드가 없습니다' })

export const moveTodoSchema = z
  .object({
    toStatus: todoStatusSchema,
    beforeId: objectIdSchema.nullable().optional(),
    afterId: objectIdSchema.nullable().optional(),
  })
  .strict()

/**
 * view 파라미터가 아예 없으면 URLSearchParams 는 빈 객체를 준다. 그 상태로는
 * .default() 가 발동하지 않으므로(입력이 undefined 가 아니다) 먼저 기본값을 주입한다.
 */
export const todoQuerySchema = z.preprocess(
  (value) => {
    const record = (value ?? {}) as Record<string, unknown>
    return record.view === undefined ? { ...record, view: 'all' } : record
  },
  z.discriminatedUnion('view', [
    z.object({ view: z.literal('day'), date: dateOnlySchema.optional() }),
    z.object({ view: z.literal('week'), weekStart: dateOnlySchema }),
    z.object({ view: z.literal('inbox') }),
    z.object({ view: z.literal('all') }),
  ]),
)

export const createWeeklyPlanSchema = z
  .object({
    title: titleSchema,
    weekStart: dateOnlySchema,
    goalId: objectIdSchema.nullable().optional(),
  })
  .strict()

export const updateWeeklyPlanSchema = z
  .object({
    title: titleSchema.optional(),
    weekStart: dateOnlySchema.optional(),
    goalId: objectIdSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: '수정할 필드가 없습니다' })

export const weeklyPlanQuerySchema = z
  .object({
    weekStart: dateOnlySchema.optional(),
    goalId: objectIdSchema.optional(),
    unassignedOnly: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
  })
  .strict()

export const carryOverSchema = z
  .object({
    todoIds: z.array(objectIdSchema).min(1, '이월할 할일을 하나 이상 선택하세요'),
  })
  .strict()

export const createGoalSchema = z
  .object({
    title: titleSchema,
    year: z.number().int().min(1970).max(9999),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    description: z.string().max(2000).nullable().optional(),
  })
  .strict()
  .refine((value) => value.startDate <= value.endDate, {
    message: '시작일이 종료일보다 늦습니다',
    path: ['endDate'],
  })

export const updateGoalSchema = z
  .object({
    title: titleSchema.optional(),
    year: z.number().int().min(1970).max(9999).optional(),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
    description: z.string().max(2000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: '수정할 필드가 없습니다' })

export const goalQuerySchema = z
  .object({
    year: z.coerce.number().int().min(1970).max(9999).optional(),
  })
  .strict()

export type CreateTodoBody = z.infer<typeof createTodoSchema>
export type UpdateTodoBody = z.infer<typeof updateTodoSchema>
export type MoveTodoBody = z.infer<typeof moveTodoSchema>
export type CreateWeeklyPlanBody = z.infer<typeof createWeeklyPlanSchema>
export type UpdateWeeklyPlanBody = z.infer<typeof updateWeeklyPlanSchema>
export type CarryOverBody = z.infer<typeof carryOverSchema>
export type CreateGoalBody = z.infer<typeof createGoalSchema>
export type UpdateGoalBody = z.infer<typeof updateGoalSchema>
