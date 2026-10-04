// @module-tag slow
// 归慢层：网络＋重 CPU：经本地 HTTPS 服务（openssl 现生成证书）走真实传输与读取，输入计量用真实分词器。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { Context } from '@deepseek-ai/cordis'
import {
  readOpaqueJson,
  writeJsonLossless,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { Message } from '@omne-harness-lite/messages'
import {invokeModel} from '@omne-harness-lite/model-request-runtime-local'
import {type InvocationOutcome, type PlanInput, type TransportAdapter} from '@omne-harness-lite/model-request-runtime'
import { type InputMeasurement, type PlanOutputHistoryGroup } from '@omne-harness-lite/model-request-runtime'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createAnthropicInputMeter } from '../src/input-meters/anthropic.ts'
import { anthropicDefinitions } from '../src/official-models/anthropic.ts'
import { createPiAiTransport } from '../src/transport.ts'
import {createModelTransportService} from '../src/registry.ts'
import {type ModelTransportService} from '@omne-harness-lite/model-request-runtime'
import { type RetirementPolicy } from '@omne-harness-lite/model-request-runtime'
import { MODEL_TRANSPORT as MODEL_TRANSPORT_SERVICE } from '@omne-harness-lite/model-request-runtime/cordis'
import { loadModelContribution as createModelPlugin } from './cordis-assembly.ts'
import type {PlannedRequest} from '@omne-harness-lite/model-request-runtime'
import type {RawResponse} from '@omne-harness-lite/model-request-runtime'
import type {ModelDefinition} from '@omne-harness-lite/model-request-runtime'
import { directFull } from './direct-full-input.ts'
import { imagePreparation } from './image-transport-support.ts'
import {
  at,
  certificate,
  content,
  finish,
  fixture,
  input,
  judgedMessage,
  message,
  policy,
  sse,
  type CapturedRequest,
} from './support.ts'

// Current official Anthropic bindings: definition 4 / pi-ai:anthropic@mp4-18, provider
// anthropic, explicit 1h last_message cache. Every upstream response is a controlled local
// TLS stand-in. Round 1 reproduces the normalized shape of the paid claude-sonnet-5 receipt
// cecc12c9-300e-43db-8389-7bb4ac859d4f (id-less index-0 thinking text, then a signature-only
// fragment; ruling R-L); text and signature values are synthetic. Nothing here observes
// OpenRouter conversion, cache retention, usage accuracy or billing.

let cert: ReturnType<typeof certificate>
let png: { small: Buffer; large: Buffer }
beforeAll(async () => {
  cert = certificate()
  const pixels = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } } })
  png = {
    small: await pixels(64, 48).png().toBuffer(),
    large: await pixels(128, 96).png().toBuffer(),
  }
})
afterAll(() => cert.dispose())

const visible = { toHuman: true, toModel: true }
const format = 'anthropic-claude-v1'
const cache = { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] }
const lookup = {
  name: 'lookup__exact',
  description: 'Look up an exact value',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
    additionalProperties: false,
  },
}
const refused = {
  rejected: 'invalidInput',
  reason: 'input_size_unavailable',
  metrics: ['maxInputTokens'],
}
const retirement: RetirementPolicy = {
  waitMilliseconds: 1000,
  force: false,
  schedule(ms, callback) {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}

function profileOf(definition: ModelDefinition, values: JsonValue = { cache }) {
  return createOfficialProfileContent(definition, {
    providers: ['anthropic'],
    allowFallback: false,
    configuration: { revision: '1', values: values as never },
  })
}

function firstRequest(
  definition: ModelDefinition,
  withTools: boolean,
  image: Buffer | undefined = undefined,
): PlanInput {
  const profile = profileOf(definition)
  if ('rejected' in profile) throw Error(profile.rejected)
  const base = input()
  return {
    ...base,
    routeName: definition.modelId,
    provider: 'anthropic',
    parameters: { reasoningEffort: 'high', maxOutputTokens: 512 },
    tools: withTools ? [lookup] : [],
    messages: [
      message('system', 'Answer briefly. Stable certification prefix.', 'system'),
      judgedMessage({
        type: 'user',
        id: 'user-1',
        createdAt: at,
        blocks: [
          { id: 'user-1-text', kind: 'text', text: 'Turn 1.', visibility: visible },
          ...(image
            ? [
                {
                  id: 'user-1-image',
                  kind: 'image',
                  mediaType: 'image/png',
                  data: { inline: image.toString('base64') },
                  visibility: visible,
                },
              ]
            : []),
        ],
      }),
    ],
    snapshot: {
      ...base.snapshot,
      ...definition.capabilities,
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: false,
    },
  }
}

const reasoning = (details: readonly unknown[]) =>
  details.map(detail => sse({ choices: [{ delta: { reasoning_details: [detail] } }] })).join('')
const usage = (round: number, model: string) =>
  sse({
    choices: [],
    model,
    provider: 'Anthropic',
    usage: {
      prompt_tokens: 1000 * round,
      completion_tokens: 30 + round,
      completion_tokens_details: { reasoning_tokens: 7 },
      prompt_tokens_details: {
        cached_tokens: round === 1 ? 0 : 20,
        cache_write_tokens: round === 1 ? 20 : 0,
      },
    },
  })

/** The retained (normalized) details each controlled round must produce. */
function expectedDetails(round: number, leaf: string): readonly Record<string, unknown>[] {
  if (round === 1)
    return [
      {
        type: 'reasoning.text',
        text: 'Plan the lookup. Check CEDAR.',
        format,
        index: 0,
        signature: `SIG-R1-${leaf}`,
      },
    ]
  if (round === 2)
    return [{ type: 'reasoning.encrypted', id: 'enc-2', data: `ENC-R2-${leaf}`, format, index: 0 }]
  return [
    {
      type: 'reasoning.text',
      id: 'think-a',
      text: 'First block.',
      format,
      index: 0,
      signature: `SIG-R3-A-${leaf}`,
    },
    {
      type: 'reasoning.text',
      id: 'think-b',
      text: 'Second block.',
      format,
      index: 1,
      signature: `SIG-R3-B-${leaf}`,
    },
  ]
}

function reply(round: number, leaf: string, model: string, toolCall: boolean): string {
  const fragments =
    round === 1
      ? [
          { type: 'reasoning.text', text: 'Plan the lookup. ', format, index: 0 },
          { type: 'reasoning.text', text: 'Check CEDAR.', format, index: 0 },
          { type: 'reasoning.text', signature: `SIG-R1-${leaf}`, format, index: 0 },
        ]
      : expectedDetails(round, leaf)
  const tail = toolCall
    ? sse({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: `toolu_${round}`,
                  function: { name: lookup.name, arguments: '{"query":"CEDAR"}' },
                },
              ],
            },
          },
        ],
      })
    : content(`Answer ${round}.`)
  return (
    reasoning(fragments) + tail + usage(round, model) + finish(toolCall ? 'tool_calls' : 'stop')
  )
}

interface Entry {
  readonly transport: TransportAdapter<PlannedRequest, RawResponse>
  readonly requests: readonly CapturedRequest[]
  readonly track?: <T>(completion: Promise<T>) => Promise<T>
  readonly signal?: AbortSignal
}

async function invoke(entry: Entry, request: PlanInput): Promise<InvocationOutcome> {
  const invoked = invokeModel({
    ...request,
    transport: entry.transport,
    credential: 'controlled-test-only',
    signal: entry.signal ?? new AbortController().signal,
    policy: policy(),
  }).outcome
  return entry.track ? entry.track(invoked) : invoked
}

function nextRequest(
  request: PlanInput,
  planned: PlannedRequest,
  result: Extract<InvocationOutcome, { outcome: string }>,
  followUp: readonly Message[],
  round: number,
): PlanInput {
  const replaySelection = result.blocks.map((_block, sourceBlockIndex) => ({
    sourceBlockIndex,
    messageIndex: request.messages.length,
    blockIndex: sourceBlockIndex,
  }))
  const group: PlanOutputHistoryGroup = {
    inputCalibration: result.inputCalibration,
    usage: result.usage,
    outputBlocks: result.blocks,
    replaySelection,
    origin: {
      adaptation: request.snapshot.adaptation,
      provider: 'anthropic',
      parameters: planned.parameters,
      servingProvider: 'Anthropic',
      upstreamModel: request.routeName,
    },
  }
  return {
    ...request,
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier(`anthropic-round-${round + 1}`, 'ModelCallId')),
      dispatch: 1,
    },
    outputHistory: [...request.outputHistory, group],
    calibration: {
      kind: 'observation',
      inputCalibration: result.inputCalibration,
      usage: result.usage,
      outputBlocks: result.blocks,
      replaySelection,
    },
    messages: [
      ...request.messages,
      judgedMessage({
        type: 'assistant',
        id: `assistant-${round}`,
        response: `response-${round}`,
        ending: 'complete',
        createdAt: at,
        blocks: result.blocks,
      }),
      ...followUp,
    ],
  }
}

function toolResult(callId: string): Message {
  return judgedMessage({
    type: 'tool',
    id: `result-${callId}`,
    callId,
    createdAt: at,
    blocks: [
      {
        id: `result-${callId}-block`,
        kind: 'tool_result',
        callId,
        outcome: 'completed',
        visibility: visible,
        blocks: [
          {
            id: `result-${callId}-text`,
            kind: 'text',
            text: 'CEDAR => COPPER',
            visibility: visible,
          },
        ],
      },
    ],
  })
}

function wire(captured: CapturedRequest | undefined): { messages: Record<string, unknown>[] } {
  const parsed: unknown = JSON.parse(captured?.body ?? '')
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('messages' in parsed) ||
    !Array.isArray(parsed.messages)
  )
    throw Error('missing wire messages')
  return parsed as { messages: Record<string, unknown>[] }
}

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1

/** One complete three-round run; returns every planned measurement. */
async function threeRounds(
  definition: ModelDefinition,
  entry: Entry,
  withTools: boolean,
): Promise<InputMeasurement[]> {
  const leaf = definition.modelId.slice('anthropic/'.length)
  let request: PlanInput = {
    ...firstRequest(definition, withTools, withTools ? undefined : png.small),
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('anthropic-round-1', 'ModelCallId')),
      dispatch: 1,
    },
  }
  const measurements: InputMeasurement[] = []
  for (let round = 1; round <= 3; round++) {
    const planned = await entry.transport.plan(request, { signal: new AbortController().signal })
    if (!('planned' in planned)) throw Error(`round ${round}: ${JSON.stringify(planned)}`)
    const measurement = planned.planned.measurement
    measurements.push(measurement)
    expect(measurement.precision).toBe('estimated')
    expect(measurement.mode).toBe(round === 1 ? 'full' : 'marginal')
    if (round > 1) {
      if (measurement.mode !== 'marginal') throw Error('marginal required')
      // The previous complete group is one contribution: its original O, counted once.
      const previous = request.outputHistory.at(-1)
      expect(measurement.replayContribution).toEqual({
        precision: 'estimated',
        tokens: previous?.usage.output_tokens,
      })
    }

    // Explicit cache: exactly one configured 1h marker, on the terminal message.
    const serialized = planned.planned.serialized
    expect(occurrences(serialized, '"cache_control"')).toBe(1)
    expect(planned.planned.body.cache_control).toBeUndefined()
    const planMessages = planned.planned.body.messages as Record<string, unknown>[]
    const last = planMessages.at(-1)
    const lastContent = Array.isArray(last?.content)
      ? (last.content as Record<string, unknown>[])
      : []
    const marked = lastContent.filter(part => part.cache_control !== undefined)
    expect(marked).toHaveLength(1)
    expect(marked[0]).toMatchObject({
      type: 'text',
      cache_control: { type: 'ephemeral', ttl: '1h' },
    })

    const result = await invoke(entry, request)
    if (!('outcome' in result) || result.outcome !== 'complete')
      throw Error(`round ${round}: ${JSON.stringify(result)}`)
    // One HTTP request per round, byte-identical to the planned request.
    expect(entry.requests).toHaveLength(round)
    expect(entry.requests[round - 1]?.body).toBe(serialized)
    expect(result.usage.output_tokens).toBe(30 + round)
    expect(result.inputCalibration.observedInput.kind).toBe('from_usage')

    // Retained details: the late-signed id-less fragments are one signed detail.
    const thinking = result.blocks.filter(block => block.kind === 'thinking')
    expect(thinking).toHaveLength(1)
    const opaque = thinking[0]?.kind === 'thinking' ? thinking[0].opaque : undefined
    if (!opaque) throw Error('reasoning details were not retained')
    expect(readOpaqueJson(opaque)).toEqual({
      routeName: definition.modelId,
      reasoning_details: expectedDetails(round, leaf),
    })

    // Every earlier group is replayed unchanged, in order, and each opaque value once.
    if (round > 1) {
      const sent = wire(entry.requests[round - 1])
      const assistants = sent.messages.filter(item => item.role === 'assistant')
      expect(assistants).toHaveLength(round - 1)
      assistants.forEach((assistant, index) =>
        expect(assistant.reasoning_details).toEqual(expectedDetails(index + 1, leaf)),
      )
      for (let earlier = 1; earlier < round; earlier++)
        for (const detail of expectedDetails(earlier, leaf))
          for (const value of [detail.signature, detail.data, detail.text])
            if (typeof value === 'string')
              expect(occurrences(serialized, JSON.stringify(value).slice(1, -1))).toBe(1)
      // The previous request's messages are the unchanged prefix, except the moved marker.
      const previous = wire(entry.requests[round - 2]).messages
      const strip = (value: unknown) =>
        writeJsonLossless(
          JSON.parse(
            JSON.stringify(value).replace(
              /,"cache_control":\{"type":"ephemeral","ttl":"1h"\}/g,
              '',
            ),
          ),
        )
      expect(sent.messages.slice(0, previous.length).map(strip)).toEqual(previous.map(strip))
    }

    const call = result.blocks.find(block => block.kind === 'tool_call')
    expect(call !== undefined).toBe(withTools && round === 1)
    let followUp: Message[] = [message('user', `Turn ${round + 1}.`, `user-${round + 1}`)]
    if (call?.kind === 'tool_call') {
      if (call.callId === undefined) throw Error('tool call identity missing')
      followUp = [toolResult(call.callId)]
    }
    request = nextRequest(request, planned.planned, result, followUp, round)
  }
  return measurements
}

function service(host: Awaited<ReturnType<typeof fixture>>) {
  return createModelTransportService({
    imagePreparation,
    baseUrl: host.options.baseUrl,
    tls: host.options.tls,
    policy: host.options.policy,
  })
}

const scenarios = anthropicDefinitions.flatMap(definition =>
  [false, true].map(withTools => ({ definition, withTools })),
)

describe('Anthropic three rounds through public invokeModel over local TLS (4 / mp4-18)', () => {
  it.each(scenarios)('$definition.modelId tools=$withTools', async ({ definition, withTools }) => {
    const leaf = definition.modelId.slice('anthropic/'.length)
    const host = await fixture(
      cert.tls,
      (res, captured) =>
        res.end(
          reply(
            host.requests.indexOf(captured) + 1,
            leaf,
            definition.modelId,
            withTools && host.requests.indexOf(captured) === 0,
          ),
        ),
      {},
      undefined,
      [definition],
    )
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [createAnthropicInputMeter(definition)],
    })
    try {
      const measurements = await threeRounds(
        definition,
        { transport, requests: host.requests },
        withTools,
      )
      expect(measurements.map(value => value.mode)).toEqual(['full', 'marginal', 'marginal'])
    } finally {
      await transport.close()
      await host.close()
    }
  })
})

describe('Anthropic three rounds through the Cordis transport service lease', () => {
  it.each(scenarios)('$definition.modelId tools=$withTools', async ({ definition, withTools }) => {
    const leaf = definition.modelId.slice('anthropic/'.length)
    const host = await fixture(
      cert.tls,
      (res, captured) =>
        res.end(
          reply(
            host.requests.indexOf(captured) + 1,
            leaf,
            definition.modelId,
            withTools && host.requests.indexOf(captured) === 0,
          ),
        ),
      {},
      undefined,
      [definition],
    )
    const ctx = new Context()
    let provided: ModelTransportService | undefined
    try {
      await ctx.plugin({
        name: 'anthropic-controlled-model-transport',
        apply(inner: Context) {
          provided = service(host)
          const owned = provided
          inner.effect(() => async () => {
            await owned.close(retirement)
            await owned.closed
          })
          inner.provide(MODEL_TRANSPORT_SERVICE, owned)
        },
      })
      if (!provided) throw Error('service unavailable')
      expect(ctx.get(MODEL_TRANSPORT_SERVICE)).toBe(provided)
      const contribution = createModelPlugin(ctx, definition, createAnthropicInputMeter(definition), retirement)
      await contribution
      const request = firstRequest(definition, withTools)
      const acquired = provided.acquire(request.snapshot.adaptation, definition.modelId)
      if (!('lease' in acquired)) throw Error('service lease unavailable')
      const lease = acquired.lease
      try {
        const measurements = await threeRounds(
          definition,
          {
            transport: lease.transport,
            requests: host.requests,
            track: lease.track,
            signal: lease.signal,
          },
          withTools,
        )
        expect(measurements.map(value => value.mode)).toEqual(['full', 'marginal', 'marginal'])
        expect(provided.inspect()).toMatchObject({ references: 1, executions: 0 })
      } finally {
        lease.release()
      }
      expect(provided.inspect()).toMatchObject({ references: 0, executions: 0 })
      await contribution.dispose()
      expect(provided.inspect()).toMatchObject({ registrations: 0 })
    } finally {
      await ctx.fiber.dispose()
      await host.close()
    }
    if (!provided) throw Error('service unavailable')
    await provided.closed
    expect(provided.inspect()).toMatchObject({ accepting: false, registrations: 0, references: 0 })
    expect(host.requests).toHaveLength(3)
  })
})

describe.each(anthropicDefinitions)('$modelId current boundaries over local TLS', definition => {
  const leaf = definition.modelId.slice('anthropic/'.length)
  async function secondRound(
    first: string,
    alter: (next: PlanInput) => PlanInput = next => next,
  ): Promise<{
    plan: unknown
    invoked: unknown
    requests: readonly CapturedRequest[]
    sent?: string
  }> {
    const host = await fixture(
      cert.tls,
      (res, captured) =>
        res.end(
          host.requests.indexOf(captured) === 0
            ? first
            : content('Later.') + usage(2, definition.modelId) + finish(),
        ),
      {},
      undefined,
      [definition],
    )
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [createAnthropicInputMeter(definition)],
    })
    try {
      const request = firstRequest(definition, false)
      const planned = await transport.plan(request, { signal: new AbortController().signal })
      if (!('planned' in planned)) throw Error(JSON.stringify(planned))
      const result = await invoke({ transport, requests: host.requests }, request)
      if (!('outcome' in result) || result.outcome !== 'complete')
        throw Error(JSON.stringify(result))
      const next = alter(
        nextRequest(request, planned.planned, result, [message('user', 'Turn 2.', 'user-2')], 1),
      )
      const plan = await transport.plan(next, { signal: new AbortController().signal })
      const invoked = await invoke({ transport, requests: host.requests }, next)
      return {
        plan,
        invoked: 'outcome' in invoked ? invoked.outcome : invoked,
        requests: host.requests,
        ...(host.requests[1] ? { sent: host.requests[1].body } : {}),
      }
    } finally {
      await transport.close()
      await host.close()
    }
  }
  const tail = content('Answer 1.') + usage(1, definition.modelId) + finish()

  it('supplies only the official 1h TTL and rejects other cache configuration before HTTP', async () => {
    expect(definition.routes.anthropic?.cache).toEqual({
      mode: 'explicit',
      ttlValues: ['1h'],
      breakpointLayouts: [['last_message']],
    })
    for (const values of [
      { cache: { ...cache, ttl: '5m' } },
      { cache: { mode: 'explicit', breakpoints: ['last_message'] } },
      { cache: { ...cache, breakpoints: ['system'] } },
      { cache: { mode: 'automatic' } },
      {},
    ])
      expect(profileOf(definition, values)).toEqual({ rejected: 'invalidInput' })
    const host = await fixture(cert.tls, res => res.end(), {}, undefined, [definition])
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [createAnthropicInputMeter(definition)],
    })
    try {
      const request = firstRequest(definition, false)
      const tampered = {
        ...request,
        snapshot: {
          ...request.snapshot,
          adaptation: {
            ...request.snapshot.adaptation,
            configuration: { revision: '1', values: { cache: { ...cache, ttl: '5m' } } },
          },
        },
      }
      expect(await invoke({ transport, requests: host.requests }, tampered)).toEqual({
        rejected: 'invalidInput',
        reason: 'malformed',
      })
      expect(host.requests).toHaveLength(0)
    } finally {
      await transport.close()
      await host.close()
    }
  })

  it('plans a terminal pure-image user with the configured top-level TTL', async () => {
    const host = await fixture(cert.tls, res => res.end(), {}, undefined, [definition])
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [createAnthropicInputMeter(definition)],
    })
    try {
      const request = firstRequest(definition, false)
      const pure = {
        ...request,
        messages: [
          request.messages[0]!,
          judgedMessage({
            type: 'user',
            id: 'pure',
            createdAt: at,
            blocks: [
              {
                id: 'pure-image',
                kind: 'image',
                mediaType: 'image/png',
                data: { inline: png.small.toString('base64') },
                visibility: visible,
              },
            ],
          }),
        ],
      }
      const planned = await transport.plan(pure, { signal: new AbortController().signal })
      if (!('planned' in planned)) throw Error(JSON.stringify(planned))
      expect(planned.planned.body.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' })
      expect(occurrences(planned.planned.serialized, '"cache_control"')).toBe(1)
      expect(planned.planned.measurement).toMatchObject({ mode: 'full', precision: 'estimated' })
      expect(host.requests).toHaveLength(0)
    } finally {
      await transport.close()
      await host.close()
    }
  })

  it('estimates inline images from their patch grid', () => {
    const meter = createAnthropicInputMeter(definition)
    const body = (image: Buffer) => ({
      model: definition.modelId,
      provider: { order: ['anthropic'], allow_fallbacks: false, require_parameters: true },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Turn 1.' },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${image.toString('base64')}` },
            },
          ],
        },
      ],
    })
    const measure = (image: Buffer) => {
      const value = body(image)
      const result = directFull(meter, { body: value, serialized: writeJsonLossless(value) })
      if (result.kind !== 'estimated') throw Error('image estimate unavailable')
      return Number(writeJsonLossless(result.tokens))
    }
    // 128x96 is 5x4 patches of 28px and 64x48 is 3x2; the text surrogate is identical.
    expect(measure(png.large) - measure(png.small)).toBe(20 - 6)
  })

  it('refuses an unsigned reasoning.text group before the next HTTP request', async () => {
    const result = await secondRound(
      reasoning([{ type: 'reasoning.text', text: 'unsigned', format, index: 0 }]) + tail,
    )
    expect(result.plan).toEqual(refused)
    expect(result.invoked).toEqual(refused)
    expect(result.requests).toHaveLength(1)
  })

  it('refuses a [REDACTED] encrypted placeholder before the next HTTP request (R-M)', async () => {
    const result = await secondRound(
      reasoning([
        { type: 'reasoning.text', text: 'signed', signature: `SIG-${leaf}`, format, index: 0 },
        { type: 'reasoning.encrypted', data: '[REDACTED]', format, index: 1 },
      ]) + tail,
    )
    expect(result.plan).toEqual(refused)
    expect(result.invoked).toEqual(refused)
    expect(result.requests).toHaveLength(1)
  })

  it('refuses a signed group retained for another route before HTTP', async () => {
    const result = await secondRound(
      reasoning([
        { type: 'reasoning.text', text: 'signed', signature: `SIG-${leaf}`, format, index: 0 },
      ]) + tail,
      next => {
        const moved = (blocks: readonly Record<string, unknown>[]) =>
          blocks.map(block =>
            block.kind === 'thinking' && block.opaque
              ? {
                  ...block,
                  opaque: {
                    value: {
                      ...(block.opaque as { value: object }).value,
                      routeName: 'anthropic/claude-other',
                    },
                  },
                }
              : block,
          )
        return {
          ...next,
          outputHistory: [],
          calibration: { kind: 'none', reason: 'no_observation' },
          messages: next.messages.map(item =>
            item.type === 'assistant'
              ? judgedMessage({ ...item, blocks: moved(item.blocks as never) })
              : item,
          ),
        }
      },
    )
    expect(result.plan).toEqual({ rejected: 'unavailable' })
    expect(result.invoked).toEqual({ rejected: 'unavailable' })
    expect(result.requests).toHaveLength(1)
  })

  it('replays an upstream refusal as ordinary assistant text without a cache or signed group', async () => {
    const result = await secondRound(
      sse({ choices: [{ delta: { refusal: 'I cannot help with that.' } }] }) + tail,
    )
    if (typeof result.plan !== 'object' || result.plan === null || !('planned' in result.plan))
      throw Error(JSON.stringify(result.plan))
    expect(result.invoked).toBe('complete')
    expect(result.requests).toHaveLength(2)
    const assistant = wire(result.requests[1]).messages.find(item => item.role === 'assistant')
    expect(assistant).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'I cannot help with that.Answer 1.' }],
    })
    expect(occurrences(result.sent ?? '', '"cache_control"')).toBe(1)
  })

  it.each([
    {
      name: 'audio',
      block: {
        id: 'voice',
        kind: 'voice',
        mediaType: 'audio/pcm',
        data: { inline: 'eA==' },
        visibility: visible,
      },
    },
    {
      name: 'video',
      block: {
        id: 'video',
        kind: 'file',
        attachment: {
          storage: 'attachments',
          key: 'obj_video',
          mediaType: 'video/mp4',
          name: 'clip.mp4',
        },
        visibility: visible,
      },
    },
  ])('does not carry $name input (R-I)', async ({ block }) => {
    expect(definition.capabilities.inputModalities).toEqual(['image', 'text'])
    const host = await fixture(cert.tls, res => res.end(), {}, undefined, [definition])
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [createAnthropicInputMeter(definition)],
    })
    try {
      const request = firstRequest(definition, false)
      const media = {
        ...request,
        messages: [
          ...request.messages,
          judgedMessage({ type: 'user', id: 'media', createdAt: at, blocks: [block] }),
        ],
      }
      expect(await invoke({ transport, requests: host.requests }, media)).toEqual({
        rejected: 'modality_not_carried',
      })
      expect(host.requests).toHaveLength(0)
    } finally {
      await transport.close()
      await host.close()
    }
  })
})
