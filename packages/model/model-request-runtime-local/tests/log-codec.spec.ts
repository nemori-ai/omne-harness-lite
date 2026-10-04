import { describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { captureModelLogValue, decodeModelLogKey, encodeModelLogKey, inspectModelLogEntry, modelLogFormat, modelLogJsonEqual, prepareModelLogEntry, recognizeMessageValue, type ModelLogKey } from '@omne-harness-lite/model-request-runtime'
import {
  anchors,
  batch,
  capture,
  dispatched,
  jsonObject,
  located,
  opened,
  prepare,
  reply,
  response,
  session,
  tenant,
} from './log-codec-fixture.ts'

function key(input: ModelLogKey): string {
  const value = encodeModelLogKey(input)
  if (!('ok' in value)) throw new Error(value.reason)
  return value.ok
}
describe('D088 K1 fixed tuples and exact values', () => {
  it('matches a literal all-code-unit encoding and rejects alternative JSON spellings', () => {
    expect(modelLogFormat).toBe('mrr/3')
    expect(key({ kind: 'all' })).toBe('mrr/3/["\\u0061\\u006c\\u006c"]')
    for (const input of [
      'mrr/3/["all"]',
      'mrr/3/["\\u0061\\u006C\\u006c"]',
      'mrr/3/[ "\\u0061\\u006c\\u006c"]',
      key({ kind: 'all' }) + ' ',
      key({ kind: 'all' }).replace('mrr/3', 'mrr/1'),
      key({ kind: 'all' }).replace('mrr/3', 'mrr/2'),
    ])
      expect(decodeModelLogKey(input)).toEqual({ invalidKey: true })
  })
  it('round trips every closed key kind with exact UTF16 identity boundaries', () => {
    const kinds: ModelLogKey[] = [{ kind: 'all' }, { kind: 'messages' }, { kind: 'selection' }]
    for (const id of ['a/b,c"\\d', 'a b\nc', 'é', 'e\u0301', '😀', '\ud800', '\udfff', 'a\0b']) {
      kinds.push(
        { kind: 'call', call: id },
        { kind: 'intent', call: id },
        { kind: 'ended', call: id },
        { kind: 'dispatch', call: id, dispatch: 1 },
        { kind: 'dispatched', call: id, dispatch: 1 },
        { kind: 'opened', call: id, dispatch: 1 },
        { kind: 'message', message: id },
        { kind: 'response', response: id },
        { kind: 'settlement', response: id },
        { kind: 'run', run: id },
      )
    }
    expect(new Set(kinds.map(key)).size).toBe(kinds.length)
    for (const item of kinds) {
      const decoded = decodeModelLogKey(key(item))
      expect(decoded).toHaveProperty('ok')
      if ('ok' in decoded) expect(key(decoded.ok)).toBe(key(item))
    }
    for (const id of ['', ' a', 'a\n', '\u0085a', 'a\u3000'])
      expect(encodeModelLogKey({ kind: 'message', message: id })).toHaveProperty('invalidValue')
  })
  it('normalizes precision beyond Number and huge exponents without expansion', () => {
    const dispatch = (source: string) =>
      key({ kind: 'opened', call: 'c', dispatch: new LosslessNumber(source) })
    expect(dispatch('1')).toBe(dispatch('1.0'))
    expect(dispatch('1')).toBe(dispatch('1e0'))
    expect(dispatch('1000')).toBe(dispatch('10e2'))
    expect(dispatch('9007199254740993')).not.toBe(dispatch('9007199254740992'))
    expect(dispatch('100e999999999999999999999998')).toBe(dispatch('1e1000000000000000000000000'))
    expect(dispatch('1e1000000000000000000000000').length).toBeLessThan(500)
    for (const source of ['0', '-1', '1e-1', '1.01'])
      expect(
        encodeModelLogKey({ kind: 'opened', call: 'c', dispatch: new LosslessNumber(source) }),
      ).toHaveProperty('invalidValue')
    const noncanonical = dispatch('1000').replace(
      '\\u0031\\u0065\\u0033',
      '\\u0031\\u0030\\u0065\\u0032',
    )
    expect(decodeModelLogKey(noncanonical)).toEqual({ invalidKey: true })
  })
  it('compares mathematical numbers and full unordered objects without modifying original lexemes', () => {
    const a = readJsonStrict('{"x":1.0,"nested":{"n":9007199254740993,"v":null}}')
    const b = readJsonStrict('{"nested":{"v":null,"n":9007199254740993e0},"x":1e0}')
    if (!('ok' in a) || !('ok' in b)) throw new Error('strict vector')
    expect(modelLogJsonEqual(a.ok, b.ok)).toBe(true)
    expect(writeJsonLossless(a.ok)).toBe('{"x":1.0,"nested":{"n":9007199254740993,"v":null}}')
    expect(modelLogJsonEqual(undefined, null)).toBe(false)
    expect(modelLogJsonEqual([1, 2], [2, 1])).toBe(false)
    expect(modelLogJsonEqual({ a: null }, {})).toBe(false)
    expect(
      modelLogJsonEqual(
        new LosslessNumber('1e999999999999999999999'),
        new LosslessNumber('10e999999999999999999998'),
      ),
    ).toBe(true)
  })
})
describe('D088 P1 ownership and D/R reconstruction', () => {
  it('preserves the MR8 interrupted null sentAt in current mrr/3 value capture', () => {
    const { reply: _reply, replyDisposition: _disposition, ...withoutReply } = response
    const interrupted = {
      ...withoutReply,
      outcome: 'interrupted',
      initiator: 'runtime_lost',
      timing: { ...jsonObject(response.timing), sentAt: null },
    }
    const captured = captureModelLogValue({
      category: 'response',
      input: { kind: 'text', text: writeJsonLossless(interrupted) },
    })
    if (!('ok' in captured)) throw new Error('expected current interrupted value')
    expect(captured.ok.response?.timing.sentAt).toBeNull()
    expect(writeJsonLossless(captured.ok.value)).toBe(writeJsonLossless(interrupted))
    for (const outcome of ['complete', 'truncated', 'failed']) {
      expect(
        captureModelLogValue({
          category: 'response',
          input: { kind: 'value', value: { ...interrupted, outcome } },
        }),
      ).toHaveProperty('invalidValue')
    }
  })
  it('captures strict text/value once, refusing duplicate members and object execution', () => {
    const text = writeJsonLossless(response)
    expect(
      captureModelLogValue({ category: 'response', input: { kind: 'text', text } }),
    ).toHaveProperty('ok')
    expect(
      captureModelLogValue({ category: 'response', input: { kind: 'value', value: text } }),
    ).toHaveProperty('invalidValue')
    expect(
      captureModelLogValue({
        category: 'response',
        input: {
          kind: 'text',
          text: text.replace('"values":{', '"values":{"duplicate":{"x":1,"x":2},'),
        },
      }),
    ).toHaveProperty('invalidValue')
    let executed = 0
    for (const hostile of [
      {
        ...response,
        get id() {
          executed++
          return 'response'
        },
      },
      {
        ...response,
        toJSON() {
          executed++
          return response
        },
      },
      { ...response, dispatch: Object.create(LosslessNumber.prototype) },
    ])
      expect(
        captureModelLogValue({ category: 'response', input: { kind: 'value', value: hostile } }),
      ).toHaveProperty('invalidValue')
    expect(executed).toBe(0)
    const mutable = { ...reply, createdAt: '2026-09-27T00:00:02Z' }
    const owned = capture('message', mutable)
    mutable.createdAt = '2027-01-01T00:00:00Z'
    expect(jsonObject(owned.value).createdAt).toBe('2026-09-27T00:00:02Z')
    expect(Object.isFrozen(owned.value)).toBe(true)
    const prototype: unknown = Object.getPrototypeOf(owned)
    if (
      prototype === null ||
      typeof prototype !== 'object' ||
      !('constructor' in prototype) ||
      typeof prototype.constructor !== 'function'
    )
      throw new Error('capture prototype')
    const captureConstructor = prototype.constructor
    expect(() =>
      Reflect.construct(captureConstructor, [{}, 'response', {}, null, null, {}]),
    ).toThrow(TypeError)
    expect(
      prepareModelLogEntry({
        session,
        shell: { tenant },
        captured: Object.create(prototype),
        purpose: { kind: 'message' },
        messagePrefix: [],
      }),
    ).toHaveProperty('invalidValue')
    expect(writeJsonLossless(capture('response', response).value)).toContain(
      '0.0000000000000000000000000310',
    )
  })
  it('uses all eight table rows with explicit D in R and no selection D', () => {
    const r = capture('response', response)
    const rows = [
      prepare('record', dispatched, { kind: 'record' }),
      prepare('record', opened, { kind: 'record' }),
      prepare(
        'record',
        { kind: 'model_call_interrupt_intent', call: 'call', initiator: 'user' },
        { kind: 'record' },
      ),
      prepare(
        'record',
        { kind: 'model_call_ended', call: 'call', ending: 'released' },
        { kind: 'record' },
      ),
      ...batch(),
    ]
    // The ordinary message vector below is explicitly formed without assistant-only fields.
    rows.push(
      prepare(
        'message',
        { id: 'ordinary', type: 'user', createdAt: '2026-09-27T00:00:02Z', blocks: reply.blocks },
        { kind: 'message' },
      ),
    )
    const expected = [
      ['dispatched', 'all', 'call', 'dispatch'],
      ['opened', 'all', 'call', 'dispatch'],
      ['intent', 'all', 'call'],
      ['ended', 'all', 'call'],
      ['message', 'all', 'messages', 'call', 'dispatch', 'settlement'],
      ['response', 'all', 'call', 'dispatch', 'settlement'],
      ['message', 'all', 'messages'],
    ]
    for (const [index, item] of rows.entries()) {
      expect(item.readKeys).toContain(item.dedupeKey)
      expect(
        item.readKeys.map(value => {
          const decoded = decodeModelLogKey(value)
          if (!('ok' in decoded)) throw new Error('key')
          return decoded.ok.kind
        }),
      ).toEqual(expected[index])
      const purpose =
        index === 4
          ? { kind: 'persistedMessage' as const, response: r }
          : index === 5
            ? { kind: 'response' as const }
            : index === 6
              ? { kind: 'message' as const }
              : { kind: 'record' as const }
      expect(
        inspectModelLogEntry({
          session,
          tenant,
          entry: located(item, index + 1),
          purpose,
          messagePrefix: [],
        }),
      ).toHaveProperty('ok')
      const reversedKeys = [...item.readKeys].reverse()
      const reordered = inspectModelLogEntry({
        session,
        tenant,
        entry: located({ ...item, readKeys: reversedKeys }, index + 1),
        purpose,
        messagePrefix: [],
      })
      expect(reordered).toHaveProperty('ok')
      if ('ok' in reordered) expect(reordered.ok.entry.readKeys).toEqual(reversedKeys)
      const firstKey = item.readKeys[0]
      if (firstKey === undefined) throw new Error('fixture key set')
      for (const changed of [
        { ...item, readKeys: item.readKeys.slice(1) },
        { ...item, readKeys: [...item.readKeys, firstKey] },
        { ...item, readKeys: [...item.readKeys, key({ kind: 'run', run: 'wrong' })] },
      ])
        expect(
          inspectModelLogEntry({
            session,
            tenant,
            entry: located(changed, index + 1),
            purpose,
            messagePrefix: [],
          }),
        ).toHaveProperty('invalidValue')
    }
    const selection = prepare(
      'record',
      { kind: 'model_selection_changed', routeName: 'teaching/model', at: '2026-09-27T00:00:00Z' },
      { kind: 'record' },
    )
    expect(selection).not.toHaveProperty('dedupeKey')
    expect(selection.readKeys).toEqual([key({ kind: 'all' }), key({ kind: 'selection' })])
    const withRun = prepare(
      'record',
      { kind: 'model_selection_changed', routeName: 'teaching/model', at: '2026-09-27T00:00:00Z' },
      { kind: 'record' },
      { tenant, run: 'selection-run', attempt: 3 },
    )
    expect(withRun).not.toHaveProperty('dedupeKey')
    expect(withRun.readKeys).toEqual([
      key({ kind: 'all' }),
      key({ kind: 'selection' }),
      key({ kind: 'run', run: 'selection-run' }),
    ])
    expect(
      inspectModelLogEntry({
        session,
        tenant,
        entry: located(withRun, 1),
        purpose: { kind: 'record' },
        messagePrefix: null,
      }),
    ).toHaveProperty('ok')
    for (const changed of [
      { ...withRun, readKeys: selection.readKeys },
      { ...selection, readKeys: withRun.readKeys },
    ])
      expect(
        inspectModelLogEntry({
          session,
          tenant,
          entry: located(changed, 1),
          purpose: { kind: 'record' },
          messagePrefix: null,
        }),
      ).toHaveProperty('invalidValue')
  })
  it('requires the actual message prefix and prevents independent assistant writes', () => {
    expect(
      prepareModelLogEntry({
        session,
        shell: { tenant },
        captured: capture('message', reply),
        purpose: { kind: 'message' },
        messagePrefix: [],
      }),
    ).toHaveProperty('invalidValue')
    const user = capture('message', {
      id: 'user',
      type: 'user',
      createdAt: '2026-09-27T00:00:00Z',
      blocks: [],
    })
    expect(
      prepareModelLogEntry({
        session,
        shell: { tenant },
        captured: user,
        purpose: { kind: 'message' },
        messagePrefix: null,
      }),
    ).toEqual({ invalidValue: true, reason: 'message_prefix' })
    const system = capture('message', {
      id: 'system',
      type: 'system',
      createdAt: '2026-09-27T00:00:00Z',
      blocks: [],
    })
    expect(
      prepareModelLogEntry({
        session,
        shell: { tenant },
        captured: system,
        purpose: { kind: 'message' },
        messagePrefix: [],
      }),
    ).toHaveProperty('invalidValue')
    const compaction = capture('message', {
      id: 'compact',
      type: 'compaction',
      createdAt: '2026-09-27T00:00:00Z',
      blocks: [],
      silenced: [{ messageId: 'user', blockId: 'block' }],
    })
    expect(
      prepareModelLogEntry({
        session,
        shell: { tenant },
        captured: compaction,
        purpose: { kind: 'message' },
        messagePrefix: [],
      }),
    ).toEqual({ invalidValue: true, reason: 'message_in_log' })
  })
  it('recognizes all original message values, including source, without canonicalizing', () => {
    const original: JsonObject = {
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
    const candidate = {
      ...original,
      source: { kind: 'extension', extension: 'teaching', payload: { amount: 1 } },
    }
    const result = recognizeMessageValue({
      candidate: { kind: 'value', value: candidate },
      original: { kind: 'value', value: original },
    })
    expect(result).toHaveProperty('same')
    if ('same' in result) expect(writeJsonLossless(result.original.value)).toContain('1.00')
    expect(
      recognizeMessageValue({
        candidate: {
          kind: 'value',
          value: { ...candidate, source: { kind: 'extension', extension: 'different' } },
        },
        original: { kind: 'value', value: original },
      }),
    ).toEqual({ different: true })
    expect(
      recognizeMessageValue({ candidate: { kind: 'value', value: candidate }, original: null }),
    ).toEqual({ absent: true })
    expect(
      recognizeMessageValue({
        candidate: { kind: 'value', value: candidate },
        original: { kind: 'value', value: { id: 'reminder' } },
      }),
    ).toEqual({ undetermined: true, reason: 'message_value' })
  })
})
