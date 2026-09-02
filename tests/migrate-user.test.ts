import { describe, expect, it } from 'vitest'
import { MigrationError, migrateOrphansToUser } from '@/lib/migrate-user'
import { Goal, Todo, WeeklyPlan } from '@/models'
import { id, makeGoal, makePlan, makeTodo } from './helpers/factories'
import { makePrincipal, owner } from './helpers/owner'

/**
 * 로그인 도입 전의 문서를 흉내낸다. userId 를 아예 지운 것과 null 인 것 두 종류를 만든다.
 * 실제로 두 형태가 다 나올 수 있고, 한쪽만 잡으면 절반이 남는다.
 */
async function makeOrphans(): Promise<{ todoId: string; planId: string; goalId: string }> {
  const todo = await makeTodo({ title: '옛날 할일' })
  const plan = await makePlan({ title: '옛날 계획' })
  const goal = await makeGoal({ title: '옛날 목표' })

  await Todo.updateOne({ _id: todo._id }, { $unset: { userId: '' } })
  await WeeklyPlan.updateOne({ _id: plan._id }, { $set: { userId: null } })
  await Goal.updateOne({ _id: goal._id }, { $unset: { userId: '' } })

  return { todoId: id(todo), planId: id(plan), goalId: id(goal) }
}

describe('migrateOrphansToUser (docs/LOGIN.md 마이그레이션)', () => {
  it('소유자가 없는 문서를 지정한 사용자에게 귀속시킨다', async () => {
    const target = await makePrincipal('migrate-target', 4001)
    const orphans = await makeOrphans()

    const result = await migrateOrphansToUser('migrate-target')

    expect(result.counts).toEqual({ todos: 1, weeklyPlans: 1, goals: 1 })

    expect((await Todo.findById(orphans.todoId).lean())?.userId?.toString()).toBe(target.ownerId)
    expect((await WeeklyPlan.findById(orphans.planId).lean())?.userId?.toString()).toBe(target.ownerId)
    expect((await Goal.findById(orphans.goalId).lean())?.userId?.toString()).toBe(target.ownerId)
  })

  it('userId 가 필드째 없는 문서와 null 인 문서를 모두 잡는다', async () => {
    await makePrincipal('migrate-target', 4001)

    const missing = await makeTodo({ title: '필드 없음' })
    const nulled = await makeTodo({ title: 'null' })
    await Todo.updateOne({ _id: missing._id }, { $unset: { userId: '' } })
    await Todo.updateOne({ _id: nulled._id }, { $set: { userId: null } })

    const result = await migrateOrphansToUser('migrate-target')
    expect(result.counts.todos).toBe(2)
  })

  it('이미 소유자가 있는 문서는 건드리지 않는다', async () => {
    const target = await makePrincipal('migrate-target', 4001)
    const mine = await makeTodo({ title: '내 것' }) // 기본 사용자 소유
    await makeOrphans()

    await migrateOrphansToUser('migrate-target')

    // 원래 주인이 그대로여야 한다
    expect((await Todo.findById(mine._id).lean())?.userId?.toString()).toBe(owner())
    expect((await Todo.findById(mine._id).lean())?.userId?.toString()).not.toBe(target.ownerId)
  })

  it('두 번 실행해도 결과가 같다 (멱등성)', async () => {
    await makePrincipal('migrate-target', 4001)
    await makeOrphans()

    const first = await migrateOrphansToUser('migrate-target')
    expect(first.counts).toEqual({ todos: 1, weeklyPlans: 1, goals: 1 })

    // 두 번째에는 옮길 것이 없다
    const second = await migrateOrphansToUser('migrate-target')
    expect(second.counts).toEqual({ todos: 0, weeklyPlans: 0, goals: 0 })

    expect(await Todo.countDocuments({ userId: null })).toBe(0)
  })

  it('--dry-run 은 대상 건수만 세고 아무것도 바꾸지 않는다', async () => {
    await makePrincipal('migrate-target', 4001)
    const orphans = await makeOrphans()

    const preview = await migrateOrphansToUser('migrate-target', true)

    expect(preview.dryRun).toBe(true)
    expect(preview.counts).toEqual({ todos: 1, weeklyPlans: 1, goals: 1 })

    // 실제로는 그대로 소유자가 없어야 한다
    expect((await Todo.findById(orphans.todoId).lean())?.userId ?? null).toBeNull()
    expect((await WeeklyPlan.findById(orphans.planId).lean())?.userId ?? null).toBeNull()
  })

  it('없는 사용자명을 주면 아무것도 바꾸지 않고 오류를 던진다', async () => {
    const orphans = await makeOrphans()

    await expect(migrateOrphansToUser('no-such-user')).rejects.toThrow(MigrationError)

    expect((await Todo.findById(orphans.todoId).lean())?.userId ?? null).toBeNull()
  })

  it('빈 사용자명을 주면 사용법을 알리는 오류를 던진다', async () => {
    await expect(migrateOrphansToUser('   ')).rejects.toThrow(/사용자명을 지정/)
  })

  it('마이그레이션 후 그 사용자의 조회에 문서가 나타난다', async () => {
    const target = await makePrincipal('migrate-target', 4001)
    await makeOrphans()

    const { todoRepo } = await import('@/lib/repositories')
    expect(await todoRepo.listAllActive(target.ownerId)).toHaveLength(0)

    await migrateOrphansToUser('migrate-target')

    const visible = await todoRepo.listAllActive(target.ownerId)
    expect(visible.map((todo) => todo.title)).toEqual(['옛날 할일'])
  })
})
