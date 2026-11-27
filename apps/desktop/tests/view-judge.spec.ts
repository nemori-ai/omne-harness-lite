import { describe, expect, it } from 'vitest'
import { judgeView, memoryStorage, viewLooks, type ViewFacts } from '../src/page/shell/view.ts'
import type { ViewAsked } from '../src/shared/view.ts'

const BUILT_IN: ViewAsked = {
  page: 'notes',
  theme: 'dark',
  size: 'medium',
  look: { kind: 'built-in' },
  width: 400,
  height: 300,
}
const PAPER: ViewAsked = { ...BUILT_IN, look: { kind: 'skin', name: 'paper' } }

const facts = (given: Partial<ViewFacts> = {}): ViewFacts => ({
  signedIn: true,
  pages: ['sessions', 'notes'],
  drawn: true,
  settled: false,
  worn: undefined,
  fellBack: false,
  ...given,
})

describe('what the drawing page says', () => {
  it('is ready once the page asked for is drawn in the look asked for, settled or not', () => {
    expect(judgeView(BUILT_IN, facts())).toBe('ready')
    expect(judgeView(PAPER, facts({ worn: 'paper', settled: true }))).toBe('ready')
  })

  it('waits while the page is not drawn yet, the login not there, or the look not on, until everything settled', () => {
    for (const given of [
      { drawn: false },
      { signedIn: false },
      { pages: ['sessions'] },
    ] satisfies Partial<ViewFacts>[])
      expect(judgeView(BUILT_IN, facts(given)), JSON.stringify(given)).toBeUndefined()
    expect(judgeView(PAPER, facts({ worn: undefined }))).toBeUndefined()
    expect(judgeView(BUILT_IN, facts({ worn: 'paper' }))).toBeUndefined()
  })

  it('says no-page once settled without the page, and no-skin once settled without the look', () => {
    expect(judgeView(BUILT_IN, facts({ settled: true, pages: ['sessions'] }))).toBe('no-page')
    expect(judgeView(PAPER, facts({ settled: true, worn: undefined }))).toBe('no-skin')
    expect(judgeView(BUILT_IN, facts({ settled: true, worn: 'paper' }))).toBe('no-skin')
  })

  it('says no-skin at once when the look could not be chosen as asked', () => {
    expect(judgeView(PAPER, facts({ fellBack: true }))).toBe('no-skin')
  })

  it('keeps waiting for the drawing when everything settled and the page and look are there', () => {
    expect(judgeView(BUILT_IN, facts({ settled: true, drawn: false }))).toBeUndefined()
  })
})

describe('what the drawing page keeps', () => {
  it('reads the look asked for for any tenant, and hears a different choice written back as a fall back', () => {
    let fell = 0
    const looks = viewLooks({ kind: 'skin', name: 'paper' }, () => (fell += 1))
    expect(looks.read('a')).toBe('{"kind":"named","name":"paper"}')
    looks.write('a', '{"kind":"named","name":"paper"}')
    expect(fell).toBe(0)
    looks.write('a', '{"kind":"none"}')
    expect(fell).toBe(1)
    expect(viewLooks({ kind: 'built-in' }, () => undefined).read('b')).toBe('{"kind":"builtin"}')
  })

  it('keeps what is written in memory only', () => {
    const store = memoryStorage()
    store.setItem('omne.visual', 'x')
    expect([store.getItem('omne.visual'), store.length, store.key(0)]).toEqual(['x', 1, 'omne.visual'])
    store.removeItem('omne.visual')
    expect(store.getItem('omne.visual')).toBeNull()
  })
})
