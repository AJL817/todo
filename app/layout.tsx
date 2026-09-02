import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: '목표 연동 칸반 투두',
  description: '1년 목표 · 주간 계획 · 할일을 하나로 잇는 칸반 투두',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">
        <Providers>
          {/* 좁은 화면에서는 가로 스크롤 메뉴, md 이상에서는 왼쪽 사이드바 */}
          <div className="flex min-h-screen flex-col md:flex-row">
            <Sidebar />
            <main className="min-w-0 flex-1 p-4 md:p-6">
              <div className="mx-auto max-w-6xl">{children}</div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
