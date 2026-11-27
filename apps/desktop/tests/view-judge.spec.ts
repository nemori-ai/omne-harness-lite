import { describe, expect, it } from 'vitest'
import { judgeView, memoryStorage, viewLooks, type ViewFacts } from '../src/page/shell/view.ts'
import type { ViewAsked } from '../src/shared/view.ts'

const BUILT_IN: ViewAsked = {
  tenant:
    '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}',
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
  it('is ready once everything settled and the page asked for is at rest in the look asked for', () => {
    expect(judgeView(BUILT_IN, facts({ settled: true }))).toBe('ready')
    expect(judgeView(PAPER, facts({ worn: 'paper', settled: true }))).toBe('ready')
  })

  it('says nothing before everything settled, though the page is there and at rest', () => {
    for (const given of [
      {},
      { pages: ['sessions'] },
      { worn: 'paper' },
    ] satisfies Partial<ViewFacts>[])
      expect(judgeView(BUILT_IN, facts(given)), JSON.stringify(given)).toBeUndefined()
  })

  it('waits while the page is not at rest or the login not there', () => {
    for (const given of [{ drawn: false }, { signedIn: false }] satisfies Partial<ViewFacts>[])
      expect(
        judgeView(BUILT_IN, facts({ settled: true, ...given })),
        JSON.stringify(given),
      ).toBeUndefined()
  })

  it('says no-page once settled without the page, and no-skin once settled without the look', () => {
    expect(judgeView(BUILT_IN, facts({ settled: true, pages: ['sessions'] }))).toBe('no-page')
    expect(judgeView(PAPER, facts({ settled: true, worn: undefined }))).toBe('no-skin')
    expect(judgeView(BUILT_IN, facts({ settled: true, worn: 'paper' }))).toBe('no-skin')
  })

  it('says no-skin at once when the look could not be chosen as asked', () => {
    expect(judgeView(PAPER, facts({ fellBack: true }))).toBe('no-skin')
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
    expect([store.getItem('omne.visual'), store.length, store.key(0)]).toEqual([
      'x',
      1,
      'omne.visual',
    ])
    store.removeItem('omne.visual')
    expect(store.getItem('omne.visual')).toBeNull()
  })
})
