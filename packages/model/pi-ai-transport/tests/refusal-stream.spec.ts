import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  writeJsonLossless,
  type JsonNumber,
} from '@omne-harness-lite/content-blocks'
import { getEventListeners } from 'node:events'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { readStream } from '@omne-harness-lite/pi-ai-transport'
import { invokeModel } from '@omne-harness-lite/model-request-runtime'
import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'
import { certificate, fixture, finish, input, invocation, planned, policy, sse } from './support.ts'

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())
function expectTokens(value: JsonNumber | 'unknown', expected: number) {
  if (value === 'unknown') throw Error('expected known tokens')
  expect(ExactDecimal.from(value).compare(ExactDecimal.from(expected))).toBe(0)
}
const refusal = (text: unknown) => sse({ choices: [{ delta: { refusal: text } }] })
const usage = {
  prompt_tokens: 123,
  completion_tokens: 7,
  prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 3 },
  cost: new LosslessNumber('0.000123456789123456789'),
}
async function run(body: string, credential = 'synthetic-refusal-credential') {
  const events: ArrivalEvent[] = [],
    diagnostics: unknown[] = []
  const host = await fixture(
    cert.tls,
    res => res.end(body),
    {},
    event => {
      diagnostics.push(event)
    },
  )
  try {
    const result = invocation(
      await invokeModel({
        ...input(),
        transport: host.transport,
        credential,
        signal: new AbortController().signal,
        policy: policy(),
        onAccepted: event => {
          events.push(event)
        },
      }).outcome,
    )
    expect(host.requests).toHaveLength(1)
    return { result, events, diagnostics }
  } finally {
    await host.close()
  }
}

describe('D108 refusal mapping through shared production reader over TLS', () => {
  it('RF-V1 pure whitespace is actual content', async () => {
    const { result } = await run(refusal(' \t\n') + finish())
    expect(result.outcome).toBe('complete')
    expect(result.timing.firstTokenAt).toBeDefined()
    expect(result.blocks).toMatchObject([{ text: ' \t\n' }])
  })
  it('RF-V5 late in-band error preserves refusal and earlier facts without reading future usage', async () => {
    const { result, events } = await run(
      sse({ choices: [{ delta: { refusal: 'already delivered' } }], usage }) +
        sse({ error: { code: 503, message: 'unavailable' } }) +
        sse({ choices: [], usage: { prompt_tokens: 999 } }) +
        finish(),
    )
    expect(result.outcome).toBe('failed')
    expect(result.failure).toMatchObject({
      cause: 'interrupted_mid_reply',
      statusCode: 503,
      inBand: true,
    })
    expect(result.blocks).toMatchObject([{ text: 'already delivered' }])
    expectTokens(result.usage.input_tokens, 100)
    expect(events.filter(event => event.t === 'account')).toHaveLength(1)
  })
  for (const mode of ['cancel', 'idle-timeout'] as const) {
    it(`RF-V7 ${mode} after refusal stops a hanging socket and retains already-read facts`, async () => {
      const events: ArrivalEvent[] = []
      const host = await fixture(cert.tls, res => {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write(sse({ choices: [{ delta: { refusal: 'partial' } }], usage }))
      })
      try {
        const handle = invokeModel({
          ...input(),
          transport: host.transport,
          credential: 'synthetic-credential',
          signal: new AbortController().signal,
          policy: { ...policy(), idleContentTimeoutMs: mode === 'idle-timeout' ? 80 : 3000 },
          onAccepted: event => {
            events.push(event)
          },
        })
        if (mode === 'cancel') {
          await expect.poll(() => events.some(event => event.t === 'fill')).toBe(true)
          handle.abort()
        }
        const result = invocation(await handle.outcome)
        expect(result.outcome).toBe(mode === 'cancel' ? 'interrupted' : 'failed')
        expect(result.ending).toBe(mode === 'cancel' ? 'interrupted_by_user' : undefined)
        if (mode === 'cancel') expect(result.failure).toBeUndefined()
        else expect(result.failure?.cause).toBe('interrupted_mid_reply')
        expect(result.blocks).toMatchObject([{ text: 'partial' }])
        expectTokens(result.usage.input_tokens, 100)
        expect(writeJsonLossless(result.cost)).toContain('0.000123456789123456789')
        // Cancellation closes the event sequence; already-read facts travel in the final outcome.
        expect(events.filter(event => event.t === 'account')).toHaveLength(0)
        await expect.poll(host.closedSockets).toBe(1)
        expect(host.requests).toHaveLength(1)
      } finally {
        await host.close()
      }
    })
  }
  for (const [label, delta] of [
    ['missing', {}],
    ['null', { refusal: null }],
    ['empty', { refusal: '' }],
  ] as const) {
    it(`RF-V1 ${label} neither opens a block nor passes the first-content gate`, async () => {
      const { result, events } = await run(sse({ choices: [{ delta }] }) + finish())
      expect(result.blocks).toEqual([])
      expect(result.timing.firstTokenAt).toBeUndefined()
      expect(events.some(event => ['open', 'fill', 'close'].includes(event.t))).toBe(false)
    })
  }
  for (const value of [false, true, 0, 42, [], ['private-invalid'], { text: 'private-invalid' }]) {
    it(`RF-V1 invalid ${JSON.stringify(value)} rejects before same-frame content and preserves facts`, async () => {
      const { result, events, diagnostics } = await run(
        sse({
          choices: [{ delta: { content: 'must-not-leak', refusal: value } }],
          usage,
        }) +
          sse({ choices: [], usage: { prompt_tokens: 999 } }) +
          finish(),
      )
      expect(result.outcome).toBe('failed')
      expect(result.failure?.localError).toBe('invalid refusal')
      expect(result.blocks).toEqual([])
      expectTokens(result.usage.input_tokens, 100)
      expect(result.usage).toMatchObject({
        output_tokens: 7,
        cache_read_tokens: 20,
        cache_write_tokens: 3,
      })
      expect(writeJsonLossless(result.cost)).toContain('0.000123456789123456789')
      expect(events.filter(event => event.t === 'account')).toHaveLength(1)
      expect(writeJsonLossless([result, diagnostics])).not.toContain('private-invalid')
      expect(writeJsonLossless([result, diagnostics])).not.toContain('must-not-leak')
    })
  }
  it('RF-V1/V2 actual whitespace/unicode, frame order and deterministic same-frame order share one text block', async () => {
    // JSON key insertion order deliberately places refusal before content.
    const body =
      refusal('拒答🙂') +
      sse({ choices: [{ delta: { refusal: ' R ', content: 'C' } }] }) +
      sse({ choices: [{ delta: { content: 'later', refusal: '\n', reasoning: 'thinking' } }] }) +
      finish()
    const { result, events } = await run(body)
    expect(result.outcome).toBe('complete')
    expect(result.blocks).toMatchObject([
      { kind: 'text', text: '拒答🙂C R later\n' },
      { kind: 'thinking', text: 'thinking' },
    ])
    expect(
      events
        .filter(event => event.t === 'open')
        .map(event => ({ kind: event.kind, index: writeJsonLossless(event.index) })),
    ).toEqual([
      { kind: 'text', index: '0' },
      { kind: 'thinking', index: '1' },
    ])
    expect(events.filter(event => event.t === 'fill').map(event => event.payload)).toEqual([
      '拒答🙂',
      'C',
      ' R ',
      'later',
      '\n',
      'thinking',
    ])
    const text = result.blocks[0]
    expect(text).not.toHaveProperty('origin')
    expect(text).not.toHaveProperty('opaque')
  })
  it('RF-V2 shared text channel keeps existing thinking and tool opening order', async () => {
    const { result, events } = await run(
      sse({ choices: [{ delta: { reasoning: 'think' } }] }) +
        sse({
          choices: [
            {
              delta: {
                refusal: 'refuse',
                tool_calls: [
                  {
                    index: 0,
                    type: 'function',
                    function: { name: 'lookup', arguments: '{"x":1}' },
                  },
                ],
              },
            },
          ],
        }) +
        sse({ choices: [{ delta: { content: 'after' } }] }) +
        finish('tool_calls'),
    )
    expect(result.outcome).toBe('complete')
    expect(
      events
        .filter(event => event.t === 'open')
        .map(event => ({ kind: event.kind, index: writeJsonLossless(event.index) })),
    ).toEqual([
      { kind: 'thinking', index: '0' },
      { kind: 'text', index: '1' },
      { kind: 'tool_call', index: '2' },
    ])
    expect(result.blocks).toMatchObject([
      { kind: 'thinking', text: 'think' },
      { kind: 'text', text: 'refuseafter' },
      { kind: 'tool_call', tool: 'lookup' },
    ])
  })
  for (const reason of ['stop', 'tool_calls', 'length']) {
    it(`RF-V4 ${reason} uses actual finish and reads normal trailing usage before DONE`, async () => {
      const { result, events } = await run(
        refusal('actual refusal') +
          sse({ choices: [{ delta: {}, finish_reason: reason }] }) +
          sse({ choices: [{ delta: { refusal: '' }, finish_reason: reason }], usage }) +
          sse('[DONE]'),
      )
      expect(result.outcome).toBe(reason === 'length' ? 'truncated' : 'complete')
      expect(result.ending).toBe(reason === 'length' ? 'truncated_at_limit' : 'complete')
      expect(result.blocks).toMatchObject([{ kind: 'text', text: 'actual refusal' }])
      expect(result.failure).toBeUndefined()
      expectTokens(result.usage.input_tokens, 100)
      expect(result.usage).toMatchObject({
        output_tokens: 7,
        source: 'upstream',
      })
      expect(events.filter(event => event.t === 'account')).toHaveLength(1)
      expect(events.filter(event => event.t === 'close')).toHaveLength(reason === 'length' ? 0 : 1)
    })
  }
  for (const [label, tail, expected] of [
    [
      'content_filter',
      sse({ choices: [{ delta: {}, finish_reason: 'content_filter' }] }),
      undefined,
    ],
    ['error finish', sse({ choices: [{ delta: {}, finish_reason: 'error' }] }), undefined],
    ['EOF', '', 'stream ended before terminal facts'],
    ['bad JSON', 'data: {bad}\n\n', 'invalid SSE JSON'],
    ['duplicate key', 'data: {"choices":[],"choices":[]}\n\n', 'invalid SSE JSON'],
    [
      'changed finish',
      sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }) +
        sse({ choices: [{ delta: {}, finish_reason: 'length' }] }),
      'finish_reason changed',
    ],
    [
      'late refusal',
      sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + refusal('late'),
      'content after finish_reason',
    ],
    ['DONE without finish', sse('[DONE]'), 'stream ended before terminal facts'],
  ] as const) {
    it(`RF-V5 ${label} keeps delivered text without a successful reply or invented later usage`, async () => {
      const { result, events } = await run(refusal('delivered refusal') + tail)
      expect(result.outcome).toBe('failed')
      expect(result.failure?.cause).toBe('interrupted_mid_reply')
      if (expected) expect(result.failure?.localError).toBe(expected)
      expect(result.ending).toBeUndefined()
      expect(result.blocks).toMatchObject([{ kind: 'text', text: 'delivered refusal' }])
      expect(result.usage.input_tokens).toBe('unknown')
      expect(events.filter(event => event.t === 'close')).toHaveLength(0)
    })
  }
  it('RF-V5/V8 same-frame error wins over refusal/content, preserves independent 503 and same-frame exact usage', async () => {
    const { result, events } = await run(
      sse({
        error: { code: 503, message: '503' },
        usage,
        choices: [{ delta: { content: 'must-not-leak', refusal: 'must-not-leak' } }],
      }) + sse({ choices: [], usage: { prompt_tokens: 999 } }),
      '503',
    )
    expect(result.outcome).toBe('failed')
    expect(result.failure).toMatchObject({ statusCode: 503, inBand: true })
    expect(writeJsonLossless(result.failure?.upstreamError)).not.toContain('"message":"503"')
    expect(result.blocks).toEqual([])
    expectTokens(result.usage.input_tokens, 100)
    expect(events.filter(event => event.t === 'account')).toHaveLength(1)
  })
  it('RF-V6 accounting before/same/after refusal is one account and conflicts remain unavailable', async () => {
    const { result, events } = await run(
      sse({ choices: [], usage }) +
        sse({ choices: [{ delta: { refusal: 'text' } }], usage }) +
        sse({
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { ...usage, prompt_tokens: 124 },
        }) +
        sse('[DONE]'),
    )
    expect(result.outcome).toBe('complete')
    expect(result.inputCalibration.observedInput).toMatchObject({
      kind: 'unavailable',
      reason: 'inconsistent_usage',
    })
    expect(events.filter(event => event.t === 'account')).toHaveLength(1)
    expectTokens(result.usage.input_tokens, 100)
  })
  it('RF-V8 legal reply text is unchanged by credential policy and diagnostics do not copy it', async () => {
    const { result, diagnostics } = await run(refusal('503') + finish(), '503')
    expect(result.blocks).toMatchObject([{ text: '503' }])
    expect(JSON.stringify(diagnostics)).not.toContain('503')
  })
  it('RF-V9 exported readStream path yields the same refusal text and settles stopped', async () => {
    const host = await fixture(cert.tls, res => res.end(refusal('public reader') + finish()))
    try {
      const request = planned(host.transport)
      const sent = await host.transport.send(
        request,
        'synthetic-credential',
        new AbortController().signal,
      )
      if (!('response' in sent)) throw Error('expected actual response')
      const signal = new AbortController().signal
      const listenersBefore = getEventListeners(signal, 'abort').length
      const iterator = readStream(sent.response, request, signal, {
        maxSseEventBytes: 16384,
        diagnostic: () => {},
      })
      const events: ArrivalEvent[] = []
      let end = await iterator.next()
      while (!end.done) {
        events.push(end.value)
        end = await iterator.next()
      }
      expect(end.value).toMatchObject({ ended: 'end' })
      expect(events.filter(event => event.t === 'fill')).toMatchObject([
        { payload: 'public reader' },
      ])
      await sent.response.stopped
      expect(getEventListeners(signal, 'abort')).toHaveLength(listenersBefore)
      expect(host.requests).toHaveLength(1)
    } finally {
      await host.close()
    }
  })
  it('RF-V7 direct reader cancellation removes its listener and actually stops without later facts', async () => {
    const host = await fixture(cert.tls, res => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(refusal('read before abort'))
    })
    try {
      const request = planned(host.transport)
      const controller = new AbortController()
      const initialListeners = getEventListeners(controller.signal, 'abort').length
      const sent = await host.transport.send(request, 'synthetic-credential', controller.signal)
      if (!('response' in sent)) throw Error('expected actual response')
      const iterator = readStream(sent.response, request, controller.signal, {
        maxSseEventBytes: 16384,
        diagnostic: () => {},
      })
      expect((await iterator.next()).value).toMatchObject({ t: 'open', kind: 'text' })
      expect((await iterator.next()).value).toMatchObject({
        t: 'fill',
        payload: 'read before abort',
      })
      controller.abort()
      const ended = await iterator.next()
      expect(ended.done).toBe(true)
      expect(ended.value).toMatchObject({
        aborted: true,
        readFacts: { usage: { input_tokens: 'unknown' }, cost: { cost_usd: 'unknown' } },
      })
      await sent.response.stopped
      await expect.poll(host.closedSockets).toBe(1)
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(initialListeners)
      expect(host.requests).toHaveLength(1)
    } finally {
      await host.close()
    }
  })
  it('RF-V5 oversized later event fails without discarding refusal already delivered', async () => {
    const { result } = await run(refusal('retained') + refusal('x'.repeat(20000)) + finish())
    expect(result.outcome).toBe('failed')
    expect(result.failure?.cause).toBe('interrupted_mid_reply')
    expect(result.blocks).toMatchObject([{ text: 'retained' }])
    expect(result.usage.input_tokens).toBe('unknown')
  })
})
