import { createHash } from 'node:crypto'
import { Tiktoken } from 'js-tiktoken/lite'
import { expect, it } from 'vitest'
import { createTiktokenTokenizer } from '@omne-harness/tokenizer-tiktoken'
import { anthropicTokenizerResources } from '../src/tokenizer.ts'

it('counts the family vocabulary like the oracle across Unicode and segment boundaries', () => {
  let state = 0xc1a0de
  const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0)
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
  const resources = anthropicTokenizerResources()
  const specialTokens = { '<|endoftext|>': 0 }
  const initialized = createTiktokenTokenizer({
    ...resources,
    specialTokens,
    definition: {
      ...resources.definition,
      configuration: {
        ...resources.definition.configuration,
        digest: createHash('sha256').update(JSON.stringify(specialTokens)).digest('hex'),
      },
    },
  })
  if ('failure' in initialized) throw new Error(JSON.stringify(initialized.failure))
  const tokenizer = initialized.ok
  const oracle = new Tiktoken({
    pat_str: resources.ranks.patStr,
    bpe_ranks: resources.ranks.bpeRanks,
    special_tokens: resources.ranks.specialTokens,
  })
  for (const text of samples) {
    const characters = Array.from(text)
    const middle = Math.floor(characters.length / 2)
    const left = characters.slice(0, middle).join('')
    const right = characters.slice(middle).join('')
    expect(
      tokenizer.count([
        { kind: 'text', text: left },
        { kind: 'text', text: right },
      ]),
    ).toEqual({ ok: { tokens: String(oracle.encode(text, [], []).length) } })
    expect(
      tokenizer.count([
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
    tokenizer.count([
      { kind: 'text', text: '\uD83D' },
      { kind: 'text', text: '\uDE00' },
    ]),
  ).toEqual({ failure: { kind: 'invalid', reason: 'a text segment is not well-formed Unicode' } })
})
