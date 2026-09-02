import { disconnectDb } from '../lib/db'
import { MigrationError, migrateOrphansToUser } from '../lib/migrate-user'
import { stopLocalMongo } from '../lib/mongo-uri'

const USAGE = `사용법: npm run migrate:user -- <github-username> [--dry-run]

로그인 도입 전에 만들어진 (소유자가 없는) 할일/주간 계획/1년 목표를
지정한 GitHub 사용자에게 귀속시킵니다. 앱에서 한 번 로그인한 뒤 실행하세요.`

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const username = args.find((arg) => !arg.startsWith('--'))

  if (username === undefined) {
    console.log(USAGE)
    process.exitCode = 1
    return
  }

  const result = await migrateOrphansToUser(username, dryRun)
  const { todos, weeklyPlans, goals } = result.counts
  const total = todos + weeklyPlans + goals

  if (dryRun) {
    console.log(`[미리보기] '${result.username}' 에게 귀속시킬 문서: ${total}건`)
  } else {
    console.log(`'${result.username}' 에게 ${total}건을 귀속시켰습니다.`)
  }

  console.log(`  할일        ${todos}건`)
  console.log(`  주간 계획   ${weeklyPlans}건`)
  console.log(`  1년 목표    ${goals}건`)

  if (total === 0) console.log('\n소유자가 없는 문서가 없습니다. 이미 마이그레이션됐거나 새 설치입니다.')
}

main()
  .catch((error: unknown) => {
    if (error instanceof MigrationError) console.error(error.message)
    else console.error('마이그레이션에 실패했습니다:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectDb()
    // 이 프로세스가 mongod 를 띄웠다면 정상 종료시킨다 (docs/CLAUDE.md)
    await stopLocalMongo()
    process.exit(process.exitCode ?? 0)
  })
