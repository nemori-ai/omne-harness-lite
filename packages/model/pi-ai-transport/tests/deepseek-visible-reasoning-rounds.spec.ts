// DV1 of the adopted DeepSeek visible reasoning estimate (revision 2): controlled local
// HTTPS streams emit the captured `delta.reasoning_details` shape; both the public
// transport and the Cordis transport service run three rounds, with and without tools.
// No request leaves 127.0.0.1; this is not route certification or accuracy evidence.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  readOpaqueJson,
  writeJsonLossless,
  type ContentBlock,
} from '@omne-harness-lite/content-blocks'
import type { Message } from '@omne-harness-lite/messages'
import {
  invokeModel,
  type PlanInput,
  type TransportAdapter,
} from '@omne-harness-lite/model-request-runtime'
import type { RawResponse } from '../src/http.ts'
import type { PlannedRequest } from '../src/plan.ts'

type ModelTransport = TransportAdapter<PlannedRequest, RawResponse>
import { createOfficialProfileContent } from '../src/configuration.ts'
import type { InputMeter } from '../src/input-meter.ts'
import { createDeepSeekV4ProInputMeter } from '../src/input-meters/deepseek-v4-pro.ts'
import { createDeepSeekV41FlashInputMeter } from '../src/input-meters/deepseek-v41-flash.ts'
import {
  deepseekV4Pro0813Configuration,
  deepseekV4Pro0813Definition,
  deepseekV41FlashConfiguration,
  deepseekV41FlashDefinition,
} from '../src/official-models/deepseek.ts'
import { createModelPlugin, MODEL_TRANSPORT_SERVICE } from '../src/plugin.ts'
import { createModelTransportService } from '../src/registry.ts'
import { createPiAiTransport } from '../src/transport.ts'
import {
  at,
  certificate,
  finish,
  fixture,
  input,
  judgedMessage,
  message,
  policy,
  sse,
} from './support.ts'

const tokenized = vi.hoisted(() => [] as string[])
vi.mock('@huggingface/tokenizers', async importOriginal => {
  const actual = await importOriginal<typeof import('@huggingface/tokenizers')>()
  return {
    ...actual,
    Tokenizer: class extends actual.Tokenizer {
      encode(...args: Parameters<InstanceType<typeof actual.Tokenizer>['encode']>) {
        tokenized.push(args[0])
        return super.encode(...args)
      }
    },
  }
})

const families = [
  {
    definition: deepseekV4Pro0813Definition,
    configuration: deepseekV4Pro0813Configuration,
    createMeter: createDeepSeekV4ProInputMeter,
  },
  {
    definition: deepseekV41FlashDefinition,
    configuration: deepseekV41FlashConfiguration,
    createMeter: createDeepSeekV41FlashInputMeter,
  },
]
const cases = families.flatMap(family =>
  [true, false].flatMap(tools =>
    (['public', 'cordis'] as const).map(path => ({ ...family, tools, path })),
  ),
)
const thought = (round: number) => [`THOUGHT_${round}_HEAD I need to look up`, ` the record code.`]
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
})
afterAll(() => cert.dispose())

describe.each(cases)(
  '$definition.modelId $path transport, tools=$tools, captured reasoning_details stream',
  ({ definition, configuration, createMeter, tools, path }) => {
    function request(): PlanInput {
      const profile = createOfficialProfileContent(definition, {
        providers: ['deepinfra/fp8'],
        allowFallback: false,
        configuration,
      })
      if ('rejected' in profile) throw Error(profile.rejected)
      const base = input()
      return {
        ...base,
        routeName: definition.modelId,
        provider: 'deepinfra/fp8',
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        messages: [message('user', 'STABLE_PREFIX_MARKER ' + 'long history '.repeat(300), 'u1')],
        tools: tools
          ? [
              {
                name: 'lookup_code',
                description: 'Look up a record code',
                parameters: {
                  type: 'object',
                  properties: { name: { type: 'string' } },
                  required: ['name'],
                  additionalProperties: false,
                },
              },
            ]
          : [],
        snapshot: {
          ...base.snapshot,
          ...definition.capabilities,
          adaptation: profile.ok.adaptation,
          providers: profile.ok.providers,
          allowFallback: profile.ok.allowFallback,
          updatedAt: at,
        },
      }
    }
    /** OpenRouter-shaped stream: plain `reasoning` plus the exact visible detail fragments. */
    function stream(round: number): string {
      const detail = (text: string) => ({
        reasoning: text,
        reasoning_details: [{ type: 'reasoning.text', text, format: 'unknown', index: 0 }],
      })
      const [head, tail] = thought(round)
      return (
        sse({
          id: `gen-${round}`,
          model: definition.modelId,
          provider: 'DeepInfra',
          choices: [{ index: 0, delta: { role: 'assistant', content: '', ...detail(head!) } }],
        }) +
        sse({ choices: [{ index: 0, delta: detail(tail!) }] }) +
        (tools
          ? sse({
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: `call_round_${round}`,
                        type: 'function',
                        function: { name: 'lookup_code', arguments: '{"name":"ORCHID"}' },
                      },
                    ],
                  },
                },
              ],
            })
          : sse({ choices: [{ index: 0, delta: { content: `visible answer ${round}` } }] })) +
        sse({
          choices: [],
          usage: {
            prompt_tokens: 7723 + round,
            completion_tokens: 62,
            prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
            completion_tokens_details: { reasoning_tokens: 13 },
          },
        }) +
        finish(tools ? 'tool_calls' : 'stop')
      )
    }
    function followUp(round: number, blocks: readonly ContentBlock[]): Message[] {
      const answer = judgedMessage({
        type: 'assistant',
        id: `a${round}`,
        response: `r${round}`,
        ending: 'complete',
        createdAt: at,
        blocks,
      })
      if (!tools) return [answer, message('user', `FOLLOWUP_${round + 1}`, `u${round + 1}`)]
      const call = blocks.find(block => block.kind === 'tool_call')
      if (!call || call.kind !== 'tool_call') throw Error('streamed tool call missing')
      const result = judgedMessage({
        type: 'tool',
        id: `tool-${round}`,
        callId: call.callId,
        createdAt: at,
        blocks: [
          {
            id: `tool-result-${round}`,
            kind: 'tool_result',
            callId: call.callId,
            outcome: 'completed',
            visibility: { toHuman: true, toModel: true },
            blocks: [
              {
                id: `tool-text-${round}`,
                kind: 'text',
                text: `FOLLOWUP_${round + 1} code=42`,
                visibility: { toHuman: true, toModel: true },
              },
            ],
          },
        ],
      })
      return [answer, result]
    }

    it('full then marginal twice; exact wire keeps each detail; resources actually stop', async () => {
      const host = await fixture(
        cert.tls,
        res => {
          res.writeHead(200, { 'content-type': 'text/event-stream' })
          res.end(stream(host.requests.length))
        },
        {},
        undefined,
        [definition],
      )
      const meter = createMeter(definition)
      const full = vi.fn(meter.measureFull)
      const bound: InputMeter = { ...meter, measureFull: full }
      let transport: ModelTransport
      let stop: () => Promise<void>
      let stopped: () => void = () => {}
      if (path === 'public') {
        const owned = createPiAiTransport({
          ...host.options,
          definitions: [definition],
          inputMeters: [bound],
        })
        transport = owned
        stop = () => owned.close()
      } else {
        const service = createModelTransportService(host.options)
        const ctx = new Context()
        const provider: Plugin.Object = {
          name: 'deepseek-visible-reasoning-local-service',
          apply(context) {
            context.provide(MODEL_TRANSPORT_SERVICE, service)
            context.effect(() => async () => {
              await service.close(retirement)
              await service.closed
            })
          },
        }
        await ctx.plugin(provider)
        await ctx.plugin(createModelPlugin(definition, bound, retirement), {})
        const initial = request()
        const acquired = service.acquire(initial.snapshot.adaptation, initial.routeName)
        if (!('lease' in acquired)) throw Error('registered DeepSeek adaptation unavailable')
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
      let next = request()
      try {
        for (let round = 1; round <= 3; round++) {
          tokenized.length = 0
          const fullCalls = full.mock.calls.length
          const plan = await transport.plan(next, { signal: new AbortController().signal })
          if ('rejected' in plan) throw Error(JSON.stringify(plan))
          const measurement = plan.planned.measurement
          expect(measurement.mode).toBe(round === 1 ? 'full' : 'marginal')
          const outcome = await invokeModel({
            ...next,
            transport,
            credential: 'local-fixture-only',
            signal: new AbortController().signal,
            policy: policy(),
          }).outcome
          if (!('outcome' in outcome)) throw Error(JSON.stringify(outcome))
          expect(outcome.outcome).toBe('complete')
          // The exact planned bytes are the bytes on the wire.
          expect(host.requests[round - 1]?.body).toBe(plan.planned.serialized)
          const wire = plan.planned.serialized
          for (let prior = 1; prior < round; prior++)
            expect(wire).toContain(
              `"reasoning_details":[{"type":"reasoning.text","text":${JSON.stringify(thought(prior).join(''))},"format":"unknown","index":0}]`,
            )
          expect(wire).not.toContain('reasoning_content')
          if (round > 1) {
            expect(full.mock.calls.length).toBe(fullCalls)
            expect(tokenized.some(value => value.includes('STABLE_PREFIX_MARKER'))).toBe(false)
            // P's own visible detail stays in the stable prefix and is not re-tokenized.
            if (round === 3)
              expect(tokenized.some(value => value.includes('THOUGHT_1_HEAD'))).toBe(false)
            expect(tokenized.some(value => value.includes(`FOLLOWUP_${round}`))).toBe(true)
            if (measurement.mode !== 'marginal') throw Error('marginal required')
            // Anchor + φ + δ only: the observed O and reasoning_tokens add nothing.
            if (next.calibration.kind !== 'observation') throw Error('observation required')
            const usage = next.calibration.usage
            const anchor = [usage.input_tokens, usage.cache_read_tokens, usage.cache_write_tokens]
              .map(value => {
                if (value === 'unknown') throw Error('known anchor required')
                return ExactDecimal.from(value)
              })
              .reduce((sum, value) => sum.add(value))
            expect(
              anchor
                .add(ExactDecimal.from(measurement.replayContribution.tokens))
                .add(ExactDecimal.from(measurement.newContribution.tokens))
                .toString(),
            ).toBe(ExactDecimal.from(measurement.predictedInput).toString())
          }
          const thinking = outcome.blocks.find(block => block.kind === 'thinking')
          if (!thinking || thinking.kind !== 'thinking' || !thinking.opaque)
            throw Error('visible detail was not retained')
          expect(thinking.text).toBe(thought(round).join(''))
          expect(readOpaqueJson(thinking.opaque)).toEqual({
            routeName: definition.modelId,
            reasoning_details: [
              {
                type: 'reasoning.text',
                text: thought(round).join(''),
                format: 'unknown',
                index: 0,
              },
            ],
          })
          expect(outcome.usage).toMatchObject({ output_tokens: 62, reasoning_tokens: 13 })
          const assistantIndex = next.messages.length
          next = {
            ...next,
            messages: [...next.messages, ...followUp(round, outcome.blocks)],
            calibration: {
              kind: 'observation',
              inputCalibration: outcome.inputCalibration,
              usage: outcome.usage,
              outputBlocks: outcome.blocks,
              replaySelection: outcome.blocks.map((_block, index) => ({
                sourceBlockIndex: index,
                messageIndex: assistantIndex,
                blockIndex: index,
              })),
            },
          }
        }
        expect(host.requests).toHaveLength(3)
        expect(writeJsonLossless(host.requests.map(item => item.path))).toBe(
          writeJsonLossless(Array(3).fill('/api/v1/chat/completions')),
        )
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
