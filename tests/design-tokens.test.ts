import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 디자인 시스템의 불변식을 실행 가능한 형태로 둔다.
 *
 * 여기 있는 규칙은 전부 주석으로 먼저 적어 뒀다가 깨진 것들이다. 캐스케이드와
 * 이중 정의는 눈으로 지켜지지 않는다 — 어긋나도 화면이 조금 달라질 뿐 아무것도
 * 실패하지 않기 때문이다.
 */

const root = process.cwd()
const css = fs.readFileSync(path.resolve(root, 'app/globals.css'), 'utf8')

/** `--이름: 값;` 을 모아 사전으로 만든다. @theme 매핑(var 참조)은 값이 아니므로 뺀다. */
function tokensIn(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  // noUncheckedIndexedAccess 라 캡처 그룹이 옵셔널로 잡힌다. 정규식상 항상 있지만 좁혀 준다.
  for (const match of block.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)) {
    const name = match[1]
    const value = match[2]?.trim()
    if (name === undefined || value === undefined) continue
    if (value.startsWith('var(')) continue
    out[name] = value
  }
  return out
}

/** 중괄호 짝을 세어 블록 본문만 잘라낸다. 정규식으로는 중첩을 못 센다. */
function blockAfter(marker: string): string {
  const start = css.indexOf(marker)
  expect(start, `${marker} 를 globals.css 에서 찾지 못했습니다`).toBeGreaterThan(-1)

  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(start, i)
    }
  }
  throw new Error(`${marker} 블록이 닫히지 않았습니다`)
}

/**
 * 화면 코드의 className 값만 모은다. 주석이나 산문에 든 단어는 세지 않는다.
 *
 * 줄 단위로 훑으면 안 된다. 조건부 클래스를 쓰는 곳은 템플릿 문자열이 여러 줄에
 * 걸치는데, 거기가 오히려 실수가 나기 쉬운 자리다. 실제로 줄 단위 버전은
 * Toast 의 위반을 놓치고 통과했다.
 */
function classNameUsages(): { file: string; line: number; classes: string }[] {
  const files = fs.globSync('{app,components}/**/*.tsx', { cwd: root })
  const out: { file: string; line: number; classes: string }[] = []

  for (const file of files) {
    const source = fs.readFileSync(path.resolve(root, file), 'utf8')
    for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([\s\S]*?)`\})/g)) {
      const classes = match[1] ?? match[2] ?? ''
      if (classes.trim() === '') continue
      const line = source.slice(0, match.index).split('\n').length
      out.push({ file, line, classes })
    }
  }
  return out
}

describe('디자인 토큰', () => {
  const mediaDark = tokensIn(blockAfter(':root:not([data-theme="light"])'))
  const forcedDark = tokensIn(blockAfter('[data-theme="dark"] {'))
  const light = tokensIn(blockAfter(':root {'))

  it('다크 값을 두 곳에 쓰지만 내용은 같다', () => {
    // 미디어 쿼리(시스템 설정)와 [data-theme="dark"](강제)에 같은 값을 두 번 쓴다.
    // 한쪽만 고치면 테마를 직접 고른 사용자에게만 다른 색이 나가고 아무도 모른다.
    expect(Object.keys(forcedDark).sort()).toEqual(Object.keys(mediaDark).sort())
    for (const name of Object.keys(mediaDark)) {
      expect(forcedDark[name], `--${name} 이 두 다크 블록에서 다릅니다`).toBe(mediaDark[name])
    }
  })

  it('라이트에 있는 색은 다크에도 있다', () => {
    for (const name of Object.keys(light).filter((n) => light[n]?.startsWith('#'))) {
      expect(mediaDark, `--${name} 의 다크 값이 없습니다`).toHaveProperty(name)
    }
  })

  it('강조색은 참고 문서의 Rausch 다', () => {
    // 이 값이 바뀌면 벤치마크가 아니게 된다. 바꿀 때는 의도적으로 이 테스트를 고칠 것.
    expect(light['primary']).toBe('#ff385c')
    expect(light['primary-active']).toBe('#e00b41')
    expect(light['primary-disabled']).toBe('#ffd1da')
  })

  it('활자 토큰은 utilities, 프리미티브는 components 레이어에 있다', () => {
    // 둘을 같은 레이어에 두면 font-size 명시도가 같아져 소스 순서가 승자를 정한다.
    // 실제로 그래서 `field t-caption-sm` 이 13px 이 아니라 16px 로 렌더됐다.
    const layerOf = (selector: string): string | null => {
      const at = css.indexOf(selector)
      if (at < 0) return null
      const opened = [...css.slice(0, at).matchAll(/@layer\s+([\w-]+)\s*\{/g)]
      return opened.at(-1)?.[1] ?? null
    }

    expect(layerOf('.t-display-xl')).toBe('utilities')
    expect(layerOf('.t-caption-sm')).toBe('utilities')
    expect(layerOf('.btn {')).toBe('components')
    expect(layerOf('.field {')).toBe('components')
  })

  it('활자 토큰에 굵기·행간·자간 유틸을 덧붙이지 않는다', () => {
    /*
     * `.t-*` 는 크기·굵기·행간·자간을 한꺼번에 정한다. 같은 요소에 font-medium 이나
     * leading-relaxed 를 함께 붙이면 둘 중 하나가 반드시 조용히 진다 — 어느 쪽이
     * 지는지는 레이어 순서가 정하고, 그건 눈으로 지킬 수 없다.
     *
     * 실제로 두 방향 모두 겪었다. components 에 뒀을 때는 .field 가 크기를 이겼고,
     * utilities 로 옮기니 이번엔 .t-* 가 font-medium 을 이겨 굵기가 사라졌다.
     *
     * 다른 굵기가 필요하면 그 값을 가진 문서 토큰으로 간다. 문서에 없는 조합
     * (13/500, 14/600 …)을 만들면 그 순간 벤치마크가 아니게 된다.
     */
    const MODIFIER =
      /\b(?:font-(?:thin|light|normal|medium|semibold|bold|extrabold|black)|leading-[a-z]+|tracking-[a-z]+)\b/
    const TOKEN =
      /\bt-(?:rating|display-xl|display-lg|display-sm|title-md|title-sm|body-md|body-sm|caption|caption-sm|micro-label|link|nav-link)\b/

    const usages = classNameUsages()
    expect(usages.length, 'className 을 하나도 찾지 못했습니다').toBeGreaterThan(50)

    const offenders = usages
      .filter((u) => TOKEN.test(u.classes) && MODIFIER.test(u.classes))
      .map((u) => `${u.file}:${u.line}  ${u.classes.trim()}`)

    expect(offenders, `활자 토큰과 수식자가 함께 쓰였습니다:\n  ${offenders.join('\n  ')}`).toEqual([])
  })

  it('화면 코드에 숫자 팔레트와 임의 크기를 쓰지 않는다', () => {
    // 토큰 이름을 쓰면 다크가 따라오지만 숫자를 쓰면 그 자리에서만 깨진다.
    const RAW =
      /\b(?:(?:bg|text|border|ring|from|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|(?:bg|text|border|ring)-(?:white|black)|text-\[\d+px\]|text-(?:xs|sm|base|lg|xl|2xl|3xl))\b/

    const offenders = classNameUsages()
      .filter((u) => RAW.test(u.classes))
      // 모달 스크림만 예외다. 참고 문서가 검은색 50% 로 못 박아 둔 값이다.
      .filter((u) => !u.classes.includes('bg-black/50'))
      .map((u) => `${u.file}:${u.line}  ${u.classes.trim()}`)

    expect(offenders, `토큰 대신 원시 값을 썼습니다:\n  ${offenders.join('\n  ')}`).toEqual([])
  })
})
