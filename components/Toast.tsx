'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * 낙관적 갱신이 실패해 롤백됐을 때 사용자에게 알리는 최소 장치 (PRD P0).
 * 롤백은 조용히 일어나면 안 된다. 화면이 되돌아간 이유를 알려 줘야 한다.
 */

interface ToastMessage {
  id: number
  text: string
  tone: 'error' | 'info'
}

interface ToastApi {
  showError: (text: string) => void
  showInfo: (text: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([])

  const push = useCallback((text: string, tone: ToastMessage['tone']) => {
    const id = Date.now() + Math.random()
    setMessages((current) => [...current, { id, text, tone }])
    setTimeout(() => {
      setMessages((current) => current.filter((message) => message.id !== id))
    }, 5000)
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      showError: (text) => push(text, 'error'),
      showInfo: (text) => push(text, 'info'),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2" data-testid="toasts">
        {messages.map((message) => (
          <div
            key={message.id}
            role="alert"
            data-testid={message.tone === 'error' ? 'toast-error' : 'toast-info'}
            className={`pointer-events-auto rounded-control px-4 py-2.5 t-caption shadow-float ${
              message.tone === 'error' ? 'bg-danger text-canvas' : 'bg-ink text-canvas'
            }`}
          >
            {message.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast 는 ToastProvider 안에서만 쓸 수 있습니다')
  return context
}
