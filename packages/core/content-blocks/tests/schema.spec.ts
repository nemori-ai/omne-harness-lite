import { assertContentSchemaTransition } from './schema-transition.ts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS } from '@omne-harness-lite/identity-values'
import { judgeContentBlock, SCHEMA_DEF_NAMES, validate, writeJsonLossless } from '../src/index.ts'
import { exampleRows, SPEC_DIR } from './spec-fixtures.ts'

const rows = exampleRows()
describe('V-1: frozen Schema and all normative instances', () => {
  it('current Schema changes only AR-1; all other assertions match the frozen source', () => {
    assertContentSchemaTransition(
      readFileSync(resolve(import.meta.dirname, '../schema/content-blocks.schema.json')),
      readFileSync(resolve(SPEC_DIR, '../v3/content-blocks.schema.json')),
    )
  })
  it('has the 162 normative rows (60 pass, 102 reject) and all 25 definitions', () => {
    expect(rows).toHaveLength(162)
    expect(rows.filter(row => row.valid)).toHaveLength(60)
    expect(SCHEMA_DEF_NAMES).toHaveLength(25)
    for (const name of SCHEMA_DEF_NAMES) expect(() => validate(name, null)).not.toThrow()
  })
  for (const row of rows) {
    it(`Schema section ${row.section} line ${row.line}: ${row.defName}`, () => {
      expect(validate(row.defName, row.value).valid).toBe(row.valid)
    })
  }
  it('uses the identity-values public whitespace input for every opaque address', () => {
    for (const point of OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS) {
      for (const value of [
        `${String.fromCodePoint(point)}id`,
        `id${String.fromCodePoint(point)}`,
      ]) {
        expect(validate('BlockId', value).valid).toBe(false)
        expect(validate('CallId', value).valid).toBe(false)
        expect(
          validate('AttachmentRef', { storage: value, key: 'id', mediaType: 'text/plain' }).valid,
        ).toBe(false)
        expect(
          validate('AttachmentRef', { storage: 'id', key: value, mediaType: 'text/plain' }).valid,
        ).toBe(false)
      }
    }
    expect(validate('BlockId', 'a\u0085b').valid).toBe(true)
    expect(validate('BlockId', 'id\u200b').valid).toBe(true)
  })
})

describe('V-2: exact named rejection and fixed precedence', () => {
  for (const row of rows.filter(row => row.defName === 'ContentBlock')) {
    it(`judgment section ${row.section} line ${row.line}: ${row.rejection ?? 'ok'}`, () => {
      const before = writeJsonLossless(row.value)
      const result = judgeContentBlock(row.value)
      if (row.valid) expect('ok' in result).toBe(true)
      else expect(result).toEqual({ rejected: row.rejection })
      expect(writeJsonLossless(row.value)).toBe(before)
    })
  }
  it('never inspects block-like objects in arguments or opaque', () => {
    const inner = { kind: 'video', blocks: [{ kind: 'tool_call' }] }
    expect(
      'ok' in
        judgeContentBlock({
          id: 'x',
          kind: 'tool_call',
          visibility: { toHuman: true, toModel: true },
          complete: true,
          callId: 'c',
          tool: 'a',
          arguments: inner,
        }),
    ).toBe(true)
    expect(
      'ok' in
        judgeContentBlock({
          id: 'x',
          kind: 'thinking',
          visibility: { toHuman: true, toModel: true },
          text: '',
          opaque: inner,
        }),
    ).toBe(true)
  })
  it('prioritizes the whole tree, independently of sibling order', () => {
    const children = [
      { id: 'a', kind: 'text', text: '' },
      { id: 'b', kind: 'video', visibility: { toHuman: true, toModel: true } },
    ]
    for (const blocks of [children, children.toReversed()]) {
      expect(
        judgeContentBlock({
          id: 'r',
          kind: 'tool_result',
          visibility: { toHuman: true, toModel: true },
          callId: 'c',
          outcome: 'completed',
          blocks,
        }),
      ).toEqual({ rejected: 'kind_unknown' })
    }
  })
})
