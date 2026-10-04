import { Context, type Plugin } from '@deepseek-ai/cordis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readOpaqueJson } from '@omne-harness-lite/content-blocks'
import {
  invokeModel,
  type InvocationOutcome,
  type ModelInvocationResult,
  type PlanInput,
} from '@omne-harness-lite/model-request-runtime-local'
import { createXaiInputMeter } from '../src/input-meters/xai.ts'
import { xaiDefinitions } from '../src/official-models/xai.ts'
import { MODEL_TRANSPORT_SERVICE, createModelPlugin } from '../src/plugin.ts'
import {
  createModelTransportService,
  type AdaptationLease,
  type RetirementPolicy,
} from '../src/registry.ts'
import { object } from '../src/json.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { appendXaiCloseoutResponse, xaiCloseoutInput } from './fixtures/xai/closeout-scenarios.ts'
import { certificate, fixture, policy, sse } from './support.ts'

/**
 * Three local rounds per leaf, tools on/off, public invoke and Cordis transport service.
 *
 * Every upstream byte is SYNTHETIC except two literals: `provider: "xAI"` and `model: <route id>`
 * on every frame, as observed in the 2026-09-30 raw SSE originals of both leaves. The frame order
 * follows those originals: streamed `reasoning.summary` fragments (no id, index 0), one
 * `reasoning.encrypted` fragment (string id, index 1), tool-call fragments, a finish frame, then
 * a usage frame repeating the finish reason. The ciphertext is a labelled placeholder. This is not
 * a real replay certification: upstream acceptance, error, cache and cost need the real run.
 */
const at = '2026-09-30T00:00:00Z'
const format = 'xai-responses-v1'
const tool = {
  name: 'lookup',
  description: 'Look up a controlled label by key.',
  parameters: {
    type: 'object',
    properties: { key: { type: 'string', enum: ['red'] } },
    required: ['key'],
    additionalProperties: false,
  },
}
// Distinct per round so each replayed group's O is identifiable in the marginal.
const completionTokens = [104, 91, 77] as const
const summaryFragments = (round: number) => ['Synthetic ', 'summary ', `round ${round}.`]
const ciphertext = (round: number) => `SYNTHETIC-XAI-IDENTITY-CIPHERTEXT-${round}-NOT-UPSTREAM`
const retirement: RetirementPolicy = {
  waitMilliseconds: 1000,
  force: false,
  schedule(ms, callback) {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}

function respond(model: string, round: number, callTool: boolean): string {
  const head = {
    id: `gen-synthetic-xai-identity-${round}`,
    provider: 'xAI',
    model,
    object: 'chat.completion.chunk',
  }
  const frame = (delta: object, finish: string | null = null, extra: object = {}) =>
    sse({
      ...head,
      ...extra,
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', ...delta },
          finish_reason: finish,
          native_finish_reason: finish && 'completed',
        },
      ],
    })
  const finish = callTool ? 'tool_calls' : 'stop'
  const summary = summaryFragments(round).map(fragment =>
    frame({
      content: '',
      reasoning: fragment,
      reasoning_details: [{ type: 'reasoning.summary', summary: fragment, format, index: 0 }],
    }),
  )
  const encrypted = frame({
    content: '',
    reasoning: null,
    reasoning_details: [
      {
        type: 'reasoning.encrypted',
        data: ciphertext(round),
        format,
        id: `rs_synthetic-${round}`,
        index: 1,
      },
    ],
  })
  const answer = callTool
    ? [
        frame({
          content: null,
          tool_calls: [
            {
              index: 0,
              id: `synthetic-upstream-call-${round}`,
              type: 'function',
              function: { name: tool.name, arguments: '' },
            },
          ],
        }),
        frame({ content: null, tool_calls: [{ index: 0, function: { arguments: '' } }] }),
        frame({
          content: null,
          tool_calls: [{ index: 0, function: { arguments: '{"key":"red"}' } }],
        }),
      ]
    : [frame({ content: 'red-' }), frame({ content: 'label-728' })]
  const usage = {
    prompt_tokens: 1600 + round * 100,
    completion_tokens: completionTokens[round - 1],
    total_tokens: 1600 + round * 100 + completionTokens[round - 1]!,
    cost: 0.0001,
    is_byok: false,
    prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    completion_tokens_details: { reasoning_tokens: 20 },
  }
  return [
    ...summary,
    encrypted,
    ...answer,
    frame({ content: '', reasoning: null }, finish),
    frame({ content: '' }, finish, { service_tier: 'default', usage }),
    sse('[DONE]'),
  ].join('')
}

function completed(result: InvocationOutcome): ModelInvocationResult {
  if (!('outcome' in result) || result.outcome !== 'complete')
    throw Error(`expected a complete synthetic reply: ${JSON.stringify(result)}`)
  return result
}

function reasoningDetails(reply: ModelInvocationResult): unknown {
  const thinking = reply.blocks.find(block => block.kind === 'thinking')
  if (!thinking || thinking.kind !== 'thinking' || !thinking.opaque) throw Error('missing opaque')
  const opaque = readOpaqueJson(thinking.opaque)
  if (!object(opaque)) throw Error('bad opaque')
  return opaque.reasoning_details
}

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

describe.each(['public', 'service'] as const)('xAI identity %s entry', entry => {
  describe.each(xaiDefinitions)('$modelId', definition => {
    it.each([true, false])(
      'three rounds with the real identity pair; tools=%s: rounds 2 and 3 are marginals counting the previous O once',
      async withTools => {
        const meter = createXaiInputMeter(definition)
        if (!meter) throw Error('missing official xAI meter')
        let calls = 0
        const host = await fixture(
          cert.tls,
          res => {
            const round = ++calls
            if (round > 3) {
              res.writeHead(500)
              res.end('{"error":{"message":"unexpected extra synthetic HTTP"}}')
              return
            }
            res.writeHead(200, { 'content-type': 'text/event-stream' })
            res.end(respond(definition.modelId, round, withTools && round === 1))
          },
          {},
          undefined,
          [definition],
        )
        const direct = createPiAiTransport({
          ...host.options,
          definitions: [definition],
          inputMeters: [meter],
        })
        const ctx = new Context()
        const service = createModelTransportService(host.options)
        let release = () => {}
        let transport: AdaptationLease['transport'] = direct
        const base = xaiCloseoutInput(definition.modelId, at)
        let request: PlanInput = {
          ...base,
          parameters: { reasoningEffort: 'high', maxOutputTokens: 1024 },
          tools: withTools ? [tool] : [],
        }
        try {
          if (entry === 'service') {
            const provider: Plugin.Object = {
              name: 'xai-identity-local',
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
            expect(ctx.get(MODEL_TRANSPORT_SERVICE)).toBe(service)
            const acquired = service.acquire(request.snapshot.adaptation, definition.modelId)
            if (!('lease' in acquired)) throw Error('service lease unavailable')
            release = acquired.lease.release
            transport = acquired.lease.transport
          }
          const replies: ModelInvocationResult[] = []
          for (let round = 1; round <= 3; round++) {
            const planned = await transport.plan(request, {
              signal: new AbortController().signal,
            })
            if (!('planned' in planned)) throw Error(JSON.stringify(planned))
            if (round === 1) expect(planned.planned.measurement.mode).toBe('full')
            else
              expect(planned.planned.measurement).toMatchObject({
                mode: 'marginal',
                replayContribution: {
                  precision: 'estimated',
                  tokens: completionTokens[round - 2],
                },
              })
            const reply = completed(
              await invokeModel({
                ...request,
                transport,
                credential: 'synthetic-local-only',
                signal: new AbortController().signal,
                policy: policy(),
                onAccepted() {},
              }).outcome,
            )
            expect(host.requests).toHaveLength(round)
            expect(host.requests[round - 1]?.body).toBe(planned.planned.serialized)
            expect(reply).toMatchObject({
              servingProvider: 'xAI',
              upstreamModel: definition.modelId,
            })
            // Streamed summary fragments normalize to one summary plus the one encrypted detail.
            expect(reasoningDetails(reply)).toEqual([
              {
                type: 'reasoning.summary',
                summary: summaryFragments(round).join(''),
                format,
                index: 0,
              },
              {
                type: 'reasoning.encrypted',
                data: ciphertext(round),
                format,
                id: `rs_synthetic-${round}`,
                index: 1,
              },
            ])
            replies.push(reply)
            if (round === 3) break
            const calls = reply.blocks.filter(block => block.kind === 'tool_call')
            request = appendXaiCloseoutResponse(request, reply, {
              round: round + 1,
              at,
              text: round === 1 ? 'What label did lookup return?' : 'Repeat the label.',
              toolResults: calls.map(call => {
                if (!call.complete) throw Error('incomplete synthetic tool call')
                expect(call).toMatchObject({ tool: tool.name, arguments: { key: 'red' } })
                return { callId: call.callId, text: '{"label":"red-label-728"}' }
              }),
            })
            expect(request.outputHistory[round - 1]?.origin).toMatchObject({
              servingProvider: 'xAI',
              upstreamModel: definition.modelId,
            })
          }
          // Every earlier complete group is resent verbatim exactly once, with its original callId.
          for (const [index, body] of host.requests.slice(1).entries()) {
            const wire = JSON.parse(body.body) as {
              messages: {
                role: string
                reasoning_details?: unknown
                tool_calls?: { id: string }[]
                tool_call_id?: string
              }[]
            }
            const assistants = wire.messages.filter(message => message.role === 'assistant')
            expect(assistants.map(message => message.reasoning_details)).toEqual(
              replies.slice(0, index + 1).map(reasoningDetails),
            )
            for (let round = 1; round <= index + 1; round++)
              expect(body.body.split(ciphertext(round))).toHaveLength(2)
            if (withTools) {
              const call = replies[0]?.blocks.find(block => block.kind === 'tool_call')
              if (!call || call.kind !== 'tool_call') throw Error('missing original call')
              expect(assistants[0]?.tool_calls?.map(item => item.id)).toEqual([call.callId])
              expect(
                wire.messages
                  .filter(message => message.role === 'tool')
                  .map(message => message.tool_call_id),
              ).toEqual([call.callId])
            }
          }
        } finally {
          release()
          await ctx.fiber.dispose()
          await service.close(retirement)
          await direct.close()
          await host.close()
        }
      },
    )
  })
})
