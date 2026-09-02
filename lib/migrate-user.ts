import { connectDb } from './db'
import { Goal, Todo, User, WeeklyPlan } from '@/models'

/**
 * 로그인 도입 전에 만들어진 문서에는 userId 가 없다 (docs/LOGIN.md "마이그레이션").
 * 그 문서들을 지정한 GitHub 사용자에게 귀속시킨다.
 *
 * userId 가 이미 있는 문서는 손대지 않으므로 몇 번을 돌려도 같은 결과가 된다.
 * 스크립트가 아니라 함수로 둔 이유는 테스트에서 그대로 검증하기 위해서다.
 */

export interface MigrationCounts {
  todos: number
  weeklyPlans: number
  goals: number
}

export interface MigrationResult {
  username: string
  userId: string
  /** dry-run 이면 "바꿀 대상 수", 아니면 "실제로 바꾼 수" */
  counts: MigrationCounts
  dryRun: boolean
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationError'
  }
}

/**
 * userId 가 아예 없거나 null 인 문서. 두 경우를 모두 잡아야 한다.
 * 호출할 때마다 새로 만든다. as const 로 굳히면 Mongoose 가 읽기 전용 배열을 거부한다.
 */
function orphanFilter() {
  return { $or: [{ userId: { $exists: false } }, { userId: null }] }
}

export async function migrateOrphansToUser(username: string, dryRun = false): Promise<MigrationResult> {
  await connectDb()

  const trimmed = username.trim()
  if (trimmed === '') {
    throw new MigrationError('GitHub 사용자명을 지정하세요. 예: npm run migrate:user -- octocat')
  }

  const user = await User.findOne({ username: trimmed }).lean()
  if (!user) {
    throw new MigrationError(
      `GitHub 사용자 '${trimmed}' 를 찾을 수 없습니다. 앱에서 한 번 로그인한 뒤 다시 실행하세요.`,
    )
  }

  const userId = user._id

  if (dryRun) {
    const [todos, weeklyPlans, goals] = await Promise.all([
      Todo.countDocuments(orphanFilter()),
      WeeklyPlan.countDocuments(orphanFilter()),
      Goal.countDocuments(orphanFilter()),
    ])
    return { username: trimmed, userId: userId.toString(), counts: { todos, weeklyPlans, goals }, dryRun: true }
  }

  // 세 컬렉션은 서로 독립이다. 부분 적용돼도 재실행으로 나머지가 처리되므로
  // 트랜잭션이 필요 없다 (docs/PLAN.md §3.1 과 같은 논리).
  const [todos, weeklyPlans, goals] = await Promise.all([
    Todo.updateMany(orphanFilter(), { $set: { userId } }),
    WeeklyPlan.updateMany(orphanFilter(), { $set: { userId } }),
    Goal.updateMany(orphanFilter(), { $set: { userId } }),
  ])

  return {
    username: trimmed,
    userId: userId.toString(),
    counts: {
      todos: todos.modifiedCount,
      weeklyPlans: weeklyPlans.modifiedCount,
      goals: goals.modifiedCount,
    },
    dryRun: false,
  }
}
