import { redirect } from 'next/navigation'
import { formatKstDate, weekStartOf } from '@/lib/date'

/** /week 는 항상 이번 주(직전 월요일 시작) 로 보낸다 (PLAN A2) */
export default function WeekIndexPage() {
  redirect(`/week/${formatKstDate(weekStartOf(new Date()))}`)
}
