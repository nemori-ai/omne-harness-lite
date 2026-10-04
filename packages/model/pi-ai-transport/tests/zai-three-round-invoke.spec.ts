// @module-tag slow
// 归慢层：网络＋重 CPU：经本地 HTTPS 服务（openssl 现生成证书）走真实传输与读取，输入计量用真实分词器。
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import { readOpaqueJson, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { ContentBlock } from '@omne-harness-lite/content-blocks'
import {
  invokeModel,
  type ModelInvocationResult,
  type PlanInput,
  type PlanOutputHistoryGroup,
} from '@omne-harness-lite/model-request-runtime-local'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import {
  createModelTransportService,
  createOfficialProfileContent,
  createPiAiTransport,
  type AdaptationLease,
  type InputMeter,
  type ModelDefinition,
  type RetirementPolicy,
} from '@omne-harness-lite/pi-ai-transport'
import {
  createModelPlugin,
  MODEL_TRANSPORT_SERVICE,
} from '@omne-harness-lite/pi-ai-transport/plugin'
import { createGlm52InputMeter } from '../src/input-meters/zai-glm52.ts'
import { createGlm53InputMeter } from '../src/input-meters/zai-glm53.ts'
import { createZaiCommercialInputMeter } from '../src/input-meters/zai-commercial.ts'
import { zaiDefinitions } from '../src/official-models/zai.ts'
import { directFull } from './direct-full-input.ts'
import { histories, jsonBody } from './fixtures/zai/history-cases.ts'
import { at, certificate, fixture, judgedMessage, message, policy, sse } from './support.ts'

// Credential-free invokeModel scenarios for the five current ZAI leaves over local
// TLS, through the standalone transport and the Cordis-leased transport service:
// GLM-5.2 (definition 3), Prime (4), FlashX (3), and after ZV0 GLM-5.3 (3) and
// Flash (3), all at `pi-ai:zai@mp4-18`, which meters visible reasoning history.
// Upstream streams are the recorded Prime/FlashX SSE fixtures or
// synthetic streams of the same shape. Nothing here observes OpenRouter conversion,
// billing, cache retention or how the hosted model consumes historical reasoning.

vi.setConfig({ testTimeout: 60000 })
let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

type Leaf = {
  readonly definition: ModelDefinition
  readonly provider: 'alibaba' | 'z-ai/fp8'
  /** The display name OpenRouter reported for the route in the recorded streams. */
  readonly servingProvider: 'Alibaba' | 'Z.AI'
  readonly efforts: readonly ('low' | 'high' | 'max' | undefined)[]
  /** An explicit effort outside the accepted set, dropped rather than forwarded. */
  readonly dropped: 'medium' | 'high'
  /** Independent per-leaf nonce; no two leaves share prompt text. */
  readonly nonce: string
  readonly recorded: readonly (typeof histories)[number][]
}

function zaiDefinition(modelId: string): ModelDefinition {
  const found = zaiDefinitions.find(item => item.modelId === modelId)
  if (!found) throw new Error(`missing ZAI definition: ${modelId}`)
  return found
}

function recorded(...ids: string[]) {
  return ids.map(id => {
    const row = histories.find(item => item.id === id)
    if (!row) throw new Error(`missing recorded ZAI stream: ${id}`)
    return row
  })
}

const leaves: readonly Leaf[] = [
  {
    definition: zaiDefinition('z-ai/glm-5.3'),
    provider: 'z-ai/fp8',
    servingProvider: 'Z.AI',
    efforts: ['low', 'high', 'max'],
    dropped: 'medium',
    nonce: randomUUID(),
    recorded: [],
  },
  {
    definition: zaiDefinition('z-ai/glm-5.3-prime'),
    provider: 'alibaba',
    servingProvider: 'Alibaba',
    efforts: ['low', 'high', 'max'],
    dropped: 'medium',
    nonce: randomUUID(),
    recorded: recorded('prime-control', 'prime-long', 'prime-base'),
  },
  {
    definition: zaiDefinition('z-ai/glm-5.3-flash'),
    provider: 'z-ai/fp8',
    servingProvider: 'Z.AI',
    efforts: [undefined],
    dropped: 'high',
    nonce: randomUUID(),
    recorded: [],
  },
  {
    definition: zaiDefinition('z-ai/glm-5.3-flashx'),
    provider: 'z-ai/fp8',
    servingProvider: 'Z.AI',
    efforts: [undefined],
    dropped: 'high',
    nonce: randomUUID(),
    recorded: recorded('flashx-long', 'flashx-mixed', 'flashx-long'),
  },
  {
    definition: zaiDefinition('z-ai/glm-5.2'),
    provider: 'z-ai/fp8',
    servingProvider: 'Z.AI',
    efforts: ['high'],
    dropped: 'medium',
    nonce: randomUUID(),
    recorded: [],
  },
]

const visible = { toHuman: true, toModel: true }
const tinyPng = readFileSync(
  new URL('./fixtures/moonshot/valid-red-1x1.png', import.meta.url),
).toString('base64')
const tool: ModelToolEntry = {
  name: 'lookup',
  description: 'Return the stored value for a key',
  parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
}

function officialMeter(definition: ModelDefinition): InputMeter {
  if (definition.modelId === 'z-ai/glm-5.2') return createGlm52InputMeter(definition)
  if (definition.modelId === 'z-ai/glm-5.3' || definition.modelId === 'z-ai/glm-5.3-flash')
    return createGlm53InputMeter(definition)
  return createZaiCommercialInputMeter(definition)
}

/** Record every φ/δ attempt and its result without changing the official meter. */
function countedMeter(original: InputMeter) {
  const marginal: string[] = []
  const meter: InputMeter = {
    ...original,
    measureReplay(value) {
      const result = original.measureReplay(value)
      marginal.push(`replay:${result.kind}`)
      return result
    },
    measureNew(value) {
      const result = original.measureNew(value)
      marginal.push(`new:${result.kind}`)
      return result
    },
  }
  return { meter, marginal }
}

function callId(round: number, value: string): string {
  return unwrap(parseOpaqueIdentifier(`zai-three-round-${value}-${round}`, 'ModelCallId'))
}

function firstRound(leaf: Leaf, effort: Leaf['efforts'][number], withTools: boolean): PlanInput {
  const prime = leaf.provider === 'alibaba'
  const profile = createOfficialProfileContent(leaf.definition, {
    providers: [leaf.provider],
    allowFallback: false,
    configuration: {
      revision: '1',
      values: {
        cache: prime
          ? { mode: 'explicit', ttl: '5m', breakpoints: ['last_message'] }
          : { mode: 'automatic' },
      },
    },
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  return {
    calibration: { kind: 'none', reason: 'no_observation' },
    outputHistory: [],
    tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
    target: { kind: 'model_call', callId: callId(1, 'call'), dispatch: 1 },
    routeName: leaf.definition.modelId,
    provider: leaf.provider,
    snapshot: {
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      inputModalities: profile.ok.inputModalities,
      outputModalities: profile.ok.outputModalities,
      maxInputTokens: profile.ok.maxInputTokens,
      maxOutputTokens: profile.ok.maxOutputTokens,
      inputConstraints: profile.ok.inputConstraints,
      upstreamInputLimits: profile.ok.upstreamInputLimits,
      updatedAt: at,
    },
    parameters: { maxOutputTokens: 512, ...(effort ? { reasoningEffort: effort } : {}) },
    messages: [
      message('system', 'Answer briefly.', 'zai-three-round-system'),
      message('user', `Remember the code ${leaf.nonce}.`, 'zai-three-round-user-1'),
    ],
    tools: withTools ? [tool] : [],
  }
}

/**
 * Append one complete same-binding reply plus explicit tool results and the next
 * user turn. `hideThinking` is the caller's context-assembly decision to keep
 * thinking out of the model context; the transport does not make it.
 */
function appendRound(
  previous: PlanInput,
  response: ModelInvocationResult,
  round: number,
  leaf: Leaf,
  hideThinking: boolean,
): PlanInput {
  if (
    response.outcome !== 'complete' ||
    response.ending !== 'complete' ||
    response.routeName !== previous.routeName ||
    response.provider !== previous.provider
  )
    throw new TypeError('response is not a complete same-binding ZAI reply')
  const blocks: ContentBlock[] = response.blocks.map(block =>
    hideThinking && block.kind === 'thinking'
      ? { ...block, visibility: { ...block.visibility, toModel: false } }
      : block,
  )
  const replaySelection = response.blocks.flatMap((block, blockIndex) =>
    hideThinking && block.kind === 'thinking'
      ? []
      : [{ sourceBlockIndex: blockIndex, messageIndex: previous.messages.length, blockIndex }],
  )
  const group: PlanOutputHistoryGroup = {
    inputCalibration: response.inputCalibration,
    usage: response.usage,
    outputBlocks: response.blocks,
    replaySelection,
    origin: {
      adaptation: response.adaptation,
      provider: response.provider,
      parameters: response.parameters,
      ...(response.servingProvider === undefined
        ? {}
        : { servingProvider: response.servingProvider }),
      ...(response.upstreamModel === undefined ? {} : { upstreamModel: response.upstreamModel }),
    },
  }
  const calls = response.blocks.flatMap(block =>
    block.kind === 'tool_call' && block.callId !== undefined ? [block.callId] : [],
  )
  return {
    ...previous,
    target: { kind: 'model_call', callId: callId(round, 'call'), dispatch: 1 },
    calibration: {
      kind: 'observation',
      inputCalibration: group.inputCalibration,
      usage: group.usage,
      outputBlocks: group.outputBlocks,
      replaySelection,
    },
    outputHistory: [...previous.outputHistory, group],
    messages: [
      ...previous.messages,
      judgedMessage({
        id: `zai-three-round-assistant-${round - 1}`,
        type: 'assistant',
        response: `zai-three-round-response-${round - 1}`,
        ending: response.ending,
        createdAt: at,
        blocks,
      }),
      ...calls.map((id, index) =>
        judgedMessage({
          id: `zai-three-round-tool-${round}-${index}`,
          type: 'tool',
          callId: id,
          createdAt: at,
          blocks: [
            {
              id: `zai-three-round-tool-block-${round}-${index}`,
              kind: 'tool_result',
              callId: id,
              outcome: 'completed',
              visibility: visible,
              blocks: [
                {
                  id: `zai-three-round-tool-text-${round}-${index}`,
                  kind: 'text',
                  text: `${leaf.nonce}=42`,
                  visibility: visible,
                },
              ],
            },
          ],
        }),
      ),
      message('user', `Round ${round}: repeat the code.`, `zai-three-round-user-${round}`),
    ],
  }
}

type Shape = 'none' | 'plain' | 'details'
const reasoningFragments = (round: number) => ['Recall', ' the code', ` for round ${round}.`]

/** Same frame shape as the recorded streams: id-less, unsigned, format unknown, index 0. */
function syntheticStream(
  leaf: Leaf,
  round: number,
  shape: Shape,
  withTools: boolean,
  servingProvider: string = leaf.servingProvider,
): string {
  const head = {
    id: `gen-zai-local-${round}`,
    object: 'chat.completion.chunk',
    model: leaf.definition.modelId,
    provider: servingProvider,
  }
  let body = ''
  if (shape !== 'none')
    for (const text of reasoningFragments(round))
      body += sse({
        ...head,
        choices: [
          {
            index: 0,
            delta: {
              content: '',
              role: 'assistant',
              reasoning: text,
              ...(shape === 'details'
                ? {
                    reasoning_details: [
                      { type: 'reasoning.text', text, format: 'unknown', index: 0 },
                    ],
                  }
                : {}),
            },
            finish_reason: null,
          },
        ],
      })
  body += sse({
    ...head,
    choices: [{ index: 0, delta: { content: `reply ${round}`, role: 'assistant' } }],
  })
  if (withTools)
    body += sse({
      ...head,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: `call_zai_${round}`,
                type: 'function',
                function: { name: tool.name, arguments: '{"key":"code"}' },
              },
            ],
          },
        },
      ],
    })
  body += sse({
    ...head,
    choices: [
      { index: 0, delta: { content: '' }, finish_reason: withTools ? 'tool_calls' : 'stop' },
    ],
    usage: {
      prompt_tokens: 200 * round,
      completion_tokens: 12,
      completion_tokens_details: { reasoning_tokens: shape === 'none' ? 0 : 6 },
      prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      cost: 0.0000123,
    },
  })
  return body + 'data: [DONE]\n\n'
}

type Transport = AdaptationLease['transport']
async function invoke(request: PlanInput, transport: Transport, signal?: AbortSignal) {
  return invokeModel({
    ...request,
    transport,
    // Must not share a substring with response identities: redaction would rewrite them.
    credential: 'zai-local-controlled-only',
    signal: signal ?? new AbortController().signal,
    policy: policy(),
  }).outcome
}

const retirement: RetirementPolicy = {
  waitMilliseconds: 100,
  force: false,
  schedule(ms, callback) {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}

/** Public: standalone transport. Cordis: the official model plugin's leased transport. */
async function openEntry(
  entry: 'public' | 'cordis',
  options: Parameters<typeof createModelTransportService>[0],
  definition: ModelDefinition,
  meter: InputMeter,
  first: PlanInput,
) {
  if (entry === 'public') {
    const direct = createPiAiTransport({
      ...options,
      definitions: [definition],
      inputMeters: [meter],
    })
    return {
      transport: direct as Transport,
      invoke: (request: PlanInput) => invoke(request, direct),
      close: () => direct.close(),
    }
  }
  const service = createModelTransportService(options)
  const context = new Context()
  const provided: Plugin.Object = {
    name: 'zai-local-https',
    apply(ctx) {
      ctx.provide(MODEL_TRANSPORT_SERVICE, service)
      ctx.effect(() => async () => {
        await service.close(retirement)
        await service.closed
      })
    },
  }
  await context.plugin(provided)
  await context.plugin(createModelPlugin(definition, meter, retirement), {})
  expect(context.get(MODEL_TRANSPORT_SERVICE)).toBe(service)
  const acquired = service.acquire(first.snapshot.adaptation, first.routeName)
  if ('rejected' in acquired) throw new Error(acquired.rejected)
  const lease = acquired.lease
  return {
    transport: lease.transport,
    invoke: (request: PlanInput) => lease.track(invoke(request, lease.transport, lease.signal)),
    close: async () => {
      lease.release()
      await context.fiber.dispose()
    },
  }
}

function laterFallback(leaf: Leaf): 'prefix_changed' | 'basis_changed' {
  return leaf.provider === 'alibaba' ? 'prefix_changed' : 'basis_changed'
}

/** The final usage frame of a recorded stream. */
function usageOf(stream: string): { prompt: number; cached: number } {
  for (const line of stream.split('\n').reverse()) {
    if (!line.startsWith('data: {')) continue
    const frame: unknown = JSON.parse(line.slice('data: '.length))
    if (typeof frame !== 'object' || frame === null || !('usage' in frame)) continue
    const usage = frame.usage
    if (
      typeof usage === 'object' &&
      usage !== null &&
      'prompt_tokens' in usage &&
      typeof usage.prompt_tokens === 'number' &&
      'prompt_tokens_details' in usage &&
      typeof usage.prompt_tokens_details === 'object' &&
      usage.prompt_tokens_details !== null &&
      'cached_tokens' in usage.prompt_tokens_details &&
      typeof usage.prompt_tokens_details.cached_tokens === 'number'
    )
      return { prompt: usage.prompt_tokens, cached: usage.prompt_tokens_details.cached_tokens }
  }
  throw new Error('recorded stream has no usage frame')
}

type WireMessage = Record<string, unknown>
function wireMessages(body: string): WireMessage[] {
  const parsed: unknown = JSON.parse(body)
  if (typeof parsed !== 'object' || parsed === null || !('messages' in parsed))
    throw new Error('wire without messages')
  const messages = parsed.messages
  if (!Array.isArray(messages)) throw new Error('wire messages are not an array')
  return messages as WireMessage[]
}

/** Prime moves its one explicit `last_message` breakpoint; compare prefixes without it. */
function withoutCacheMarkers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutCacheMarkers)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'cache_control')
      .map(([key, item]) => [key, withoutCacheMarkers(item)]),
  )
}

const entries = ['public', 'cordis'] as const
const matrix = entries.flatMap(entry =>
  leaves.flatMap(leaf =>
    leaf.efforts.flatMap(effort =>
      [false, true].map(withTools => ({
        entry,
        leaf,
        effort,
        withTools,
        name: `${entry} ${leaf.definition.modelId} effort=${effort ?? 'omitted'} tools=${withTools}`,
      })),
    ),
  ),
)

async function threeRounds(
  scenario: (typeof matrix)[number],
  mode: 'no-reasoning' | 'hidden-thinking',
) {
  const { entry, leaf, effort, withTools } = scenario
  const { definition } = leaf
  const realRows = mode === 'hidden-thinking' && !withTools && leaf.recorded.length === 3
  let responses = 0
  const host = await fixture(
    cert.tls,
    res => {
      responses++
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const row = realRows ? leaf.recorded[responses - 1] : undefined
      res.end(
        row
          ? row.sse
          : syntheticStream(
              leaf,
              responses,
              mode === 'no-reasoning' ? 'none' : 'details',
              withTools,
            ),
      )
    },
    {},
    undefined,
    [definition],
  )
  const official = officialMeter(definition)
  expect(official.replayRevision).toBe('unsupported-marginal/1')
  const { meter, marginal } = countedMeter(official)
  let request = firstRound(leaf, effort, withTools)
  const opened = await openEntry(entry, host.options, definition, meter, request)
  const estimates: number[] = []
  try {
    for (let round = 1; round <= 3; round++) {
      const planned = await opened.transport.plan(request, {
        signal: new AbortController().signal,
      })
      if ('rejected' in planned) throw new Error(`round ${round}: ${JSON.stringify(planned)}`)
      const { measurement, body, serialized, inputLimitEvidence } = planned.planned
      expect(measurement).toMatchObject({
        mode: 'full',
        precision: 'estimated',
        // Later rounds fall back before φ/δ is ever consulted: Prime's single
        // `last_message` breakpoint moves, so the observed prefix changed; on the
        // fp8 routes the reported display name differs from the endpoint tag.
        fallbackReason: round === 1 ? 'no_observation' : laterFallback(leaf),
        fullContribution: { precision: 'estimated' },
        basis: { provider: leaf.provider, replayRevision: 'unsupported-marginal/1' },
      })
      if (measurement.mode !== 'full') throw new Error('unreachable')
      const independent = directFull(officialMeter(definition), { body, serialized })
      if (independent.kind !== 'estimated') throw new Error(`round ${round}: no estimate`)
      expect(writeJsonLossless(measurement.predictedInput)).toBe(
        writeJsonLossless(independent.tokens),
      )
      expect(inputLimitEvidence.inputTokens.kind).toBe('estimated')
      if (inputLimitEvidence.inputTokens.kind !== 'estimated') throw new Error('unreachable')
      estimates.push(Number(inputLimitEvidence.inputTokens.tokens))
      expect(body).toMatchObject({
        model: definition.modelId,
        provider: { order: [leaf.provider], allow_fallbacks: false, require_parameters: true },
      })
      if (effort) expect(body.reasoning).toEqual({ effort })
      else expect(body).not.toHaveProperty('reasoning')
      expect(body.tools === undefined).toBe(!withTools)
      expect(serialized).toContain(leaf.nonce)
      for (const other of leaves) if (other !== leaf) expect(serialized).not.toContain(other.nonce)

      const result = await opened.invoke(request)
      if (!('outcome' in result) || result.outcome !== 'complete')
        throw new Error(`round ${round}: ${JSON.stringify(result)}`)
      // Exactly one HTTP request per round, byte-identical to the fixed plan.
      expect(host.requests).toHaveLength(round)
      expect(host.requests[round - 1]?.path).toBe('/api/v1/chat/completions')
      expect(host.requests[round - 1]?.body).toBe(serialized)
      expect(result.servingProvider).toBe(leaf.servingProvider)
      expect(result.inputCalibration.observedInput.kind).toBe('from_usage')
      if (effort) expect(result.parameters).toMatchObject({ reasoningEffort: effort })
      else expect(result.parameters).not.toHaveProperty('reasoningEffort')

      const kinds = result.blocks.map(block => block.kind)
      const row = realRows ? leaf.recorded[round - 1] : undefined
      if (mode === 'no-reasoning')
        expect(kinds).toEqual(withTools ? ['text', 'tool_call'] : ['text'])
      else {
        expect(kinds).toEqual(withTools ? ['thinking', 'text', 'tool_call'] : ['thinking', 'text'])
        const thinking = result.blocks[0]
        if (thinking?.kind !== 'thinking' || thinking.opaque === undefined)
          throw new Error('recorded reasoning lost its details')
        // Adjacent id-less unsigned fragments join into one detail (R-F/R-L).
        if (row) {
          expect(createHash('sha256').update(row.sse).digest('hex')).toBe(row.sseSha256)
          expect(thinking.text).toBe(row.thought)
          expect(readOpaqueJson(thinking.opaque)).toEqual(
            jsonBody({ routeName: definition.modelId, reasoning_details: [row.detail] }),
          )
          // Recorded usage stays an upstream fact: uncached input plus cache read.
          const recordedUsage = usageOf(row.sse)
          expect(writeJsonLossless(result.usage.input_tokens)).toBe(
            String(recordedUsage.prompt - recordedUsage.cached),
          )
          expect(writeJsonLossless(result.usage.cache_read_tokens)).toBe(
            String(recordedUsage.cached),
          )
        } else {
          const text = reasoningFragments(round).join('')
          expect(thinking.text).toBe(text)
          expect(readOpaqueJson(thinking.opaque)).toEqual({
            routeName: definition.modelId,
            reasoning_details: [{ type: 'reasoning.text', text, format: 'unknown', index: 0 }],
          })
        }
      }
      if (!row) {
        expect(writeJsonLossless(result.usage.input_tokens)).toBe(String(200 * round))
        expect(writeJsonLossless(result.cost.cost_usd)).toBe('0.0000123')
      }
      if (round < 3)
        request = appendRound(request, result, round + 1, leaf, mode === 'hidden-thinking')
    }
    // Full-only (R-A): no φ/δ contribution was requested or reported.
    expect(marginal).toEqual([])
    expect(estimates[1]).toBeGreaterThan(estimates[0] ?? Infinity)
    expect(estimates[2]).toBeGreaterThan(estimates[1] ?? Infinity)
    expect(host.requests).toHaveLength(3)
    const wires = host.requests.map(sent => wireMessages(sent.body))
    for (const [index, wire] of wires.entries()) {
      // No message on any wire carries reasoning in either representation.
      for (const unit of wire) {
        expect(unit).not.toHaveProperty('reasoning')
        expect(unit).not.toHaveProperty('reasoning_details')
      }
      if (leaf.provider === 'alibaba') {
        const marked = wire.flatMap((unit, position) =>
          JSON.stringify(unit).includes('cache_control') ? [position] : [],
        )
        expect(marked).toEqual([wire.length - 1])
      } else expect(host.requests[index]?.body).not.toContain('cache_control')
    }
    for (const round of [1, 2]) {
      const prior = wires[round - 1] ?? []
      const current = wires[round] ?? []
      // Earlier units are replayed unchanged (apart from the moved Prime breakpoint).
      expect(JSON.stringify(withoutCacheMarkers(current.slice(0, prior.length)))).toBe(
        JSON.stringify(withoutCacheMarkers(prior)),
      )
      const assistant = current[prior.length]
      const content = realRows ? leaf.recorded[round - 1]?.content : `reply ${round}`
      expect(assistant).toMatchObject({ role: 'assistant', content })
      expect(Object.keys(assistant ?? {}).sort()).toEqual(
        withTools ? ['content', 'role', 'tool_calls'] : ['content', 'role'],
      )
      expect(current.slice(prior.length + 1).map(unit => unit.role)).toEqual(
        withTools ? ['tool', 'user'] : ['user'],
      )
    }
  } finally {
    await opened.close()
    await host.close()
  }
}

describe.each(matrix)('ZAI three local TLS rounds, replies without reasoning: $name', scenario => {
  it('every round is full estimated, φ/δ unavailable, history replayed', async () => {
    await threeRounds(scenario, 'no-reasoning')
  })
})

describe.each(matrix)('ZAI three local TLS rounds, caller hides thinking: $name', scenario => {
  it('every round is full estimated and no wire carries reasoning', async () => {
    await threeRounds(scenario, 'hidden-thinking')
  })
})

const boundaries = entries.flatMap(entry =>
  leaves.flatMap(leaf =>
    (['plain', 'details'] as const).map(shape => ({
      entry,
      leaf,
      shape,
      name: `${entry} ${leaf.definition.modelId} ${shape}`,
    })),
  ),
)

// Visible reasoning history (GG-12) is released for every leaf: GLM-5.2, Prime and FlashX in
// the first batch, GLM-5.3 and Flash after ZV0. The split was the published
// definition/implementation revision, never a switch; the refusing `mp4-17` is retired.
describe.each(boundaries)('ZAI reasoning history replayed as returned: $name', scenario => {
  it('each released leaf estimates round 2 and sends it; history unchanged', async () => {
    const { entry, leaf, shape } = scenario
    expect(leaf.definition.implementation.revision).toBe('mp4-18')
    const { definition } = leaf
    // Recorded streams are the details shape; other leaves use the same frame shape.
    const row = shape === 'details' ? leaf.recorded[0] : undefined
    const host = await fixture(
      cert.tls,
      res => {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.end(row ? row.sse : syntheticStream(leaf, 1, shape, false))
      },
      {},
      undefined,
      [definition],
    )
    const first = firstRound(leaf, leaf.efforts[0], false)
    const opened = await openEntry(
      entry,
      host.options,
      definition,
      officialMeter(definition),
      first,
    )
    try {
      const result = await opened.invoke(first)
      if (!('outcome' in result) || result.outcome !== 'complete')
        throw new Error(JSON.stringify(result))
      const thinking = result.blocks.find(block => block.kind === 'thinking')
      if (thinking?.kind !== 'thinking') throw new Error('reasoning missing')
      expect(thinking.opaque === undefined).toBe(shape === 'plain')
      const second = appendRound(first, result, 2, leaf, false)
      const retained = JSON.stringify(second.messages)
      const planned = await opened.transport.plan(second, {
        signal: new AbortController().signal,
      })
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      expect(planned.planned.measurement).toMatchObject({ mode: 'full', precision: 'estimated' })
      const replayed = await opened.invoke(second)
      if (!('outcome' in replayed) || replayed.outcome !== 'complete')
        throw new Error(JSON.stringify(replayed))
      expect(host.requests).toHaveLength(2)
      expect(host.requests[1]?.body).toBe(planned.planned.serialized)
      expect(JSON.stringify(second.messages)).toBe(retained)
      // The synthetic fixture meter shows the projection itself carries the history
      // unchanged; whether it is metered is the official meter's release.
      const carried = await host.transport.plan(second, { signal: new AbortController().signal })
      if ('rejected' in carried) throw new Error(JSON.stringify(carried))
      const assistant = wireMessages(carried.planned.serialized).find(
        unit => unit.role === 'assistant',
      )
      if (shape === 'plain') {
        expect(assistant).toMatchObject({ reasoning: thinking.text })
        expect(assistant).not.toHaveProperty('reasoning_details')
      } else {
        expect(assistant).toHaveProperty('reasoning_details')
        expect(assistant).not.toHaveProperty('reasoning')
      }
      // The sent second request carries the same member on the wire.
      const sent = wireMessages(host.requests[1]?.body ?? '{}').find(
        unit => unit.role === 'assistant',
      )
      expect(sent).toEqual(assistant)
      expect(host.requests).toHaveLength(2)
    } finally {
      await opened.close()
      await host.close()
    }
  })
})

describe.each(leaves)('ZAI public boundaries: $definition.modelId', leaf => {
  const { definition } = leaf

  it('with provenance matching the basis, φ/δ are unavailable or never reached', async () => {
    const host = await fixture(
      cert.tls,
      res => {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.end(syntheticStream(leaf, 1, 'none', false, leaf.provider))
      },
      {},
      undefined,
      [definition],
    )
    const { meter, marginal } = countedMeter(officialMeter(definition))
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [meter],
    })
    let request = firstRound(leaf, leaf.efforts[0], false)
    try {
      for (let round = 1; round <= 3; round++) {
        const before = marginal.length
        const planned = await transport.plan(request, { signal: new AbortController().signal })
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        expect(planned.planned.measurement).toMatchObject({ mode: 'full', precision: 'estimated' })
        if (round === 1) expect(marginal.slice(before)).toEqual([])
        else if (leaf.provider === 'alibaba') {
          // The moved Prime breakpoint changes the prefix before φ/δ is reached.
          expect(marginal.slice(before)).toEqual([])
          expect(planned.planned.measurement).toMatchObject({ fallbackReason: 'prefix_changed' })
        } else {
          expect(marginal.slice(before)).toEqual(['replay:unavailable', 'new:unavailable'])
          expect(planned.planned.measurement).not.toHaveProperty('fallbackReason')
          expect(planned.planned.measurement).not.toHaveProperty('replayContribution')
        }
        marginal.length = before
        const result = await invoke(request, transport)
        if (!('outcome' in result) || result.outcome !== 'complete')
          throw new Error(JSON.stringify(result))
        expect(result.servingProvider).toBe(leaf.provider)
        expect(host.requests.at(-1)?.body).toBe(planned.planned.serialized)
        if (round < 3) request = appendRound(request, result, round + 1, leaf, false)
      }
      expect(host.requests).toHaveLength(3)
    } finally {
      await transport.close()
      await host.close()
    }
  })

  it('drops an explicit effort outside the accepted set instead of forwarding it', async () => {
    const host = await fixture(cert.tls, res => res.end(), {}, undefined, [definition])
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [officialMeter(definition)],
    })
    try {
      const base = firstRound(leaf, undefined, false)
      const planned = await transport.plan(
        { ...base, parameters: { ...base.parameters, reasoningEffort: leaf.dropped } },
        { signal: new AbortController().signal },
      )
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      expect(planned.planned.body).not.toHaveProperty('reasoning')
      expect(planned.planned.droppedParameters).toContain('reasoningEffort')
      expect(planned.planned.measurement).toMatchObject({ mode: 'full', precision: 'estimated' })
      expect(host.requests).toHaveLength(0)
    } finally {
      await transport.close()
      await host.close()
    }
  })
})

const videoLeaves = leaves.filter(leaf =>
  leaf.definition.capabilities.inputModalities.includes('video'),
)

describe.each(entries.flatMap(entry => videoLeaves.map(leaf => ({ entry, leaf }))))(
  'ZAI declared media input: $entry $leaf.definition.modelId',
  ({ entry, leaf }) => {
    it('stays modality_not_carried with zero HTTP', async () => {
      const { definition } = leaf
      const host = await fixture(cert.tls, res => res.end(), {}, undefined, [definition])
      const base = firstRound(leaf, undefined, false)
      const opened = await openEntry(
        entry,
        host.options,
        definition,
        officialMeter(definition),
        base,
      )
      try {
        // Out of scope for this delivery (text and image only): the declaration
        // is kept, the modality is not carried.
        expect(definition.capabilities.inputModalities).toEqual(['image', 'text', 'video'])
        const input: PlanInput = {
          ...base,
          messages: [
            ...base.messages,
            judgedMessage({
              id: 'zai-video',
              type: 'user',
              createdAt: at,
              blocks: [
                {
                  id: 'zai-video-file',
                  kind: 'file',
                  attachment: {
                    storage: 'attachments',
                    key: `obj_zai_video_${leaf.nonce}`,
                    mediaType: 'video/mp4',
                    name: 'clip.mp4',
                  },
                  visibility: visible,
                },
              ],
            }),
          ],
        }
        expect(await opened.invoke(input)).toEqual({ rejected: 'modality_not_carried' })
        expect(
          await opened.transport.plan(input, { signal: new AbortController().signal }),
        ).toEqual({ rejected: 'modality_not_carried' })
        // The synthetic meter does not change that: no wire projection exists.
        expect(await host.transport.plan(input, { signal: new AbortController().signal })).toEqual({
          rejected: 'modality_not_carried',
        })
        expect(host.requests).toHaveLength(0)
      } finally {
        await opened.close()
        await host.close()
      }
    })

    it('carries a declared inline image on the wire, but the official meter refuses it before HTTP', async () => {
      const { definition } = leaf
      const host = await fixture(cert.tls, res => res.end(), {}, undefined, [definition])
      const base = firstRound(leaf, undefined, false)
      const opened = await openEntry(
        entry,
        host.options,
        definition,
        officialMeter(definition),
        base,
      )
      try {
        const input: PlanInput = {
          ...base,
          messages: [
            ...base.messages,
            judgedMessage({
              id: 'zai-image',
              type: 'user',
              createdAt: at,
              blocks: [
                {
                  id: 'zai-image-block',
                  kind: 'image',
                  mediaType: 'image/png',
                  data: { inline: tinyPng },
                  visibility: visible,
                },
              ],
            }),
          ],
        }
        // The synthetic fixture meter shows the wire projection carries the image.
        const carried = await host.transport.plan(input, { signal: new AbortController().signal })
        if ('rejected' in carried) throw new Error(JSON.stringify(carried))
        expect(carried.planned.serialized).toContain('"type":"image_url"')
        expect(carried.planned.serialized).toContain('data:image/png;base64,')
        const refused = {
          rejected: 'invalidInput',
          reason: 'input_size_unavailable',
          metrics: ['maxInputTokens'],
        }
        expect(
          await opened.transport.plan(input, { signal: new AbortController().signal }),
        ).toEqual(refused)
        expect(await opened.invoke(input)).toEqual(refused)
        expect(host.requests).toHaveLength(0)
      } finally {
        await opened.close()
        await host.close()
      }
    })
  },
)
