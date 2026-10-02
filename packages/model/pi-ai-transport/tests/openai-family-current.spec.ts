// @module-tag slow
// 归慢层：网络＋重 CPU：经本地 HTTPS 服务（openssl 现生成证书）走真实传输与读取，输入计量用真实分词器。
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { imageSize } from 'image-size'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  readOpaqueJson,
  writeJsonLossless,
  type JsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  invokeModel,
  type ModelInvocationResult,
  type PlanInput,
} from '@omne-harness-lite/model-request-runtime'
import {
  createModelTransportService,
  createOpenAiInputMeter,
  createPiAiTransport,
  openaiConfiguration,
  openaiDefinitions,
  type AdaptationLease,
  type InputMeter,
  type ModelDefinition,
  type RetirementPolicy,
} from '@omne-harness-lite/pi-ai-transport'
import {
  createModelPlugin,
  MODEL_TRANSPORT_SERVICE,
} from '@omne-harness-lite/pi-ai-transport/plugin'
import {
  openAiFamilyRecords,
  OPENAI_FAMILY_ALGORITHM,
  OPENAI_FAMILY_IMPLEMENTATION,
  OPENAI_FAMILY_REPLAY,
} from '../src/input-meters/openai-family-policy.ts'
import { normalizeToolCallId } from '../src/assistant-projection.ts'
import {
  appendOpenAiRound,
  openAiFamilyTool,
  openAiStablePrefix,
  openAiThreeRoundInput,
} from './fixtures/openai/three-round.ts'
import {
  at,
  certificate,
  content,
  finish,
  fixture,
  judgedMessage,
  message,
  policy,
  sse,
} from './support.ts'

// Credential-free current-source closeout for the twelve OpenAI leaves over a
// local TLS fixture, through the standalone public transport and through the
// Cordis-leased transport service. The upstream stream is synthetic: this
// proves the local plan/send/read/replay path on the current definitions and
// pi-ai:openai/mp4-18, not live OpenRouter/OpenAI behavior, cache hits or billing.

const tokenized = vi.hoisted(() => [] as string[])
vi.mock('js-tiktoken', async importOriginal => {
  const actual = await importOriginal<typeof import('js-tiktoken')>()
  return {
    ...actual,
    getEncoding(...args: Parameters<typeof actual.getEncoding>) {
      const encoder = actual.getEncoding(...args),
        encode = encoder.encode.bind(encoder)
      encoder.encode = (...values: Parameters<typeof encode>) => {
        tokenized.push(values[0])
        return encode(...values)
      }
      return encoder
    },
  }
})
const { getEncoding } = await import('js-tiktoken')

// The first test in a worker pays tokenizer load and TLS setup.
vi.setConfig({ testTimeout: 30000 })
let cert: ReturnType<typeof certificate>
let png: string
beforeAll(async () => {
  cert = certificate()
  // Same 64px red square geometry as the R4 image gate fixture (red-64.png).
  png = (
    await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ff0000' } })
      .png()
      .toBuffer()
  ).toString('base64')
})
afterAll(() => cert.dispose())

const format = 'openai-responses-v1'
const provider = { order: ['openai'], allow_fallbacks: false, require_parameters: true }
const retirement: RetirementPolicy = {
  waitMilliseconds: 100,
  force: false,
  schedule(ms, callback) {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}

function definitionFor(modelId: string): ModelDefinition {
  const found = openaiDefinitions.find(item => item.modelId === modelId)
  if (!found) throw new Error(`missing OpenAI definition: ${modelId}`)
  return found
}
const leaves = Object.values(openAiFamilyRecords).map(row => ({
  modelId: row.modelId,
  pro: row.inputScope === 'scope_unknown',
  efforts: row.efforts,
  definition: definitionFor(row.modelId),
}))

const summaryMark = (round: number) => `SUMMARY_MARK_${round}`
const encryptedMark = (round: number) => `gAAAA_ENCRYPTED_MARK_${round}_é_\\n_+/=`
/** The two summary fragments merge under the shared R-F table; the ciphertext stays separate. */
function expectedDetails(round: number, data = encryptedMark(round)): JsonObject[] {
  return [
    {
      type: 'reasoning.summary',
      summary: `${summaryMark(round)} first half second half`,
      id: `rs_${round}`,
      format,
      index: 0,
    },
    { type: 'reasoning.encrypted', data, id: `rs_${round}`, format, index: 0 },
  ]
}
const output = (round: number) => 20 + round
const prompt = (round: number) => 1000 * round
const cached = (round: number) => (round === 1 ? 0 : 256)

function response(
  modelId: string,
  round: number,
  withTools: boolean,
  details?: readonly JsonObject[],
): string {
  const [summary, encrypted] = details ?? expectedDetails(round)
  const halves = details
    ? [summary]
    : [
        { ...summary, summary: `${summaryMark(round)} first half` },
        { ...summary, summary: ' second half' },
      ]
  return (
    sse({
      id: `gen-openai-local-${round}`,
      model: modelId,
      provider: 'OpenAI',
      choices: [
        {
          delta: {
            role: 'assistant',
            content: '',
            reasoning: `${summaryMark(round)} first half`,
            reasoning_details: [halves[0]],
          },
        },
      ],
    }) +
    (halves[1]
      ? sse({
          choices: [{ delta: { reasoning: ' second half', reasoning_details: [halves[1]] } }],
        })
      : '') +
    sse({
      choices: [{ delta: { reasoning_details: [encrypted, ...(details?.slice(2) ?? [])] } }],
    }) +
    content(`Answer ${round}.`) +
    (withTools
      ? sse({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: `call_openai_${round}`,
                    type: 'function',
                    function: { name: openAiFamilyTool.name, arguments: '{"key":"alpha"}' },
                  },
                ],
              },
            },
          ],
        })
      : '') +
    sse({
      choices: [],
      usage: {
        prompt_tokens: prompt(round),
        completion_tokens: output(round),
        completion_tokens_details: { reasoning_tokens: 5 },
        prompt_tokens_details: { cached_tokens: cached(round), cache_write_tokens: 0 },
        cost: 0.0000117,
      },
    }) +
    finish(withTools ? 'tool_calls' : 'stop')
  )
}

function nextRound(request: PlanInput, result: ModelInvocationResult, round: number): PlanInput {
  const callIds = result.blocks.flatMap(block => {
    if (block.kind !== 'tool_call') return []
    if (block.callId === undefined) throw new Error('fixture tool call lacks an id')
    return [block.callId]
  })
  return appendOpenAiRound(request, result, {
    round,
    text: `Round ${round}: what was the code?`,
    ...(callIds.length
      ? { toolResults: callIds.map(callId => ({ callId, text: 'alpha=42' })) }
      : {}),
  })
}

function unitList(serialized: string): JsonObject[] {
  const parsed: unknown = JSON.parse(serialized)
  if (!parsed || typeof parsed !== 'object' || !('messages' in parsed))
    throw new Error('wire lacks messages')
  const { messages } = parsed
  if (!Array.isArray(messages)) throw new Error('wire messages are not an array')
  return messages.map((unit: unknown) => {
    if (!unit || typeof unit !== 'object' || Array.isArray(unit)) throw new Error('bad unit')
    return unit as JsonObject
  })
}

/** Independent image oracle for the small auto-detail images used here: 32px patches × 6/5. */
function imageOracle(serialized: string): { images: number; tokens: number } {
  let images = 0,
    tokens = 0
  for (const unit of unitList(serialized)) {
    if (!Array.isArray(unit.content)) continue
    for (const part of unit.content) {
      if (!part || typeof part !== 'object' || Array.isArray(part) || part.type !== 'image_url')
        continue
      const image = part.image_url
      if (!image || typeof image !== 'object' || Array.isArray(image)) throw new Error('bad image')
      const url = image.url
      if (typeof url !== 'string') throw new Error('bad image url')
      const match = /^data:image\/png;base64,(.+)$/u.exec(url)
      if (!match?.[1]) throw new Error('image is not an inline PNG')
      const { width, height } = imageSize(Buffer.from(match[1], 'base64'))
      images++
      tokens += Math.ceil((Math.ceil(width / 32) * Math.ceil(height / 32) * 6) / 5)
    }
  }
  return { images, tokens }
}

let oracleEncoder: ReturnType<typeof getEncoding> | undefined
/**
 * Independent full-mode oracle: drop every replayed encrypted assistant group,
 * replace inline image URLs by the fixed marker, tokenize the remaining JSON
 * with o200k and add each group's upstream O exactly once plus image tokens.
 */
function fullOracle(serialized: string, groupOutputs: readonly number[]): number {
  oracleEncoder ??= getEncoding('o200k_base')
  const body = JSON.parse(serialized) as JsonObject
  const kept = unitList(serialized)
    .filter(
      unit =>
        !(
          unit.role === 'assistant' &&
          Array.isArray(unit.reasoning_details) &&
          unit.reasoning_details.some(
            detail =>
              !!detail &&
              typeof detail === 'object' &&
              !Array.isArray(detail) &&
              detail.type === 'reasoning.encrypted',
          )
        ),
    )
    .map(unit =>
      Array.isArray(unit.content)
        ? {
            ...unit,
            content: unit.content.map(part =>
              part && typeof part === 'object' && !Array.isArray(part) && part.type === 'image_url'
                ? { ...part, image_url: { ...(part.image_url as JsonObject), url: '[image]' } }
                : part,
            ),
          }
        : unit,
    )
  const text = writeJsonLossless({ ...body, messages: kept as JsonValue[] })
  const before = tokenized.length
  const counted = oracleEncoder.encode(text).length
  tokenized.length = before
  return counted + imageOracle(serialized).tokens + groupOutputs.reduce((a, b) => a + b, 0)
}

const admission = (predicted: number) => Math.ceil((predicted * 11) / 10) + 7
function numeric(value: JsonNumber): number {
  return Number(ExactDecimal.from(value).toString())
}

type Transport = AdaptationLease['transport']
async function invoke(request: PlanInput, transport: Transport, signal?: AbortSignal) {
  return invokeModel({
    ...request,
    transport,
    credential: 'openai-local-credential',
    signal: signal ?? new AbortController().signal,
    policy: policy(),
  }).outcome
}

async function openEntry(
  entry: 'public' | 'cordis',
  options: Awaited<ReturnType<typeof fixture>>['options'],
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
    name: 'openai-family-current-local-https',
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

const cases = (['public', 'cordis'] as const).flatMap(entry =>
  leaves.flatMap(leaf => [false, true].map(withTools => ({ entry, withTools, ...leaf }))),
)

describe.each(cases)(
  'OpenAI current family %#: three local TLS rounds',
  ({ entry, withTools, modelId, pro, definition }) => {
    it(`${entry} ${modelId} tools=${withTools}: ${pro ? 'full×3 source_unavailable' : 'full→marginal→marginal'}, original groups replayed, O once`, async () => {
      let responses = 0
      const host = await fixture(
        cert.tls,
        res => {
          responses++
          res.end(response(modelId, responses, withTools))
        },
        {},
        undefined,
        [definition],
      )
      const meter = createOpenAiInputMeter(definition)
      let request = openAiThreeRoundInput(definition, withTools, png)
      const opened = await openEntry(entry, host.options, definition, meter, request)
      const outputs: number[] = []
      const callIds: string[] = []
      const fullEstimates: number[] = []
      try {
        for (let round = 1; round <= 3; round++) {
          tokenized.length = 0
          const planned = await opened.transport.plan(request, {
            signal: new AbortController().signal,
          })
          if ('rejected' in planned) throw new Error(JSON.stringify(planned))
          const seen = [...tokenized]
          const { measurement, body, serialized, inputLimitEvidence } = planned.planned
          // Encrypted payloads and the whole-group summary never reach the tokenizer.
          for (const prior of outputs.keys()) {
            expect(seen.some(text => text.includes(encryptedMark(prior + 1)))).toBe(false)
            expect(seen.some(text => text.includes(summaryMark(prior + 1)))).toBe(false)
          }
          expect(measurement.basis).toMatchObject({
            model: modelId,
            provider: 'openai',
            meterRevision: OPENAI_FAMILY_ALGORITHM,
            replayRevision: OPENAI_FAMILY_REPLAY,
            binding: {
              implementation: { name: 'pi-ai:openai', revision: OPENAI_FAMILY_IMPLEMENTATION },
              definition: { modelId, revision: definition.revision },
              configuration: openaiConfiguration,
            },
          })
          expect(measurement.precision).toBe('estimated')
          expect(inputLimitEvidence.inputTokens.kind).toBe('estimated')
          const image = imageOracle(serialized)
          expect(image).toEqual({ images: 1, tokens: 5 })
          expect(inputLimitEvidence.images).toBe(1)
          if (round === 1 || pro) {
            expect(measurement).toMatchObject({
              mode: 'full',
              fallbackReason: round === 1 ? 'no_observation' : 'source_unavailable',
              fullContribution: { precision: 'estimated' },
            })
            if (measurement.mode !== 'full') throw new Error('unreachable')
            const full = numeric(measurement.fullContribution.tokens)
            expect(full).toBe(fullOracle(serialized, outputs))
            expect(numeric(measurement.predictedInput)).toBe(full)
            fullEstimates.push(full)
          } else {
            expect(measurement).not.toHaveProperty('fallbackReason')
            if (measurement.mode !== 'marginal') throw new Error(JSON.stringify(measurement))
            // φ is exactly the previous complete group's upstream O; the
            // anchor is the previous observed I; δ covers the new region only.
            expect(measurement.replayContribution).toEqual({
              precision: 'estimated',
              tokens: output(round - 1),
            })
            expect(measurement.newContribution.precision).toBe('estimated')
            const delta = numeric(measurement.newContribution.tokens)
            expect(delta).toBeGreaterThan(0)
            expect(numeric(measurement.predictedInput)).toBe(
              prompt(round - 1) + output(round - 1) + delta,
            )
            expect(seen.some(text => text.includes(openAiStablePrefix))).toBe(false)
          }
          expect(numeric(measurement.admissionTokens)).toBe(
            admission(numeric(measurement.predictedInput)),
          )
          // Exact provider, no fallback, automatic cache: no explicit cache control.
          expect(Object.keys(body).sort()).toEqual(
            [
              'max_tokens',
              'messages',
              'model',
              'provider',
              'reasoning',
              'store',
              'stream',
              ...(withTools ? ['tools'] : []),
            ].sort(),
          )
          expect(body).toMatchObject({
            model: modelId,
            provider,
            stream: true,
            store: false,
            reasoning: { effort: 'high' },
            max_tokens: 1024,
          })
          expect(serialized).not.toContain('cache_control')
          expect(serialized).not.toContain('prompt_cache')
          const result = await opened.invoke(request)
          if (!('outcome' in result) || result.outcome !== 'complete')
            throw new Error(JSON.stringify(result))
          expect(host.requests).toHaveLength(round)
          expect(host.requests[round - 1]?.path).toBe('/api/v1/chat/completions')
          expect(host.requests[round - 1]?.body).toBe(serialized)
          expect(result.servingProvider).toBe('OpenAI')
          expect(result.upstreamModel).toBe(modelId)
          expect(result.parameters).toEqual({ reasoningEffort: 'high', maxOutputTokens: 1024 })
          expect(result.usage).toMatchObject({
            source: 'upstream',
            output_tokens: output(round),
            reasoning_tokens: 5,
            cache_read_tokens: cached(round),
            cache_write_tokens: 0,
          })
          expect(writeJsonLossless(result.usage.input_tokens)).toBe(
            String(prompt(round) - cached(round)),
          )
          expect(writeJsonLossless(result.cost.cost_usd)).toBe('0.0000117')
          if (pro)
            expect(result.inputCalibration.observedInput).toEqual({
              kind: 'unavailable',
              reason: 'scope_unknown',
            })
          else expect(result.inputCalibration.observedInput.kind).toBe('from_usage')
          expect(result.blocks.map(block => block.kind)).toEqual(
            withTools ? ['thinking', 'text', 'tool_call'] : ['thinking', 'text'],
          )
          const thinking = result.blocks[0]
          if (thinking?.kind !== 'thinking' || thinking.opaque === undefined)
            throw new Error('missing original opaque reasoning')
          expect(thinking.text).toBe(`${summaryMark(round)} first half second half`)
          expect(writeJsonLossless(readOpaqueJson(thinking.opaque) as JsonValue)).toBe(
            writeJsonLossless({ routeName: modelId, reasoning_details: expectedDetails(round) }),
          )
          // The upstream call id is replaced by the project-owned call id of this call/dispatch.
          const call = result.blocks[2]
          if (withTools) {
            if (call?.kind !== 'tool_call' || call.callId === undefined)
              throw new Error('missing tool call')
            expect(call.callId).not.toBe(`call_openai_${round}`)
            callIds.push(normalizeToolCallId(call.callId))
          }
          outputs.push(output(round))
          if (round < 3) request = nextRound(request, result, round + 1)
        }
        expect(host.requests).toHaveLength(3)
        const wires = host.requests.map(sent => unitList(sent.body))
        for (const round of [1, 2]) {
          const prior = wires[round - 1] ?? []
          const current = wires[round] ?? []
          // Earlier units are replayed byte-for-byte, then the original reply.
          expect(writeJsonLossless(current.slice(0, prior.length))).toBe(writeJsonLossless(prior))
          expect(writeJsonLossless(current[prior.length] ?? null)).toBe(
            writeJsonLossless({
              role: 'assistant',
              content: `Answer ${round}.`,
              ...(withTools
                ? {
                    tool_calls: [
                      {
                        id: callIds[round - 1],
                        type: 'function',
                        function: { name: openAiFamilyTool.name, arguments: '{"key":"alpha"}' },
                      },
                    ],
                  }
                : {}),
              reasoning_details: expectedDetails(round),
            }),
          )
          expect(current.slice(prior.length + 1).map(unit => unit.role)).toEqual(
            withTools ? ['tool', 'user'] : ['user'],
          )
          if (withTools)
            expect(current[prior.length + 1]).toEqual({
              role: 'tool',
              tool_call_id: callIds[round - 1],
              content: 'alpha=42',
            })
        }
        // Each ciphertext appears exactly once per later wire; nothing is dropped.
        for (const [index, sent] of host.requests.entries())
          for (let round = 1; round <= index; round++)
            expect(sent.body.split(JSON.stringify(encryptedMark(round)).slice(1, -1))).toHaveLength(
              2,
            )
        if (pro) {
          expect(fullEstimates).toHaveLength(3)
          expect(fullEstimates[1]).toBeGreaterThan(fullEstimates[0] ?? Infinity)
          expect(fullEstimates[2]).toBeGreaterThan(fullEstimates[1] ?? Infinity)
        }
      } finally {
        await opened.close()
        await host.close()
      }
    })
  },
)

describe.each(leaves)('OpenAI current family boundaries: $modelId', leaf => {
  const { modelId, definition, efforts } = leaf

  it('parameter differential: only max_tokens and an accepted effort reach the wire', async () => {
    const host = await fixture(
      cert.tls,
      res =>
        res.end(
          content('ok') +
            sse({ choices: [], usage: { prompt_tokens: 50, completion_tokens: 1 } }) +
            finish(),
        ),
      {},
      undefined,
      [definition],
    )
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [createOpenAiInputMeter(definition)],
    })
    try {
      const base = openAiThreeRoundInput(definition, false, png)
      const sampled = {
        temperature: 0.5,
        topP: 0.9,
        seed: 7,
        stopSequences: ['END'],
        frequencyPenalty: 0.1,
        presencePenalty: 0.2,
        maxOutputTokens: 333,
      }
      for (const effort of ['none', 'max'] as const) {
        const accepted = efforts.includes(effort)
        const request = { ...base, parameters: { ...sampled, reasoningEffort: effort } }
        const planned = await transport.plan(request, { signal: new AbortController().signal })
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        expect([...(planned.planned.droppedParameters ?? [])].sort()).toEqual(
          [
            'frequencyPenalty',
            'presencePenalty',
            'seed',
            'stopSequences',
            'temperature',
            'topP',
            ...(accepted ? [] : ['reasoningEffort']),
          ].sort(),
        )
        const body = planned.planned.body
        for (const name of [
          'temperature',
          'top_p',
          'seed',
          'stop',
          'frequency_penalty',
          'presence_penalty',
        ])
          expect(body).not.toHaveProperty(name)
        expect(body.max_tokens).toBe(333)
        if (accepted) expect(body.reasoning).toEqual({ effort })
        else expect(body).not.toHaveProperty('reasoning')
        const result = await invoke(request, transport)
        if (!('outcome' in result) || result.outcome !== 'complete')
          throw new Error(JSON.stringify(result))
        expect(host.requests.at(-1)?.body).toBe(planned.planned.serialized)
        expect(result.parameters).toEqual({
          maxOutputTokens: 333,
          ...(accepted ? { reasoningEffort: effort } : {}),
        })
      }
      expect(host.requests).toHaveLength(2)
    } finally {
      await transport.close()
      await host.close()
    }
  })

  it('opaque from another route or an unknown reasoning format is refused before HTTP, history kept', async () => {
    const foreignFormat = expectedDetails(1).map(detail => ({ ...detail, format: 'unknown' }))
    const host = await fixture(
      cert.tls,
      res => res.end(response(modelId, 1, true, foreignFormat)),
      {},
      undefined,
      [definition],
    )
    const meter = createOpenAiInputMeter(definition)
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [meter],
    })
    const other = leaves.find(candidate => candidate.modelId !== modelId)
    if (!other) throw new Error('missing second OpenAI leaf')
    const otherMeter = createOpenAiInputMeter(other.definition)
    const attempted = vi.fn(otherMeter.measureFull)
    const switched = createPiAiTransport({
      ...host.options,
      definitions: [other.definition],
      inputMeters: [{ ...otherMeter, measureFull: attempted }],
    })
    try {
      const first = openAiThreeRoundInput(definition, true, png)
      const result = await invoke(first, transport)
      if (!('outcome' in result) || result.outcome !== 'complete')
        throw new Error(JSON.stringify(result))
      const second = nextRound(first, result, 2)
      const retained = writeJsonLossless(second.messages)
      // Same route, but the retained group is not openai-responses-v1: no estimate.
      const unknownFormat = {
        rejected: 'invalidInput',
        reason: 'input_size_unavailable',
        metrics: ['maxInputTokens'],
      }
      expect(await transport.plan(second, { signal: new AbortController().signal })).toEqual(
        unknownFormat,
      )
      expect(await invoke(second, transport)).toEqual(unknownFormat)
      // Another route's opaque history has no projector here (S-57): unavailable
      // before metering, nothing stripped and nothing sent.
      const base = openAiThreeRoundInput(other.definition, true, png)
      const foreign: PlanInput = {
        ...second,
        routeName: other.modelId,
        snapshot: base.snapshot,
        calibration: { kind: 'none', reason: 'no_observation' },
        outputHistory: [],
      }
      expect(await switched.plan(foreign, { signal: new AbortController().signal })).toEqual({
        rejected: 'unavailable',
      })
      expect(await invoke(foreign, switched)).toEqual({ rejected: 'unavailable' })
      expect(attempted).not.toHaveBeenCalled()
      expect(host.requests).toHaveLength(1)
      expect(writeJsonLossless(second.messages)).toBe(retained)
    } finally {
      await switched.close()
      await transport.close()
      await host.close()
    }
  })

  it.each([false, true])(
    'a streamed [REDACTED] ciphertext placeholder is not a complete group: second round refused, zero HTTP; tools=%s',
    async withTools => {
      const redacted = expectedDetails(1, '[REDACTED]')
      const host = await fixture(
        cert.tls,
        res => res.end(response(modelId, 1, withTools, redacted)),
        {},
        undefined,
        [definition],
      )
      const meter = createOpenAiInputMeter(definition)
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [definition],
        inputMeters: [meter],
      })
      try {
        const first = openAiThreeRoundInput(definition, withTools, png)
        const result = await invoke(first, transport)
        if (!('outcome' in result) || result.outcome !== 'complete')
          throw new Error(JSON.stringify(result))
        // The placeholder is retained as received; it is neither dropped nor upgraded.
        const thinking = result.blocks[0]
        if (thinking?.kind !== 'thinking' || thinking.opaque === undefined)
          throw new Error('missing original opaque reasoning')
        expect(readOpaqueJson(thinking.opaque)).toEqual({
          routeName: modelId,
          reasoning_details: redacted,
        })
        const second = nextRound(first, result, 2)
        const retained = writeJsonLossless(second.messages)
        const refused = {
          rejected: 'invalidInput',
          reason: 'input_size_unavailable',
          metrics: ['maxInputTokens'],
        }
        expect(await transport.plan(second, { signal: new AbortController().signal })).toEqual(
          refused,
        )
        expect(await invoke(second, transport)).toEqual(refused)
        expect(host.requests).toHaveLength(1)
        expect(writeJsonLossless(second.messages)).toBe(retained)
      } finally {
        await transport.close()
        await host.close()
      }
    },
  )

  it('visible reasoning and tool history supplied as messages plans and sends via the public factory', async () => {
    // Side evidence for the inherited openai-input-meter.spec.ts:597 failure:
    // the same visible reasoning.text/summary + unparseable tool call + tool result
    // shape, sent through createPiAiTransport with the real meter.
    const host = await fixture(
      cert.tls,
      res =>
        res.end(
          content('ready') +
            sse({ choices: [], usage: { prompt_tokens: 48, completion_tokens: 1 } }) +
            finish(),
        ),
      {},
      undefined,
      [definition],
    )
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [createOpenAiInputMeter(definition)],
    })
    try {
      const base = openAiThreeRoundInput(definition, true, png)
      const request: PlanInput = {
        ...base,
        parameters: { reasoningEffort: 'medium', maxOutputTokens: 64 },
        messages: [
          ...base.messages,
          judgedMessage({
            id: 'visible-assistant',
            type: 'assistant',
            response: 'visible-response',
            ending: 'complete',
            createdAt: at,
            blocks: [
              {
                id: 'visible-thinking',
                kind: 'thinking',
                text: '',
                opaque: {
                  routeName: modelId,
                  reasoning_details: [
                    { type: 'reasoning.text', text: 'Need the forecast.', index: 0 },
                    { type: 'reasoning.summary', summary: 'Use the weather tool.', index: 1 },
                  ],
                },
                visibility: { toHuman: false, toModel: true },
              },
              {
                id: 'visible-call',
                kind: 'tool_call',
                callId: 'call with spaces',
                tool: openAiFamilyTool.name,
                complete: true,
                unparseable: true,
                rawArguments: '{"key":"Paris"}',
                visibility: { toHuman: true, toModel: true },
              },
            ],
          }),
          judgedMessage({
            id: 'visible-result',
            type: 'tool',
            callId: 'call with spaces',
            createdAt: at,
            blocks: [
              {
                id: 'visible-result-block',
                kind: 'tool_result',
                callId: 'call with spaces',
                outcome: 'completed',
                visibility: { toHuman: true, toModel: true },
                blocks: [
                  {
                    id: 'visible-result-text',
                    kind: 'text',
                    text: 'Sunny in Paris',
                    visibility: { toHuman: true, toModel: true },
                  },
                ],
              },
            ],
          }),
          message('user', 'And tomorrow?', 'tomorrow'),
        ],
      }
      const planned = await transport.plan(request, { signal: new AbortController().signal })
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      expect(planned.planned.measurement).toMatchObject({ mode: 'full', precision: 'estimated' })
      expect(planned.planned.serialized).toContain('"reasoning_details"')
      expect(planned.planned.serialized).toContain('Need the forecast.')
      expect(planned.planned.serialized).toContain('"tool_call_id"')
      const result = await invoke(request, transport)
      if (!('outcome' in result) || result.outcome !== 'complete')
        throw new Error(JSON.stringify(result))
      expect(host.requests).toHaveLength(1)
      expect(host.requests[0]?.body).toBe(planned.planned.serialized)
    } finally {
      await transport.close()
      await host.close()
    }
  })
})
