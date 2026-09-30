import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import { readOpaqueJson, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  invokeModel,
  type ModelInvocationResult,
  type PlanInput,
} from '@omne-harness-lite/model-request-runtime'
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
import { createGoogleInputMeter } from '../src/input-meters/google.ts'
import { googleDefinitions } from '../src/official-models/google.ts'
import { googleCertificationRequest, googleCertificationTool } from './fixtures/google/cases.ts'
import { appendGoogleRound, googleThreeRoundInput } from './fixtures/google/three-round.ts'
import { certificate, content, finish, fixture, judgedMessage, policy, sse } from './support.ts'

// Credential-free invokeModel scenarios over a local TLS fixture, through the
// standalone transport and the Cordis-leased transport service. The
// upstream stream is synthetic: this proves the local plan/send/read/replay
// path on definition 3 / mp4-17, not live Gemini behavior or billing.

// The first test in a worker pays the verified tokenizer load and TLS setup.
vi.setConfig({ testTimeout: 30000 })
let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

const provider = { order: ['google-ai-studio'], allow_fallbacks: false, require_parameters: true }
const at = '2026-09-30T00:00:00Z'
const visible = { toHuman: true, toModel: true }

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

function toolCall(round: number): string {
  return sse({
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: `call_google_${round}`,
              type: 'function',
              function: { name: googleCertificationTool.name, arguments: '{"key":"alpha"}' },
            },
          ],
        },
      },
    ],
  })
}

function usage(round: number): string {
  return sse({
    choices: [],
    usage: {
      prompt_tokens: 120 * round,
      completion_tokens: 9,
      completion_tokens_details: { reasoning_tokens: 4 },
      prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      cost: 0.0000117,
    },
  })
}

function nextRound(request: PlanInput, result: ModelInvocationResult, round: number) {
  const callIds = result.blocks.flatMap(block => {
    if (block.kind !== 'tool_call') return []
    if (block.callId === undefined) throw new Error('fixture tool call lacks an id')
    return [block.callId]
  })
  return appendGoogleRound(request, result, {
    round,
    text: `Round ${round}: what was the code?`,
    ...(callIds.length
      ? { toolResults: callIds.map(callId => ({ callId, text: 'alpha=42' })) }
      : {}),
  })
}

type Transport = AdaptationLease['transport']
async function invoke(request: PlanInput, transport: Transport, signal?: AbortSignal) {
  return invokeModel({
    ...request,
    transport,
    credential: 'google-local-credential',
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

/**
 * The public entry is the standalone transport; the Cordis entry is the leased
 * transport of the official model plugin on a provided transport service.
 */
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
    name: 'google-local-https',
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
  googleDefinitions.flatMap(definition =>
    (['low', 'medium', 'high'] as const).flatMap(effort =>
      [false, true].map(withTools => ({ entry, definition, effort, withTools })),
    ),
  ),
)

describe.each(cases)(
  'Google transport invoke %#: three local TLS rounds',
  ({ entry, definition, effort, withTools }) => {
    it(`${entry} ${definition.modelId} ${effort} tools=${withTools}: full estimated, φ/δ unavailable, original history replayed`, async () => {
      let responses = 0
      const host = await fixture(
        cert.tls,
        res => {
          responses++
          res.end(
            sse({
              id: `gen-google-local-${responses}`,
              model: definition.modelId,
              // The display name OpenRouter actually reported on the 2026-09-28 public probe.
              provider: 'Google AI Studio',
              choices: [{ delta: { reasoning: `plan ${responses}` } }],
            }) +
              content(`reply ${responses}`) +
              (withTools ? toolCall(responses) : '') +
              usage(responses) +
              finish(withTools ? 'tool_calls' : 'stop'),
          )
        },
        {},
        undefined,
        [definition],
      )
      const official = createGoogleInputMeter(definition)
      if (!official) throw new Error('Google meter unavailable')
      expect(official.replayRevision).toBe('unsupported-marginal/1')
      const { meter, marginal } = countedMeter(official)
      let request = googleThreeRoundInput(definition.modelId, effort, withTools)
      const opened = await openEntry(entry, host.options, definition, meter, request)
      const estimates: number[] = []
      try {
        for (let round = 1; round <= 3; round++) {
          const planned = await opened.transport.plan(request, {
            signal: new AbortController().signal,
          })
          if ('rejected' in planned) throw new Error(JSON.stringify(planned))
          const { measurement, body, inputLimitEvidence } = planned.planned
          expect(measurement).toMatchObject({
            mode: 'full',
            precision: 'estimated',
            // First round has no observation. Later rounds: provenance says
            // "Google AI Studio" while the basis says google-ai-studio, so the
            // shared calibration falls back before φ/δ is ever consulted.
            fallbackReason: round === 1 ? 'no_observation' : 'basis_changed',
            fullContribution: { precision: 'estimated' },
            basis: { provider: 'google-ai-studio', replayRevision: 'unsupported-marginal/1' },
          })
          expect(inputLimitEvidence.inputTokens.kind).toBe('estimated')
          if (inputLimitEvidence.inputTokens.kind !== 'estimated') throw new Error('unreachable')
          estimates.push(Number(inputLimitEvidence.inputTokens.tokens))
          expect(body).toMatchObject({ model: definition.modelId, reasoning: { effort }, provider })
          expect(body.tools === undefined).toBe(!withTools)
          const result = await opened.invoke(request)
          if (!('outcome' in result) || result.outcome !== 'complete')
            throw new Error(JSON.stringify(result))
          expect(host.requests).toHaveLength(round)
          expect(host.requests[round - 1]?.path).toBe('/api/v1/chat/completions')
          expect(host.requests[round - 1]?.body).toBe(planned.planned.serialized)
          expect(result.servingProvider).toBe('Google AI Studio')
          expect(result.inputCalibration.observedInput.kind).toBe('from_usage')
          expect(writeJsonLossless(result.usage.input_tokens)).toBe(String(120 * round))
          expect(writeJsonLossless(result.cost.cost_usd)).toBe('0.0000117')
          expect(result.parameters).toMatchObject({ reasoningEffort: effort })
          expect(result.blocks.map(block => block.kind)).toEqual(
            withTools ? ['thinking', 'text', 'tool_call'] : ['thinking', 'text'],
          )
          if (round < 3) request = nextRound(request, result, round + 1)
        }
        // Full-only: no φ/δ contribution was ever requested or reported.
        expect(marginal).toEqual([])
        expect(estimates[1]).toBeGreaterThan(estimates[0] ?? Infinity)
        expect(estimates[2]).toBeGreaterThan(estimates[1] ?? Infinity)
        expect(host.requests).toHaveLength(3)
        const wires = host.requests.map(
          sent => JSON.parse(sent.body).messages as Record<string, unknown>[],
        )
        for (const round of [1, 2]) {
          const prior = wires[round - 1] ?? []
          const current = wires[round] ?? []
          // Earlier wire units are replayed byte-for-byte; the new reply follows them.
          expect(writeJsonLossless(current.slice(0, prior.length))).toBe(writeJsonLossless(prior))
          const callId = request.outputHistory[round - 1]?.outputBlocks.find(
            block => block.kind === 'tool_call',
          )
          expect(current[prior.length]).toEqual({
            role: 'assistant',
            content: `reply ${round}`,
            ...(withTools && callId?.kind === 'tool_call'
              ? {
                  tool_calls: [
                    {
                      id: callId.callId,
                      type: 'function',
                      function: {
                        name: googleCertificationTool.name,
                        arguments: '{"key":"alpha"}',
                      },
                    },
                  ],
                }
              : {}),
            reasoning: `plan ${round}`,
          })
          expect(current.slice(prior.length + 1).map(unit => unit.role)).toEqual(
            withTools ? ['tool', 'user'] : ['user'],
          )
        }
        expect(host.requests.every(sent => !sent.body.includes('reasoning_details'))).toBe(true)
      } finally {
        await opened.close()
        await host.close()
      }
    })
  },
)

describe.each(googleDefinitions)('Google public invoke boundary: $modelId', definition => {
  it('asks φ/δ when provenance matches the basis and both stay unavailable', async () => {
    let responses = 0
    const host = await fixture(
      cert.tls,
      res => {
        responses++
        res.end(
          sse({
            id: `gen-google-slug-${responses}`,
            model: definition.modelId,
            provider: 'google-ai-studio',
            choices: [{ delta: { reasoning: `plan ${responses}` } }],
          }) +
            content(`reply ${responses}`) +
            usage(responses) +
            finish(),
        )
      },
      {},
      undefined,
      [definition],
    )
    const official = createGoogleInputMeter(definition)
    if (!official) throw new Error('Google meter unavailable')
    const { meter, marginal } = countedMeter(official)
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [meter],
    })
    let request = googleThreeRoundInput(definition.modelId, 'medium', false)
    try {
      for (let round = 1; round <= 3; round++) {
        const before = marginal.length
        const planned = await transport.plan(request, { signal: new AbortController().signal })
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        expect(planned.planned.measurement.mode).toBe('full')
        expect(planned.planned.measurement.precision).toBe('estimated')
        if (round === 1) expect(marginal.slice(before)).toEqual([])
        else {
          // The planner reached the marginal branch; both components are unavailable,
          // so it fell back to the full estimate without any marginal claim.
          expect(marginal.slice(before)).toEqual(['replay:unavailable', 'new:unavailable'])
          expect(planned.planned.measurement).not.toHaveProperty('fallbackReason')
          expect(planned.planned.measurement).not.toHaveProperty('replayContribution')
        }
        marginal.length = before
        const result = await invoke(request, transport)
        if (!('outcome' in result) || result.outcome !== 'complete')
          throw new Error(JSON.stringify(result))
        expect(host.requests.at(-1)?.body).toBe(planned.planned.serialized)
        if (round < 3) request = nextRound(request, result, round + 1)
      }
      expect(host.requests).toHaveLength(3)
    } finally {
      await transport.close()
      await host.close()
    }
  })

  it.each([false, true])(
    'Gemini-shaped signed reasoning history is carried but not metered; tools=%s',
    async withTools => {
      const details = [
        {
          type: 'reasoning.text',
          text: 'Considering the code.',
          format: 'google-gemini-v1',
          index: 0,
        },
        {
          type: 'reasoning.text',
          signature: 'EvcBCvQBAWkUfROq',
          format: 'google-gemini-v1',
          index: 0,
        },
      ]
      const host = await fixture(
        cert.tls,
        res =>
          res.end(
            sse({
              id: 'gen-google-signed-1',
              model: definition.modelId,
              provider: 'Google AI Studio',
              choices: [
                {
                  delta: {
                    role: 'assistant',
                    content: '',
                    reasoning: 'Considering the code.',
                    reasoning_details: [details[0]],
                  },
                },
              ],
            }) +
              sse({ choices: [{ delta: { content: '', reasoning_details: [details[1]] } }] }) +
              content('ALPHA-42') +
              (withTools ? toolCall(1) : '') +
              usage(1) +
              finish(withTools ? 'tool_calls' : 'stop'),
          ),
        {},
        undefined,
        [definition],
      )
      const official = createGoogleInputMeter(definition)
      if (!official) throw new Error('Google meter unavailable')
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [definition],
        inputMeters: [official],
      })
      try {
        const first = googleThreeRoundInput(definition.modelId, 'high', withTools)
        const result = await invoke(first, transport)
        if (!('outcome' in result) || result.outcome !== 'complete')
          throw new Error(JSON.stringify(result))
        // R-L: id-less, same-index text then signature-only fragments are one content block,
        // rebuilt as a single signed reasoning.text detail (format-independent).
        const merged = [{ ...details[0], signature: details[1]?.signature }]
        const thinking = result.blocks.filter(block => block.kind === 'thinking')
        expect(thinking).toHaveLength(1)
        const opaque = thinking[0]?.opaque
        if (opaque === undefined) throw new Error('signed reasoning lost its original details')
        expect(readOpaqueJson(opaque)).toEqual({
          routeName: definition.modelId,
          reasoning_details: merged,
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
        // The synthetic fixture meter proves the projection itself would carry the
        // original signed details unchanged; only the official meter refuses them.
        const carried = await host.transport.plan(second, { signal: new AbortController().signal })
        if ('rejected' in carried) throw new Error(JSON.stringify(carried))
        const assistant = (
          carried.planned.body.messages as { role: string; reasoning_details?: unknown }[]
        ).find(unit => unit.role === 'assistant')
        expect(assistant?.reasoning_details).toEqual(merged)
        expect(assistant).not.toHaveProperty('reasoning')
        expect(host.requests).toHaveLength(1)
      } finally {
        await transport.close()
        await host.close()
      }
    },
  )

  it('inline image plans with the synthetic meter but the official meter refuses before HTTP', async () => {
    const host = await fixture(cert.tls, res => res.end(), {}, undefined, [definition])
    const official = createGoogleInputMeter(definition)
    if (!official) throw new Error('Google meter unavailable')
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [official],
    })
    try {
      const input = googleCertificationRequest(definition.modelId)
      const carried = await host.transport.plan(input, { signal: new AbortController().signal })
      if ('rejected' in carried) throw new Error(JSON.stringify(carried))
      expect(carried.planned.serialized).toContain('"type":"image_url"')
      expect(carried.planned.serialized).toContain('data:image/png;base64,')
      expect(carried.planned.inputLimitEvidence).toMatchObject({ images: 1, imageBytes: [70] })
      const refused = {
        rejected: 'invalidInput',
        reason: 'input_size_unavailable',
        metrics: ['maxInputTokens'],
      }
      expect(await transport.plan(input, { signal: new AbortController().signal })).toEqual(refused)
      expect(await invoke(input, transport)).toEqual(refused)
      expect(host.requests).toHaveLength(0)
    } finally {
      await transport.close()
      await host.close()
    }
  })

  it.each([
    {
      name: 'audio',
      block: {
        id: 'google-voice',
        kind: 'voice',
        mediaType: 'audio/pcm',
        data: { inline: 'eA==' },
        visibility: visible,
      },
    },
    {
      name: 'video',
      block: {
        id: 'google-video-file',
        kind: 'file',
        attachment: {
          storage: 'attachments',
          key: 'obj_google_video',
          mediaType: 'video/mp4',
          name: 'clip.mp4',
        },
        visibility: visible,
      },
    },
  ])('declared $name input stays modality_not_carried through public invoke', async ({ block }) => {
    const host = await fixture(cert.tls, res => res.end(), {}, undefined, [definition])
    const official = createGoogleInputMeter(definition)
    if (!official) throw new Error('Google meter unavailable')
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [official],
    })
    try {
      // Out of scope for this delivery (text and image only): the declaration is
      // kept, the modality is not carried.
      expect(definition.capabilities.inputModalities).toContain(
        block.kind === 'voice' ? 'audio' : 'video',
      )
      const base = googleThreeRoundInput(definition.modelId, 'low', false)
      const input = {
        ...base,
        messages: [
          ...base.messages,
          judgedMessage({ id: 'google-media', type: 'user', createdAt: at, blocks: [block] }),
        ],
      }
      expect(await invoke(input, transport)).toEqual({ rejected: 'modality_not_carried' })
      // The synthetic meter does not change that: no wire projection exists.
      expect(await host.transport.plan(input, { signal: new AbortController().signal })).toEqual({
        rejected: 'modality_not_carried',
      })
      expect(host.requests).toHaveLength(0)
    } finally {
      await transport.close()
      await host.close()
    }
  })

  it('binds only google-ai-studio without provider fallback and applies the effort rule', async () => {
    for (const providers of [['google-vertex'], ['google-ai-studio', 'google-vertex']])
      expect(
        createOfficialProfileContent(definition, {
          providers,
          allowFallback: false,
          configuration: { revision: '1', values: { cache: { mode: 'automatic' } } },
        }),
      ).toHaveProperty('rejected')
    const fallbackProfile = createOfficialProfileContent(definition, {
      providers: ['google-ai-studio'],
      allowFallback: true,
      configuration: { revision: '1', values: { cache: { mode: 'automatic' } } },
    })
    if ('rejected' in fallbackProfile) throw new Error(fallbackProfile.rejected)
    const host = await fixture(
      cert.tls,
      res => res.end(content('ok') + usage(1) + finish()),
      {},
      undefined,
      [definition],
    )
    const official = createGoogleInputMeter(definition)
    if (!official) throw new Error('Google meter unavailable')
    const transport = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [official],
    })
    try {
      const base = googleThreeRoundInput(definition.modelId, 'low', false)
      expect(await invoke({ ...base, provider: 'google-vertex' }, transport)).toEqual({
        rejected: 'unavailable',
      })
      expect(host.requests).toHaveLength(0)
      // A caller profile may record allowFallback:true, but the shared planner
      // still pins the one provider with allow_fallbacks:false on the wire.
      const pinned = await invoke(
        {
          ...base,
          snapshot: { ...base.snapshot, allowFallback: fallbackProfile.ok.allowFallback },
        },
        transport,
      )
      if (!('outcome' in pinned) || pinned.outcome !== 'complete')
        throw new Error(JSON.stringify(pinned))
      const outside = await invoke(
        { ...base, parameters: { reasoningEffort: 'max', maxOutputTokens: 1024 } },
        transport,
      )
      if (!('outcome' in outside) || outside.outcome !== 'complete')
        throw new Error(JSON.stringify(outside))
      expect(host.requests).toHaveLength(2)
      const [first, second] = host.requests.map(sent => JSON.parse(sent.body))
      expect(first.provider).toEqual(provider)
      expect(first.reasoning).toEqual({ effort: 'low' })
      // Effort outside the declared low/medium/high set is dropped, not forwarded.
      expect(second.provider).toEqual(provider)
      expect(second.reasoning).toBeUndefined()
      expect(outside.parameters).not.toHaveProperty('reasoningEffort')
    } finally {
      await transport.close()
      await host.close()
    }
  })
})
