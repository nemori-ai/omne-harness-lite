import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ANY,
  compileQuery,
  documentRow,
  documentsOf,
  kindMarker,
  matchEntry,
  planAdmits,
  visibilityMarker,
  type CompiledQuery,
  type GramPlan,
  type SearchQuery,
} from '../src/index.ts'
import {
  ALPHABET,
  LIMITS,
  entryOf,
  literals,
  queryOf,
  random,
  randomText,
  regex,
} from './support.ts'

function compiled(query: SearchQuery): CompiledQuery {
  const answer = compileQuery(query, LIMITS)
  if (typeof answer === 'string') throw new Error(`refused: ${answer}`)
  return answer
}
const gram = (text: string): GramPlan => ({ kind: 'gram', gram: text })
const all = (...of: GramPlan[]): GramPlan => ({ kind: 'and', of })
const one = (...of: GramPlan[]): GramPlan => ({ kind: 'or', of })
const everyKind = [
  'message.user',
  'message.assistant',
  'message.tool',
  'message.system_reminder',
  'message.tool_internal',
  'message.compaction',
] as const
// With every kind named and any visibility there is no filter: the plan is the content plan.
const contentPlan = (content: SearchQuery['content']): GramPlan =>
  compiled(queryOf({ content, kinds: everyKind })).plan

describe('the plan of a query: what the index is asked for', () => {
  it.each([
    ['three code points', literals(['abc']), gram('abc')],
    ['more than three: every trigram', literals(['abcd']), all(gram('abc'), gram('bcd'))],
    ['folded, sensitive or not', literals(['ABc'], true), gram('abc')],
    [
      'two code points: left to the vocabulary of the index',
      literals(['受理']),
      { kind: 'short', prefix: '受理' },
    ],
    ['one code point: nothing to narrow with', literals(['理']), ANY],
    [
      'several literals: all of them',
      literals(['abc', '受理']),
      all(gram('abc'), { kind: 'short', prefix: '受理' }),
    ],
    [
      'a literal that cannot narrow drops out of a conjunction',
      literals(['abc', 'x']),
      gram('abc'),
    ],
    ['an astral code point counts as one', literals(['a😀b']), gram('a😀b')],
    [
      'a trigram with a reserved code point is not asked for',
      literals(['ab\u0002cde']),
      gram('cde'),
    ],
    [
      'a pattern with required literals',
      regex('受理.*预算'),
      all({ kind: 'short', prefix: '受理' }, { kind: 'short', prefix: '预算' }),
    ],
    [
      'an alternation',
      regex('(foo|bar)baz', true),
      all(one(gram('foo'), gram('bar')), gram('baz')),
    ],
    ['an alternation with a branch that cannot narrow', regex('(foo|.)baz', true), gram('baz')],
    [
      'a pattern without case: the literals of the sensitive one, folded',
      regex('Hello'),
      all(gram('hel'), gram('ell'), gram('llo')),
    ],
    ['a pattern with no literal', regex('[0-9]+\\s[0-9]+'), ANY],
    ['a pattern that sets its own case flag', regex('(?i)Hello', true), ANY],
  ] as const)('%s', (_label, content, plan) => {
    expect(contentPlan(content)).toEqual(plan)
  })

  it('keeps a bounded number of trigrams of a long literal, spread over it', () => {
    const long = Array.from({ length: 200 }, (_, at) => String.fromCodePoint(0x4e00 + at)).join('')
    const plan = contentPlan(literals([long]))
    if (plan.kind !== 'and') throw new Error(plan.kind)
    expect(plan.of).toHaveLength(LIMITS.maxGramsPerLiteral)
    const grams = plan.of.map(part => (part.kind === 'gram' ? part.gram : ''))
    expect(grams[0]).toBe(long.slice(0, 3))
    expect(long.indexOf(grams.at(-1)!)).toBeGreaterThan(150)
  })

  it('gives up narrowing by an alternation of too many branches', () => {
    // Each branch starts with its own code point: the engine factors a shared prefix out.
    const branches = Array.from({ length: LIMITS.maxAlternatives + 1 }, (_, at) =>
      String.fromCodePoint(0x4e00 + at).repeat(3),
    )
    expect(contentPlan(regex(branches.join('|'), true))).toEqual(ANY)
    expect(contentPlan(regex(branches.slice(1).join('|'), true)).kind).toBe('or')
  })

  it('flattens an alternation inside an alternation, and keeps exactly the trigrams the limit allows', () => {
    expect(contentPlan(regex('(foo|(bar|qux))baz', true))).toEqual(
      all(one(gram('foo'), gram('bar'), gram('qux')), gram('baz')),
    )
    const plan = contentPlan(literals(['abcdefghijklmnopqr']))
    if (plan.kind !== 'and') throw new Error(plan.kind)
    expect(plan.of).toHaveLength(LIMITS.maxGramsPerLiteral)
  })

  it('finds the first of several literals, and refuses a window only when both ends are given', () => {
    const entry = entryOf('message.user', [{ text: 'bb then aa' }])
    const query = compiled(queryOf({ content: literals(['aa', 'bb']) }))
    expect(matchEntry(query, entry)?.span).toEqual({ start: 0, end: 2 })
    expect(typeof compileQuery(queryOf({ content: literals(['abc']), from: 9 }), LIMITS)).toBe(
      'object',
    )
    expect(typeof compileQuery(queryOf({ content: literals(['abc']), to: 0 }), LIMITS)).toBe(
      'object',
    )
    expect(contentPlan(regex('(foo|x)baz', true))).toEqual(gram('baz'))
  })

  it('adds the filters as markers: the kinds asked for, and model-readable only when asked', () => {
    const content = literals(['abc'])
    expect(compiled(queryOf({ content })).plan).toEqual(
      all(
        gram('abc'),
        one(
          gram(kindMarker('message.user')),
          gram(kindMarker('message.assistant')),
          gram(kindMarker('message.tool')),
          gram(kindMarker('message.system_reminder')),
        ),
      ),
    )
    expect(
      compiled(queryOf({ content, kinds: ['message.user'], modelReadable: 'only' })).plan,
    ).toEqual(all(gram('abc'), gram(kindMarker('message.user')), gram(visibilityMarker('model'))))
    expect(compiled(queryOf({ content: literals(['x']), kinds: everyKind })).plan).toEqual(ANY)
  })
})

describe('what a query is refused for', () => {
  it.each([
    ['no literal', queryOf({ content: literals([]) }), 'empty-literal'],
    ['an empty literal', queryOf({ content: literals(['abc', '']) }), 'empty-literal'],
    [
      'too many literals',
      queryOf({ content: literals(Array.from({ length: 9 }, () => 'abc')) }),
      'too-many-literals',
    ],
    ['a literal too long', queryOf({ content: literals(['a'.repeat(257)]) }), 'literal-too-long'],
    ['a pattern too long', queryOf({ content: regex('a'.repeat(513)) }), 'pattern-too-long'],
    ['a pattern that does not parse', queryOf({ content: regex('(') }), 'pattern-invalid'],
    ['a backreference', queryOf({ content: regex('(a)\\1') }), 'pattern-invalid'],
    ['a lookahead', queryOf({ content: regex('a(?=b)') }), 'pattern-invalid'],
    [
      'a pattern whose program is too large',
      queryOf({ content: regex('(abcdefghij){900}') }),
      'pattern-too-large',
    ],
    [
      'too many sessions',
      queryOf({
        content: literals(['abc']),
        scope: {
          kind: 'sessions',
          sessions: Array.from({ length: 65 }, (_, at) => `s${String(at)}`) as never,
        },
      }),
      'too-many-sessions',
    ],
    [
      'a kind that cannot be searched',
      queryOf({ content: literals(['abc']), kinds: ['message.delivered' as never] }),
      'kind-unknown',
    ],
    [
      'a window that ends before it starts',
      queryOf({ content: literals(['abc']), from: 5, to: 4 }),
      'window-invalid',
    ],
    [
      'a window that is not a time',
      queryOf({ content: literals(['abc']), from: -1 }),
      'window-invalid',
    ],
  ] as const)('%s', (_label, query, refusal) => {
    expect(compileQuery(query, LIMITS)).toBe(refusal)
  })

  it('admits the largest of each: the limits are inclusive', () => {
    const sessions = Array.from({ length: 64 }, (_, at) => `s${String(at)}`) as never
    for (const query of [
      queryOf({ content: literals(Array.from({ length: 8 }, () => 'a'.repeat(256))) }),
      queryOf({ content: regex('a'.repeat(512)) }),
      queryOf({ content: literals(['abc']), scope: { kind: 'sessions', sessions } }),
      queryOf({ content: literals(['abc']), from: 4, to: 4 }),
    ])
      expect(typeof compileQuery(query, LIMITS)).toBe('object')
  })
})

describe('the match of a query in an entry', () => {
  const entry = entryOf('message.assistant', [
    { text: 'first Block' },
    { text: 'hidden NEEDLE', toModel: false },
    { text: 'the needle is here, needle' },
  ])

  it('is the first matching block and the first match in it: one hit for an entry', () => {
    const match = matchEntry(compiled(queryOf({ content: literals(['needle']) })), entry)
    expect(match).toEqual({
      kind: 'message.assistant',
      block: 'hidden NEEDLE',
      span: { start: 7, end: 13 },
    })
  })

  it('reads only what the model can read when asked to', () => {
    const query = compiled(queryOf({ content: literals(['needle']), modelReadable: 'only' }))
    expect(matchEntry(query, entry)?.span).toEqual({ start: 4, end: 10 })
    expect(
      matchEntry(
        compiled(queryOf({ content: literals(['hidden']), modelReadable: 'only' })),
        entry,
      ),
    ).toBeNull()
  })

  it('tells case apart only when asked to', () => {
    expect(
      matchEntry(compiled(queryOf({ content: literals(['NEEDLE'], true) })), entry)?.block,
    ).toBe('hidden NEEDLE')
    expect(matchEntry(compiled(queryOf({ content: literals(['Needle'], true) })), entry)).toBeNull()
    expect(matchEntry(compiled(queryOf({ content: regex('NEEDLE$', true) })), entry)?.block).toBe(
      'hidden NEEDLE',
    )
    expect(matchEntry(compiled(queryOf({ content: regex('needle$') })), entry)?.span).toEqual({
      start: 7,
      end: 13,
    })
  })

  it('wants every literal in one block, and no match across two blocks', () => {
    expect(
      matchEntry(compiled(queryOf({ content: literals(['the', 'here']) })), entry)?.span,
    ).toEqual({ start: 0, end: 3 })
    expect(
      matchEntry(compiled(queryOf({ content: literals(['first', 'here']) })), entry),
    ).toBeNull()
    expect(matchEntry(compiled(queryOf({ content: regex('Block.*hidden') })), entry)).toBeNull()
  })

  it('hits only the kinds asked for; the default leaves out summaries and tool-internal messages', () => {
    const query = compiled(queryOf({ content: literals(['needle']) }))
    const internal = entryOf('message.tool_internal', [{ text: 'needle' }])
    expect(matchEntry(query, internal)).toBeNull()
    expect(
      matchEntry(
        compiled(queryOf({ content: literals(['needle']), kinds: ['message.tool_internal'] })),
        internal,
      )?.kind,
    ).toBe('message.tool_internal')
    expect(
      matchEntry(
        compiled(queryOf({ content: literals(['needle']), kinds: ['message.user'] })),
        entry,
      ),
    ).toBeNull()
    expect(matchEntry(query, entryOf('message.delivered', [{ text: 'needle' }]))).toBeNull()
  })
})

describe('the plan against the match (SH-1)', () => {
  const PATTERNS = [
    'ab',
    'a.b',
    '(ab|ba)a',
    'a+b',
    '[ab]{2}中',
    '受理.*文',
    's',
    'K',
    'a?b?',
    'σ',
    '\\bab',
    's+k',
    '理预',
    '(受理|预算)中文',
  ]

  it('admits every document of an entry the query matches: the index never hides a hit', () => {
    const seed = 1119
    const rng = random(seed)
    let matched = 0
    for (let round = 0; round < 6000; round += 1) {
      const caseSensitive = rng.next() < 0.5
      const content =
        rng.next() < 0.5
          ? literals(
              Array.from({ length: 1 + rng.below(2) }, () => randomText(rng, 4) || 'a'),
              caseSensitive,
            )
          : regex(rng.pick(PATTERNS), caseSensitive)
      const query = compiled(
        queryOf({
          content,
          kinds: rng.next() < 0.5 ? [] : [rng.pick(everyKind)],
          modelReadable: rng.pick(['only', 'any']),
        }),
      )
      const entry = entryOf(
        rng.pick(everyKind),
        Array.from({ length: 1 + rng.below(3) }, () => ({
          text: randomText(rng, 10),
          toModel: rng.next() < 0.6,
        })),
      )
      if (matchEntry(query, entry) === null) continue
      matched += 1
      const rows = documentsOf(entry).map(document => documentRow(document))
      expect(
        rows.some(row => planAdmits(query.plan, row)),
        `seed ${String(seed)} round ${String(round)}: ${JSON.stringify({ content, plan: query.plan, rows })}`,
      ).toBe(true)
    }
    expect(matched).toBeGreaterThan(250)
  })

  it('has case orbits and reserved code points among what it tries', () => {
    expect(ALPHABET).toEqual(expect.arrayContaining(['ſ', 'K', 'ς', '\u0002']))
  })
})

describe('the regular expression engine', () => {
  it('answers a pattern that makes a backtracking engine explode, in time linear in the text', () => {
    const query = compiled(queryOf({ content: regex('(a+)+$', true) }))
    const started = performance.now()
    expect(query.matches(`${'a'.repeat(200_000)}b`)).toBeNull()
    expect(performance.now() - started).toBeLessThan(2000)
  })

  it('is imported by one source file only', () => {
    const src = fileURLToPath(new URL('../src/', import.meta.url))
    const importers = readdirSync(src).filter(file =>
      /from 're2js'/u.test(readFileSync(src + file, 'utf8')),
    )
    expect(importers).toEqual(['regex.ts'])
  })

  it('still gives the required literals of a pattern: an upgrade that drops them shows here', () => {
    expect(contentPlan(regex('needle[0-9]', true))).not.toEqual(ANY)
  })
})
