import { readFileSync } from 'node:fs'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  invokeModel,
  type PlanInput,
  type PlanOutputHistoryGroup,
} from '@omne-harness-lite/model-request-runtime-local'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { anthropicReplayModels } from '../src/input-meters/anthropic-replay.ts'
import { createAnthropicInputMeter } from '../src/input-meters/anthropic.ts'
import { anthropicDefinitions } from '../src/official-models/anthropic.ts'
import { createPiAiTransport } from '../src/transport.ts'
import {
  createModelTransportService,
  type RetirementPolicy,
  type AdaptationLease,
} from '../src/registry.ts'
import { MODEL_TRANSPORT_SERVICE, createModelPlugin } from '../src/plugin.ts'
import { imagePreparation } from './image-transport-support.ts'
import {
  at,
  certificate,
  fixture,
  input,
  message,
  judgedMessage,
  content,
  sse,
  finish,
  policy,
} from './support.ts'

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())
const retirement: RetirementPolicy = {
  waitMilliseconds: 1000,
  force: false,
  schedule(ms, callback) {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}
const gif = readFileSync(
  new URL('./fixtures/anthropic/reference-single-frame.gif', import.meta.url),
).toString('base64')

describe.each(['public', 'service'] as const)(
  'Anthropic %s actual local TLS complete history',
  entry => {
    for (const original of anthropicDefinitions)
      it(original.modelId, async () => {
        const definition = original
        const meter = createAnthropicInputMeter(definition)
        const profile = createOfficialProfileContent(definition, {
          providers: ['anthropic'],
          allowFallback: false,
          configuration: {
            revision: '1',
            values: { cache: { mode: 'explicit', ttl: '1h', breakpoints: ['last_message'] } },
          },
        })
        if ('rejected' in profile) throw Error(profile.rejected)
        let calls = 0
        const host = await fixture(
          cert.tls,
          res => {
            calls++
            const detail =
              calls === 2
                ? { type: 'reasoning.encrypted', data: `encrypted-${calls}` }
                : { type: 'reasoning.text', text: '', signature: `signature-${calls}` }
            res.end(
              sse({
                choices: [
                  {
                    delta: {
                      reasoning_details: [{ ...detail, format: 'anthropic-claude-v1', index: 0 }],
                    },
                  },
                ],
              }) +
                content(`answer ${calls}`) +
                sse({
                  choices: [],
                  model: definition.modelId,
                  provider: 'Anthropic',
                  usage: {
                    prompt_tokens: 100 * calls,
                    completion_tokens: 31,
                    completion_tokens_details: { reasoning_tokens: 7 },
                    prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 5 },
                  },
                }) +
                finish(),
            )
          },
          {},
          undefined,
          [definition],
        )
        const options = { ...host.options, imagePreparation }
        const direct = createPiAiTransport({
          ...options,
          definitions: [definition],
          inputMeters: [meter],
        })
        const ctx = new Context(),
          service = createModelTransportService(options)
        const provider: Plugin.Object = {
          name: 'anthropic-local-family',
          apply(context) {
            context.provide(MODEL_TRANSPORT_SERVICE, service)
            context.effect(() => async () => {
              await service.close(retirement)
              await service.closed
            })
          },
        }
        let release = () => {}
        try {
          let transport: AdaptationLease['transport'] = direct
          if (entry === 'service') {
            await ctx.plugin(provider)
            await ctx.plugin(createModelPlugin(definition, meter, retirement), {})
            expect(ctx.get(MODEL_TRANSPORT_SERVICE)).toBe(service)
            const acquired = service.acquire(profile.ok.adaptation, definition.modelId)
            if (!('lease' in acquired)) throw Error('service lease unavailable')
            release = acquired.lease.release
            transport = acquired.lease.transport
          }
          const base = input()
          let request: PlanInput = {
            ...base,
            routeName: definition.modelId,
            provider: 'anthropic',
            parameters: { reasoningEffort: 'high', maxOutputTokens: 128 },
            messages: [
              judgedMessage({
                type: 'user',
                id: 'image-user',
                createdAt: at,
                blocks: [
                  {
                    kind: 'image',
                    id: 'image',
                    mediaType: 'image/gif',
                    data: { inline: gif },
                    visibility: { toHuman: true, toModel: true },
                  },
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
          for (let round = 0; round < 3; round++) {
            const planned = await transport.plan(request, { signal: new AbortController().signal })
            if (!('planned' in planned)) throw Error(JSON.stringify(planned))
            expect(planned.planned.measurement.mode).toBe(round === 0 ? 'full' : 'marginal')
            if (round === 0)
              expect(planned.planned.body.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' })
            const actual = await invokeModel({
              ...request,
              transport,
              credential: 'synthetic-local-only',
              signal: new AbortController().signal,
              policy: policy(),
              onAccepted() {},
            }).outcome
            if (!('outcome' in actual) || actual.outcome !== 'complete')
              throw Error(JSON.stringify(actual))
            expect(actual.inputCalibration.observedInput.kind).toBe('from_usage')
            expect(actual.usage.output_tokens).toBe(31)
            const selection = actual.blocks.map((_, index) => ({
              sourceBlockIndex: index,
              messageIndex: request.messages.length,
              blockIndex: index,
            }))
            const history: PlanOutputHistoryGroup = {
              inputCalibration: actual.inputCalibration,
              usage: actual.usage,
              outputBlocks: actual.blocks,
              replaySelection: selection,
              origin: {
                adaptation: request.snapshot.adaptation,
                provider: 'anthropic',
                parameters: planned.planned.parameters,
                servingProvider: 'Anthropic',
                upstreamModel: definition.modelId,
              },
            }
            const reply = judgedMessage({
              type: 'assistant',
              id: `a${round}`,
              response: `r${round}`,
              ending: 'complete',
              createdAt: at,
              blocks: actual.blocks,
            })
            request = {
              ...request,
              outputHistory: [...request.outputHistory, history],
              calibration: {
                kind: 'observation',
                inputCalibration: actual.inputCalibration,
                usage: actual.usage,
                outputBlocks: actual.blocks,
                replaySelection: selection,
              },
              messages: [...request.messages, reply, message('user', `next ${round}`, `u${round}`)],
            }
            if (round === 0) {
              const invoke = (candidate: PlanInput) =>
                invokeModel({
                  ...candidate,
                  transport,
                  credential: 'synthetic-local-only',
                  signal: new AbortController().signal,
                  policy: policy(),
                  onAccepted() {},
                }).outcome
              if (
                anthropicReplayModels.find(row => row.modelId === definition.modelId)
                  ?.requiresSignedPrefix
              ) {
                for (const parameters of [
                  { ...request.parameters, reasoningEffort: 'low' as const },
                  { ...request.parameters, maxOutputTokens: 256 },
                ]) {
                  const failed = await invoke({ ...request, parameters })
                  expect(failed).toEqual({
                    rejected: 'invalidInput',
                    reason: 'input_size_unavailable',
                    metrics: ['maxInputTokens'],
                  })
                  expect(host.requests).toHaveLength(1)
                }
              }
              // A contradictory retained origin is truly malformed, unlike a
              // valid change whose required contribution cannot be measured.
              const bad = { ...history, origin: { ...history.origin!, provider: 'unrelated' } }
              expect(await invoke({ ...request, outputHistory: [bad] })).toEqual({
                rejected: 'invalidInput',
                reason: 'malformed',
              })
              expect(host.requests).toHaveLength(1)
            }
          }
          expect(host.requests).toHaveLength(3)
          expect(host.requests[1]?.body).toContain('signature-1')
          expect(host.requests[2]?.body).toContain('encrypted-2')
        } finally {
          release()
          await ctx.fiber.dispose()
          await service.close(retirement)
          await direct.close()
          await host.close()
        }
      })
  },
)
