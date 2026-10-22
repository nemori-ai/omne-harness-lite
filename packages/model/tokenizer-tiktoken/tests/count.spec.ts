import { getEncoding } from 'js-tiktoken'
import type { ModelTextTokenizer, TokenizationSegment } from '@omne-harness/model-contract'
import { createTiktokenTokenizer, type TiktokenResources } from '@omne-harness/tokenizer-tiktoken'
import { describe, expect, it } from 'vitest'
import { DIGESTS, o200kResources, syntheticResources } from './support/resources.ts'

function tokenizerOf(resources: TiktokenResources): ModelTextTokenizer {
  const created = createTiktokenTokenizer(resources)
  if ('failure' in created)
    throw new Error(`initialization failed: ${JSON.stringify(created.failure)}`)
  return created.ok
}

const text = (value: string): TokenizationSegment => ({ kind: 'text', text: value })
const special = (name: string): TokenizationSegment => ({ kind: 'special-token', name })

describe('o200k ranks supplied by the caller', () => {
  const tokenizer = tokenizerOf(o200kResources())

  it('counts ordinary text as a decimal string', () => {
    expect(tokenizer.count([text('hello world')])).toEqual({ ok: { tokens: '2' } })
    expect(tokenizer.count([text('你好，世界')])).toEqual({ ok: { tokens: '3' } })
  })

  it('agrees with the full js-tiktoken o200k encoder on ordinary text', () => {
    const reference = getEncoding('o200k_base')
    for (const sample of [
      'The quick brown fox jumps over the lazy dog.',
      '  tabs\tand\nlines\r\n',
      '😀 emoji',
    ]) {
      expect(tokenizer.count([text(sample)])).toEqual({
        ok: { tokens: String(reference.encode(sample, [], []).length) },
      })
    }
  })

  it('counts the spelling of a special token inside text as ordinary text', () => {
    expect(tokenizer.count([text('<|endoftext|>')])).toEqual({ ok: { tokens: '7' } })
    expect(tokenizer.count([text('a<|endoftext|>b')])).toEqual({ ok: { tokens: '9' } })
  })

  it('counts an explicit special-token segment from the fixed table as one token', () => {
    expect(tokenizer.count([special('<|endoftext|>')])).toEqual({ ok: { tokens: '1' } })
    expect(tokenizer.count([text('hello'), special('<|endofprompt|>'), text(' world')])).toEqual({
      ok: { tokens: '3' },
    })
  })

  it('joins adjacent text segments before encoding', () => {
    // "hel" and "lo" are one token each; "hello" is one token.
    expect(tokenizer.count([text('hel'), text('lo')])).toEqual({ ok: { tokens: '1' } })
  })

  it('returns unsupported-token for a name outside the fixed table', () => {
    expect(tokenizer.count([text('x'), special('<|im_start|>')])).toEqual({
      failure: { kind: 'unsupported-token', name: '<|im_start|>' },
    })
  })

  it('does not take object prototype names as special tokens', () => {
    for (const name of ['toString', '__proto__', 'constructor']) {
      expect(tokenizer.count([special(name)])).toEqual({
        failure: { kind: 'unsupported-token', name },
      })
    }
  })

  it('counts an empty sequence and empty text as zero', () => {
    expect(tokenizer.count([])).toEqual({ ok: { tokens: '0' } })
    expect(tokenizer.count([text(''), text('')])).toEqual({ ok: { tokens: '0' } })
  })

  it('returns invalid for text that is not well-formed Unicode, instead of replacing it', () => {
    expect(tokenizer.count([text('a\uD800b')])).toEqual({
      failure: { kind: 'invalid', reason: 'a text segment is not well-formed Unicode' },
    })
  })

  it('keeps the definition it was created with, frozen', () => {
    expect(tokenizer.definition).toEqual(o200kResources().definition)
    expect(Object.isFrozen(tokenizer.definition)).toBe(true)
    expect(Object.isFrozen(tokenizer.definition.vocabulary)).toBe(true)
  })
})

describe('a second, synthetic vocabulary', () => {
  const tokenizer = tokenizerOf(syntheticResources())

  it('counts with the merges of that vocabulary', () => {
    expect(tokenizer.count([text('abcd')])).toEqual({ ok: { tokens: '1' } })
    expect(tokenizer.count([text('abcde')])).toEqual({ ok: { tokens: '2' } })
    expect(tokenizer.count([text('ab ab')])).toEqual({ ok: { tokens: '3' } })
    expect(tokenizer.count([text('xyz')])).toEqual({ ok: { tokens: '3' } })
  })

  it('counts the special token of that vocabulary only as an explicit segment', () => {
    // "<|", "fim" and "|>" have no merges: 2 + 3 + 2 single-byte tokens.
    expect(tokenizer.count([text('<|fim|>')])).toEqual({ ok: { tokens: '7' } })
    expect(tokenizer.count([special('<|fim|>')])).toEqual({ ok: { tokens: '1' } })
  })

  it('does not accept a special token of another vocabulary', () => {
    expect(tokenizer.count([special('<|endoftext|>')])).toEqual({
      failure: { kind: 'unsupported-token', name: '<|endoftext|>' },
    })
  })
})

describe('the fixed special-token table', () => {
  it('is the only source of special tokens, even for names that the vocabulary defines', () => {
    const resources = syntheticResources()
    const tokenizer = tokenizerOf({
      ...resources,
      definition: {
        ...resources.definition,
        configuration: { ...resources.definition.configuration, digest: DIGESTS.emptyTable },
      },
      specialTokens: {},
    })
    expect(tokenizer.count([special('<|fim|>')])).toEqual({
      failure: { kind: 'unsupported-token', name: '<|fim|>' },
    })
  })

  it('is copied at initialization, so later changes to the caller table do not count', () => {
    const table: Record<string, number> = { '<|fim|>': 300 }
    const tokenizer = tokenizerOf({ ...syntheticResources(), specialTokens: table })
    table['<|late|>'] = 301
    delete table['<|fim|>']
    expect(tokenizer.count([special('<|fim|>')])).toEqual({ ok: { tokens: '1' } })
    expect(tokenizer.count([special('<|late|>')])).toEqual({
      failure: { kind: 'unsupported-token', name: '<|late|>' },
    })
  })
})
