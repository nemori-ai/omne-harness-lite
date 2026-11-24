import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string =>
  readFileSync(join(import.meta.dirname, '../src', path), 'utf8')
const TOKENS = read('styles/tokens.css')
const BASE = read('styles/base.css')
const HIGHLIGHT = read('prose/code-highlight.ts')

const DEFAULTS: Readonly<Record<string, string>> = {
  '--omne-scrollbar-thumb-rest': 'color-mix(in srgb, var(--omne-ink-faint) 27%, transparent)',
  '--omne-scrollbar-thumb-active': 'color-mix(in srgb, var(--omne-ink-faint) 48%, transparent)',
  '--omne-selection': 'var(--omne-accent)',
  '--omne-selection-ink': 'var(--omne-accent-ink)',
  '--omne-code-surface': 'var(--omne-surface-panel-soft)',
  '--omne-code-ink': 'var(--omne-ink-primary)',
  '--omne-code-keyword': 'var(--omne-info-ink)',
  '--omne-code-literal': 'var(--omne-caution-ink)',
  '--omne-code-comment': 'var(--omne-ink-faint)',
}

describe('the colours a theme may set on their own: the scrollbar, the selection, the code', () => {
  it.each(Object.entries(DEFAULTS))(
    '%s is a token of the root, and by default it is what the interface showed before it had a name',
    (name, value) => {
      const written = TOKENS.split('\n').filter(line => line.trim().startsWith(`${name}:`))
      expect(written.map(line => line.trim())).toEqual([`${name}: ${value};`])
    },
  )

  it('the selection, the scrollbar and the code read these tokens, not the colours they default to', () => {
    expect(BASE).toContain('background: var(--omne-selection);')
    expect(BASE).toContain('color: var(--omne-selection-ink);')
    expect(BASE).toContain('--omne-scrollbar-thumb: var(--omne-scrollbar-thumb-rest);')
    expect(BASE).toContain('--omne-scrollbar-thumb: var(--omne-scrollbar-thumb-active);')
    for (const name of ['surface', 'ink', 'keyword', 'literal', 'comment'])
      expect(HIGHLIGHT).toContain(`var(--omne-code-${name})`)
    expect(HIGHLIGHT).not.toMatch(/var\(--omne-(info-ink|caution-ink|ink-faint|ink-primary)\)/u)
  })
})
