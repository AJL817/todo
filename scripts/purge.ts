import { disconnectDb } from '../lib/db'
import { stopLocalMongo } from '../lib/mongo-uri'
import { RETENTION_DAYS, runDailyMaintenance } from '../lib/retention'

/** npm run purge — 소프트 삭제 후 30일이 지난 문서를 하드 삭제한다. */
async function main() {
  const outcome = await runDailyMaintenance()

  if (!outcome.ran) {
    console.log(`오늘 이미 정리했습니다 (마지막 실행: ${outcome.lastRunAt.toISOString()})`)
    return
  }

  const { todos, weeklyPlans, goals, sessions, cutoff } = outcome.result
  console.log(`보관 기한 ${RETENTION_DAYS}일, 기준 시각 ${cutoff.toISOString()} 이전 삭제분을 정리했습니다.`)
  console.log(`  할일        ${todos}건`)
  console.log(`  주간 계획   ${weeklyPlans}건`)
  console.log(`  1년 목표    ${goals}건`)
  console.log(`  만료 세션   ${sessions}건`)
}

main()
  .catch((error: unknown) => {
    console.error('정리에 실패했습니다:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectDb()
    // 이 프로세스가 mongod 를 띄웠다면 정상 종료시킨다.
    // 곧바로 process.exit 하면 아직 기록되지 않은 쓰기가 사라진다.
    await stopLocalMongo()
    process.exit(process.exitCode ?? 0)
  })
