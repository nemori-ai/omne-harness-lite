import { modelFormat } from './log-codec-fixture.ts'
import { describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import * as codec from '@omne-harness-lite/model-request-runtime'
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
import { responseV5 } from './log-codec-v2-fixture.ts'

const target = { call: 'call', dispatch: 1, response: 'response' }
const write = (captured: codec.CapturedModelLogValue) => ({
  session,
  shell: { tenant },
  captured,
  purpose: { kind: 'response' } as const,
  messagePrefix: [],
})

describe('D100 current root model-log codec', () => {
  it('writes mrr/3 payloads and keys with full ordered MR7 values', () => {
    const mutable = { ...responseV5, raw: { headers: { 'x-values': ['b', '', 'b', 'a'] } } }
    const captured = capture('response', mutable)
    mutable.raw.headers['x-values'].push('after-capture')
    const prepared = codec.prepareModelLogEntry(write(captured))
    if (!('ok' in prepared)) throw new Error('prepare')
    expect(codec.modelLogFormat).toBe('mrr/3')
    expect(modelFormat(prepared.ok.payload)).toBe('mrr/3')
    expect(prepared.ok.dedupeKey?.startsWith('mrr/3/')).toBe(true)
    expect(prepared.ok.readKeys.every(key => key.startsWith('mrr/3/'))).toBe(true)
    expect(jsonObject(jsonObject(captured.value).raw).headers).toEqual({
      'x-values': ['b', '', 'b', 'a'],
    })
    expect(writeJsonLossless(captured.value)).toContain('0.0000000000000000000000000310')
    expect(writeJsonLossless(captured.value)).toContain('9007199254740993')
    expect(anchors().entries.every(entry => modelFormat(entry.payload) === 'mrr/3')).toBe(true)
    expect(batch().every(entry => modelFormat(entry.payload) === 'mrr/3')).toBe(true)
  })

  it('keeps absent and empty headers distinct and rejects malformed values', () => {
    expect(jsonObject(capture('response', response).value).raw).toBeUndefined()
    expect(
      jsonObject(jsonObject(capture('response', { ...response, raw: { headers: {} } }).value).raw)
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

  it('rejects forged captures and wrong session, tenant, key or body generation', () => {
    const captured = capture('response', response)
    const prototype: unknown = Object.getPrototypeOf(captured)
    if (prototype === null || typeof prototype !== 'object') throw new Error('prototype')
    const constructor: unknown = Reflect.get(prototype, 'constructor')
    if (typeof constructor !== 'function') throw new Error('constructor')
    expect(() => Reflect.construct(constructor, [{}, 'response', {}, null, null, {}])).toThrow()
    for (const forged of [Object.create(prototype), { ...captured }])
      expect(codec.prepareModelLogEntry(write(forged))).toHaveProperty('invalidValue')
    const entry = located(prepare('response', response, { kind: 'response' }), 3)
    for (const changed of [
      { ...entry, session: 'wrong-session' },
      { ...entry, tenant: { organization: 'other', account: 'other' } },
      { ...entry, readKeys: [] },
      { ...entry, dedupeKey: entry.dedupeKey?.replace('mrr/3', 'mrr/1') },
      { ...entry, payload: { ...jsonObject(entry.payload), version: 'mrr/1' } },
      { ...entry, payload: { ...jsonObject(entry.payload), version: 'mrr/2' } },
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
  })

  it.each(['mrr/1', 'mrr/2', 'mrr/4'])('refuses old or unknown %s in a complete prefix', format => {
    const prior = durable()
    const entries = prior.prefix.entries.map((entry, index) =>
      index === 3
        ? { ...entry, payload: { ...jsonObject(entry.payload), version: format } }
        : entry,
    )
    expect(
      codec.inspectSettlementMembers({
        mode: 'read',
        session,
        tenant,
        ...prior,
        prefix: { entries, tail: prior.prefix.tail },
        target,
        current: null,
      }),
    ).toEqual({ undetermined: true, reason: 'unknown_format' })
  })

  it('recognizes only the original full current [message,response] batch', () => {
    const prior = durable()
    const winner = codec.inspectSettlementMembers({
      mode: 'write',
      session,
      tenant,
      ...prior,
      target,
      current: { messageId: 'another-message', disposition: { consumed: { by: 'side_query' } } },
      candidates: [],
    })
    if (!('completeMembers' in winner)) throw new Error('prior winner')
    expect(winner.completeMembers.mode).toBe('read')
    expect(winner.completeMembers.entries.map(entry => modelFormat(entry.payload))).toEqual([
      'mrr/3',
      'mrr/3',
    ])
    expect(writeJsonLossless(winner.completeMembers.response.value)).toBe(
      writeJsonLossless(capture('response', response).value),
    )
  })
})
