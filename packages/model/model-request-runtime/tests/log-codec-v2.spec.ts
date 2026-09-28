import { describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import * as old from '@omne-harness-lite/model-request-runtime'
import * as codec from '@omne-harness-lite/model-request-runtime/log-codec/v2'
import {
  anchors,
  batch,
  capture,
  durable,
  jsonObject,
  located,
  prepare,
  response,
  session,
  tenant,
} from './log-codec-fixture.ts'
import { batchV2, captureV2, prepareV2, responseV5 } from './log-codec-v2-fixture.ts'

const target = { call: 'call', dispatch: 1, response: 'response' }
function write(captured: codec.CapturedModelLogValue) {
  return {
    session,
    shell: { tenant },
    captured,
    purpose: { kind: 'response' } as const,
    messagePrefix: [],
  }
}
function mixed() {
  const initial = anchors()
  return {
    prefix: {
      entries: [...initial.entries, ...batchV2().map((entry, i) => located(entry, i + 3))],
      tail: 4,
    },
    anchors: initial,
  }
}
describe('D094 LC5 fixed public representation domains', () => {
  it('LC5-V1 writes all categories as mrr/2 with owned full ordered MR5 values', () => {
    const mutable = { ...responseV5, raw: { headers: { 'x-values': ['b', '', 'b', 'a'] } } }
    const captured = captureV2('response', mutable)
    mutable.raw.headers['x-values'].push('after-capture')
    const prepared = codec.prepareModelLogEntry(write(captured))
    expect(prepared).toHaveProperty('ok')
    if (!('ok' in prepared)) throw new Error('prepare')
    expect(jsonObject(prepared.ok.payload).format).toBe('mrr/2')
    expect(jsonObject(jsonObject(captured.value).raw).headers).toEqual({
      'x-values': ['b', '', 'b', 'a'],
    })
    expect(writeJsonLossless(captured.value)).toContain('0.0000000000000000000000000310')
    expect(writeJsonLossless(captured.value)).toContain('9007199254740993')
    for (const entry of batchV2()) expect(jsonObject(entry.payload).format).toBe('mrr/2')
    expect(
      jsonObject(
        prepareV2(
          'record',
          anchors().dispatched.payload && jsonObject(anchors().dispatched.payload).value,
          { kind: 'record' },
        ).payload,
      ).format,
    ).toBe('mrr/2')
    expect(codec.modelLogFormat).toBe('mrr/2')
    expect(old.modelLogFormat).toBe('mrr/1')
  })
  it('LC5-V1 preserves absent versus empty headers and rejects malformed MR5', () => {
    expect(jsonObject(captureV2('response', response).value).raw).toBeUndefined()
    expect(
      jsonObject(jsonObject(captureV2('response', { ...response, raw: { headers: {} } }).value).raw)
        .headers,
    ).toEqual({})
    for (const rawHeaders of [null, { x: [3] }, { x: [null] }, { x: {} }])
      expect(
        codec.captureModelLogValue({
          category: 'response',
          input: { kind: 'value', value: { ...response, raw: { headers: rawHeaders } } },
        }),
      ).toHaveProperty('invalidValue')
    expect(
      codec.captureModelLogValue({
        category: 'response',
        input: { kind: 'text', text: '{"id":"x","id":"y"}' },
      }),
    ).toEqual({ invalidValue: true, reason: 'not_json' })
  })
  it('LC5-V2 rejects both cross-domain captures, including common MR4 values and messages', () => {
    expect(old.prepareModelLogEntry(write(captureV2('response', responseV5)))).toHaveProperty(
      'invalidValue',
    )
    expect(old.prepareModelLogEntry(write(captureV2('response', response)))).toHaveProperty(
      'invalidValue',
    )
    expect(codec.prepareModelLogEntry(write(capture('response', response)))).toHaveProperty(
      'invalidValue',
    )
    const message = captureV2('message', response.reply)
    expect(
      old.prepareModelLogEntry({
        ...write(message),
        purpose: { kind: 'persistedMessage', response: capture('response', response) },
      }),
    ).toHaveProperty('invalidValue')
    expect(
      old.captureModelLogValue({
        category: 'response',
        input: { kind: 'value', value: responseV5 },
      }),
    ).toHaveProperty('invalidValue')
    expect(
      old.inspectSettlementMembers({
        mode: 'write',
        session,
        tenant,
        prefix: { entries: anchors().entries, tail: 2 },
        anchors: anchors(),
        target,
        current: { messageId: 'winner-message', disposition: 'persisted' },
        candidates: batchV2(),
      }),
    ).not.toHaveProperty('completeMembers')
    expect(
      codec.inspectSettlementMembers({
        mode: 'write',
        session,
        tenant,
        prefix: { entries: anchors().entries, tail: 2 },
        anchors: anchors(),
        target,
        current: { messageId: 'winner-message', disposition: 'persisted' },
        candidates: batch(),
      }),
    ).not.toHaveProperty('completeMembers')
  })
  it('LC5-V2 cannot reflect, forge, or reuse a history capture as a v2 write', () => {
    const captured = captureV2('response', responseV5)
    const prototype: unknown = Object.getPrototypeOf(captured)
    if (prototype === null || typeof prototype !== 'object') throw new Error('prototype')
    const constructor: unknown = Reflect.get(prototype, 'constructor')
    if (typeof constructor !== 'function') throw new Error('constructor')
    expect(() => Reflect.construct(constructor, [{}, 'response', {}, null, null, {}])).toThrow()
    for (const forged of [Object.create(prototype), { ...captured }])
      expect(codec.prepareModelLogEntry(write(forged))).toHaveProperty('invalidValue')
    const source = mixed().prefix.entries[3]
    const inspected = codec.inspectModelLogEntry({
      session,
      tenant,
      entry: source,
      purpose: { kind: 'response' },
      messagePrefix: [],
    })
    if (!('ok' in inspected)) throw new Error('history inspect')
    expect(codec.prepareModelLogEntry(write(inspected.ok.captured))).toHaveProperty('invalidValue')
    expect(
      codec.prepareModelLogEntry(write(captureV2('response', inspected.ok.captured.value))),
    ).toHaveProperty('ok')
  })
  it('LC5-V2 keeps legacy inspect-to-prepare behavior but no v2 bypass', () => {
    const entry = located(prepare('response', response, { kind: 'response' }), 3)
    const legacy = old.inspectModelLogEntry({
      session,
      tenant,
      entry,
      purpose: { kind: 'response' },
      messagePrefix: [],
    })
    if (!('ok' in legacy)) throw new Error('legacy')
    expect(old.prepareModelLogEntry(write(legacy.ok.captured))).toHaveProperty('ok')
    expect(codec.prepareModelLogEntry(write(legacy.ok.captured))).toHaveProperty('invalidValue')
    const history = codec.inspectModelLogEntry({
      session,
      tenant,
      entry,
      purpose: { kind: 'response' },
      messagePrefix: [],
    })
    if (!('ok' in history)) throw new Error('mixed history')
    expect(jsonObject(history.ok.entry.payload).format).toBe('mrr/1')
    expect(codec.prepareModelLogEntry(write(history.ok.captured))).toHaveProperty('invalidValue')
  })
  it('LC5-V3 reads mixed history by actual format and preserves the original winner', () => {
    const result = codec.inspectSettlementMembers({
      mode: 'read',
      session,
      tenant,
      ...mixed(),
      target,
      current: null,
    })
    expect(result).toHaveProperty('completeMembers')
    if (!('completeMembers' in result)) throw new Error('mixed')
    expect(result.completeMembers.entries.map(entry => jsonObject(entry.payload).format)).toEqual([
      'mrr/2',
      'mrr/2',
    ])
    const previous = durable()
    const winner = codec.inspectSettlementMembers({
      mode: 'write',
      session,
      tenant,
      ...previous,
      target,
      current: { messageId: 'never-submitted', disposition: { consumed: { by: 'side_query' } } },
      candidates: [],
    })
    if (!('completeMembers' in winner)) throw new Error('prior winner')
    expect(winner.completeMembers.mode).toBe('read')
    expect(winner.completeMembers.disposition).toBe('firstWinner')
    expect(winner.completeMembers.entries.map(entry => jsonObject(entry.payload).format)).toEqual([
      'mrr/1',
      'mrr/1',
    ])
    expect(writeJsonLossless(winner.completeMembers.response.value)).toBe(
      writeJsonLossless(capture('response', response).value),
    )
  })
  it.each(['mrr/0', 'mrr/3', 'alien'])(
    'LC5-V3 refuses unknown format %s instead of treating it as absent',
    format => {
      const history = mixed()
      const entries = history.prefix.entries.map((entry, index) =>
        index === 3 ? { ...entry, payload: { ...jsonObject(entry.payload), format } } : entry,
      )
      expect(
        codec.inspectSettlementMembers({
          mode: 'read',
          session,
          tenant,
          ...history,
          prefix: { entries, tail: 4 },
          target,
          current: null,
        }),
      ).toEqual({ undetermined: true, reason: 'unknown_format' })
    },
  )
  it('LC5-V3 rejects mrr/1 arrays, wrong keys/shells/associations and old reads of mrr/2', () => {
    const history = mixed()
    const entry = history.prefix.entries[3]
    if (!entry) throw new Error('entry')
    for (const changed of [
      { ...entry, session: 'wrong-session' },
      { ...entry, tenant: { organization: 'other', account: 'other' } },
      { ...entry, payload: { ...jsonObject(entry.payload), format: 'mrr/3' } },
    ])
      expect(
        codec.inspectModelLogEntry({
          session,
          tenant,
          entry: changed,
          purpose: { kind: 'response' },
          messagePrefix: [],
        }),
      ).toHaveProperty('invalidValue')
    for (const changed of [
      { ...entry, payload: { ...jsonObject(entry.payload), format: 'mrr/1' } },
      { ...entry, readKeys: [] },
      {
        ...entry,
        payload: {
          ...jsonObject(entry.payload),
          value: {
            ...responseV5,
            timing: {
              sentAt: '2026-09-27T00:00:00Z',
              firstTokenAt: '2026-09-27T00:00:01.1Z',
              endedAt: '2026-09-27T00:00:02Z',
            },
          },
        },
      },
    ]) {
      const entries = history.prefix.entries.map((item, i) => (i === 3 ? changed : item))
      expect(
        codec.inspectSettlementMembers({
          mode: 'read',
          session,
          tenant,
          ...history,
          prefix: { entries, tail: 4 },
          target,
          current: null,
        }),
      ).not.toHaveProperty('completeMembers')
    }
    expect(
      old.inspectModelLogEntry({
        session,
        tenant,
        entry,
        purpose: { kind: 'response' },
        messagePrefix: [],
      }),
    ).toHaveProperty('invalidValue')
    expect(
      old.inspectSettlementMembers({
        mode: 'read',
        session,
        tenant,
        ...history,
        target,
        current: null,
      }),
    ).toEqual({ undetermined: true, reason: 'unknown_format' })
  })
  it('LC5-V4 shares exact response and message dedupe identities across payload versions', () => {
    const legacy = batch(),
      current = batchV2()
    expect(current.map(item => item.dedupeKey)).toEqual(legacy.map(item => item.dedupeKey))
    expect(current.map(item => item.readKeys)).toEqual(legacy.map(item => item.readKeys))
    expect(current.every(item => item.dedupeKey?.startsWith('mrr/1/'))).toBe(true)
  })
})
