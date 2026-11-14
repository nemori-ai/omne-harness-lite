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

  it('says that the file is gone for every entry of a source that no longer exists', () => {
    const GONE = 'packages/x/y/src/gone.ts'
    const baseline = emptyBaseline({
      comments: { [GONE]: 1 },
      sizes: { files: { [GONE]: 1200 }, functions: { [GONE]: { count: 1, longest: 160 } } },
    })
    expect(messages(looseBaselineViolations(current, baseline, open))).toEqual([
      '基线过宽，收紧到当前值（文件已不存在）',
      '基线过宽，收紧到当前值（文件已不存在）',
      '基线过宽，收紧到当前值（文件已不存在）',
    ])
  })

  it('says what shrank for an entry whose source still exists', () => {
    const baseline = emptyBaseline({
      comments: { [OTHER]: 1 },
      sizes: { files: { [SOURCE]: 1200 }, functions: { [SOURCE]: { count: 1, longest: 160 } } },
    })
    expect(messages(looseBaselineViolations(current, baseline, open))).toEqual([
      '基线过宽，收紧到当前值（注释违例 1 条，现 0 条）',
      '基线过宽，收紧到当前值（已不超 1000 行）',
      '基线过宽，收紧到当前值（已无超过 150 行的函数）',
    ])
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

  const withLimits = (limits: unknown) => JSON.stringify({ ...valid, limits })
  const withFunctions = (entry: unknown) =>
    JSON.stringify({ ...valid, sizes: { files: {}, functions: { 'a.ts': entry } } })

  it.each([
    ['not json', '{', 'x.json：'],
    ['an array', '[]', '基线 须为对象'],
    ['null', 'null', '基线 须为对象'],
    [
      'a missing key',
      JSON.stringify({ limits: DEFAULT_LIMITS, documents: [] }),
      '基线 的键须恰为 comments、documents、limits、sizes',
    ],
    [
      'a misspelt key',
      JSON.stringify({
        limits: valid.limits,
        documents: valid.documents,
        comments: valid.comments,
        size: valid.sizes,
      }),
      '基线 的键须恰为 comments、documents、limits、sizes',
    ],
    ['limits that are not an object', withLimits(3), 'limits 须为对象'],
    [
      'limits with another key',
      withLimits({ ...DEFAULT_LIMITS, extra: 1 }),
      'limits 的键须恰为 fileLines、functionLines、specLines',
    ],
    [
      'a bad limit',
      withLimits({ ...DEFAULT_LIMITS, fileLines: 'x' }),
      'limits.fileLines 须为正整数',
    ],
    [
      'a fractional limit',
      withLimits({ ...DEFAULT_LIMITS, functionLines: 1.5 }),
      'limits.functionLines 须为正整数',
    ],
    [
      'a zero limit',
      withLimits({ ...DEFAULT_LIMITS, specLines: 0 }),
      'limits.specLines 须为正整数',
    ],
    [
      'documents that are not a list',
      JSON.stringify({ ...valid, documents: {} }),
      'documents 须为字符串数组',
    ],
    [
      'a document that is not a string',
      JSON.stringify({ ...valid, documents: ['a.md', 1] }),
      'documents 须为字符串数组',
    ],
    [
      'an unsorted document list',
      JSON.stringify({ ...valid, documents: ['b.md', 'a.md'] }),
      'documents 须按路径字典序排列且不重复',
    ],
    [
      'a repeated document',
      JSON.stringify({ ...valid, documents: ['a.md', 'a.md'] }),
      'documents 须按路径字典序排列且不重复',
    ],
    [
      'comments that are not an object',
      JSON.stringify({ ...valid, comments: [] }),
      'comments 须为对象',
    ],
    [
      'a zero count',
      JSON.stringify({ ...valid, comments: { 'a.ts': 0 } }),
      'comments[a.ts] 须为正整数',
    ],
    [
      'an unsorted comment map',
      JSON.stringify({ ...valid, comments: { 'b.ts': 1, 'a.ts': 1 } }),
      'comments 的键须按路径字典序排列且不重复',
    ],
    [
      'sizes with another key',
      JSON.stringify({ ...valid, sizes: { files: {}, functions: {}, extra: {} } }),
      'sizes 的键须恰为 files、functions',
    ],
    [
      'a file size that is not a count',
      JSON.stringify({ ...valid, sizes: { files: { 'a.ts': '1100' }, functions: {} } }),
      'sizes.files[a.ts] 须为正整数',
    ],
    ['a function entry that is not an object', withFunctions(3), 'sizes.functions[a.ts] 须为对象'],
    [
      'a function entry without longest',
      withFunctions({ count: 1 }),
      'sizes.functions[a.ts] 的键须恰为 count、longest',
    ],
    [
      'a function entry with a zero count',
      withFunctions({ count: 0, longest: 160 }),
      'sizes.functions[a.ts].count 须为正整数',
    ],
    [
      'a function entry with a zero longest',
      withFunctions({ count: 1, longest: 0 }),
      'sizes.functions[a.ts].longest 须为正整数',
    ],
  ])('rejects %s instead of reading it as empty, and says why', (_, text, reason) => {
    expect(() => parseHygieneBaseline(text, 'x.json')).toThrow('x.json：')
    expect(() => parseHygieneBaseline(text, 'x.json')).toThrow(reason)
  })

  it('keeps the original error as the cause', () => {
    let caught: unknown
    try {
      parseHygieneBaseline('[]', 'x.json')
    } catch (error) {
      caught = error
    }
    expect((caught as Error).cause).toBeInstanceOf(Error)
  })
})
