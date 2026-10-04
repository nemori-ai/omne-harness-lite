import { imagePreparation } from './image-transport-support.ts'
import { directFull } from './direct-full-input.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { Context } from '@deepseek-ai/cordis'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { Message } from '@omne-harness-lite/messages'
import {
  invokeModel,
  type InputMeasurement,
  type PlanInput,
  type TransportAdapter,
} from '@omne-harness-lite/model-request-runtime'
import {
  createModelTransportService,
  createPiAiTransport,
  type ModelTransportService,
  type PlannedRequest,
  type RawResponse,
  type RetirementPolicy,
} from '@omne-harness-lite/pi-ai-transport'
import {
  createModelPlugin,
  MODEL_TRANSPORT_SERVICE,
} from '@omne-harness-lite/pi-ai-transport/plugin'
import { normalizeToolCallId } from '../src/assistant-projection.ts'
import { createMoonshotInputMeter } from '../src/input-meters/moonshot.ts'
import { at, certificate, fixture, judgedMessage, policy, type CapturedRequest } from './support.ts'
import {
  lookupTool,
  MOONSHOT_SERVING_PROVIDER,
  moonshotDefinition,
  moonshotModels,
  moonshotReply,
  moonshotRequest,
  toolResult,
  trackedMeter,
  userTurn,
  wireOf,
  type MoonshotModel,
} from './moonshot-support.ts'

// Current official Moonshot bindings: definition revision 3, implementation mp4-19.
// Every upstream response is a controlled local TLS stand-in with plain `reasoning`
// only; nothing here observes OpenRouter conversion, billing or cache retention.
// The archived real-route shape (reasoning + reasoning_details) is covered separately
// in moonshot-visible-reasoning-rounds.spec.ts, where it is estimated from the details.

let cert: ReturnType<typeof certificate>
let images: { png: Buffer; jpeg: Buffer; webp: Buffer }
beforeAll(async () => {
  cert = certificate()
  const pixels = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } } })
  images = {
    png: await pixels(64, 48).png().toBuffer(),
    jpeg: await pixels(96, 64).jpeg({ quality: 90 }).toBuffer(),
    webp: await pixels(80, 80).webp({ quality: 90 }).toBuffer(),
  }
})
afterAll(() => cert.dispose())

interface Scenario {
  readonly model: MoonshotModel
  readonly withTools: boolean
  readonly servingProvider: string | undefined
  readonly transport: TransportAdapter<PlannedRequest, RawResponse>
  readonly requests: readonly CapturedRequest[]
  readonly calls: ReturnType<typeof trackedMeter>['calls']
  readonly track?: <T>(completion: Promise<T>) => Promise<T>
  readonly signal?: AbortSignal
}

function respond(model: MoonshotModel, withTools: boolean, servingProvider: string | undefined) {
  return (
    res: Parameters<Parameters<typeof fixture>[1]>[0],
    captured: CapturedRequest,
    requests: readonly CapturedRequest[],
  ) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const round = requests.indexOf(captured) + 1
    res.end(moonshotReply(model, round, { servingProvider, toolCall: withTools && round === 1 }))
  }
}

/**
 * Three rounds of the unchanged public invokeModel contract. Rounds 2 and 3 carry the
 * previous response as an observation, so the calibrated path actually runs; Moonshot is
 * full-only (R-A), so φ/δ never contribute and the full reference estimate is used.
 */
async function threeRounds(scenario: Scenario) {
  const { model, withTools, transport, requests, calls } = scenario
  const oracle = createMoonshotInputMeter(moonshotDefinition(model))
  const initial = moonshotRequest(model, { tools: withTools })
  let request: PlanInput = {
    ...initial,
    messages: [
      ...initial.messages,
      userTurn(1, withTools ? undefined : { bytes: images.png, mediaType: 'image/png' }),
    ],
  }
  const measurements: InputMeasurement[] = []
  let firstCallId: string | undefined
  for (let round = 1; round <= 3; round++) {
    // Each round is a distinct model call; tool call IDs are generated from it.
    request = {
      ...request,
      target: {
        kind: 'model_call',
        callId: unwrap(parseOpaqueIdentifier(`moonshot-round-${round}`, 'ModelCallId')),
        dispatch: 1,
      },
    }
    const before = {
      full: calls.full.length,
      replay: calls.replay.length,
      fresh: calls.fresh.length,
    }
    const planned = await transport.plan(request, { signal: new AbortController().signal })
    if ('rejected' in planned) throw new Error(`round ${round}: ${JSON.stringify(planned)}`)
    const measurement = planned.planned.measurement
    measurements.push(measurement)
    const sourceMessages = JSON.stringify(request.messages)
    const invoked = invokeModel({
      ...request,
      transport,
      // Must not share a substring with response identities: redaction would rewrite them.
      credential: 'controlled-test-only',
      signal: scenario.signal ?? new AbortController().signal,
      policy: policy(),
    }).outcome
    const result = await (scenario.track ? scenario.track(invoked) : invoked)
    if (!('outcome' in result) || result.outcome !== 'complete')
      throw new Error(`round ${round}: ${JSON.stringify(result)}`)
    // Exactly one HTTP request per round, byte-identical to the fixed plan.
    expect(requests).toHaveLength(round)
    expect(requests[round - 1]?.body).toBe(planned.planned.serialized)
    expect(JSON.stringify(request.messages)).toBe(sourceMessages)
    const sent = wireOf(requests[round - 1])

    // Full estimated input on the actual final body; an independent meter instance
    // re-measuring the captured bytes gives the same reference estimate.
    expect(measurement.mode).toBe('full')
    expect(measurement.precision).toBe('estimated')
    expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
    const independent = directFull(oracle, {
      body: sent.body,
      serialized: requests[round - 1]?.body ?? '',
    })
    if (independent.kind !== 'estimated' || measurement.mode !== 'full')
      throw new Error('estimate missing')
    expect(writeJsonLossless(measurement.predictedInput)).toBe(
      writeJsonLossless(independent.tokens),
    )
    expect(measurement.fullContribution.precision).toBe('estimated')
    // Two plans per round (explicit plan + invokeModel), each one full measurement.
    expect(calls.full.length - before.full).toBe(2)
    expect(calls.full.slice(before.full).every(value => value.kind === 'estimated')).toBe(true)
    const replay = calls.replay.slice(before.replay)
    const fresh = calls.fresh.slice(before.fresh)
    if (round === 1) {
      expect(measurement.fallbackReason).toBe('no_observation')
      expect(replay).toEqual([])
      expect(fresh).toEqual([])
    } else if (scenario.servingProvider === MOONSHOT_SERVING_PROVIDER) {
      // The reported display name differs from the fixed endpoint tag, so the
      // calibrated source is already rejected as a basis change before φ/δ.
      expect(measurement.fallbackReason).toBe('basis_changed')
      expect(replay).toEqual([])
      expect(fresh).toEqual([])
    } else {
      // φ/δ are actually consulted and honestly unavailable (unsupported-marginal/1).
      expect(measurement.fallbackReason).toBeUndefined()
      expect(replay).toEqual([{ kind: 'unavailable' }, { kind: 'unavailable' }])
      expect(fresh).toEqual([{ kind: 'unavailable' }, { kind: 'unavailable' }])
    }
    expect(oracle.replayRevision).toBe('unsupported-marginal/1')

    // Effort: K3 passes the accepted value; K2.7 Code drops it and sends no reasoning member.
    if (model.k3) {
      expect(sent.body.reasoning).toEqual({ effort: 'high' })
      expect(planned.planned.droppedParameters ?? []).not.toContain('reasoningEffort')
    } else {
      expect(sent.body).not.toHaveProperty('reasoning')
      expect(planned.planned.droppedParameters).toContain('reasoningEffort')
    }
    expect(sent.body.tools === undefined).toBe(!withTools)
    expect(requests[round - 1]?.body).not.toContain('cache_control')

    // The previous request's complete history is replayed unchanged as the prefix.
    if (round > 1) {
      const previous = wireOf(requests[round - 2]).messages
      expect(sent.messages.slice(0, previous.length).map(item => writeJsonLossless(item))).toEqual(
        previous.map(item => writeJsonLossless(item)),
      )
    }
    const thinking = result.blocks.find(block => block.kind === 'thinking')
    if (!thinking || thinking.kind !== 'thinking') throw new Error('plain reasoning missing')
    expect(thinking.text).toBe(`Think ${round}.`)
    expect(thinking.opaque).toBeUndefined()
    expect(writeJsonLossless(result.usage.input_tokens)).toBe(
      String(300 + round - (round === 1 ? 0 : 256)),
    )
    expect(writeJsonLossless(result.usage.cache_read_tokens)).toBe(round === 1 ? '0' : '256')

    const assistant = judgedMessage({
      type: 'assistant',
      id: `moonshot-assistant-${round}`,
      response: `moonshot-response-${round}`,
      ending: 'complete',
      createdAt: at,
      blocks: result.blocks,
    })
    const call = result.blocks.find(block => block.kind === 'tool_call')
    expect(call !== undefined).toBe(withTools && round === 1)
    let followUp: Message
    if (call?.kind === 'tool_call') {
      const callId = call.callId
      if (callId === undefined) throw new Error('tool call identity missing')
      firstCallId = callId
      followUp = toolResult(callId)
    } else
      followUp = userTurn(
        round + 1,
        withTools
          ? undefined
          : round === 1
            ? { bytes: images.jpeg, mediaType: 'image/jpeg' }
            : { bytes: images.webp, mediaType: 'image/webp' },
      )
    request = {
      ...request,
      calibration: {
        kind: 'observation',
        inputCalibration: result.inputCalibration,
        usage: result.usage,
        outputBlocks: result.blocks,
        replaySelection: result.blocks.map((_block, sourceBlockIndex) => ({
          sourceBlockIndex,
          messageIndex: request.messages.length,
          blockIndex: sourceBlockIndex,
        })),
      },
      messages: [...request.messages, assistant, followUp],
    }
  }
  const last = wireOf(requests[2]).messages
  if (withTools) {
    // The reader owns call identity (generated from the model call), not the upstream ID.
    if (firstCallId === undefined) throw new Error('tool call missing')
    const wireCallId = normalizeToolCallId(firstCallId)
    expect(last.slice(2)).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Turn 1.' }] },
      {
        role: 'assistant',
        content: '',
        reasoning: 'Think 1.',
        tool_calls: [
          {
            id: wireCallId,
            type: 'function',
            function: { name: lookupTool.name, arguments: '{"query":"value"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: wireCallId, content: 'value=42' },
      { role: 'assistant', content: 'Answer 2.', reasoning: 'Think 2.' },
      { role: 'user', content: [{ type: 'text', text: 'Turn 3.' }] },
    ])
  } else {
    const dataUrl = (bytes: Buffer, type: string) =>
      `data:${type};base64,${bytes.toString('base64')}`
    expect(last.slice(2)).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Turn 1.' },
          { type: 'image_url', image_url: { url: dataUrl(images.png, 'image/png') } },
        ],
      },
      { role: 'assistant', content: 'Answer 1.', reasoning: 'Think 1.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Turn 2.' },
          { type: 'image_url', image_url: { url: dataUrl(images.jpeg, 'image/jpeg') } },
        ],
      },
      { role: 'assistant', content: 'Answer 2.', reasoning: 'Think 2.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Turn 3.' },
          { type: 'image_url', image_url: { url: dataUrl(images.webp, 'image/webp') } },
        ],
      },
    ])
  }
  return measurements
}

const scenarios = moonshotModels.flatMap(model =>
  [false, true].flatMap(withTools =>
    [MOONSHOT_SERVING_PROVIDER, undefined].map(servingProvider => ({
      model,
      withTools,
      servingProvider,
    })),
  ),
)

describe('Moonshot three-round public invokeModel over local TLS (definition 3 / mp4-19)', () => {
  it.each(scenarios)(
    '$model.modelId tools=$withTools serving=$servingProvider',
    async ({ model, withTools, servingProvider }) => {
      const definition = moonshotDefinition(model)
      const { meter, calls } = trackedMeter(createMoonshotInputMeter(definition))
      const handle = respond(model, withTools, servingProvider)
      const host = await fixture(
        cert.tls,
        (res, captured) => handle(res, captured, host.requests),
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
        const measurements = await threeRounds({
          model,
          withTools,
          servingProvider,
          transport,
          requests: host.requests,
          calls,
        })
        // Growing history strictly increases the full estimate every round.
        const predicted = measurements.map(value => Number(String(value.predictedInput)))
        expect(predicted[1]).toBeGreaterThan(predicted[0] ?? 0)
        expect(predicted[2]).toBeGreaterThan(predicted[1] ?? 0)
      } finally {
        await transport.close()
        await host.close()
      }
    },
  )
})

const retirement: RetirementPolicy = {
  waitMilliseconds: 50,
  force: false,
  schedule: (milliseconds, callback) => {
    const timer = setTimeout(callback, milliseconds)
    return () => clearTimeout(timer)
  },
}

function transportService(value: unknown): value is ModelTransportService {
  return (
    typeof value === 'object' &&
    value !== null &&
    'acquire' in value &&
    typeof value.acquire === 'function' &&
    'inspect' in value &&
    typeof value.inspect === 'function' &&
    'closed' in value &&
    value.closed instanceof Promise
  )
}

describe('Moonshot three rounds through the Cordis transport service and official model plugin', () => {
  it.each(moonshotModels.flatMap(model => [false, true].map(withTools => ({ model, withTools }))))(
    '$model.modelId tools=$withTools',
    async ({ model, withTools }) => {
      const definition = moonshotDefinition(model)
      const { meter, calls } = trackedMeter(createMoonshotInputMeter(definition))
      const handle = respond(model, withTools, MOONSHOT_SERVING_PROVIDER)
      const host = await fixture(
        cert.tls,
        (res, captured) => handle(res, captured, host.requests),
        {},
        undefined,
        [definition],
      )
      const ctx = new Context()
      let service: ModelTransportService | undefined
      try {
        // Same controlled-HTTPS service shape the acceptance assembly provides; the model
        // contribution is the official createModelPlugin with the real Moonshot meter.
        await ctx.plugin({
          name: 'moonshot-controlled-model-transport',
          apply(inner: Context) {
            const provided = createModelTransportService({
              imagePreparation,
              baseUrl: host.options.baseUrl,
              tls: host.options.tls,
              policy: host.options.policy,
            })
            inner.effect(() => async () => {
              await provided.close(retirement)
              await provided.closed
            })
            inner.provide(MODEL_TRANSPORT_SERVICE, provided)
          },
        })
        const provided: unknown = ctx.get(MODEL_TRANSPORT_SERVICE)
        if (!transportService(provided)) throw new Error('model transport service unavailable')
        service = provided
        const contribution = ctx.plugin(createModelPlugin(definition, meter, retirement), {})
        await contribution
        expect(service.inspect()).toMatchObject({ registrations: 1, references: 0 })
        const request = moonshotRequest(model, { tools: withTools })
        const acquired = service.acquire(request.snapshot.adaptation, request.routeName)
        if ('rejected' in acquired) throw new Error(acquired.rejected)
        const lease = acquired.lease
        try {
          await threeRounds({
            model,
            withTools,
            servingProvider: MOONSHOT_SERVING_PROVIDER,
            transport: lease.transport,
            requests: host.requests,
            calls,
            track: lease.track,
            signal: lease.signal,
          })
          expect(service.inspect()).toMatchObject({ references: 1, executions: 0 })
        } finally {
          lease.release()
        }
        expect(service.inspect()).toMatchObject({ references: 0, executions: 0 })
        await contribution.dispose()
        expect(service.inspect()).toMatchObject({ registrations: 0 })
        expect(service.acquire(request.snapshot.adaptation, request.routeName)).toEqual({
          rejected: 'unavailable',
        })
      } finally {
        await ctx.fiber.dispose()
        await host.close()
      }
      // Disposing the owning fiber closes the service; closed resolves only after the
      // contributions, executions and owned connection pool have actually stopped.
      await service.closed
      expect(service.inspect()).toMatchObject({
        accepting: false,
        registrations: 0,
        references: 0,
      })
      expect(host.requests).toHaveLength(3)
    },
  )
})
