// @module-tag slow
// 归慢层：网络＋重 CPU：经本地 HTTPS 服务（openssl 现生成证书）走真实传输与读取，输入计量用真实分词器。
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import {
  invokeModel,
  type ModelInvocationResult,
  type PlanInput,
  type PlanOutputHistoryGroup,
} from '@omne-harness-lite/model-request-runtime-local'
import { writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import {
  createModelTransportService,
  createOfficialProfileContent,
  createPiAiTransport,
  createQwenInputMeter,
  qwenDefinitions,
  type AdaptationLease,
  type InputMeter,
  type MeterContribution,
  type ModelDefinition,
  type PlannedRequest,
  type RetirementPolicy,
} from '@omne-harness-lite/pi-ai-transport'
import {
  createModelPlugin,
  MODEL_TRANSPORT_SERVICE,
} from '@omne-harness-lite/pi-ai-transport/plugin'
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
} from './support.ts'

// Local TLS closeout for the eight exact Qwen leaves at their current bindings.
// Synthetic upstream bytes verify wiring, replay and metering shape only.
const openIds: readonly string[] = ['qwen/qwen3.8-2.4t-a95b', 'qwen/qwen3.8-27b']
const imageModelId = 'qwen/qwen3.8-27b'
type Effort = 'high' | 'max'
type Entry = 'public' | 'cordis'
const retirement: RetirementPolicy = {
  waitMilliseconds: 100,
  force: false,
  schedule(ms, callback) {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}
const tool: ModelToolEntry = {
  name: 'lookup__exact',
  description: 'Exact lookup',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
    additionalProperties: false,
  },
}
const systemText = 'Answer from the lookup result.'
const visible = { toHuman: true, toModel: true } as const
const redPng = readFileSync(new URL('./fixtures/qwen/public-red-544.png', import.meta.url))
// One 1x1 PNG: canonical inline encoding, but below the unscaled 27B pixel floor.
const tinyPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='

const meters = new Map<string, InputMeter>()
let cert: ReturnType<typeof certificate>
// Each factory call loads and verifies the pinned tokenizer; build all eight once.
beforeAll(() => {
  cert = certificate()
  for (const definition of qwenDefinitions)
    meters.set(definition.modelId, createQwenInputMeter(definition))
}, 180_000)
afterAll(() => cert.dispose())

function definitionFor(modelId: string): ModelDefinition {
  const found = qwenDefinitions.find(value => value.modelId === modelId)
  if (!found) throw new Error(`missing Qwen definition ${modelId}`)
  return found
}
function meterFor(modelId: string): InputMeter {
  const found = meters.get(modelId)
  if (!found) throw new Error(`missing Qwen meter ${modelId}`)
  return found
}
function explicit(definition: ModelDefinition): boolean {
  return definition.routes.alibaba?.cache.mode === 'explicit'
}
function forwards(definition: ModelDefinition, effort: Effort): boolean {
  const rule = definition.routes.alibaba?.parameters.reasoningEffort
  return rule?.kind === 'select' && 'values' in rule.accepted
    ? rule.accepted.values.some(value => value === effort)
    : false
}

function request(definition: ModelDefinition, effort: Effort, tools: boolean): PlanInput {
  const profile = createOfficialProfileContent(definition, {
    providers: ['alibaba'],
    allowFallback: false,
    configuration: {
      revision: 'qwen-current-closeout-1',
      values: {
        cache: explicit(definition)
          ? { mode: 'explicit', ttl: '5m', breakpoints: ['system'] }
          : { mode: 'automatic' },
      },
    },
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const base = input()
  return {
    ...base,
    routeName: definition.modelId,
    provider: 'alibaba',
    parameters: { reasoningEffort: effort, maxOutputTokens: 1024 },
    tools: tools ? [tool] : [],
    messages: [
      message('system', systemText, 'system'),
      message('system_reminder', 'Keep answers short.', 'reminder'),
      message('user', 'Start.', 'u0'),
    ],
    tokenMargin: { multiplier: 1.1, reserveTokens: 64 },
    outputHistory: [],
    snapshot: {
      ...base.snapshot,
      ...definition.capabilities,
      adaptation: profile.ok.adaptation,
      providers: ['alibaba'],
      allowFallback: false,
    },
  }
}

type Reasoning = 'plain' | 'text' | 'summary' | 'encrypted'
function reasoningDelta(kind: Reasoning, round: number): JsonObject {
  const text = `Visible step ${round}.`
  if (kind === 'plain') return { reasoning: text }
  if (kind === 'text')
    return {
      reasoning: text,
      reasoning_details: [{ type: 'reasoning.text', text, format: 'unknown', index: 0 }],
    }
  if (kind === 'summary')
    return {
      reasoning_details: [
        { type: 'reasoning.summary', summary: `Summary ${round}.`, format: 'unknown', index: 0 },
      ],
    }
  return {
    reasoning_details: [
      { type: 'reasoning.encrypted', data: `OPAQUE-${round}`, format: 'unknown', index: 0 },
    ],
  }
}
function response(
  modelId: string,
  round: number,
  options: { reasoning: Reasoning; call: boolean; servingProvider?: string },
): string {
  const call = options.call
    ? sse({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: `call_q${round}`,
                  type: 'function',
                  function: { name: tool.name, arguments: JSON.stringify({ query: `q${round}` }) },
                },
              ],
            },
          },
        ],
      })
    : content(`Answer ${round}.`)
  return (
    sse({
      model: modelId,
      ...(options.servingProvider === undefined ? {} : { provider: options.servingProvider }),
      choices: [{ delta: reasoningDelta(options.reasoning, round) }],
    }) +
    call +
    sse({
      choices: [],
      usage: {
        prompt_tokens: 1000 + round,
        completion_tokens: 7,
        completion_tokens_details: { reasoning_tokens: 3 },
        prompt_tokens_details: {
          cached_tokens: round === 1 ? 0 : 20,
          cache_write_tokens: round === 1 ? 20 : 0,
        },
        cost: 0.0000117,
      },
    }) +
    finish(options.call ? 'tool_calls' : 'stop')
  )
}

type Opened = { transport: AdaptationLease['transport']; close: () => Promise<void> }
async function open(
  entry: Entry,
  definition: ModelDefinition,
  meter: InputMeter,
  options: Awaited<ReturnType<typeof fixture>>['options'],
  adaptation: PlanInput['snapshot']['adaptation'],
): Promise<Opened> {
  if (entry === 'public') {
    const direct = createPiAiTransport({
      ...options,
      definitions: [definition],
      inputMeters: [meter],
    })
    return { transport: direct, close: () => direct.close() }
  }
  const context = new Context()
  const service = createModelTransportService(options)
  const provider: Plugin.Object = {
    name: 'qwen-family-local-https',
    apply(ctx) {
      ctx.provide(MODEL_TRANSPORT_SERVICE, service)
      ctx.effect(() => async () => {
        await service.close(retirement)
        await service.closed
      })
    },
  }
  try {
    await context.plugin(provider)
    await context.plugin(createModelPlugin(definition, meter, retirement), {})
    expect(context.get(MODEL_TRANSPORT_SERVICE)).toBe(service)
    const acquired = service.acquire(adaptation, definition.modelId)
    if ('rejected' in acquired) throw new Error(acquired.rejected)
    return {
      transport: acquired.lease.transport,
      async close() {
        acquired.lease.release()
        await context.fiber.dispose()
        await service.closed
        expect(service.inspect().references).toBe(0)
      },
    }
  } catch (error) {
    await context.fiber.dispose()
    throw error
  }
}

function appendRound(
  current: PlanInput,
  planned: PlannedRequest,
  outcome: ModelInvocationResult,
  round: number,
): PlanInput {
  const replaySelection = outcome.blocks.map((_block, sourceBlockIndex) => ({
    sourceBlockIndex,
    messageIndex: current.messages.length,
    blockIndex: sourceBlockIndex,
  }))
  const group: PlanOutputHistoryGroup = {
    inputCalibration: outcome.inputCalibration,
    usage: outcome.usage,
    outputBlocks: outcome.blocks,
    replaySelection,
    origin: {
      adaptation: current.snapshot.adaptation,
      provider: 'alibaba',
      parameters: planned.parameters,
      ...(outcome.upstreamModel === undefined ? {} : { upstreamModel: outcome.upstreamModel }),
      ...(outcome.servingProvider === undefined
        ? {}
        : { servingProvider: outcome.servingProvider }),
    },
  }
  const results = outcome.blocks.flatMap(block =>
    block.kind === 'tool_call'
      ? [
          judgedMessage({
            type: 'tool',
            id: `tool-${round}`,
            callId: block.callId,
            createdAt: at,
            blocks: [
              {
                id: `tool-result-${round}`,
                kind: 'tool_result',
                callId: block.callId,
                outcome: 'completed',
                visibility: visible,
                blocks: [
                  {
                    id: `tool-text-${round}`,
                    kind: 'text',
                    text: `Result ${round}`,
                    visibility: visible,
                  },
                ],
              },
            ],
          }),
        ]
      : [],
  )
  return {
    ...current,
    messages: [
      ...current.messages,
      judgedMessage({
        type: 'assistant',
        id: `assistant-${round}`,
        response: `response-${round}`,
        ending: 'complete',
        createdAt: at,
        blocks: outcome.blocks,
      }),
      ...results,
      message('user', `Next ${round}`, `u${round}`),
    ],
    outputHistory: [...current.outputHistory, group],
    calibration: {
      kind: 'observation',
      inputCalibration: group.inputCalibration,
      usage: group.usage,
      outputBlocks: group.outputBlocks,
      replaySelection: group.replaySelection,
    },
  }
}

// Open leaves replay the plain reasoning string; commercial leaves replay one visible
// `reasoning.text` detail in rounds 1 and 2 (a summary detail is refused on every leaf).
function roundReasoning(isOpen: boolean, round: number): Reasoning {
  return isOpen || round === 3 ? 'plain' : 'text'
}

/** The exact wire assistant unit a prior round must replay unchanged. */
function replayedAssistant(isOpen: boolean, round: number, call: boolean): JsonObject {
  const reasoning = roundReasoning(isOpen, round)
  const delta = reasoningDelta(reasoning, round)
  return {
    role: 'assistant',
    content: call ? '' : `Answer ${round}.`,
    ...(call
      ? {
          tool_calls: [
            {
              id: expect.any(String),
              type: 'function',
              function: { name: tool.name, arguments: `{"query":"q${round}"}` },
            },
          ],
        }
      : {}),
    ...(reasoning === 'plain'
      ? { reasoning: `Visible step ${round}.` }
      : { reasoning_details: delta.reasoning_details ?? [] }),
  }
}

type Counted = { meter: InputMeter; marginal: MeterContribution[] }
function counted(original: InputMeter): Counted {
  const marginal: MeterContribution[] = []
  return {
    marginal,
    meter: {
      ...original,
      measureReplay(value) {
        const result = original.measureReplay(value)
        marginal.push(result)
        return result
      },
      measureNew(value) {
        const result = original.measureNew(value)
        marginal.push(result)
        return result
      },
    },
  }
}

const threeRoundCases = qwenDefinitions.flatMap(definition =>
  (openIds.includes(definition.modelId) ? (['high', 'max'] as const) : (['high'] as const)).flatMap(
    effort => [false, true].map(tools => ({ modelId: definition.modelId, effort, tools })),
  ),
)

describe.each(['public', 'cordis'] as const)('%s Qwen current-binding local TLS', entry => {
  it.each(threeRoundCases)(
    '$modelId effort=$effort tools=$tools: three rounds replay original history, full only',
    async ({ modelId, effort, tools }) => {
      const definition = definitionFor(modelId)
      const isOpen = openIds.includes(modelId)
      const { meter, marginal } = counted(meterFor(modelId))
      let round = 0
      const host = await fixture(
        cert.tls,
        res => {
          round++
          const reasoning = roundReasoning(isOpen, round)
          res.end(response(modelId, round, { reasoning, call: tools && round < 3 }))
        },
        {},
        undefined,
        [definition],
      )
      let next = request(definition, effort, tools)
      const opened = await open(entry, definition, meter, host.options, next.snapshot.adaptation)
      try {
        for (let index = 0; index < 3; index++) {
          const before = marginal.length
          const plan = await opened.transport.plan(next, { signal: new AbortController().signal })
          if ('rejected' in plan) throw new Error(JSON.stringify(plan))
          const planned = plan.planned
          // Full only: the meter publishes no replay (phi) or new-input (delta) contribution.
          expect(planned.measurement).toMatchObject({
            mode: 'full',
            fullContribution: { precision: 'estimated' },
          })
          expect(planned.measurement).not.toHaveProperty('replayContribution')
          if (index === 0) expect(planned.measurement).toHaveProperty('fallbackReason')
          else {
            expect(planned.measurement).not.toHaveProperty('fallbackReason')
            expect(marginal.length).toBeGreaterThan(before)
          }
          expect(planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
          const body = planned.body
          if (forwards(definition, effort)) expect(body.reasoning).toEqual({ effort })
          else {
            expect(body).not.toHaveProperty('reasoning')
            expect(planned.droppedParameters).toContain('reasoningEffort')
          }
          if (explicit(definition)) {
            expect(Array.isArray(body.messages) ? body.messages[0] : undefined).toEqual({
              role: 'system',
              content: [
                { type: 'text', text: systemText, cache_control: { type: 'ephemeral', ttl: '5m' } },
              ],
            })
            expect(planned.serialized.split('"cache_control"')).toHaveLength(2)
          } else expect(planned.serialized).not.toContain('cache_control')
          if (tools) {
            expect(body.tools).toHaveLength(1)
            expect(body.tools).toMatchObject([{ type: 'function', function: { name: tool.name } }])
          } else expect(body).not.toHaveProperty('tools')
          const outcome = await invokeModel({
            ...next,
            transport: opened.transport,
            credential: 'local-qwen-closeout-only',
            signal: new AbortController().signal,
            policy: policy(),
          }).outcome
          if (!('outcome' in outcome) || outcome.outcome !== 'complete')
            throw new Error(JSON.stringify(outcome))
          const wire = host.requests[index]?.body
          expect(wire).toBe(planned.serialized)
          expect(wire).not.toContain('local-qwen-closeout-only')
          const sent: unknown = JSON.parse(wire ?? 'null')
          const units: unknown[] =
            sent !== null &&
            typeof sent === 'object' &&
            'messages' in sent &&
            Array.isArray(sent.messages)
              ? sent.messages
              : []
          const withRole = (role: string) =>
            units.filter(
              (unit): unit is JsonObject =>
                unit !== null && typeof unit === 'object' && 'role' in unit && unit.role === role,
            )
          const assistants = withRole('assistant')
          expect(assistants).toEqual(
            Array.from({ length: index }, (_value, prior) =>
              replayedAssistant(isOpen, prior + 1, tools && prior + 1 < 3),
            ),
          )
          // Wire call ids are the shared normalized projection; results stay paired to them.
          expect(withRole('tool').map(unit => [unit.tool_call_id, unit.content])).toEqual(
            assistants.flatMap((unit, prior) =>
              Array.isArray(unit.tool_calls)
                ? unit.tool_calls.map(call => [
                    call !== null && typeof call === 'object' && 'id' in call ? call.id : undefined,
                    `Result ${prior + 1}`,
                  ])
                : [],
            ),
          )
          // Uncached input excludes either the 20 written or the 20 read cache tokens.
          expect(writeJsonLossless(outcome.usage.input_tokens)).toBe(String(1000 + index + 1 - 20))
          expect(writeJsonLossless(outcome.cost.cost_usd)).toBe('0.0000117')
          expect(outcome.inputCalibration.observedInput.kind).toBe('from_usage')
          next = appendRound(next, planned, outcome, index + 1)
        }
        expect(host.requests).toHaveLength(3)
        expect(marginal.length).toBeGreaterThan(0)
        expect(marginal.every(value => value.kind === 'unavailable')).toBe(true)
      } finally {
        await opened.close()
        await host.close()
      }
    },
    20000,
  )

  it.each(['max', 'high'] as const)(
    '27B effort=%s carries a canonical inline PNG estimate across three rounds',
    async effort => {
      const definition = definitionFor(imageModelId)
      const meter = meterFor(imageModelId)
      let round = 0
      const host = await fixture(
        cert.tls,
        res => {
          round++
          res.end(response(imageModelId, round, { reasoning: 'plain', call: false }))
        },
        {},
        undefined,
        [definition],
      )
      const base = request(definition, effort, false)
      const caption = {
        id: 'image-text',
        kind: 'text',
        text: 'Describe this image.',
        visibility: visible,
      }
      const withTurn = (blocks: readonly unknown[]): PlanInput => ({
        ...base,
        messages: [
          ...base.messages,
          judgedMessage({ id: 'image-user', type: 'user', createdAt: at, blocks }),
        ],
      })
      let next = withTurn([
        caption,
        {
          id: 'image',
          kind: 'image',
          mediaType: 'image/png',
          data: { inline: redPng.toString('base64') },
          visibility: visible,
        },
      ])
      const textOnly = await estimateOnly(definition, withTurn([caption]))
      const opened = await open(entry, definition, meter, host.options, next.snapshot.adaptation)
      try {
        for (let index = 0; index < 3; index++) {
          const plan = await opened.transport.plan(next, { signal: new AbortController().signal })
          if ('rejected' in plan) throw new Error(JSON.stringify(plan))
          expect(plan.planned.measurement).toMatchObject({ mode: 'full' })
          expect(plan.planned.inputLimitEvidence.images).toBe(1)
          expect(plan.planned.inputLimitEvidence.imageBytes).toEqual([redPng.length])
          expect(plan.planned.body.reasoning).toEqual({ effort })
          const outcome = await invokeModel({
            ...next,
            transport: opened.transport,
            credential: 'local-qwen-closeout-only',
            signal: new AbortController().signal,
            policy: policy(),
          }).outcome
          if (!('outcome' in outcome) || outcome.outcome !== 'complete')
            throw new Error(JSON.stringify(outcome))
          expect(host.requests[index]?.body).toBe(plan.planned.serialized)
          expect(host.requests[index]?.body).toContain(
            `data:image/png;base64,${redPng.toString('base64')}`,
          )
          if (index === 0) {
            const tokens = plan.planned.inputLimitEvidence.inputTokens
            if (tokens.kind === 'unavailable' || textOnly.kind === 'unavailable')
              throw new Error('27B image estimate unavailable')
            // Alibaba's unscaled 544x544 formula: 544*544/1024 + 2 = 291, which includes the
            // template's vision markers around one image pad.
            expect(Number(tokens.tokens) - Number(textOnly.tokens)).toBe(291)
          }
          next = appendRound(next, plan.planned, outcome, index + 1)
        }
        expect(host.requests).toHaveLength(3)
      } finally {
        await opened.close()
        await host.close()
      }
    },
    20000,
  )
})

async function estimateOnly(definition: ModelDefinition, value: PlanInput) {
  const transport = createPiAiTransport({
    ...(await localOptions()),
    definitions: [definition],
    inputMeters: [meterFor(definition.modelId)],
  })
  try {
    const plan = await transport.plan(value, { signal: new AbortController().signal })
    if ('rejected' in plan) throw new Error(JSON.stringify(plan))
    return plan.planned.inputLimitEvidence.inputTokens
  } finally {
    await transport.close()
  }
}
let sharedHost: Awaited<ReturnType<typeof fixture>> | undefined
async function localOptions() {
  sharedHost ??= await fixture(cert.tls, res => res.end(finish()), {}, undefined, qwenDefinitions)
  return sharedHost.options
}
afterAll(async () => {
  await sharedHost?.close()
})

function userBlocks(blocks: readonly unknown[]) {
  return judgedMessage({ id: 'media-user', type: 'user', createdAt: at, blocks })
}

describe('Qwen current-binding boundaries for all eight leaves', () => {
  it.each(qwenDefinitions.map(definition => definition.modelId))(
    '%s publishes full-only estimates with no replay or new-input contribution',
    modelId => {
      const meter = meterFor(modelId)
      const definition = definitionFor(modelId)
      expect(meter).toMatchObject({
        modelId,
        definitionRevision: definition.revision,
        implementation: definition.implementation,
        provider: 'alibaba',
        replayRevision: 'unsupported-marginal/1',
        transformRevision: 'openrouter-wire/2',
      })
      expect(definition.revision).toBe('4')
      expect(definition.implementation.revision).toBe(
        openIds.includes(modelId) ? 'mp4-19' : 'mp4-20',
      )
    },
  )

  it.each(qwenDefinitions.map(definition => definition.modelId))(
    '%s refuses opaque or summary history before a second HTTP request without dropping it; visible text is estimated',
    async modelId => {
      const definition = definitionFor(modelId)
      // One visible `reasoning.text` detail is a full estimate on every leaf (open revision 2,
      // commercial public template); summary and encrypted details are refused before HTTP.
      const reasoning: readonly Reasoning[] = ['encrypted', 'text', 'summary']
      for (const kind of reasoning) {
        const host = await fixture(
          cert.tls,
          res => res.end(response(modelId, 1, { reasoning: kind, call: false })),
          {},
          undefined,
          [definition],
        )
        const transport = createPiAiTransport({
          ...host.options,
          definitions: [definition],
          inputMeters: [meterFor(modelId)],
        })
        try {
          const first = request(definition, 'high', false)
          const plan = await transport.plan(first, { signal: new AbortController().signal })
          if ('rejected' in plan) throw new Error(JSON.stringify(plan))
          const outcome = await invokeModel({
            ...first,
            transport,
            credential: 'local-qwen-closeout-only',
            signal: new AbortController().signal,
            policy: policy(),
          }).outcome
          if (!('outcome' in outcome) || outcome.outcome !== 'complete')
            throw new Error(JSON.stringify(outcome))
          const thinking = outcome.blocks.find(block => block.kind === 'thinking')
          expect(thinking?.kind === 'thinking' ? thinking.opaque : undefined).toBeDefined()
          const second = appendRound(first, plan.planned, outcome, 1)
          const retained = writeJsonLossless(second.messages)
          const secondPlan = await transport.plan(second, { signal: new AbortController().signal })
          const next = await invokeModel({
            ...second,
            transport,
            credential: 'local-qwen-closeout-only',
            signal: new AbortController().signal,
            policy: policy(),
          }).outcome
          expect(writeJsonLossless(second.messages)).toBe(retained)
          if (kind === 'text') {
            if ('rejected' in secondPlan) throw new Error(JSON.stringify(secondPlan))
            expect(secondPlan.planned.measurement).toMatchObject({
              mode: 'full',
              precision: 'estimated',
            })
            if (!('outcome' in next) || next.outcome !== 'complete')
              throw new Error(JSON.stringify(next))
            expect(host.requests).toHaveLength(2)
            // The wire replays the detail unchanged; only the meter copy used `reasoning`.
            const sent = host.requests[1]?.body ?? ''
            expect(sent).toBe(secondPlan.planned.serialized)
            expect(sent).toContain(
              '"reasoning_details":[{"type":"reasoning.text","text":"Visible step 1.","format":"unknown","index":0}]',
            )
            expect(sent).not.toContain('"reasoning":"Visible step 1."')
            continue
          }
          expect(secondPlan).toMatchObject({
            rejected: 'invalidInput',
            reason: 'input_size_unavailable',
          })
          expect(next).toMatchObject({
            rejected: 'invalidInput',
            reason: 'input_size_unavailable',
          })
          expect(host.requests).toHaveLength(1)
        } finally {
          await transport.close()
          await host.close()
        }
      }
    },
    20000,
  )

  it.each(qwenDefinitions.map(definition => definition.modelId))(
    '%s treats an inline image by declared modality and meter domain',
    async modelId => {
      const definition = definitionFor(modelId)
      const transport = createPiAiTransport({
        ...(await localOptions()),
        definitions: [definition],
        inputMeters: [meterFor(modelId)],
      })
      try {
        const base = request(definition, 'high', false)
        const plan = (data: string) =>
          transport.plan(
            {
              ...base,
              messages: [
                ...base.messages,
                userBlocks([
                  {
                    id: 'png',
                    kind: 'image',
                    mediaType: 'image/png',
                    data: { inline: data },
                    visibility: visible,
                  },
                ]),
              ],
            },
            { signal: new AbortController().signal },
          )
        const canonical = await plan(redPng.toString('base64'))
        const tiny = await plan(tinyPng)
        if (!definition.capabilities.inputModalities.includes('image')) {
          expect(canonical).toEqual({ rejected: 'modality_not_carried' })
          expect(tiny).toEqual({ rejected: 'modality_not_carried' })
        } else if (modelId === imageModelId) {
          expect(canonical).toHaveProperty('planned')
          expect(tiny).toMatchObject({
            rejected: 'invalidInput',
            reason: 'input_size_unavailable',
          })
        } else {
          expect(canonical).toMatchObject({
            rejected: 'invalidInput',
            reason: 'input_size_unavailable',
          })
          expect(tiny).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
        }
      } finally {
        await transport.close()
      }
    },
    20000,
  )

  it.each(qwenDefinitions.map(definition => definition.modelId))(
    '%s keeps video outside the carried wire modalities',
    async modelId => {
      const definition = definitionFor(modelId)
      const transport = createPiAiTransport({
        ...(await localOptions()),
        definitions: [definition],
        inputMeters: [meterFor(modelId)],
      })
      try {
        const base = request(definition, 'high', false)
        expect(
          await transport.plan(
            {
              ...base,
              messages: [
                ...base.messages,
                userBlocks([
                  {
                    id: 'clip',
                    kind: 'file',
                    attachment: {
                      storage: 'attachments',
                      key: 'obj_qwen_video',
                      mediaType: 'video/mp4',
                      name: 'clip.mp4',
                    },
                    visibility: visible,
                  },
                ]),
              ],
            },
            { signal: new AbortController().signal },
          ),
        ).toEqual({ rejected: 'modality_not_carried' })
      } finally {
        await transport.close()
      }
    },
  )

  it.each(qwenDefinitions.map(definition => definition.modelId))(
    '%s: a realistic Alibaba serving echo already falls back as basis_changed',
    async modelId => {
      const definition = definitionFor(modelId)
      const { meter, marginal } = counted(meterFor(modelId))
      const host = await fixture(
        cert.tls,
        res =>
          res.end(
            response(modelId, 1, { reasoning: 'plain', call: false, servingProvider: 'Alibaba' }),
          ),
        {},
        undefined,
        [definition],
      )
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [definition],
        inputMeters: [meter],
      })
      try {
        const first = request(definition, 'high', false)
        const plan = await transport.plan(first, { signal: new AbortController().signal })
        if ('rejected' in plan) throw new Error(JSON.stringify(plan))
        const outcome = await invokeModel({
          ...first,
          transport,
          credential: 'local-qwen-closeout-only',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        if (!('outcome' in outcome) || outcome.outcome !== 'complete')
          throw new Error(JSON.stringify(outcome))
        expect(outcome.servingProvider).toBe('Alibaba')
        const second = await transport.plan(appendRound(first, plan.planned, outcome, 1), {
          signal: new AbortController().signal,
        })
        if ('rejected' in second) throw new Error(JSON.stringify(second))
        expect(second.planned.measurement).toMatchObject({
          mode: 'full',
          fallbackReason: 'basis_changed',
        })
        expect(marginal).toHaveLength(0)
      } finally {
        await transport.close()
        await host.close()
      }
    },
    20000,
  )
})
