'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { fetchInbox, fetchMe } from '@/lib/client/api'
import { queryKeys } from '@/lib/queryKeys'
import { ThemeToggle } from './ThemeToggle'

interface NavItem {
  href: string
  label: string
  testId: string
  /** 하위 경로까지 활성으로 볼지 (예: /week/2026-08-31) */
  matchPrefix?: boolean
}

const ITEMS: NavItem[] = [
  { href: '/', label: '대시보드', testId: 'nav-dashboard' },
  { href: '/todos', label: '할일', testId: 'nav-todos', matchPrefix: true },
  { href: '/week', label: '주간 계획', testId: 'nav-week', matchPrefix: true },
  { href: '/goals', label: '1년 목표', testId: 'nav-goals', matchPrefix: true },
  // 미분류는 조회 가능한 상태가 아니라 해소해야 할 큐다 (PLAN §4.6).
  // 진입점이 없으면 목표와 단절된 할일이 조용히 쌓인다.
  { href: '/inbox', label: '미분류', testId: 'nav-inbox', matchPrefix: true },
]

export function Sidebar() {
  const pathname = usePathname()

  // 로그인 화면과 인증 경로에서는 앱 메뉴를 감춘다.
  // 아직 세션이 없으므로 여기서 API 를 두드려 봐야 401 만 쌓인다.
  const authenticated = !pathname.startsWith('/login') && !pathname.startsWith('/auth')

  const { data } = useQuery({ queryKey: queryKeys.inbox, queryFn: fetchInbox, enabled: authenticated })
  const inboxCount = data?.todos.length ?? 0

  // 로그인한 사람이 누구인지 항상 보이게 한다. 여러 계정을 오갈 때 특히 필요하다.
  const me = useQuery({ queryKey: queryKeys.me, queryFn: fetchMe, retry: false, enabled: authenticated })

  if (!authenticated) return null

  return (
    <nav
      data-testid="sidebar"
      aria-label="주요 메뉴"
      className="sticky top-0 z-20 flex shrink-0 gap-1 overflow-x-auto border-b border-hairline bg-canvas px-3 py-2.5 md:h-screen md:w-64 md:flex-col md:gap-0.5 md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:py-5"
    >
      <div className="hidden px-3 pb-6 md:block">
        <Link href="/" className="t-title text-ink">
          목표 연동 칸반
        </Link>
        <p className="mt-1.5 text-[13px] text-muted">1년 목표 · 주간 계획 · 할일</p>
      </div>

      {ITEMS.map((item) => {
        const active = item.matchPrefix ? pathname.startsWith(item.href) : pathname === item.href

        return (
          <Link
            key={item.href}
            href={item.href}
            data-testid={item.testId}
            aria-current={active ? 'page' : undefined}
            className={`flex shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-control px-3.5 py-2.5 text-[15px] transition-colors ${
              active
                ? 'bg-primary-soft font-semibold text-primary-accent'
                : 'text-body hover:bg-surface-soft hover:text-ink'
            }`}
          >
            {item.label}
            {item.href === '/inbox' && inboxCount > 0 && (
              <span data-testid="inbox-badge" className="badge badge-primary">
                {inboxCount}
              </span>
            )}
          </Link>
        )
      })}

      {me.data && (
        <div
          data-testid="current-user"
          className="mt-auto hidden flex-col gap-3 border-t border-hairline pt-4 md:flex"
        >
          <ThemeToggle />

          <div className="flex items-center gap-2 px-1">
            {/* 아바타는 외부 URL 이라 next/image 최적화를 쓰지 않는다 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={me.data.user.avatarUrl}
              alt=""
              width={28}
              height={28}
              data-testid="current-user-avatar"
              className="size-7 rounded-full bg-surface-strong"
            />
            <span data-testid="current-user-name" className="truncate text-[15px] font-medium text-ink">
              {me.data.user.username}
            </span>
          </div>

          {/* 서버 라우트가 303 으로 되돌리므로 자바스크립트 없이도 동작한다 */}
          <form action="/auth/logout" method="post">
            <button type="submit" data-testid="logout" className="btn btn-secondary btn-sm w-full">
              로그아웃
            </button>
          </form>
        </div>
      )}
    </nav>
  )
}
