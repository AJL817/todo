import { connectDb, disconnectDb } from '../lib/db'
import { User } from '../models'
import { stopLocalMongo } from '../lib/mongo-uri'
import { METRIC_TARGETS, computeMetrics, meetsTarget } from '../lib/metrics'

/** npm run metrics — PLAN §1.5 의 M1/M2/M3 를 출력한다. */
function line(
  id: string,
  label: string,
  value: number,
  key: keyof typeof METRIC_TARGETS,
  sampleSize: number,
  detail: string,
) {
  const { target, direction } = METRIC_TARGETS[key]
  const goal = direction === 'atLeast' ? `>= ${target}%` : `<= ${target}%`
  // 표본이 0이면 0% 는 "미달" 이 아니라 "잴 것이 없음" 이다. 갓 설치한 상태를
  // 경고로 표시하면 지표가 신호가 아니라 소음이 된다.
  const mark = sampleSize === 0 ? '  - ' : meetsTarget(key, value) ? ' OK ' : '주의 '
  const shown = sampleSize === 0 ? '  -' : String(value).padStart(3)
  console.log(`${mark}${id} ${label.padEnd(16)} ${shown}%  (목표 ${goal})  ${detail}`)
}

/**
 * 데이터가 사용자별로 나뉘었으므로(docs/LOGIN.md) 누구의 지표인지 정해야 한다.
 * 사용자가 한 명뿐이면 굳이 묻지 않는다. 1인용 로컬 앱에서 흔한 경우다.
 */
async function resolveUser(requested: string | undefined) {
  await connectDb()

  if (requested !== undefined) {
    const found = await User.findOne({ username: requested }).lean()
    if (!found) throw new Error(`GitHub 사용자 '${requested}' 를 찾을 수 없습니다. 먼저 로그인하세요.`)
    return found
  }

  const users = await User.find({}).sort({ createdAt: 1 }).lean()
  if (users.length === 0) throw new Error('등록된 사용자가 없습니다. 앱에서 GitHub 로 먼저 로그인하세요.')
  if (users.length > 1) {
    const names = users.map((user) => user.username).join(', ')
    throw new Error(`사용자가 여럿입니다. 대상을 지정하세요: npm run metrics -- <${names}>`)
  }
  return users[0]!
}

async function main() {
  const user = await resolveUser(process.argv[2])
  console.log(`대상 사용자: ${user.username}`)
  console.log('')

  const metrics = await computeMetrics(user._id.toString())
  const { detail } = metrics

  console.log('성공 지표 (docs/PLAN.md §1.5)')
  line('M1', '주간 계획 연결률', metrics.linkedRate, 'linkedRate', detail.activeTodos, `연결 ${detail.linkedTodos}/${detail.activeTodos}건`)
  line('M2', '주간 실행률', metrics.executionRate, 'executionRate', detail.elapsedPlans, `착수 ${detail.startedPlans}/${detail.elapsedPlans}주`)
  line('M3', '이월 적체율', metrics.carryOverBacklogRate, 'carryOverBacklogRate', detail.activeTodos, `2회 이상 이월 ${detail.repeatedlyCarried}건`)

  if (detail.activeTodos === 0 && detail.elapsedPlans === 0) {
    console.log('')
    console.log('아직 데이터가 없어 잴 것이 없습니다. 목표와 주간 계획을 만들고 다시 실행하세요.')
  }
}

main()
  .catch((error: unknown) => {
    console.error('지표 산출에 실패했습니다:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectDb()
    // 이 프로세스가 mongod 를 띄웠다면 정상 종료시킨다.
    // 곧바로 process.exit 하면 아직 기록되지 않은 쓰기가 사라진다.
    await stopLocalMongo()
    process.exit(process.exitCode ?? 0)
  })
