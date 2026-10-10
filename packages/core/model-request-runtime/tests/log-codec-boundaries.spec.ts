import { describe, expect, it, vi } from 'vitest'
import {
  LosslessNumber,
  writeJsonLossless,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import {
  captureModelLogValue,
  decodeModelLogKey,
  encodeModelLogKey,
  modelLogJsonEqual,
  recognizeMessageValue,
  type ModelLogKey,
} from '../src/index.ts'

function key(input: ModelLogKey): string {
  const result = encodeModelLogKey(input)
  if (!('ok' in result)) throw new Error('valid key expected')
  return result.ok
}

const reminder: JsonObject = {
  id: 'reminder',
  type: 'system_reminder',
  nature: 'event',
  source: {
    kind: 'extension',
    extension: 'teaching',
    payload: { amount: new LosslessNumber('1.00') },
  },
  blocks: [],
  createdAt: '2026-09-27T00:00:00Z',
}

describe('SPEC canonical model keys and complete message recognition', () => {
  it('uses the fixed current encoding and rejects noncanonical but parseable keys', () => {
    expect(key({ kind: 'all' })).toBe('mrr/3/["\\u0061\\u006c\\u006c"]')
    for (const input of [
      'mrr/3/["all"]',
      'mrr/3/["\\u0061\\u006C\\u006c"]',
      'mrr/3/[ "\\u0061\\u006c\\u006c"]',
      key({ kind: 'all' }) + ' ',
      key({ kind: 'all' }).replace('mrr/3', 'mrr/2'),
    ])
      expect(decodeModelLogKey(input)).toEqual({ invalidKey: true })
  })

  it('rejects syntax, shape, identity and arity defects without admitting partial keys', () => {
    for (const input of [
      '',
      'mrr/3/[',
      'mrr/3/null',
      'mrr/3/{}',
      'mrr/3/[1]',
      'mrr/3/[]',
      'mrr/3/["call"]',
      'mrr/3/["call",""]',
      'mrr/3/["unknown","call"]',
      'mrr/3/["all","extra"]',
      'mrr/3/["opened","call","0e0"]',
      'mrr/3/["opened","call","1e-1"]',
      'mrr/3/["opened","call","1e0","extra"]',
    ])
      expect(decodeModelLogKey(input)).toEqual({ invalidKey: true })
    for (const input of [null, undefined, false, 1, []])
      expect(Reflect.apply(decodeModelLogKey, undefined, [input])).toEqual({ invalidKey: true })
  })

  it('propagates an internal parser error with its original identity', () => {
    const error = new Error('parser failed')
    const parser = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
      throw error
    })
    try {
      let observed: unknown
      try {
        decodeModelLogKey(key({ kind: 'all' }))
      } catch (failure) {
        observed = failure
      }
      expect(observed).toBe(error)
    } finally {
      parser.mockRestore()
    }
  })

  it('keeps every closed key kind distinct and preserves exact UTF16 identities', () => {
    const keys: ModelLogKey[] = [
      { kind: 'all' },
      { kind: 'messages' },
      { kind: 'selection' },
      { kind: 'call', call: 'call' },
      { kind: 'created', call: 'call' },
      { kind: 'intent', call: 'call' },
      { kind: 'ended', call: 'call' },
      { kind: 'acknowledged', call: 'call' },
      { kind: 'creation', creationKey: 'creation' },
      { kind: 'dispatch', call: 'call', dispatch: new LosslessNumber('1e0') },
      { kind: 'dispatched', call: 'call', dispatch: new LosslessNumber('1e0') },
      { kind: 'opened', call: 'call', dispatch: new LosslessNumber('1e0') },
      { kind: 'response', response: 'response' },
      { kind: 'ready', response: 'response' },
      { kind: 'settlement', response: 'response' },
      { kind: 'message', message: 'message' },
      { kind: 'run', run: 'run' },
    ]
    expect(new Set(keys.map(key)).size).toBe(keys.length)
    for (const input of keys) expect(decodeModelLogKey(key(input))).toEqual({ ok: input })
    for (const id of ['a/b,c"\\d', 'a b\nc', 'é', 'e\u0301', '😀', '\ud800', '\udfff', 'a\0b'])
      expect(decodeModelLogKey(key({ kind: 'message', message: id }))).toEqual({
        ok: { kind: 'message', message: id },
      })
    for (const id of ['', ' a', 'a\n', '\u0085a', 'a\u3000'])
      expect(encodeModelLogKey({ kind: 'message', message: id })).toEqual({
        invalidValue: true,
        reason: 'identity',
      })
  })

  it('normalizes mathematical dispatch values without rounding or expanding huge exponents', () => {
    const dispatch = (source: string) =>
      key({ kind: 'opened', call: 'call', dispatch: new LosslessNumber(source) })
    expect(dispatch('1')).toBe(dispatch('1.0'))
    expect(dispatch('1000')).toBe(dispatch('10e2'))
    expect(dispatch('9007199254740993')).not.toBe(dispatch('9007199254740992'))
    expect(dispatch('100e999999999999999999999998')).toBe(dispatch('1e1000000000000000000000000'))
    expect(dispatch('1e1000000000000000000000000').length).toBeLessThan(500)
    expect(decodeModelLogKey(dispatch('1000'))).toEqual({
      ok: { kind: 'opened', call: 'call', dispatch: new LosslessNumber('1e3') },
    })
    expect(
      decodeModelLogKey(
        dispatch('1000').replace('\\u0031\\u0065\\u0033', '\\u0031\\u0030\\u0065\\u0032'),
      ),
    ).toEqual({ invalidKey: true })
    for (const source of ['0', '-1', '1e-1', '1.01'])
      expect(
        encodeModelLogKey({ kind: 'opened', call: 'call', dispatch: new LosslessNumber(source) }),
      ).toEqual({ invalidValue: true, reason: 'dispatch' })
  })

  it('recognizes absent, identical and different complete messages, preserving original numeric spelling', () => {
    const candidate: JsonObject = {
      ...reminder,
      source: { kind: 'extension', extension: 'teaching', payload: { amount: 1 } },
    }
    expect(
      recognizeMessageValue({ candidate: { kind: 'value', value: candidate }, original: null }),
    ).toEqual({
      absent: true,
    })
    const result = recognizeMessageValue({
      candidate: { kind: 'text', text: writeJsonLossless(candidate) },
      original: { kind: 'value', value: reminder },
    })
    if (!('same' in result)) throw new Error('equal complete messages expected')
    expect(writeJsonLossless(result.original.value)).toContain('"amount":1.00')
    expect(result.original.value).not.toBe(reminder)
    expect(Object.isFrozen(result.original)).toBe(true)
    for (const changed of [
      { ...candidate, id: 'other' },
      { ...candidate, createdAt: '2026-09-27T00:00:01Z' },
      { ...candidate, source: { kind: 'extension', extension: 'different' } },
      {
        ...candidate,
        source: { kind: 'extension', extension: 'teaching', payload: { amount: 2 } },
      },
    ])
      expect(
        recognizeMessageValue({
          candidate: { kind: 'value', value: changed },
          original: { kind: 'value', value: reminder },
        }),
      ).toEqual({ different: true })
  })

  it('keeps malformed candidate or original undetermined rather than absent or different', () => {
    const valid = { kind: 'value', value: reminder } satisfies Parameters<
      typeof recognizeMessageValue
    >[0]['candidate']
    for (const input of [{ id: 'reminder' }, null, [], { ...reminder, createdAt: 'invalid' }]) {
      expect(
        recognizeMessageValue({ candidate: { kind: 'value', value: input }, original: null }),
      ).toEqual({
        undetermined: true,
        reason: 'message_value',
      })
      expect(
        recognizeMessageValue({ candidate: valid, original: { kind: 'value', value: input } }),
      ).toEqual({
        undetermined: true,
        reason: 'message_value',
      })
    }
    expect(
      recognizeMessageValue({ candidate: { kind: 'text', text: '{' }, original: valid }),
    ).toEqual({
      undetermined: true,
      reason: 'message_value',
    })
  })

  it('rejects non-data values without executing getters and compares exact numbers and all object members', () => {
    let reads = 0
    const accessor = Object.defineProperty({}, 'id', {
      enumerable: true,
      get() {
        reads++
        return 'reminder'
      },
    })
    expect(
      captureModelLogValue({ category: 'message', input: { kind: 'value', value: accessor } }),
    ).toEqual({
      invalidValue: true,
      reason: 'not_json',
    })
    expect(reads).toBe(0)
    expect(
      modelLogJsonEqual(
        { a: new LosslessNumber('9007199254740993') },
        { a: new LosslessNumber('9007199254740993e0') },
      ),
    ).toBe(true)
    expect(
      modelLogJsonEqual(
        { a: new LosslessNumber('9007199254740993') },
        { a: new LosslessNumber('9007199254740992') },
      ),
    ).toBe(false)
    expect(modelLogJsonEqual({ a: null }, {})).toBe(false)
    expect(modelLogJsonEqual([1, 2], [2, 1])).toBe(false)
    expect(modelLogJsonEqual(undefined, null)).toBe(false)
    expect(modelLogJsonEqual(accessor, accessor)).toBe(false)
    expect(reads).toBe(0)
  })
})
