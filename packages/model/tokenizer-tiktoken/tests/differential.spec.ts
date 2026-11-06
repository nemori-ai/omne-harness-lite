import { expect, it } from 'vitest'
import { pairOf, ranksOf, seeded, words } from './support/differential.ts'
import { o200kRanks } from './support/resources.ts'

async function expectCount(tokens: Readonly<Record<string, number>>, text: string, count: number) {
  const { tokenizer, oracle } = await pairOf(ranksOf(tokens))
  expect(oracle.encode(text, [], []).length).toBe(count)
  expect(await tokenizer.count([{ kind: 'text', text }])).toEqual({ ok: { tokens: String(count) } })
}

it('merges the leftmost equal-rank pair before overlapping pairs', async () => {
  await expectCount({ a: 10, b: 11, c: 12, d: 13, ab: 1, bc: 1, cd: 2 }, 'abcd', 2)
})

it('refreshes both neighbors and discards candidates whose endpoints changed', async () => {
  await expectCount({ a: 10, b: 11, c: 12, ab: 2, bc: 1 }, 'abc', 2)
  await expectCount({ a: 10, b: 11, c: 12, d: 13, ab: 2, bc: 1, abc: 0 }, 'abcd', 2)
  await expectCount({ a: 10, b: 11, c: 12, d: 13, ab: 1, bc: 2, cd: 3, bcd: 0 }, 'abcd', 2)
  await expectCount({ a: 10, b: 11, c: 12, d: 13, ab: 1, abc: 0 }, 'abcd', 2)
})

it('uses whole tokens without intermediate merges and filters missing terminal ranks', async () => {
  await expectCount({ a: 0, b: 1, c: 2, abc: 3 }, 'abc', 1)
  await expectCount({}, 'a', 1)
  await expectCount({}, 'aa', 0)
  await expectCount({ ab: 1 }, 'abc', 1)
})

it('keeps non-finite rank behavior on the original engine', async () => {
  await expectCount(
    { c: 12, d: 13, e: 14, f: 15, g: 16, h: 17, cdefg: 6, de: NaN, def: 1, defg: NaN, gh: 1 },
    'cdefgh',
    2,
  )
  for (const [rank, count] of [
    [NaN, 2],
    [Infinity, 3],
    [-Infinity, 2],
  ] as const) {
    // The compressed parser accepts parseInt overflow; literal Infinity parses as NaN.
    const ordinary = ranksOf({ a: 10, b: 11, c: 12, d: 13, bc: 1, cd: 2, ab: rank })
    const bpeRanks = ordinary.bpeRanks
      .replace(' Infinity ', ` ${'9'.repeat(400)} `)
      .replace(' -Infinity ', ` -${'9'.repeat(400)} `)
    const { tokenizer, oracle } = await pairOf({ ...ordinary, bpeRanks })
    expect(oracle.encode('abcd', [], []).length).toBe(count)
    expect(await tokenizer.count([{ kind: 'text', text: 'abcd' }])).toEqual({
      ok: { tokens: String(count) },
    })
  }
})

it('preserves regex gaps, zero-width matches and lazy compilation for empty input', async () => {
  for (const [ranks, text] of [
    [ranksOf({ a: 0 }, 'a'), 'bab'],
    [ranksOf({}, '(?:)'), 'ab'],
    [ranksOf({ '': 0 }, '(?:)'), 'ab'],
  ] as const) {
    const { tokenizer, oracle } = await pairOf(ranks)
    expect(await tokenizer.count([{ kind: 'text', text }])).toEqual({
      ok: { tokens: String(oracle.encode(text, [], []).length) },
    })
  }
  for (const tokens of [{}, { a: NaN }]) {
    const { tokenizer, oracle } = await pairOf(ranksOf(tokens, '['))
    expect(await tokenizer.count([{ kind: 'text', text: '' }])).toEqual({ ok: { tokens: '0' } })
    expect(() => oracle.encode('a', [], [])).toThrow(SyntaxError)
    expect(await tokenizer.count([{ kind: 'text', text: 'a' }])).toMatchObject({
      failure: {
        kind: 'unavailable',
        diagnostic: expect.stringContaining('Invalid regular expression'),
      },
    })
  }
})

it('keeps special spellings ordinary when non-finite ranks use the original engine', async () => {
  const text = '<|special|>'
  const tokens = Object.fromEntries(Array.from(text, (letter, index) => [letter, index]))
  const { tokenizer, oracle } = await pairOf(ranksOf({ ...tokens, unused: NaN }))
  expect(oracle.encode(text, [], []).length).toBe(text.length)
  expect(await tokenizer.count([{ kind: 'text', text }])).toEqual({
    ok: { tokens: String(text.length) },
  })
  expect(await tokenizer.count([{ kind: 'special-token', name: text }])).toEqual({
    ok: { tokens: '1' },
  })
})

it(
  'agrees with the unchanged oracle across exhaustive sparse non-monotonic vocabularies',
  { timeout: 30000 },
  async () => {
    const random = seeded(0x71c0de)
    const vocabulary = words(['a', 'b', 'c'], 4).slice(1)
    const samples = words(['a', 'b', 'c'], 5)
    for (let trial = 0; trial < 32; trial++) {
      const tokens = Object.fromEntries(
        vocabulary.filter(() => random() % 3 === 0).map(token => [token, (random() % 9) - 3]),
      )
      const { tokenizer, oracle } = await pairOf(ranksOf(tokens))
      for (const text of samples) {
        expect(
          await tokenizer.count([{ kind: 'text', text }]),
          `trial=${trial} text=${text}`,
        ).toEqual({
          ok: { tokens: String(oracle.encode(text, [], []).length) },
        })
      }
    }
  },
)

it('agrees on the o200k vocabulary, Unicode, ordinary special spellings and segment boundaries', async () => {
  const random = seeded(0xc1a0de)
  const alphabet = [
    'a',
    'z',
    ' ',
    '\t',
    '\n',
    '\r\n',
    '你',
    '界',
    '😀',
    'é',
    'e\u0301',
    '<|endoftext|>',
  ]
  const samples = [
    'hello',
    ' '.repeat(256),
    '😀你好\t\n<|endoftext|>',
    ...Array.from({ length: 96 }, () =>
      Array.from({ length: 48 }, () => alphabet[random() % alphabet.length]).join(''),
    ),
  ]
  const { tokenizer, oracle } = await pairOf(o200kRanks)
  for (const text of samples) {
    const characters = Array.from(text)
    const middle = Math.floor(characters.length / 2)
    const left = characters.slice(0, middle).join('')
    const right = characters.slice(middle).join('')
    expect(
      await tokenizer.count([
        { kind: 'text', text: left },
        { kind: 'text', text: right },
      ]),
    ).toEqual({ ok: { tokens: String(oracle.encode(text, [], []).length) } })
    expect(
      await tokenizer.count([
        { kind: 'text', text: left },
        { kind: 'special-token', name: '<|endoftext|>' },
        { kind: 'text', text: right },
      ]),
    ).toEqual({
      ok: {
        tokens: String(
          oracle.encode(left, [], []).length + 1 + oracle.encode(right, [], []).length,
        ),
      },
    })
  }
  expect(
    await tokenizer.count([
      { kind: 'text', text: '\uD83D' },
      { kind: 'text', text: '\uDE00' },
    ]),
  ).toEqual({ failure: { kind: 'invalid', reason: 'a text segment is not well-formed Unicode' } })
})

it('counts long unmergeable pieces without spreading token arrays onto the call stack', async () => {
  const { tokenizer } = await pairOf(ranksOf({ a: 0 }))
  expect(await tokenizer.count([{ kind: 'text', text: 'a'.repeat(131_072) }])).toEqual({
    ok: { tokens: '131072' },
  })
})
