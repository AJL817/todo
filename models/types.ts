import type { Types } from 'mongoose'

export const TODO_STATUSES = ['todo', 'doing', 'done'] as const
export type TodoStatus = (typeof TODO_STATUSES)[number]

export interface GoalDoc {
  _id: Types.ObjectId
  title: string
  /** 소유자 (docs/LOGIN.md) */
  userId: Types.ObjectId
  year: number
  startDate: Date
  endDate: Date
  description: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export interface WeeklyPlanDoc {
  _id: Types.ObjectId
  title: string
  /** 소유자 (docs/LOGIN.md) */
  userId: Types.ObjectId
  /** 항상 월요일 KST 자정에 해당하는 UTC 인스턴트 */
  weekStart: Date
  goalId: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export interface TodoDoc {
  _id: Types.ObjectId
  title: string
  /** 소유자 (docs/LOGIN.md) */
  userId: Types.ObjectId
  dueDate: Date | null
  status: TodoStatus
  /** 열 내 정렬 키. BSON Double */
  position: number
  weeklyPlanId: Types.ObjectId | null
  /** 이월돼 떠나온 주간 계획들. 순서가 곧 이월 순서 (PLAN A8) */
  carriedFrom: Types.ObjectId[]
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

export interface UserDoc {
  _id: Types.ObjectId
  /** GitHub 의 숫자 id. username 이 바뀌어도 동일인을 가리킨다 */
  githubId: number
  username: string
  avatarUrl: string
  createdAt: Date
  updatedAt: Date
}

export interface SessionDoc {
  _id: Types.ObjectId
  /** 쿠키에 담긴 토큰의 SHA-256 해시. 원문은 저장하지 않는다 */
  tokenHash: string
  userId: Types.ObjectId
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}
