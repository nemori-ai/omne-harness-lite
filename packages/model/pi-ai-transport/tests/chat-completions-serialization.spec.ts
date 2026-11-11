import { describe, expect, it } from 'vitest'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fitsSerializedBytes } from '../src/chat-completions/serialization.ts'

describe('bounded serialization preflight', () => {
  const texts = [
    '',
    '\\"\b\t\n\f\r\u0000',
    '中文😀ﬁ',
    '\ud800',
    '\udfff',
    '\ud800x\udfff',
    'e\u0301',
  ]
  it.each(texts)('matches exact JSON UTF-8 bytes for %j without changing the text', text => {
    const tree: JsonValue = {
      kind: 'object',
      entries: [
        {
          key: text,
          value: {
            kind: 'array',
            items: [
              { kind: 'string', value: text },
              { kind: 'number', lexeme: '-1.20e+3' },
              { kind: 'null' },
              { kind: 'boolean', value: false },
              { kind: 'boolean', value: true },
              { kind: 'array', items: [] },
              { kind: 'object', entries: [] },
            ],
          },
        },
      ],
    }
    const written = writeJsonText(tree)
    const bytes = Buffer.byteLength(written)
    expect(fitsSerializedBytes(tree, bytes)).toBe(true)
    expect(fitsSerializedBytes(tree, bytes - 1)).toBe(false)
    expect(writeJsonText(tree)).toBe(written)
  })

  it('stops before visiting later members after the budget is exhausted', () => {
    const tree: JsonValue = {
      kind: 'array',
      items: [
        { kind: 'string', value: 'x'.repeat(100) },
        {
          kind: 'string',
          get value(): string {
            throw new Error('must not visit')
          },
        },
      ],
    }
    expect(fitsSerializedBytes(tree, 16)).toBe(false)
  })

  it('bounds a deep tree without recursive traversal or an unbounded child list', () => {
    let tree: JsonValue = { kind: 'null' }
    for (let index = 0; index < 10000; index += 1) tree = { kind: 'array', items: [tree] }
    expect(fitsSerializedBytes(tree, 100)).toBe(false)
  })
})
