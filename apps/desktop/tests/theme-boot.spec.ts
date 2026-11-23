import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  createSizeController,
  resolveTheme,
  type SizeRoot,
  type ThemeChoice,
} from '@omne-harness/ui-kit'
import { CONTENT_SECURITY_POLICY } from '../src/shared/page-policy.ts'
import { SIZE_KEY, bindSizeKeys, storedSizePreference } from '../src/page/shell/size.ts'
import { THEME_KEY, storedThemePreference } from '../src/page/shell/theme.ts'
import { TOKENS_KEY, dropBootTokens, storedTokens } from '../src/page/shell/boot-tokens.ts'

// The query the theme controller follows (`colorSchemeQuery` in the shared interface kit).
const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'

const PAGE = join(import.meta.dirname, '..', 'src', 'page')
const source = readFileSync(join(PAGE, 'public', 'theme-boot.js'), 'utf8')

type Stored = Readonly<Record<string, string | null>> | 'throws'

/** Runs the boot script against a stand-in `window` and `document`; gives what it set on the root. */
function run(stored: Stored, systemDark: boolean | 'none'): { theme?: string; size?: string } {
  const dataset: { theme?: string; size?: string } = {}
  const queries: string[] = []
  const window = {
    localStorage: {
      getItem(key: string) {
        if (stored === 'throws') throw new Error('blocked')
        return stored[key] ?? null
      },
    },
    ...(systemDark === 'none'
      ? {}
      : { matchMedia: (query: string) => (queries.push(query), { matches: systemDark }) }),
  }
  new Function('window', 'document', source)(window, { documentElement: { dataset } })
  for (const query of queries) expect(query).toBe(COLOR_SCHEME_QUERY)
  return dataset
}

function boot(stored: string | null | 'throws', systemDark: boolean | 'none'): string | undefined {
  return run(stored === 'throws' ? stored : { [THEME_KEY]: stored }, systemDark).theme
}

const holding = (key: string, value: string | null) => () => ({
  getItem: (asked: string) => (asked === key ? value : null),
  setItem: () => {},
})

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

describe('首帧之前的字号档', () => {
  it('和字号档控制器得出同一档：存的每种取值，两处读同一个键', () => {
    for (const stored of ['small', 'medium', 'large', 'reading', 'nonsense', '', null]) {
      const root: SizeRoot = { dataset: {} }
      createSizeController({ ...storedSizePreference(holding(SIZE_KEY, stored)), root })
      expect(run({ [SIZE_KEY]: stored }, false).size, String(stored)).toBe(root.dataset.size)
    }
  })

  it('读不到存的字号档时是中楷：两处都不写 data-size', () => {
    expect('size' in run('throws', false)).toBe(false)
    const root: SizeRoot = { dataset: {} }
    const blocked = () => {
      throw new Error('blocked')
    }
    createSizeController({ ...storedSizePreference(blocked), root })
    expect('size' in root.dataset).toBe(false)
  })
})

describe('字号档的按键', () => {
  function keys(platform: 'mac' | 'other') {
    let listener: ((event: KeyboardEvent) => void) | undefined
    const target = {
      addEventListener: (_type: 'keydown', added: (event: KeyboardEvent) => void) => {
        listener = added
      },
      removeEventListener: () => {
        listener = undefined
      },
    }
    const written: string[] = []
    const size = createSizeController({
      read: () => null,
      write: tier => void written.push(tier),
      root: { dataset: {} },
    })
    const unbind = bindSizeKeys(target, size, platform)
    const press = (key: string, modifiers: { metaKey?: boolean; ctrlKey?: boolean }) => {
      const preventDefault = vi.fn()
      listener?.({
        key,
        metaKey: modifiers.metaKey ?? false,
        ctrlKey: modifiers.ctrlKey ?? false,
        preventDefault,
      } as unknown as KeyboardEvent)
      return preventDefault.mock.calls.length > 0
    }
    return { size, written, press, unbind }
  }

  it('Command 加 = - 0 在 macOS 上一档一档调，并拦下缺省的动作', () => {
    const { size, written, press } = keys('mac')
    expect(press('=', { metaKey: true })).toBe(true)
    expect(press('+', { metaKey: true })).toBe(true)
    expect(press('=', { metaKey: true })).toBe(true)
    expect(size.current()).toBe('reading')
    expect(press('-', { metaKey: true })).toBe(true)
    expect(size.current()).toBe('large')
    expect(press('0', { metaKey: true })).toBe(true)
    expect(size.current()).toBe('medium')
    expect(written).toEqual(['large', 'reading', 'reading', 'large', 'medium'])
  })

  it('别的平台用 Control；别的键不动字号档，也不拦缺省的动作；解开之后不再听', () => {
    const { size, press, unbind } = keys('other')
    expect(press('=', { metaKey: true })).toBe(false)
    expect(press('a', { ctrlKey: true })).toBe(false)
    expect(size.current()).toBe('medium')
    expect(press('_', { ctrlKey: true })).toBe(true)
    expect(size.current()).toBe('small')
    unbind()
    expect(press('=', { ctrlKey: true })).toBe(false)
    expect(size.current()).toBe('small')
  })
})

describe('首帧之前整个应用的令牌', () => {
  /** Runs the boot script with what is stored under the tokens key; gives what it wrote on the root. */
  function tinted(stored: string | null | 'throws') {
    const written = new Map<string, string>()
    const dataset: Record<string, string> = {}
    const window = {
      localStorage: {
        getItem(key: string) {
          if (stored === 'throws') throw new Error('blocked')
          return key === TOKENS_KEY ? stored : null
        },
      },
    }
    const style = { setProperty: (name: string, value: string) => void written.set(name, value) }
    new Function('window', 'document', source)(window, { documentElement: { dataset, style } })
    return { written: Object.fromEntries(written), names: dataset['bootTokens'] }
  }

  it('存着的令牌在首帧之前写到根上，并记下写了哪几个', () => {
    const stored = JSON.stringify({
      '--omne-accent': '#0a7a4a',
      '--omne-surface': 'oklch(98% 0.01 90)',
    })
    expect(tinted(stored)).toEqual({
      written: { '--omne-accent': '#0a7a4a', '--omne-surface': 'oklch(98% 0.01 90)' },
      names: '--omne-accent --omne-surface',
    })
  })

  it.each([
    ['没有存', null],
    ['读不到', 'throws'],
    ['不是 JSON', '{ not json'],
    ['不是对象', '["--omne-accent"]'],
    ['是空的', '{}'],
  ] as const)('%s时什么都不写', (_name, stored) => {
    expect(tinted(stored)).toEqual({ written: {}, names: undefined })
  })

  it('名字不是界面令牌的样子、值不是文字或带着不许有的写法的，那一个不写，别的照写', () => {
    const stored = JSON.stringify({
      '--omne-accent': '#0a7a4a',
      '--kami-ink': '#000',
      color: 'red',
      '--omne-surface': 'url(https://example.com/x.png)',
      '--omne-radius-control': 4,
      '--omne-line': 'red; background: blue',
      '--omne-shadow': '',
    })
    expect(tinted(stored)).toEqual({
      written: { '--omne-accent': '#0a7a4a' },
      names: '--omne-accent',
    })
  })
})

describe('整个应用的令牌存到下一次冷启动', () => {
  function store(initial: Record<string, string> = {}) {
    const held = new Map(Object.entries(initial))
    return {
      held,
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => void held.set(key, value),
      removeItem: (key: string) => void held.delete(key),
    }
  }

  it('有令牌时存成一段 JSON，没有时把这个键去掉；存的东西首帧脚本读得回来', () => {
    const local = store()
    const kept = storedTokens(() => local)
    kept.write({ '--omne-accent': '#0a7a4a' })
    expect(local.held.get(TOKENS_KEY)).toBe('{"--omne-accent":"#0a7a4a"}')
    kept.write({})
    expect(local.held.has(TOKENS_KEY)).toBe(false)
  })

  it('存不进去时不抛出', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    expect(() => storedTokens(blocked).write({ '--omne-accent': '#0a7a4a' })).not.toThrow()
  })

  it('样式表接手之后，把首帧脚本写在根上的那几个去掉，别的不动', () => {
    const removed: string[] = []
    const root = {
      dataset: { bootTokens: '--omne-accent --omne-surface', theme: 'dark' } as Record<
        string,
        string
      >,
      style: { removeProperty: (name: string) => void removed.push(name) },
    }
    dropBootTokens(root)
    expect(removed).toEqual(['--omne-accent', '--omne-surface'])
    expect(root.dataset).toEqual({ theme: 'dark' })
    dropBootTokens(root)
    expect(removed).toHaveLength(2)
  })
})
