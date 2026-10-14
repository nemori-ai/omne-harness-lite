import { describe, expect, it } from 'vitest'
import {
  readJsonBytes,
  readJsonText,
  type JsonLimits,
  type JsonRead,
} from '@omne-harness/json-text'

const roomy: JsonLimits = {
  maxBytes: 1_000,
  maxDepth: 10,
  maxItems: 100,
  maxMembers: 100,
  maxStringLength: 100,
  maxNumberLength: 100,
}

const looseText = readJsonText as (text: unknown, limits: unknown) => JsonRead
const looseBytes = readJsonBytes as (bytes: unknown, limits: unknown) => JsonRead
const space = new Uint8Array([0x20])

function expectLimitsRejected(bad: unknown, good: unknown): void {
  expect(() => looseText(' ', bad)).toThrow(TypeError)
  expect(() => looseBytes(space, bad)).toThrow(TypeError)
  expect(looseText(' ', good)).toEqual({ kind: 'empty' })
  expect(looseBytes(space, good)).toEqual({ kind: 'empty' })
}

describe('arguments', () => {
  const fields = Object.keys(roomy)

  it.each([undefined, null, 1, 'limits'])('limits %s throws TypeError', limits => {
    expectLimitsRejected(limits, roomy)
  })

  it.each(fields)('missing %s throws TypeError', field => {
    const limits: Record<string, unknown> = { ...roomy }
    delete limits[field]
    expectLimitsRejected(limits, { ...limits, [field]: 1 })
  })

  const illegal = [0, -1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', 1n, null]
  it.each(fields.flatMap(field => illegal.map(value => [field, value] as const)))(
    '%s = %s throws TypeError',
    (field, value) => {
      expectLimitsRejected({ ...roomy, [field]: value }, { ...roomy, [field]: 1 })
    },
  )

  it('accepts Number.MAX_SAFE_INTEGER for every field', () => {
    const max = Number.MAX_SAFE_INTEGER
    expectLimitsRejected(
      { ...roomy, maxBytes: max + 1 },
      {
        maxBytes: max,
        maxDepth: max,
        maxItems: max,
        maxMembers: max,
        maxStringLength: max,
        maxNumberLength: max,
      },
    )
  })

  it.each([new Uint8Array([0x20]), 1, null, undefined, [' ']])(
    'readJsonText(%s) throws TypeError',
    text => {
      expect(() => looseText(text, roomy)).toThrow(TypeError)
      expect(looseText(' ', roomy)).toEqual({ kind: 'empty' })
    },
  )

  it.each([' ', [0x20], new ArrayBuffer(1), new Uint16Array([0x20]), null, undefined])(
    'readJsonBytes(%s) throws TypeError',
    bytes => {
      expect(() => looseBytes(bytes, roomy)).toThrow(TypeError)
      expect(looseBytes(space, roomy)).toEqual({ kind: 'empty' })
    },
  )
})
