'use client'

import { useEffect, useState } from 'react'
import { applyTheme, isTheme, THEME_STORAGE_KEY, type Theme } from '@/lib/theme'

const OPTIONS: { value: Theme; label: string; title: string }[] = [
  { value: 'system', label: '시스템', title: '기기 설정을 따릅니다' },
  { value: 'light', label: '라이트', title: '항상 밝게' },
  { value: 'dark', label: '다크', title: '항상 어둡게' },
]

export function ThemeToggle() {
  // 서버에는 이 사람의 선택을 알 방법이 없다. 첫 렌더는 'system' 으로 두고
  // 마운트 후 실제 값으로 맞춘다. 화면 색 자체는 head 스크립트가 이미 확정해 둬서
  // 여기서 늦게 맞춰도 깜빡이지 않는다.
  const [theme, setTheme] = useState<Theme>('system')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      if (isTheme(stored)) setTheme(stored)
    } catch {
      // 사이트 데이터가 막힌 브라우저. 시스템 설정으로 두면 된다.
    }
  }, [])

  function choose(next: Theme) {
    setTheme(next)
    applyTheme(next)
    try {
      if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
      else localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // 저장만 실패한다. 이번 세션에는 선택이 반영돼 있다.
    }
  }

  return (
    <div
      data-testid="theme-toggle"
      role="radiogroup"
      aria-label="화면 테마"
      className="flex rounded-control border border-hairline p-0.5"
    >
      {OPTIONS.map((option) => {
        const selected = theme === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            data-testid={`theme-${option.value}`}
            onClick={() => choose(option.value)}
            className={`flex-1 rounded-[6px] px-2 py-1 text-[11px] font-medium transition-colors ${
              selected ? 'bg-primary text-on-primary' : 'text-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
