import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LIMITS,
  parseHygieneBaseline,
  renderHygieneBaseline,
} from '../src/hygiene/baseline.ts'
import { compareToBase, readBaseBaseline, type BaseAccess } from '../src/hygiene/base.ts'
import { growthViolations, looseBaselineViolations } from '../src/hygiene/checks.ts'
import { baselineOf } from '../src/hygiene/measure.ts'
import {
  SOURCE,
  emptyBaseline,
  longFunction,
  measured,
  repeat,
} from './fixtures/hygiene/support.ts'

const open = () => false
const OTHER = 'packages/group/member/src/other.ts'
const messages = (list: readonly { message: string }[]) => list.map(v => v.message)

describe('hygiene-baseline-ratchet: loose baseline', () => {
  const sources = [
    { path: SOURCE, text: 'const a = 1\n// TODO\n' },
    { path: OTHER, text: `${repeat('void 0', 1100)}\n${longFunction('f', 200)}` },
  ]
  const current = measured({ documents: ['README.md', 'notes.md'], sources })

  it('accepts a baseline equal to the current values', () => {
    const baseline = baselineOf(current, DEFAULT_LIMITS)
    expect(looseBaselineViolations(current, baseline, open)).toEqual([])
  })

  it('reports documents that are gone or now allowed', () => {
    const baseline = emptyBaseline({ documents: ['README.md', 'gone.md', 'notes.md'] })
    const violations = looseBaselineViolations(current, baseline, open)
    expect(violations.map(v => v.path)).toEqual(['README.md', 'gone.md'])
    expect(violations.every(v => v.rule === 'hygiene-baseline-ratchet')).toBe(true)
    expect(messages(violations).every(m => m.startsWith('基线过宽，收紧到当前值'))).toBe(true)
  })

  it('reports comment entries that shrank, vanished or whose file is gone', () => {
    const baseline = emptyBaseline({
      comments: { [SOURCE]: 2, [OTHER]: 1, 'packages/x/y/src/gone.ts': 1 },
    })
    expect(looseBaselineViolations(current, baseline, open).map(v => v.path)).toEqual([
      SOURCE,
      OTHER,
      'packages/x/y/src/gone.ts',
    ])
  })

  it('reports size entries that shrank or no longer exceed the limit', () => {
    const baseline = emptyBaseline({
      sizes: {
        files: { [OTHER]: 1400, [SOURCE]: 1200 },
        functions: { [OTHER]: { count: 2, longest: 200 }, [SOURCE]: { count: 1, longest: 160 } },
      },
    })
    const violations = looseBaselineViolations(current, baseline, open)
    expect(violations.map(v => v.path)).toEqual([OTHER, SOURCE, OTHER, SOURCE])
  })

  it('treats a longest value that shrank as loose', () => {
    const baseline = emptyBaseline({
      sizes: { files: {}, functions: { [OTHER]: { count: 1, longest: 250 } } },
    })
    expect(looseBaselineViolations(current, baseline, open)).toHaveLength(1)
  })
})

describe('hygiene-baseline-ratchet: growth against the base', () => {
  const base = emptyBaseline({
    documents: ['a.md'],
    comments: { [SOURCE]: 2 },
    sizes: { files: { [SOURCE]: 1200 }, functions: { [SOURCE]: { count: 1, longest: 200 } } },
  })

  it('accepts equal and shorter baselines', () => {
    expect(growthViolations(base, base)).toEqual([])
    expect(
      growthViolations(
        emptyBaseline({ comments: { [SOURCE]: 1 }, sizes: { files: {}, functions: {} } }),
        base,
      ),
    ).toEqual([])
  })

  it('reports an added entry of every kind', () => {
    const grown = emptyBaseline({
      documents: ['a.md', 'b.md'],
      comments: { [SOURCE]: 2, [OTHER]: 1 },
      sizes: {
        files: { [SOURCE]: 1200, [OTHER]: 1100 },
        functions: { [SOURCE]: { count: 1, longest: 200 }, [OTHER]: { count: 1, longest: 151 } },
      },
    })
    const violations = growthViolations(grown, base)
    expect(messages(violations).map(m => m.split(' ')[0])).toHaveLength(4)
    expect(violations.every(v => v.path === 'tools/product-checks/hygiene-baseline.json')).toBe(
      true,
    )
  })

  it('reports a value that grew', () => {
    const grown = emptyBaseline({
      documents: ['a.md'],
      comments: { [SOURCE]: 3 },
      sizes: { files: { [SOURCE]: 1201 }, functions: { [SOURCE]: { count: 2, longest: 200 } } },
    })
    expect(growthViolations(grown, base)).toHaveLength(3)
    const longer = emptyBaseline({
      documents: ['a.md'],
      comments: { [SOURCE]: 2 },
      sizes: { files: { [SOURCE]: 1200 }, functions: { [SOURCE]: { count: 1, longest: 201 } } },
    })
    expect(growthViolations(longer, base)).toHaveLength(1)
  })

  it('reports a limit raised above the base', () => {
    const raised = { ...base, limits: { fileLines: 1001, functionLines: 151, specLines: 601 } }
    expect(growthViolations(raised, base)).toHaveLength(3)
    const lowered = { ...base, limits: { fileLines: 900, functionLines: 100, specLines: 500 } }
    expect(growthViolations(lowered, base)).toEqual([])
  })
})

describe('hygiene-baseline-ratchet: reading the base', () => {
  const text = renderHygieneBaseline(emptyBaseline({ documents: ['a.md'] }))
  const access = (shown: string | undefined, known: readonly string[]): BaseAccess => ({
    resolves: ref => known.includes(ref),
    show: () => shown,
  })

  it('takes the first candidate that resolves', () => {
    const found = readBaseBaseline([undefined, '', 'one', 'two'], access(text, ['two', 'one']))
    expect(found).toMatchObject({ status: 'found', ref: 'one' })
  })

  it('says the file is absent on the base and reports no violation', () => {
    const base = readBaseBaseline(['origin/main'], access(undefined, ['origin/main']))
    expect(base).toEqual({
      status: 'absent',
      reason: '基点 origin/main 上没有这份基线文件',
    })
    const result = compareToBase(emptyBaseline({ documents: ['z.md'] }), base)
    expect(result.violations).toEqual([])
    expect(result.note).toBe('基线只减不增 未检查（基点 origin/main 上没有这份基线文件）')
  })

  it('says the base is unreachable when no candidate resolves', () => {
    const base = readBaseBaseline([undefined, 'a', 'b'], access(text, []))
    expect(base).toMatchObject({ status: 'absent' })
    expect(compareToBase(emptyBaseline(), base).note).toContain('取不到基点')
  })

  it('compares against a found base without a note', () => {
    const base = readBaseBaseline(['one'], access(text, ['one']))
    const result = compareToBase(emptyBaseline({ documents: ['a.md', 'new.md'] }), base)
    expect(result.note).toBeUndefined()
    expect(result.violations).toHaveLength(1)
  })

  it('treats an unreadable base file as unavailable', () => {
    expect(readBaseBaseline(['one'], access('{', ['one']))).toMatchObject({ status: 'absent' })
  })
})

describe('hygiene baseline file', () => {
  const valid = emptyBaseline({
    documents: ['a.md', 'b.md'],
    comments: { 'a.ts': 1, 'b.ts': 2 },
    sizes: { files: { 'a.ts': 1100 }, functions: { 'a.ts': { count: 1, longest: 160 } } },
  })

  it('round-trips and writes keys in path order', () => {
    const rendered = renderHygieneBaseline({
      ...valid,
      documents: ['b.md', 'a.md'],
      comments: { 'b.ts': 2, 'a.ts': 1 },
    })
    expect(rendered.endsWith('\n')).toBe(true)
    expect(parseHygieneBaseline(rendered, 'x')).toEqual(valid)
    expect(rendered.indexOf('"a.ts"')).toBeLessThan(rendered.indexOf('"b.ts"'))
  })

  it.each([
    ['not json', '{'],
    ['an array', '[]'],
    ['a missing key', JSON.stringify({ limits: DEFAULT_LIMITS, documents: [] })],
    ['an unsorted document list', JSON.stringify({ ...valid, documents: ['b.md', 'a.md'] })],
    ['a bad limit', JSON.stringify({ ...valid, limits: { ...DEFAULT_LIMITS, fileLines: 'x' } })],
    ['a zero count', JSON.stringify({ ...valid, comments: { 'a.ts': 0 } })],
    ['an unsorted comment map', JSON.stringify({ ...valid, comments: { 'b.ts': 1, 'a.ts': 1 } })],
    [
      'a function entry without longest',
      JSON.stringify({ ...valid, sizes: { files: {}, functions: { 'a.ts': { count: 1 } } } }),
    ],
  ])('rejects %s instead of reading it as empty', (_, text) => {
    expect(() => parseHygieneBaseline(text, 'x.json')).toThrow(/x\.json/u)
  })
})
