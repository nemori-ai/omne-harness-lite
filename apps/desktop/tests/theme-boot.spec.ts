import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveTheme, type ThemeChoice } from '@omne-harness/ui-kit'
import { CONTENT_SECURITY_POLICY } from '../src/shared/page-policy.ts'
import { THEME_KEY, storedThemePreference } from '../src/page/shell/theme.ts'

// The query the theme controller follows (`colorSchemeQuery` in the shared interface kit).
const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'

const PAGE = join(import.meta.dirname, '..', 'src', 'page')
const source = readFileSync(join(PAGE, 'public', 'theme-boot.js'), 'utf8')

/** Runs the boot script against a stand-in `window` and `document`; gives the theme it set. */
function boot(stored: string | null | 'throws', systemDark: boolean | 'none'): string | undefined {
  const dataset: { theme?: string } = {}
  const queries: string[] = []
  const window = {
    localStorage: {
      getItem(key: string) {
        if (stored === 'throws') throw new Error('blocked')
        return key === THEME_KEY ? stored : null
      },
    },
    ...(systemDark === 'none'
      ? {}
      : { matchMedia: (query: string) => (queries.push(query), { matches: systemDark }) }),
  }
  new Function('window', 'document', source)(window, { documentElement: { dataset } })
  for (const query of queries) expect(query).toBe(COLOR_SCHEME_QUERY)
  return dataset.theme
}

describe('首帧之前的主题', () => {
  it('和主题控制器得出同一个主题：存的每种取值乘以系统的明暗', () => {
    for (const stored of ['light', 'dark', 'system', 'nonsense', null] as const)
      for (const systemDark of [true, false]) {
        const choice: ThemeChoice = storedThemePreference(() => ({
          getItem: () => stored,
          setItem: () => {},
        })).read()
        expect(boot(stored, systemDark), `${stored} ${systemDark}`).toBe(
          resolveTheme(choice, systemDark),
        )
      }
  })

  it('读不到存的偏好时跟随系统；没有系统查询时是浅色', () => {
    expect(boot('throws', true)).toBe('dark')
    expect(boot('throws', false)).toBe('light')
    expect(boot(null, 'none')).toBe('light')
  })

  it('页面在入口脚本之前装入它，它是同源的外部脚本，内容安全策略不为它放宽', () => {
    const html = readFileSync(join(PAGE, 'index.html'), 'utf8')
    const bootAt = html.indexOf('<script src="/theme-boot.js"></script>')
    expect(bootAt).toBeGreaterThan(0)
    expect(bootAt).toBeLessThan(html.indexOf('type="module"'))
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'")
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-inline')
  })
})
