// @module-tag slow
// 归慢层：网络＋重 CPU：经本地 HTTPS 服务（openssl 现生成证书）走真实传输与读取，输入计量用真实分词器。
import { Context, type Plugin } from '@deepseek-ai/cordis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {invokeModel} from '@omne-harness-lite/model-request-runtime-local'
import {type InvocationOutcome, type ModelInvocationResult, type PlanInput} from '@omne-harness-lite/model-request-runtime'
import { createXaiInputMeter } from '../src/input-meters/xai.ts'
import { xaiDefinitions } from '../src/official-models/xai.ts'
import { MODEL_TRANSPORT as MODEL_TRANSPORT_SERVICE } from '@omne-harness-lite/model-request-runtime/cordis'
import { loadModelContribution as createModelPlugin } from './cordis-assembly.ts'
import {createModelTransportService} from '../src/registry.ts'
import {type AdaptationLease} from '@omne-harness-lite/model-request-runtime'
import { type RetirementPolicy } from '@omne-harness-lite/model-request-runtime'
import { createPiAiTransport } from '../src/transport.ts'
import { appendXaiCloseoutResponse, xaiCloseoutInput } from './fixtures/xai/closeout-scenarios.ts'
import { certificate, content, finish, fixture, judgedMessage, policy, sse } from './support.ts'

/**
 * X5 narrow local fixture for the production identity guard (mp4-20).
 *
 * Every upstream byte below is SYNTHETIC. The reasoning detail shape follows the
 * OpenRouter `xai-responses-v1` streaming form; the ciphertext is a labelled
 * placeholder, not real xAI output. The only real inputs are the identity literals
 * `provider: "xAI"` / `model: <route id>` taken from the 2026-09-30 raw SSE originals
 * of both leaves (research xai/2026-09-30-identity-and-reasoning-format.md). These
 * cases are not a real replay certification: upstream acceptance of the resent
 * ciphertext, error, cache and cost remain for the real three-round run.
 */
const at = '2026-09-30T00:00:00Z'
const syntheticCiphertext = 'SYNTHETIC-X5-XAI-CIPHERTEXT-NOT-UPSTREAM-BYTES'
// Upstream wire id only. The runtime assigns the domain callId that later turns must reuse.
const syntheticUpstreamToolId = 'synthetic-x5-xai-upstream-tool-1'
const syntheticDetails = [
  {
    type: 'reasoning.summary',
    summary: 'Synthetic summary: call lookup for key red.',
    format: 'xai-responses-v1',
    index: 0,
  },
  {
    type: 'reasoning.encrypted',
    data: syntheticCiphertext,
    format: 'xai-responses-v1',
    id: 'synthetic-1',
    index: 1,
  },
]
// Same controlled format-2 family_three_turn content as the R3 `xai-local.json` scenario.
const scenario = {
  reasoningEffort: 'high',
  maxOutputTokens: 1024,
  systemText:
    'Use lookup exactly once to obtain the label for key red. Preserve the returned label. On subsequent turns answer the requested label without another tool call.',
  userText: 'Call lookup with key red and then report the label.',
  tool: {
    name: 'lookup',
    description: 'Look up a controlled label by key.',
    parameters: {
      type: 'object',
      properties: { key: { type: 'string', enum: ['red'] } },
      required: ['key'],
      additionalProperties: false,
    },
  },
  toolResultText: '{"label":"red-label-728"}',
  turns: ['What label did lookup return? Answer only that label.', 'Repeat the same label only.'],
} as const
const unavailable = {
  rejected: 'invalidInput',
  reason: 'input_size_unavailable',
  metrics: ['maxInputTokens'],
}
const retirement: RetirementPolicy = {
  waitMilliseconds: 1000,
  force: false,
  schedule(ms, callback) {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}

/** Raw frame identity fields; `true` = the real pair observed for this leaf. */
type FrameIdentity = boolean | { readonly provider?: string; readonly model?: string }
type Upstream =
  | {
      readonly kind: 'tool'
      readonly identity: FrameIdentity
      readonly details: readonly unknown[]
    }
  | { readonly kind: 'text'; readonly identity: FrameIdentity; readonly text: string }
  | { readonly kind: 'refuse' }

function frameIdentity(model: string, identity: FrameIdentity) {
  return identity === true ? { model, provider: 'xAI' } : identity === false ? {} : identity
}

function respond(model: string, upstream: Upstream): string {
  if (upstream.kind === 'refuse') throw Error('refusal is written as an HTTP status')
  const reasoning =
    upstream.kind === 'tool'
      ? sse({ choices: [{ delta: { reasoning_details: upstream.details } }] })
      : ''
  const body =
    upstream.kind === 'tool'
      ? sse({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: syntheticUpstreamToolId,
                    type: 'function',
                    function: { name: scenario.tool.name, arguments: '{"key":"red"}' },
                  },
                ],
              },
            },
          ],
        })
      : content(upstream.text)
  return (
    reasoning +
    body +
    sse({
      choices: [],
      ...frameIdentity(model, upstream.identity),
      usage: {
        prompt_tokens: 1600,
        completion_tokens: 37,
        completion_tokens_details: { reasoning_tokens: 21 },
        prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        cost: 0.0001,
      },
    }) +
    finish(upstream.kind === 'tool' ? 'tool_calls' : 'stop')
  )
}

function firstRequest(model: string): PlanInput {
  const base = xaiCloseoutInput(model, at)
  return {
    ...base,
    parameters: { reasoningEffort: scenario.reasoningEffort, maxOutputTokens: 1024 },
    tools: [scenario.tool],
    messages: [
      judgedMessage({
        id: 'x5-system',
        type: 'system',
        createdAt: at,
        blocks: [
          {
            id: 'x5-system-text',
            kind: 'text',
            text: scenario.systemText,
            visibility: { toHuman: true, toModel: true },
          },
        ],
      }),
      judgedMessage({
        id: 'x5-user-1',
        type: 'user',
        createdAt: at,
        blocks: [
          {
            id: 'x5-user-1-text',
            kind: 'text',
            text: scenario.userText,
            visibility: { toHuman: true, toModel: true },
          },
        ],
      }),
    ],
  }
}

function completed(result: InvocationOutcome): ModelInvocationResult {
  if (!('outcome' in result) || result.outcome !== 'complete')
    throw Error(`expected a complete synthetic reply: ${JSON.stringify(result)}`)
  return result
}

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

describe.each(['public', 'service'] as const)('xAI X5 %s entry, identity guard', entry => {
  describe.each(xaiDefinitions)('$modelId synthetic format-2 three-turn tool case', definition => {
    async function open(script: readonly Upstream[]) {
      const meter = createXaiInputMeter(definition)
      if (!meter) throw Error('missing official xAI meter')
      let calls = 0
      const host = await fixture(
        cert.tls,
        res => {
          const upstream = script[calls++]
          if (!upstream) {
            res.writeHead(500)
            res.end('{"error":{"message":"unexpected extra synthetic HTTP"}}')
            return
          }
          if (upstream.kind === 'refuse') {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end('{"error":{"code":400,"message":"synthetic replay refusal"}}')
            return
          }
          res.writeHead(200, { 'content-type': 'text/event-stream' })
          res.end(respond(definition.modelId, upstream))
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
      const request = firstRequest(definition.modelId)
      if (entry === 'service') {
        const provider: Plugin.Object = {
          name: 'xai-x5-local',
          apply(context) {
            context.provide(MODEL_TRANSPORT_SERVICE, service)
            context.effect(() => async () => {
              await service.close(retirement)
              await service.closed
            })
          },
        }
        await ctx.plugin(provider)
        await createModelPlugin(ctx, definition, meter, retirement)
        expect(ctx.get(MODEL_TRANSPORT_SERVICE)).toBe(service)
        const acquired = service.acquire(request.snapshot.adaptation, definition.modelId)
        if (!('lease' in acquired)) throw Error('service lease unavailable')
        release = acquired.lease.release
        transport = acquired.lease.transport
      }
      const invoke = (input: PlanInput) =>
        invokeModel({
          ...input,
          transport,
          credential: 'synthetic-local-only',
          signal: new AbortController().signal,
          policy: policy(),
          onAccepted() {},
        }).outcome
      const plan = (input: PlanInput) =>
        transport.plan(input, { signal: new AbortController().signal })
      return {
        host,
        request,
        invoke,
        plan,
        async close() {
          release()
          await ctx.fiber.dispose()
          await service.close(retirement)
          await direct.close()
          await host.close()
        },
      }
    }

    function originalCallId(reply: ModelInvocationResult): string {
      const calls = reply.blocks.filter(block => block.kind === 'tool_call')
      const call = calls[0]
      if (calls.length !== 1 || !call?.complete) throw Error('expected one complete tool call')
      expect(call).toMatchObject({ tool: scenario.tool.name, arguments: { key: 'red' } })
      return call.callId
    }

    function second(request: PlanInput, reply: ModelInvocationResult): PlanInput {
      // The tool result pairs with the original reply's exact callId, never a renamed one.
      return appendXaiCloseoutResponse(request, reply, {
        round: 2,
        at,
        text: scenario.turns[0],
        toolResults: [{ callId: originalCallId(reply), text: scenario.toolResultText }],
      })
    }

    function replayed(body: string | undefined) {
      const wire = JSON.parse(body ?? '{}') as {
        messages?: {
          role?: string
          reasoning_details?: unknown
          tool_calls?: { id?: string }[]
          tool_call_id?: string
        }[]
      }
      const assistant = wire.messages?.find(message => message.role === 'assistant')
      return {
        details: assistant?.reasoning_details,
        assistantCallIds: assistant?.tool_calls?.map(call => call.id),
        toolResultCallIds: wire.messages
          ?.filter(message => message.role === 'tool')
          .map(message => message.tool_call_id),
      }
    }

    it('real upstream identity: round 2 is a marginal counting original O once; rounds 2 and 3 resend the group verbatim', async () => {
      const entryUnderTest = await open([
        { kind: 'tool', identity: true, details: syntheticDetails },
        { kind: 'text', identity: true, text: 'red-label-728' },
        { kind: 'text', identity: true, text: 'red-label-728' },
      ])
      try {
        const { host, invoke, plan } = entryUnderTest
        const first = completed(await invoke(entryUnderTest.request))
        expect(host.requests).toHaveLength(1)
        expect(first.servingProvider).toBe('xAI')
        expect(first.upstreamModel).toBe(definition.modelId)
        const round2 = second(entryUnderTest.request, first)
        expect(round2.outputHistory[0]?.origin).toMatchObject({
          servingProvider: 'xAI',
          upstreamModel: definition.modelId,
        })
        const planned2 = await plan(round2)
        if (!('planned' in planned2)) throw Error(JSON.stringify(planned2))
        expect(planned2.planned.measurement).toMatchObject({
          mode: 'marginal',
          replayContribution: { precision: 'estimated', tokens: 37 },
        })
        const reply2 = completed(await invoke(round2))
        expect(host.requests).toHaveLength(2)
        expect(host.requests[1]?.body).toBe(planned2.planned.serialized)
        const round3 = appendXaiCloseoutResponse(round2, reply2, {
          round: 3,
          at,
          text: scenario.turns[1],
        })
        const planned3 = await plan(round3)
        if (!('planned' in planned3)) throw Error(JSON.stringify(planned3))
        expect(planned3.planned.measurement.mode).toBe('marginal')
        completed(await invoke(round3))
        expect(host.requests).toHaveLength(3)
        const callId = originalCallId(first)
        for (const request of host.requests.slice(1)) {
          expect(replayed(request.body)).toEqual({
            details: syntheticDetails,
            assistantCallIds: [callId],
            toolResultCallIds: [callId],
          })
          expect(request.body.split(syntheticCiphertext)).toHaveLength(2)
        }
      } finally {
        await entryUnderTest.close()
      }
    })

    const other = definition.modelId === 'x-ai/grok-4.6' ? 'x-ai/grok-4.7' : 'x-ai/grok-4.6'
    it.each([
      { label: 'lower-case provider', identity: { provider: 'xai', model: definition.modelId } },
      { label: 'dotted provider', identity: { provider: 'x.ai', model: definition.modelId } },
      { label: 'provider with a space', identity: { provider: 'xAI ', model: definition.modelId } },
      { label: 'other leaf model', identity: { provider: 'xAI', model: other } },
      { label: 'provider only', identity: { provider: 'xAI' } },
      { label: 'model only', identity: { model: definition.modelId } },
    ])(
      'unadopted upstream identity ($label): round 2 stays unavailable with zero extra HTTP',
      async ({ identity }) => {
        const entryUnderTest = await open([{ kind: 'tool', identity, details: syntheticDetails }])
        try {
          const { host, invoke, plan } = entryUnderTest
          const first = completed(await invoke(entryUnderTest.request))
          expect(host.requests).toHaveLength(1)
          const round2 = second(entryUnderTest.request, first)
          expect(writeJsonLossless(round2.outputHistory[0]?.outputBlocks)).toContain(
            syntheticCiphertext,
          )
          expect(await plan(round2)).toMatchObject(unavailable)
          expect(await invoke(round2)).toEqual(unavailable)
          expect(host.requests).toHaveLength(1)
        } finally {
          await entryUnderTest.close()
        }
      },
    )

    it('absent upstream identity: a second-round upstream refusal is recorded as failed, not local success', async () => {
      const entryUnderTest = await open([
        { kind: 'tool', identity: false, details: syntheticDetails },
        { kind: 'refuse' },
      ])
      try {
        const { host, invoke } = entryUnderTest
        const first = completed(await invoke(entryUnderTest.request))
        expect(first.servingProvider).toBeUndefined()
        expect(first.upstreamModel).toBeUndefined()
        const round2 = second(entryUnderTest.request, first)
        const refused = await invoke(round2)
        if (!('outcome' in refused))
          throw Error(`expected an HTTP send: ${JSON.stringify(refused)}`)
        expect(refused.outcome).toBe('failed')
        expect(refused.failure).toMatchObject({ cause: 'request_rejected', statusCode: 400 })
        expect(host.requests).toHaveLength(2)
        const callId = originalCallId(first)
        expect(replayed(host.requests[1]?.body)).toEqual({
          details: syntheticDetails,
          assistantCallIds: [callId],
          toolResultCallIds: [callId],
        })
      } finally {
        await entryUnderTest.close()
      }
    })

    it('absent upstream identity: rounds 2 and 3 resend the complete original group verbatim', async () => {
      const entryUnderTest = await open([
        { kind: 'tool', identity: false, details: syntheticDetails },
        { kind: 'text', identity: false, text: 'red-label-728' },
        { kind: 'text', identity: false, text: 'red-label-728' },
      ])
      try {
        const { host, invoke } = entryUnderTest
        const first = completed(await invoke(entryUnderTest.request))
        const round2 = second(entryUnderTest.request, first)
        const reply2 = completed(await invoke(round2))
        const round3 = appendXaiCloseoutResponse(round2, reply2, {
          round: 3,
          at,
          text: scenario.turns[1],
        })
        completed(await invoke(round3))
        expect(host.requests).toHaveLength(3)
        const callId = originalCallId(first)
        for (const request of host.requests.slice(1)) {
          expect(replayed(request.body)).toEqual({
            details: syntheticDetails,
            assistantCallIds: [callId],
            toolResultCallIds: [callId],
          })
          expect(request.body.split(syntheticCiphertext)).toHaveLength(2)
        }
      } finally {
        await entryUnderTest.close()
      }
    })

    it('a streamed [REDACTED] ciphertext placeholder is not a complete group: zero extra HTTP', async () => {
      const redacted = syntheticDetails.map(detail =>
        detail.type === 'reasoning.encrypted' ? { ...detail, data: '[REDACTED]' } : detail,
      )
      const entryUnderTest = await open([{ kind: 'tool', identity: false, details: redacted }])
      try {
        const { host, invoke } = entryUnderTest
        const first = completed(await invoke(entryUnderTest.request))
        // The placeholder is retained as received; it is neither dropped nor upgraded.
        expect(writeJsonLossless(first.blocks)).toContain('[REDACTED]')
        const round2 = second(entryUnderTest.request, first)
        expect(await invoke(round2)).toEqual(unavailable)
        expect(host.requests).toHaveLength(1)
      } finally {
        await entryUnderTest.close()
      }
    })
  })
})
