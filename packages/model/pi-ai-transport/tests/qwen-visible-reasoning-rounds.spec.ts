// @module-tag slow
// 归慢层：网络＋重 CPU：经本地 HTTPS 服务（openssl 现生成证书）走真实传输与读取，输入计量用真实分词器。
// QV1 of the adopted Qwen open-leaf visible reasoning estimate (revision 2): both open
// leaves, with and without tools, default/high/max effort, through the public transport and
// the Cordis transport service, three rounds of archived-shape SSE (every frame `reasoning`
// + one identical `reasoning.text` detail) merged by the real reader. Rounds 2 and 3 replay
// the merged details and are full estimated. No request leaves 127.0.0.1; this is not route
// certification or accuracy evidence (QV4 is the real-route gate).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import { readOpaqueJson, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { Message } from '@omne-harness-lite/messages'
import {
  invokeModel,
  type PlanInput,
  type TransportAdapter,
} from '@omne-harness-lite/model-request-runtime-local'
import type { RawResponse } from '../src/http.ts'
import { admissionTokens } from '../src/input-meter.ts'
import { object } from '../src/json.ts'
import type { PlannedRequest } from '../src/plan.ts'
import { createModelPlugin, MODEL_TRANSPORT_SERVICE } from '../src/plugin.ts'
import { createModelTransportService } from '../src/registry.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { directFull } from './direct-full-input.ts'
import { trackedMeter, wireOf } from './moonshot-support.ts'
import {
  archivedReply,
  archivedText,
  asReasoningString,
  serialized,
  visibleDetail,
} from './moonshot-visible-support.ts'
import {
  QWEN_SERVING_PROVIDER,
  qwenArchivedFor,
  qwenDefinition,
  qwenEfforts,
  qwenMeter,
  qwenOpenModels,
  qwenRequest,
  qwenToolResult,
  qwenUserTurn,
} from './qwen-visible-support.ts'
import { at, certificate, fixture, judgedMessage, policy } from './support.ts'

type ModelTransport = TransportAdapter<PlannedRequest, RawResponse>
const cases = qwenOpenModels.flatMap(model =>
  qwenEfforts.flatMap(effort =>
    [false, true].flatMap(tools =>
      (['public', 'cordis'] as const).map(path => ({ model, effort, tools, path })),
    ),
  ),
)
const retirement = {
  waitMilliseconds: 1000,
  force: true,
  schedule(ms: number, callback: () => void) {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
  // Load and verify the pinned tokenizer once per leaf.
  for (const model of qwenOpenModels) qwenMeter(model)
}, 120_000)
afterAll(() => cert.dispose())

describe.each(cases.map((value, offset) => ({ ...value, offset })))(
  '$model.modelId effort=$effort tools=$tools $path: archived details history',
  ({ model, effort, tools, path, offset }) => {
    const definition = qwenDefinition(model)
    const streams = qwenArchivedFor(model)
    const streamOf = (round: number) => {
      const stream = streams[(offset + round - 1) % streams.length]
      if (!stream) throw new Error('archived stream missing')
      return stream
    }
    // The public path keeps the fixed tag as the serving provider, so φ/δ are consulted
    // (and honestly unavailable); the Cordis path reports the archived display name.
    const servingProvider = path === 'cordis' ? QWEN_SERVING_PROVIDER : undefined

    it('rounds 2 and 3 are full estimated; one exact HTTP each; details kept; resources stop', async () => {
      const host = await fixture(
        cert.tls,
        (res, captured) => {
          const round = host.requests.indexOf(captured) + 1
          res.writeHead(200, { 'content-type': 'text/event-stream' })
          res.end(
            archivedReply(model, round, streamOf(round), {
              servingProvider,
              toolCall: tools && round === 1,
            }),
          )
        },
        {},
        undefined,
        [definition],
      )
      const oracle = qwenMeter(model)
      const { meter, calls } = trackedMeter(oracle)
      let transport: ModelTransport
      let stop: () => Promise<void>
      let stopped: () => void = () => {}
      if (path === 'public') {
        const owned = createPiAiTransport({
          ...host.options,
          definitions: [definition],
          inputMeters: [meter],
        })
        transport = owned
        stop = () => owned.close()
      } else {
        const service = createModelTransportService(host.options)
        const ctx = new Context()
        const provider: Plugin.Object = {
          name: 'qwen-visible-reasoning-local-service',
          apply(context) {
            context.provide(MODEL_TRANSPORT_SERVICE, service)
            context.effect(() => async () => {
              await service.close(retirement)
              await service.closed
            })
          },
        }
        await ctx.plugin(provider)
        await ctx.plugin(createModelPlugin(definition, meter, retirement), {})
        const initial = qwenRequest(model, { tools, effort })
        const acquired = service.acquire(initial.snapshot.adaptation, initial.routeName)
        if (!('lease' in acquired)) throw new Error('registered Qwen adaptation unavailable')
        transport = acquired.lease.transport
        stopped = () =>
          expect(service.inspect()).toMatchObject({
            accepting: false,
            registrations: 0,
            references: 0,
            executions: 0,
          })
        stop = async () => {
          acquired.lease.release()
          await ctx.fiber.dispose()
        }
      }
      const initial = qwenRequest(model, { tools, effort })
      let request: PlanInput = { ...initial, messages: [...initial.messages, qwenUserTurn(1)] }
      const texts: string[] = []
      try {
        for (let round = 1; round <= 3; round++) {
          request = {
            ...request,
            target: {
              kind: 'model_call',
              callId: unwrap(parseOpaqueIdentifier(`qwen-visible-${round}`, 'ModelCallId')),
              dispatch: 1,
            },
          }
          const before = {
            full: calls.full.length,
            replay: calls.replay.length,
            fresh: calls.fresh.length,
          }
          const source = JSON.stringify(request.messages)
          const planned = await transport.plan(request, { signal: new AbortController().signal })
          if ('rejected' in planned) throw new Error(`round ${round}: ${JSON.stringify(planned)}`)
          const measurement = planned.planned.measurement
          expect(measurement).toMatchObject({ mode: 'full', precision: 'estimated' })
          if (measurement.mode !== 'full') throw new Error('full required')
          // The configured margin is applied once, at the final admission gate.
          expect(planned.planned.inputLimitEvidence.admissionTokens).toEqual(
            admissionTokens(measurement.predictedInput, request.tokenMargin),
          )
          const outcome = await invokeModel({
            ...request,
            transport,
            credential: 'controlled-test-only',
            signal: new AbortController().signal,
            policy: policy(),
          }).outcome
          if (!('outcome' in outcome) || outcome.outcome !== 'complete')
            throw new Error(`round ${round}: ${JSON.stringify(outcome)}`)
          // Exactly one HTTP request per round, byte-identical to the fixed plan.
          expect(host.requests).toHaveLength(round)
          expect(host.requests[round - 1]?.body).toBe(planned.planned.serialized)
          expect(JSON.stringify(request.messages)).toBe(source)
          const sent = wireOf(host.requests[round - 1])
          if (effort === undefined) expect(sent.body).not.toHaveProperty('reasoning')
          else expect(sent.body.reasoning).toEqual({ effort })
          expect(sent.body.tools === undefined).toBe(!tools)
          // The route's explicit 5m system breakpoint is the only cache control.
          expect(host.requests[round - 1]?.body.split('"cache_control"')).toHaveLength(2)

          // Every earlier reply is replayed as its reader-merged detail and nothing else.
          const assistants = sent.messages.filter(item => object(item) && item.role === 'assistant')
          expect(assistants).toHaveLength(round - 1)
          for (const [index, item] of assistants.entries()) {
            if (!object(item)) throw new Error('assistant wire')
            expect(item.reasoning_details).toEqual([visibleDetail(texts[index] ?? '')])
            expect(item).not.toHaveProperty('reasoning')
            expect(item).not.toHaveProperty('reasoning_content')
          }
          // Independent meter on the captured bytes, and the equivalence oracle: the
          // same wire with details replaced by `reasoning: text` counts identically.
          const independent = directFull(oracle, {
            body: sent.body,
            serialized: host.requests[round - 1]?.body ?? '',
          })
          const plain = directFull(oracle, serialized(asReasoningString(sent.body)))
          if (independent.kind !== 'estimated') throw new Error('independent estimate missing')
          expect(writeJsonLossless(independent.tokens)).toBe(
            writeJsonLossless(measurement.predictedInput),
          )
          expect(plain).toEqual(independent)

          // Two plans per round (explicit plan + invokeModel), each one full estimate.
          expect(calls.full.slice(before.full)).toEqual([independent, independent])
          const replay = calls.replay.slice(before.replay)
          const fresh = calls.fresh.slice(before.fresh)
          if (round === 1 || servingProvider === QWEN_SERVING_PROVIDER) {
            // `Alibaba` is not the basis tag `alibaba`; only a future increment cares.
            expect(measurement.fallbackReason).toBe(
              round === 1 ? 'no_observation' : 'basis_changed',
            )
            expect([...replay, ...fresh]).toEqual([])
          } else {
            // Full-only: φ/δ are consulted and stay unsupported-marginal/1.
            expect(measurement.fallbackReason).toBeUndefined()
            expect(replay).toEqual([{ kind: 'unavailable' }, { kind: 'unavailable' }])
            expect(fresh).toEqual([{ kind: 'unavailable' }, { kind: 'unavailable' }])
          }

          const thinking = outcome.blocks.find(block => block.kind === 'thinking')
          if (!thinking || thinking.kind !== 'thinking' || !thinking.opaque)
            throw new Error('visible detail was not retained')
          const text = archivedText(streamOf(round))
          expect(thinking.text).toBe(text)
          expect(readOpaqueJson(thinking.opaque)).toEqual({
            routeName: definition.modelId,
            reasoning_details: [visibleDetail(text)],
          })
          texts.push(text)

          const assistant = judgedMessage({
            type: 'assistant',
            id: `qwen-visible-assistant-${round}`,
            response: `qwen-visible-response-${round}`,
            ending: 'complete',
            createdAt: at,
            blocks: outcome.blocks,
          })
          const call = outcome.blocks.find(block => block.kind === 'tool_call')
          expect(call !== undefined).toBe(tools && round === 1)
          let followUp: Message = qwenUserTurn(round + 1)
          if (call?.kind === 'tool_call') {
            if (call.callId === undefined) throw new Error('tool call identity missing')
            followUp = qwenToolResult(call.callId)
          }
          request = {
            ...request,
            calibration: {
              kind: 'observation',
              inputCalibration: outcome.inputCalibration,
              usage: outcome.usage,
              outputBlocks: outcome.blocks,
              replaySelection: outcome.blocks.map((_block, sourceBlockIndex) => ({
                sourceBlockIndex,
                messageIndex: request.messages.length,
                blockIndex: sourceBlockIndex,
              })),
            },
            messages: [...request.messages, assistant, followUp],
          }
        }
        expect(host.requests).toHaveLength(3)
      } catch (error) {
        await stop().finally(() => host.close())
        throw error
      }
      try {
        // The pooled connection is still open after three rounds; closing the owner stops it.
        const closedBeforeStop = host.closedSockets()
        await stop()
        stopped()
        await expect.poll(host.closedSockets).toBeGreaterThan(closedBeforeStop)
      } finally {
        await host.close()
      }
      expect(host.requests).toHaveLength(3)
    }, 60_000)
  },
)
