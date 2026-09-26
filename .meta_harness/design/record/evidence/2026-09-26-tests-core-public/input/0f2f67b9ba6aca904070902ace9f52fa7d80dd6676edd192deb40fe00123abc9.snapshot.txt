import { describe, expect, it } from 'vitest'
import {
  isJsonNumber,
  isNonNegativeJsonInteger,
  jsonNumberSource,
  judgeContentBlock,
  LosslessNumber,
  readJsonStrict,
  readOpaqueJson,
  toOpaqueJson,
  validate,
  writeJsonLossless,
} from '../src/index.ts'

describe('V-6 / M36: strict lossless JSON', () => {
  const sources = [
    '0.1',
    '9007199254740993',
    '12345678901234567890',
    '0.1000000000000000055511151231257827',
    '1.10',
    '1e400',
    '-0',
    '-9007199254740993',
    '1e-999',
    '1.2345678901234567890123456789',
  ]
  for (const source of sources) {
    it(`preserves the original numeric source ${source}`, () => {
      const parsed = readJsonStrict(source)
      if (!('ok' in parsed)) throw new Error('expected numeric JSON')
      expect(parsed.ok).toBeInstanceOf(LosslessNumber)
      expect(writeJsonLossless(parsed.ok)).toBe(source)
      expect(readJsonStrict(writeJsonLossless(parsed.ok))).toEqual(parsed)
      if (!isJsonNumber(parsed.ok)) throw new Error('expected number representation')
      expect(jsonNumberSource(parsed.ok)).toBe(source)
    })
  }
  it('uses number for plain safe integers, distinguishing -0', () => {
    expect(readJsonStrict('42')).toEqual({ ok: 42 })
    expect(readJsonStrict('9007199254740991')).toEqual({ ok: 9007199254740991 })
    expect(writeJsonLossless(-0)).toBe('-0')
    expect(isJsonNumber(Object.create(LosslessNumber.prototype))).toBe(false)
  })
  it('is strict RFC JSON, with syntax failure winning over duplicates', () => {
    for (const text of [
      'NaN',
      'Infinity',
      'undefined',
      '01',
      '+1',
      '.1',
      '1.',
      '[1,]',
      '{"a":1,}',
      "{'a':1}",
      '/*x*/1',
      '\ufeff{}',
      '',
      '{"a":1,"a":2,}',
    ]) {
      expect(readJsonStrict(text)).toEqual({ failed: 'syntax' })
    }
  })
  it('rejects duplicate decoded names at every nesting and string escape form', () => {
    for (const text of [
      '{"a":1,"a":2}',
      '{"a":1,"\\u0061":2}',
      '[{"x":{"a":1,"a":2}}]',
      '{"__proto__":1,"__proto__":2}',
      '{"😀":1,"\\ud83d\\ude00":2}',
      '{"\\\\":1,"\\u005c":2}',
      '{"\\\"":1,"\\u0022":2}',
    ]) {
      expect(readJsonStrict(text)).toEqual({ failed: 'duplicate_member' })
    }
    expect(readJsonStrict('{"a":{"x":1},"b":{"x":2}}')).toHaveProperty('ok')
    expect(readJsonStrict('["a:a",{"a":1}]')).toHaveProperty('ok')
  })
  it('scans nested and long valid input without imposing a product size/depth limit', () => {
    const nested = '['.repeat(128) + '{"n":9007199254740993}' + ']'.repeat(128)
    const parsed = readJsonStrict(nested)
    if (!('ok' in parsed)) throw new Error('expected nested JSON')
    expect(writeJsonLossless(parsed.ok)).toBe(nested)
    expect(readJsonStrict('['.repeat(128) + '{"a":1,"a":2}' + ']'.repeat(128))).toEqual({
      failed: 'duplicate_member',
    })
    const long = '{"text":"' + 'x'.repeat(100_000) + '","n":12345678901234567890}'
    const read = readJsonStrict(long)
    if (!('ok' in read)) throw new Error('expected long JSON')
    expect(writeJsonLossless(read.ok)).toBe(long)
  })
  it('preserves __proto__ as an ordinary own member without prototype effects', () => {
    const text = '{"__proto__":{"polluted":true},"n":12345678901234567890,"null":null}'
    const parsed = readJsonStrict(text)
    if (!('ok' in parsed)) throw new Error('expected JSON')
    if (parsed.ok === null || typeof parsed.ok !== 'object') throw new Error('expected object')
    expect(Object.hasOwn(parsed.ok, '__proto__')).toBe(true)
    expect(writeJsonLossless(parsed.ok)).toBe(text)
    expect(Object.hasOwn({}, 'polluted')).toBe(false)
  })
  it('round-trips nested opaque original value and separates absent from null', () => {
    const text =
      '{"id":"b","kind":"thinking","visibility":{"toHuman":false,"toModel":true},"text":"","opaque":{"n":9007199254740993,"nested":[12345678901234567890,{"x":null,"fraction":1.10}],"huge":1e400,"zero":-0}}'
    const parsed = readJsonStrict(text)
    if (!('ok' in parsed)) throw new Error('expected JSON')
    const judged = judgeContentBlock(parsed.ok)
    if (!('ok' in judged) || judged.ok.kind !== 'thinking' || judged.ok.opaque === undefined)
      throw new Error('expected thinking block')
    expect(writeJsonLossless(judged.ok)).toBe(text)
    expect(writeJsonLossless(readOpaqueJson(judged.ok.opaque))).toBe(
      '{"n":9007199254740993,"nested":[12345678901234567890,{"x":null,"fraction":1.10}],"huge":1e400,"zero":-0}',
    )
    for (const suffix of ['', ',"opaque":null']) {
      const input = `{"id":"b","kind":"thinking","visibility":{"toHuman":false,"toModel":true},"text":""${suffix}}`
      const read = readJsonStrict(input)
      if (!('ok' in read)) throw new Error('expected JSON')
      const result = judgeContentBlock(read.ok)
      if (!('ok' in result)) throw new Error('expected block')
      expect(Object.hasOwn(result.ok, 'opaque')).toBe(suffix !== '')
      expect(writeJsonLossless(result.ok)).toBe(input)
    }
    expect(writeJsonLossless(toOpaqueJson(null))).toBe('null')
  })
  it('exposes neutral duplicate failure; block JSON receiver maps it before judging', () => {
    const parsed = readJsonStrict(
      '{"id":"b1","kind":"text","kind":"tool_call","visibility":{"toHuman":true,"toModel":true},"text":"x"}',
    )
    expect(parsed).toEqual({ failed: 'duplicate_member' })
    const received = 'failed' in parsed ? { rejected: 'malformed' } : judgeContentBlock(parsed.ok)
    expect(received).toEqual({ rejected: 'malformed' })
  })
  it('validates exact numeric constraints instead of treating wrappers as objects', () => {
    const base = { storage: 's', key: 'k', mediaType: 'application/pdf' }
    for (const source of [
      '9007199254740993',
      '1e400',
      '1.00',
      '100e-2',
      '-0',
      '0e-999999999999999999999',
    ]) {
      const number = new LosslessNumber(source)
      expect(isNonNegativeJsonInteger(number)).toBe(true)
      expect(validate('AttachmentRef', { ...base, bytes: number }).valid).toBe(true)
    }
    for (const source of [
      '-9007199254740993',
      '0.00000000000000000001',
      '1e-400',
      '-1e-400',
      '1.0000000000000000000001',
    ]) {
      const number = new LosslessNumber(source)
      expect(isNonNegativeJsonInteger(number)).toBe(false)
      expect(validate('AttachmentRef', { ...base, bytes: number }).valid).toBe(false)
      expect(
        judgeContentBlock({
          id: 'b',
          kind: 'file',
          visibility: { toHuman: true, toModel: true },
          attachment: { ...base, bytes: number },
        }),
      ).toEqual({ rejected: 'malformed' })
    }
    expect(validate('Visibility', new LosslessNumber('1e400')).valid).toBe(false)
    expect(validate('BlockId', new LosslessNumber('1')).valid).toBe(false)
  })
  it('refuses JS values that ordinary stringify silently changes or omits', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    for (const value of [
      undefined,
      NaN,
      Infinity,
      { x: undefined },
      [undefined],
      new Date(),
      1n,
      cycle,
      {
        toJSON() {
          return 1
        },
      },
      {
        get x() {
          throw new Error('must not read getter')
        },
      },
    ]) {
      expect(() => writeJsonLossless(value)).toThrow(TypeError)
      expect(judgeContentBlock(value)).toEqual({ rejected: 'malformed' })
    }
    for (const source of ['01', '+1', 'NaN', ' 1', '1\n', '1.'])
      expect(() => new LosslessNumber(source)).toThrow(TypeError)
  })
})
