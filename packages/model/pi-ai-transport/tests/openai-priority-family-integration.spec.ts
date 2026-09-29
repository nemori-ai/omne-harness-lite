import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import {
  invokeModel,
  type PlanInput,
  type PlanOutputHistoryGroup,
} from '@omne-harness-lite/model-request-runtime'
import { readOpaqueJson, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  createOpenAiInputMeter,
  createOfficialProfileContent,
  createPiAiTransport,
  createModelTransportService,
  openaiDefinitions,
  openaiConfiguration,
  type AdaptationLease,
  type RetirementPolicy,
} from '@omne-harness-lite/pi-ai-transport'
import {
  createModelPlugin,
  MODEL_TRANSPORT_SERVICE,
} from '@omne-harness-lite/pi-ai-transport/plugin'
import { openAiFamilyRecords } from '../src/input-meters/openai-family-policy.ts'
import {
  at,
  certificate,
  fixture,
  finish,
  input,
  judgedMessage,
  message,
  policy,
  sse,
} from './support.ts'

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
const retirement: RetirementPolicy = {
  waitMilliseconds: 100,
  force: false,
  schedule(ms, callback) {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}
const encrypted = {
  type: 'reasoning.encrypted',
  data: 'OPAQUE_unchanged_é_\\n_+/=',
  format: 'openai-responses-v1',
  id: 'rs-local',
  index: 0,
}
let cert: ReturnType<typeof certificate>
let png: string
beforeAll(async () => {
  cert = certificate()
  png = (
    await sharp({ create: { width: 65, height: 65, channels: 3, background: '#467' } })
      .png()
      .toBuffer()
  ).toString('base64')
})
afterAll(() => cert.dispose())

describe.each(['public', 'cordis'] as const)('%s actual OpenAI family transport', entry => {
  it.each(Object.values(openAiFamilyRecords))(
    '$modelId completes three real local rounds with unchanged opaque and prepared image',
    async row => {
      const definition = openaiDefinitions.find(item => item.modelId === row.modelId)!
      const meter = createOpenAiInputMeter(definition)
      const profile = createOfficialProfileContent(definition, {
        providers: ['openai'],
        allowFallback: false,
        configuration: openaiConfiguration,
      })
      if ('rejected' in profile) throw Error(profile.rejected)
      const host = await fixture(
        cert.tls,
        res =>
          res.end(
            sse({
              model: row.modelId,
              provider: 'OpenAI',
              choices: [{ delta: { reasoning_details: [encrypted], content: 'Visible response' } }],
            }) +
              sse({
                choices: [{ delta: {}, finish_reason: 'stop' }],
                usage: {
                  prompt_tokens: 400,
                  completion_tokens: 18,
                  completion_tokens_details: { reasoning_tokens: 11 },
                  prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
                  cost: 0.000123,
                },
              }) +
              finish(),
          ),
        {},
        undefined,
        [definition],
      )
      const context = new Context()
      let transport: AdaptationLease['transport']
      let release = () => {}
      let close = async () => {}
      let next: PlanInput = {
        ...input(),
        routeName: row.modelId,
        provider: 'openai',
        snapshot: {
          ...input().snapshot,
          ...definition.capabilities,
          adaptation: profile.ok.adaptation,
          providers: ['openai'],
          allowFallback: false,
        },
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        tools: [],
        messages: [
          message('user', 'STABLE_PREFIX', 'u0'),
          judgedMessage({
            type: 'user',
            id: 'image-user',
            createdAt: at,
            blocks: [
              {
                id: 'image',
                kind: 'image',
                mediaType: 'image/png',
                data: { inline: png },
                visibility: { toHuman: true, toModel: true },
              },
            ],
          }),
        ],
        tokenMargin: { multiplier: 1.1, reserveTokens: 7 },
        outputHistory: [],
      }
      try {
        if (entry === 'public') {
          const direct = createPiAiTransport({
            ...host.options,
            definitions: [definition],
            inputMeters: [meter],
          })
          transport = direct
          close = () => direct.close()
        } else {
          const service = createModelTransportService(host.options)
          const provider: Plugin.Object = {
            name: 'openai-family-local-https',
            apply(ctx) {
              ctx.provide(MODEL_TRANSPORT_SERVICE, service)
              ctx.effect(() => async () => {
                await service.close(retirement)
                await service.closed
              })
            },
          }
          await context.plugin(provider)
          await context.plugin(createModelPlugin(definition, meter, retirement), {})
          expect(context.get(MODEL_TRANSPORT_SERVICE)).toBe(service)
          const acquired = service.acquire(next.snapshot.adaptation, next.routeName)
          if ('rejected' in acquired) throw Error(acquired.rejected)
          transport = acquired.lease.transport
          release = acquired.lease.release
        }
        for (let round = 0; round < 3; round++) {
          tokenized.length = 0
          const planned = await transport.plan(next, { signal: new AbortController().signal })
          if ('rejected' in planned) throw Error(JSON.stringify(planned))
          expect(planned.planned.measurement.mode).toBe(
            round === 0 || row.inputScope === 'scope_unknown' ? 'full' : 'marginal',
          )
          if (planned.planned.measurement.mode === 'marginal') {
            expect(planned.planned.measurement.replayContribution).toEqual({
              precision: 'estimated',
              tokens: 18,
            })
            expect(tokenized.some(text => text.includes('STABLE_PREFIX'))).toBe(false)
          }
          expect(planned.planned.serialized).toContain('data:image/png;base64,')
          const result = await invokeModel({
            ...next,
            transport,
            credential: 'local-fixture',
            signal: new AbortController().signal,
            policy: policy(),
          }).outcome
          if (!('outcome' in result) || result.outcome !== 'complete')
            throw Error(JSON.stringify(result))
          expect(result.usage).toMatchObject({
            source: 'upstream',
            output_tokens: 18,
            reasoning_tokens: 11,
          })
          expect(writeJsonLossless(result.cost.cost_usd)).toBe('0.000123')
          if (row.inputScope === 'scope_unknown')
            expect(result.inputCalibration.observedInput).toEqual({
              kind: 'unavailable',
              reason: 'scope_unknown',
            })
          else expect(result.inputCalibration.observedInput.kind).toBe('from_usage')
          const thinking = result.blocks.find(block => block.kind === 'thinking')
          if (!thinking || thinking.kind !== 'thinking' || thinking.opaque === undefined)
            throw Error('missing original opaque')
          expect(readOpaqueJson(thinking.opaque)).toMatchObject({
            routeName: row.modelId,
            reasoning_details: [encrypted],
          })
          expect(tokenized.some(text => text.includes(encrypted.data))).toBe(false)
          const wire = JSON.parse(host.requests.at(-1)!.body)
          const replayed = wire.messages.flatMap(
            (unit: { reasoning_details?: unknown[] }) => unit.reasoning_details ?? [],
          )
          expect(replayed).toEqual(Array.from({ length: round }, () => encrypted))
          const selection = result.blocks.map((_, i) => ({
            sourceBlockIndex: i,
            messageIndex: next.messages.length,
            blockIndex: i,
          }))
          const group: PlanOutputHistoryGroup = {
            inputCalibration: result.inputCalibration,
            usage: result.usage,
            outputBlocks: result.blocks,
            replaySelection: selection,
            origin: {
              adaptation: next.snapshot.adaptation,
              provider: 'openai',
              parameters: planned.planned.parameters,
              upstreamModel: row.modelId,
              servingProvider: 'OpenAI',
            },
          }
          next = {
            ...next,
            messages: [
              ...next.messages,
              judgedMessage({
                type: 'assistant',
                id: `a${round}`,
                response: `r${round}`,
                ending: 'complete',
                createdAt: at,
                blocks: result.blocks,
              }),
              message('user', `next ${round}`, `u${round + 1}`),
            ],
            outputHistory: [...next.outputHistory!, group],
            calibration: {
              kind: 'observation',
              inputCalibration: group.inputCalibration,
              usage: group.usage,
              outputBlocks: group.outputBlocks,
              replaySelection: group.replaySelection,
            },
          }
        }
        expect(host.requests).toHaveLength(3)
      } finally {
        release()
        await context.fiber.dispose()
        await close()
        await host.close()
      }
    },
    10000,
  )
})
