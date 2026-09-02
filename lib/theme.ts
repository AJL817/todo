/**
 * 테마 선택.
 *
 * 세 가지 상태다. 'system' 은 값을 지우는 것이고, 나머지 둘은 html 에
 * data-theme 을 박아 시스템 설정을 덮는다. globals.css 가 그 속성을 보고 색을 바꾼다.
 *
 * 저장은 localStorage 다. 서버에 둘 만한 정보가 아니고, 기기마다 다를 수 있다.
 */

export const THEME_STORAGE_KEY = 'todo-theme'

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

/** html 요소에 선택을 반영한다. 'system' 이면 속성을 지워 미디어 쿼리에 맡긴다. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

/**
 * <head> 에서 동기적으로 도는 스크립트.
 *
 * React 가 붙기 전에 실행돼야 첫 페인트부터 올바른 색이 나온다. 그래서 위 함수들을
 * 재사용하지 못하고 문자열로 따로 둔다 — 번들이 로드되기 전이기 때문이다.
 *
 * localStorage 접근은 try 로 감싼다. 시크릿 모드나 사이트 데이터 차단 설정에서는
 * 읽기 자체가 예외를 던지는데, 그러면 페이지가 통째로 하얗게 죽는다.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`
