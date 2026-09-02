import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Inter } from 'next/font/google'
import { Sidebar } from '@/components/Sidebar'
import { THEME_INIT_SCRIPT } from '@/lib/theme'
import { Providers } from './providers'
import './globals.css'

/*
 * Airbnb Cereal 은 라이선스 폰트라 쓸 수 없다. 참고 문서가 지목한 대체재가 Inter 다.
 * 한글 글리프는 Inter 에 없으므로 시스템 한글 폰트로 폴백된다 (globals.css 의 --font-sans).
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: '목표 연동 칸반 투두',
  description: '1년 목표 · 주간 계획 · 할일을 하나로 잇는 칸반 투두',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={inter.variable} suppressHydrationWarning>
      <head>
        {/*
          첫 페인트 전에 테마를 확정한다. React 가 붙기를 기다리면 다크 사용자에게
          흰 화면이 한 번 번쩍인다.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <Providers>
          {/* 좁은 화면에서는 가로 스크롤 메뉴, md 이상에서는 왼쪽 사이드바 */}
          <div className="flex min-h-screen flex-col md:flex-row">
            <Sidebar />
            <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-10">
              <div className="mx-auto max-w-5xl">{children}</div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
