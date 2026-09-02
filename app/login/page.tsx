export const metadata = { title: '로그인 · 목표 연동 칸반 투두' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="card flex w-full max-w-sm flex-col gap-6 p-8 shadow-float">
        <header className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-ink">목표 연동 칸반 투두</h1>
          <p className="t-body text-muted">
            1년 목표 · 주간 계획 · 할일을 하나로 잇습니다. 계속하려면 GitHub 로 로그인하세요.
          </p>
        </header>

        {error && (
          <p role="alert" data-testid="login-error" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {/*
          Next 의 Link 가 아니라 평범한 앵커를 쓴다. /auth/github 는 페이지가 아니라
          외부(GitHub)로 보내는 라우트 핸들러다. 클라이언트 라우터가 이를 페이지 전환으로
          처리하면 리다이렉트를 따라가지 못하고 로그인 화면으로 되돌아온다.
        */}
        <a
          href="/auth/github"
          data-testid="login-github"
          className="btn btn-primary w-full"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
          GitHub 로 로그인
        </a>

        <p className="text-xs leading-relaxed text-muted">
          처음이라면 <code className="rounded bg-surface-strong px-1 text-body">docs/LOGIN-SETUP.md</code> 를 보고
          GitHub OAuth App 을 먼저 만드세요.
        </p>
      </div>
    </div>
  )
}
