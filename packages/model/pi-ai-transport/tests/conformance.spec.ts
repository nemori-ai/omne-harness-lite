import { testDefinitions } from './definitions.ts'
import { planRequest } from './synthetic-input-meter.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  isJsonNumber,
  readOpaqueJson,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'
import {
  start,
  accept,
  closeOut,
  type AssemblySettlement,
} from '@omne-harness-lite/stream-assembly'
import {
  invokeModel,
  type PlanInput,
  type StreamEnd,
} from '@omne-harness-lite/model-request-runtime-local'
import {
  type RawResponse,
  type PlannedRequest,
  type Diagnostic,
} from '@omne-harness-lite/pi-ai-transport'
import {
  certificate,
  content,
  finish,
  fixture,
  input,
  judgedMessage,
  invocation,
  planned,
  policy,
  sse,
  at,
} from './support.ts'

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

type Host = Awaited<ReturnType<typeof fixture>>
interface Reading {
  readonly events: readonly ArrivalEvent[]
  readonly end: StreamEnd
}
async function openResponse(host: Host, request = input()) {
  const plan = await planned(host.transport, request)
  const signal = new AbortController().signal
  const sent = await host.transport.send(plan, 'synthetic-conformance-credential', signal)
  if (!('response' in sent)) throw new Error('controlled HTTPS response unavailable')
  return { response: sent.response, plan, signal }
}
async function readResponse(
  host: Host,
  response: RawResponse,
  plan: PlannedRequest,
  signal: AbortSignal,
  onEvent: (event: ArrivalEvent) => void = () => {},
): Promise<Reading> {
  const events: ArrivalEvent[] = []
  const reader = host.transport.read(response, plan, signal)
  while (true) {
    const next = await reader.next()
    if (next.done) {
      await response.stopped
      return { events, end: next.value }
    }
    events.push(next.value)
    onEvent(next.value)
  }
}
async function read(host: Host): Promise<Reading> {
  const opened = await openResponse(host)
  return readResponse(host, opened.response, opened.plan, opened.signal)
}
function assemble(reading: Reading, request: PlanInput = input()): AssemblySettlement {
  const initial = start(request.target)
  if ('rejected' in initial) throw new Error(`SA fixture target rejected: ${initial.rejected}`)
  let state = initial.ok
  for (const event of reading.events) {
    // runtime/v3 S-59④, arrival/v2 S-7/S-11/S-13: the real consumer judges each event.
    const next = accept(state, event)
    if ('rejected' in next) throw new Error(`SA rejected transport ${event.t}: ${next.rejected}`)
    state = next.ok
  }
  expect(reading.events.some(event => event.t === 'finish')).toBe(false)
  const reason = 'ended' in reading.end ? reading.end.ended : 'lost'
  const final = accept(state, { t: 'finish', reason })
  if ('rejected' in final) throw new Error(`SA host finish rejected: ${final.rejected}`)
  const settled = closeOut(final.ok)
  if ('rejected' in settled) throw new Error(`SA settlement rejected: ${settled.rejected}`)
  return settled.ok
}
function jsonObject(value: JsonValue | undefined): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value) && !LosslessNumber.is(value)
}
// Vitest cannot inspect LosslessNumber's private value. Compare typed JSON
// trees with exact decimals and ignore object member order; every node is
// tagged, so an ordinary JSON object cannot collide with a number marker.
function comparableJson(value: JsonValue): JsonValue {
  if (isJsonNumber(value)) return ['number', ExactDecimal.from(value).toString()]
  if (Array.isArray(value)) return ['array', value.map(comparableJson)]
  if (jsonObject(value))
    return [
      'object',
      Object.keys(value)
        .sort()
        .map(key => {
          const member = value[key]
          if (member === undefined) throw new Error('undefined is not JSON')
          return [key, comparableJson(member)]
        }),
    ]
  return [typeof value, value]
}
function assistantWith(blocks: AssemblySettlement['blocks']) {
  return judgedMessage({
    id: 'replay-assistant',
    type: 'assistant',
    createdAt: at,
    response: 'replay-response',
    ending: 'complete',
    blocks,
  })
}
async function replayBody(request: PlanInput, blocks: AssemblySettlement['blocks']) {
  const result = await planRequest(
    { ...request, messages: [assistantWith(blocks)] },
    testDefinitions,
  )
  if ('rejected' in result) throw new Error(`replay planning rejected: ${result.rejected}`)
  const messages = result.planned.body.messages
  if (!Array.isArray(messages)) throw new Error('planned messages missing')
  const assistant = messages.find(value => jsonObject(value) && value.role === 'assistant')
  if (!jsonObject(assistant)) throw new Error('planned assistant missing')
  return assistant
}
async function assertStoppedOnce(host: Host) {
  expect(host.requests).toHaveLength(1)
  await host.transport.close()
  await expect.poll(host.closedSockets).toBe(1)
}

describe('public transport conformance increments against actual HTTPS and stream-assembly', () => {
  it('T-12/T-14: multiline SSE, comments and empty non-content fields preserve text and produce accepted events', async () => {
    // v3 S-59④; adopted design: strict SSE/ignored fields; arrival/v2 S-20.
    const multiline =
      ': heartbeat\r\nevent: message\r\nid: transport-only\r\nretry: 3000\r\n' +
      'data: {"choices":\r\ndata: [{"delta":{"content":"你🙂","role":"assistant","refusal":null,"annotations":[]}}]}\r\n\r\n'
    const host = await fixture(cert.tls, res => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(
        sse({
          choices: [{ delta: { content: '', role: 'assistant', refusal: null, annotations: [] } }],
        }),
      )
      for (const byte of Buffer.from(multiline + finish())) res.write(Buffer.from([byte]))
      res.end()
    })
    try {
      const result = await read(host)
      expect(result.end).toMatchObject({ ended: 'end' })
      expect(result.events.filter(event => event.t === 'fill')).toMatchObject([{ payload: '你🙂' }])
      expect(result.events.filter(event => event.t === 'open')).toHaveLength(1)
      const settled = assemble(result)
      expect(settled.blocks).toMatchObject([{ kind: 'text', text: '你🙂' }])
      expect(settled.ending.firstContentAt).toBeDefined()
      await assertStoppedOnce(host)
    } finally {
      await host.close()
    }
  })

  it('T-1/T-19: a real socket reset after successful headers retains no invented terminal or billing facts', async () => {
    // runtime/v3 S-58③/⑤, S-59⑥/⑧; design stream_broken; response/v4 S-19.
    let disconnect = () => {}
    const host = await fixture(cert.tls, res => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.flushHeaders()
      disconnect = () => res.destroy()
    })
    try {
      const opened = await openResponse(host)
      const reading = readResponse(host, opened.response, opened.plan, opened.signal)
      disconnect()
      const result = await reading
      expect(result.end).toMatchObject({ failed: { source: 'stream_broken' } })
      expect(result.end).not.toHaveProperty('stopReason')
      expect(result.end).not.toHaveProperty('upstreamRequestId')
      expect(result.events).toEqual([])
      const settled = assemble(result)
      expect(settled.ending).toEqual({ reason: 'lost' })
      expect(settled.account).toMatchObject({
        usage: { input_tokens: 'unknown', output_tokens: 'unknown', source: 'none' },
        cost: { cost_usd: 'unknown', source: 'none' },
      })
      await assertStoppedOnce(host)
    } finally {
      await host.close()
    }
  })

  it('T-1/T-3/T-19: a real reset mid-tool preserves only raw unclosed arguments and never resends', async () => {
    // runtime/v3 S-38③, S-59④⑥; arrival/v2 S-13; content/v3 S-13.
    const fragment = '{"amount":9007199254740993,"more":'
    let disconnect = () => {}
    const host = await fixture(cert.tls, res => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(
        sse({
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, function: { name: 'ledger__record', arguments: fragment } },
                ],
              },
            },
          ],
        }),
      )
      disconnect = () => res.destroy()
    })
    try {
      const opened = await openResponse(host)
      const result = await readResponse(
        host,
        opened.response,
        opened.plan,
        opened.signal,
        event => {
          if (event.t === 'fill') disconnect()
        },
      )
      expect(result.end).toMatchObject({ failed: { source: 'stream_broken' } })
      expect(result.events.filter(event => event.t === 'close')).toEqual([])
      expect(result.events.filter(event => event.t === 'fill')).toMatchObject([
        { payload: fragment },
      ])
      expect(assemble(result).blocks).toMatchObject([
        {
          kind: 'tool_call',
          tool: 'ledger__record',
          complete: false,
          rawArguments: fragment,
          visibility: { toHuman: false, toModel: false },
        },
      ])
      await assertStoppedOnce(host)
    } finally {
      await host.close()
    }
  })

  it.each([
    ['absent code', { message: 'untyped upstream failure', metadata: { marker: null } }],
    [
      'fractional code',
      {
        code: new LosslessNumber('5.001e2'),
        message: 'fractional upstream code',
        metadata: { exact: new LosslessNumber('9007199254740993') },
      },
    ],
  ])('T-19: %s in-band errors retain raw values without borrowing HTTP 200', async (_name, raw) => {
    // runtime/v3 S-38②, S-59③; design code-less in_band branch; response/v4 S-15.
    const host = await fixture(cert.tls, res => res.end(sse({ error: raw })))
    try {
      const result = await read(host)
      expect(result.end).toMatchObject({
        failed: { source: 'in_band', httpStatus: 200, upstreamError: { raw } },
      })
      if (!('failed' in result.end)) throw new Error('expected an upstream error fact')
      const upstream = result.end.failed.upstreamError
      if (!upstream || upstream.raw === undefined) throw new Error('raw upstream error absent')
      expect(comparableJson(upstream.raw)).toEqual(comparableJson(raw))
      expect(result.end.failed).not.toHaveProperty('statusCode')
      expect(result.end.failed).not.toHaveProperty('inBand')
      expect(result.events).toEqual([])
      expect(assemble(result).account).toMatchObject({
        cost: { cost_usd: 'unknown', source: 'none' },
      })
      await assertStoppedOnce(host)
    } finally {
      await host.close()
    }
  })

  it('T-19: abnormal finish reason retains its raw reason without fabricating a status or sealed content', async () => {
    // Adopted design finish_reason other branch; runtime/v3 S-59⑤⑥.
    const host = await fixture(cert.tls, res =>
      res.end(content('before-filter') + finish('content_filter')),
    )
    try {
      const result = await read(host)
      expect(result.end).toMatchObject({
        stopReason: 'content_filter',
        failed: { source: 'in_band', upstreamError: { code: 'content_filter' } },
      })
      if (!('failed' in result.end)) throw new Error('expected abnormal finish fact')
      expect(result.end.failed).not.toHaveProperty('statusCode')
      expect(result.end.failed).not.toHaveProperty('inBand')
      expect(result.events.some(event => event.t === 'close')).toBe(false)
      expect(assemble(result).blocks).toMatchObject([{ kind: 'text', text: 'before-filter' }])
      await assertStoppedOnce(host)
    } finally {
      await host.close()
    }
  })

  it('T-3/T-11/T-12/T-13: interleaved tool fragments seal only in the real assembler, preserving malformed originals', async () => {
    // runtime/v3 S-38③/⑪, S-59④; content/v3 S-12/S-24; arrival/v2 S-7/S-13.
    const duplicate = '{"a":1,"a":2}'
    const invalidNameRaw = '{"safe":9007199254740993}'
    const host = await fixture(cert.tls, res =>
      res.end(
        sse({
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 8, function: { arguments: '{"n":900719925474' } },
                  { index: 3, function: { name: 'lookup__dup', arguments: '{"a":1,' } },
                  { index: 9, function: { name: 'bad/name', arguments: invalidNameRaw } },
                ],
              },
            },
          ],
        }) +
          sse({
            choices: [
              {
                delta: {
                  tool_calls: [
                    { index: 8, function: { name: 'lookup__exact', arguments: '0993}' } },
                    { index: 3, function: { arguments: '"a":2}' } },
                  ],
                },
              },
            ],
          }) +
          finish('tool_calls'),
      ),
    )
    try {
      const result = await read(host)
      expect(result.end).toMatchObject({ ended: 'end' })
      const opens = result.events.filter(event => event.t === 'open')
      expect(opens).toHaveLength(3)
      expect(new Set(opens.map(event => event.id)).size).toBe(3)
      for (const event of opens) {
        expect(event.visibility).toEqual({ toHuman: true, toModel: true })
        if (event.kind !== 'tool_call') throw new Error('expected a tool block')
        expect(event.head.callId).toMatch(/^call_[A-Za-z0-9_-]{32}$/)
      }
      const closes = result.events.filter(event => event.t === 'close')
      expect(closes).toHaveLength(3)
      for (const event of closes) expect(event).not.toHaveProperty('block')
      const settled = assemble(result)
      expect(settled.blocks).toMatchObject([
        {
          kind: 'tool_call',
          tool: 'lookup__dup',
          complete: true,
          unparseable: true,
          rawArguments: duplicate,
        },
        {
          kind: 'tool_call',
          tool: 'bad/name',
          complete: true,
          unparseable: true,
          rawArguments: invalidNameRaw,
        },
        { kind: 'tool_call', tool: 'lookup__exact', complete: true },
      ])
      const exact = settled.blocks.find(
        block => block.kind === 'tool_call' && block.tool === 'lookup__exact',
      )
      if (!exact || exact.kind !== 'tool_call' || !exact.complete || exact.unparseable)
        throw new Error('exact tool arguments absent')
      expect(writeJsonLossless(exact.arguments)).toBe('{"n":9007199254740993}')
      await assertStoppedOnce(host)
    } finally {
      await host.close()
    }
  })

  it('T-4/T-12: reasoning-details-only input is accepted but cannot open the visible-content gate', async () => {
    // Design reasoning_details row; arrival/v2 S-21; runtime/v3 S-55④.
    const details = [
      {
        type: 'reasoning.encrypted',
        data: 'private-replay',
        index: new LosslessNumber('9007199254740993'),
      },
    ]
    let continueResponse = () => {},
      gates = 0
    const host = await fixture(cert.tls, res => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(sse({ choices: [{ delta: { reasoning_details: details } }] }))
      continueResponse = () => res.end(content('visible-after-opaque') + finish())
    })
    try {
      const events: ArrivalEvent[] = []
      const handle = invokeModel({
        ...input(),
        transport: host.transport,
        credential: 'synthetic-conformance-credential',
        signal: new AbortController().signal,
        policy: policy(),
        beforeFirstContent: async () => {
          gates++
        },
        onAccepted: event => {
          events.push(event)
        },
      })
      await expect.poll(() => events.some(event => event.t === 'open')).toBe(true)
      expect(gates).toBe(0)
      expect(handle.snapshot().firstContentAt).toBeUndefined()
      continueResponse()
      const result = invocation(await handle.outcome)
      expect(result.outcome).toBe('complete')
      expect(gates).toBe(1)
      expect(result.blocks).toMatchObject([
        { kind: 'thinking', text: '' },
        { kind: 'text', text: 'visible-after-opaque' },
      ])
      const thinking = result.blocks[0]
      if (!thinking || thinking.kind !== 'thinking' || !thinking.opaque)
        throw new Error('opaque block absent')
      expect(readOpaqueJson(thinking.opaque)).toEqual({
        routeName: input().routeName,
        reasoning_details: details,
      })
      await assertStoppedOnce(host)
    } finally {
      continueResponse()
      await host.close()
    }
  })

  it('T-16: independent opaque identities and changing unknown metadata survive same-route replay without merging', async () => {
    // content/v3 S-9/S-24; adopted T-16 preserves same JSON value, not selected fields.
    expect(comparableJson(new LosslessNumber('9007199254740993'))).not.toEqual(
      comparableJson(new LosslessNumber('9007199254740994')),
    )
    expect(comparableJson({ nullable: null })).not.toEqual(comparableJson({}))
    expect(comparableJson({ a: 1, b: 2 })).toEqual(comparableJson({ b: 2, a: 1 }))
    const details = [
      {
        type: 'reasoning.text',
        id: 'detail-a',
        index: 0,
        text: 'alpha',
        extra: { revision: new LosslessNumber('9007199254740993'), nullable: null },
      },
      {
        type: 'reasoning.text',
        id: 'detail-b',
        index: 1,
        text: 'beta',
        extra: { revision: new LosslessNumber('9007199254740994') },
      },
      {
        type: 'reasoning.text',
        id: 'detail-b',
        index: 1,
        text: 'gamma',
        extra: { revision: new LosslessNumber('9007199254740995'), nullable: null },
      },
    ]
    const host = await fixture(cert.tls, res =>
      res.end(
        details
          .map(detail => sse({ choices: [{ delta: { reasoning_details: [detail] } }] }))
          .join('') + finish(),
      ),
    )
    try {
      const reading = await read(host)
      expect(reading.end).toMatchObject({ ended: 'end' })
      const settled = assemble(reading)
      const same = await replayBody(input(), settled.blocks)
      // Another route has no projector for these opaque units: reject, never strip.
      await expect(replayBody(input(true), settled.blocks)).rejects.toThrow(
        'replay planning rejected: unavailable',
      )
      await assertStoppedOnce(host)
      if (same.reasoning_details === undefined) throw new Error('same-route replay omitted details')
      expect(comparableJson(same.reasoning_details)).toEqual(comparableJson(details))
      const thinking = settled.blocks[0]
      if (!thinking || thinking.kind !== 'thinking' || !thinking.opaque)
        throw new Error('opaque block absent')
      expect(comparableJson(readOpaqueJson(thinking.opaque))).toEqual(
        comparableJson({
          routeName: input().routeName,
          reasoning_details: details,
        }),
      )
    } finally {
      await host.close()
    }
  })

  it('T-16: equal detail identity and all metadata permit text fragment concatenation without losing metadata', async () => {
    // Adopted pi detail assembly, content/v3 S-9/S-24 and T-16 replay.
    const metadata = {
      type: 'reasoning.text',
      id: 'continuous-detail',
      index: 3,
      extra: { revision: new LosslessNumber('9007199254740993'), nullable: null },
    }
    const host = await fixture(cert.tls, res =>
      res.end(
        sse({ choices: [{ delta: { reasoning_details: [{ ...metadata, text: '你' }] } }] }) +
          sse({ choices: [{ delta: { reasoning_details: [{ ...metadata, text: '🙂' }] } }] }) +
          finish(),
      ),
    )
    try {
      const reading = await read(host)
      expect(reading.end).toMatchObject({ ended: 'end' })
      const settled = assemble(reading)
      const replay = await replayBody(input(), settled.blocks)
      if (replay.reasoning_details === undefined) throw new Error('replay omitted details')
      expect(comparableJson(replay.reasoning_details)).toEqual(
        comparableJson([{ ...metadata, text: '你🙂' }]),
      )
      await assertStoppedOnce(host)
    } finally {
      await host.close()
    }
  })

  it('T-8: changed upstream identity remains the first raw fact and emits the adopted provider-change diagnostic', async () => {
    // Design first-identity/provider-changed rows; runtime/v3 S-59⑤⑧; response/v4 S-37.
    const diagnostics: Diagnostic[] = []
    const host = await fixture(
      cert.tls,
      res =>
        res.end(
          sse({
            id: 'gen-first',
            model: ' Raw Model A ',
            provider: ' Raw Provider A ',
            choices: [],
          }) +
            sse({
              id: 'gen-second',
              model: 'Raw Model B',
              provider: 'Raw Provider B',
              choices: [],
            }) +
            content('answer') +
            finish(),
        ),
      {},
      event => {
        diagnostics.push(event)
      },
    )
    try {
      const reading = await read(host)
      expect(reading.end).toMatchObject({
        ended: 'end',
        upstreamRequestId: 'gen-first',
        upstreamModel: ' Raw Model A ',
        servingProvider: ' Raw Provider A ',
      })
      expect(assemble(reading).blocks).toMatchObject([{ text: 'answer' }])
      await assertStoppedOnce(host)
      expect(diagnostics).toContainEqual({
        kind: 'model_transport.serving_provider_changed',
        level: 'error',
      })
    } finally {
      await host.close()
    }
  })

  it('T-19: an unterminated SSE terminal frame cannot turn partial content into a normal sealed reply', async () => {
    // Design strict SSE/terminal facts; runtime/v3 S-59⑥; arrival/v2 S-13.
    const host = await fixture(cert.tls, res =>
      res.end(
        content('partial') +
          sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }) +
          'data: [DONE]',
      ),
    )
    try {
      const reading = await read(host)
      expect(reading.end).toMatchObject({
        failed: { source: 'protocol', localError: 'unterminated SSE event' },
      })
      expect(reading.events.some(event => event.t === 'close')).toBe(false)
      expect(assemble(reading).ending.reason).toBe('lost')
      await assertStoppedOnce(host)
    } finally {
      await host.close()
    }
  })

  it('T-19: a JSON frame after DONE cannot hide trailing upstream content as normal completion', async () => {
    // Adopted design/G terminal/no-trailing-content obligation; runtime/v3 S-59⑥⑦.
    const host = await fixture(cert.tls, res =>
      res.end(content('first') + finish() + content('forbidden-after-DONE')),
    )
    try {
      const reading = await read(host)
      expect(reading.end).toMatchObject({
        failed: { source: 'protocol', localError: 'event after DONE' },
      })
      expect(reading.events.filter(event => event.t === 'fill')).toMatchObject([
        { payload: 'first' },
      ])
      expect(reading.events.some(event => event.t === 'close')).toBe(false)
      expect(assemble(reading).blocks).toMatchObject([{ text: 'first' }])
      await assertStoppedOnce(host)
    } finally {
      await host.close()
    }
  })
})
