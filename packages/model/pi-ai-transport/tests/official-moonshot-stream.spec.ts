import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import { kimiK3MoonshotRoute, kimiK27CodeMoonshotRoute } from '../src/official-models/moonshot.ts'
import { certificate, content, finish, fixture, judgedMessage, policy, sse } from './support.ts'
import type { ModelDefinition } from '@omne-harness-lite/pi-ai-transport'
import type { PlanInput } from '@omne-harness-lite/model-request-runtime-local'

const at = '2026-09-28T00:00:00Z'
const tool: ModelToolEntry = {
  name: 'lookup__exact',
  description: 'Look up an exact value',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
    additionalProperties: false,
  },
}
const routes = [
  { label: 'K3', provider: 'moonshotai/mxfp4', route: kimiK3MoonshotRoute },
  { label: 'K2.7 Code', provider: 'moonshotai/int4', route: kimiK27CodeMoonshotRoute },
] as const

function syntheticInput(provider: string, route: ModelDefinition['routes'][string]) {
  const definition: ModelDefinition = {
    modelId: 'test/moonshot-history',
    revision: 'fixture-1',
    implementation: { name: 'pi-ai:moonshot-history-test', revision: '1' },
    // These text-only limits are test data, never a claim about either official model.
    capabilities: {
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 1024,
      maxOutputTokens: 128,
      inputConstraints: {},
      upstreamInputLimits: {
        maxInputTokens: { status: 'unknown' },
        maxRequestBytes: { status: 'unknown' },
      },
    },
    routes: { [provider]: route },
  }
  const input: PlanInput = {
    calibration: { kind: 'none' as const, reason: 'no_observation' as const },
    outputHistory: [],
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('moonshot-first-call', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: definition.modelId,
    provider,
    snapshot: {
      adaptation: {
        implementation: definition.implementation,
        definition: { modelId: definition.modelId, revision: definition.revision },
        configuration: { revision: 'fixture-1', values: { cache: { mode: 'automatic' } } },
      },
      providers: [provider],
      allowFallback: false,
      inputModalities: ['text'],
      outputModalities: ['text'],
      maxInputTokens: 1024,
      maxOutputTokens: 128,
      inputConstraints: definition.capabilities.inputConstraints,
      upstreamInputLimits: definition.capabilities.upstreamInputLimits,
      updatedAt: at,
    },
    parameters: { maxOutputTokens: 64 },
    messages: [
      judgedMessage({
        id: 'moonshot-reminder',
        type: 'system_reminder',
        createdAt: at,
        nature: 'event',
        source: { kind: 'attempt_started', attempt: 1, reason: 'first', at },
        blocks: [
          {
            id: 'moonshot-reminder-text',
            kind: 'text',
            text: 'Remember the task',
            visibility: { toHuman: true, toModel: true },
          },
        ],
      }),
      judgedMessage({
        id: 'moonshot-user',
        type: 'user',
        createdAt: at,
        blocks: [
          {
            id: 'moonshot-user-text',
            kind: 'text',
            text: 'Look up value',
            visibility: { toHuman: true, toModel: true },
          },
        ],
      }),
    ],
    tools: [tool],
  }
  return { definition, input }
}

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

describe('Moonshot fixed routes through public HTTPS invocation (synthetic profile)', () => {
  it.each(routes)(
    '$label replays streamed thinking and completed tool history on the same fixed route',
    async ({ provider, route }) => {
      const { definition, input } = syntheticInput(provider, route)
      const host = await fixture(
        cert.tls,
        res => {
          res.writeHead(200, { 'content-type': 'text/event-stream' })
          res.end(
            host.requests.length === 1
              ? sse({
                  choices: [
                    {
                      delta: {
                        reasoning_content: 'Need an exact lookup.',
                        reasoning_details: [
                          { type: 'reasoning.encrypted', data: 'opaque-moonshot' },
                        ],
                      },
                    },
                  ],
                }) +
                  sse({
                    choices: [
                      {
                        delta: {
                          tool_calls: [
                            {
                              index: 0,
                              id: 'call_moonshot',
                              function: { name: tool.name, arguments: '{"query":"value"}' },
                            },
                          ],
                        },
                      },
                    ],
                  }) +
                  finish('tool_calls')
              : content('Found it.') + finish(),
          )
        },
        {},
        undefined,
        [definition],
      )
      try {
        const first = await invokeModel({
          ...input,
          transport: host.transport,
          credential: 'test-secret',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        if (!('outcome' in first))
          throw new Error(`first request refused: ${JSON.stringify(first)}`)
        expect(first.outcome).toBe('complete')
        const thinking = first.blocks.find(block => block.kind === 'thinking')
        const call = first.blocks.find(block => block.kind === 'tool_call')
        if (!thinking || thinking.kind !== 'thinking' || !thinking.opaque)
          throw new Error('streamed reasoning was not retained')
        if (!call || call.kind !== 'tool_call' || !call.complete)
          throw new Error('streamed tool call was not retained')
        expect(thinking.text).toBe('Need an exact lookup.')
        expect(call).toMatchObject({ tool: tool.name, arguments: { query: 'value' } })

        const assistant = judgedMessage({
          id: 'moonshot-assistant',
          type: 'assistant',
          response: 'moonshot-response',
          ending: 'complete',
          createdAt: at,
          blocks: first.blocks,
        })
        const toolResult = judgedMessage({
          id: 'moonshot-tool-result',
          type: 'tool',
          callId: call.callId,
          createdAt: at,
          blocks: [
            {
              id: 'moonshot-tool-result-block',
              kind: 'tool_result',
              callId: call.callId,
              outcome: 'completed',
              visibility: { toHuman: true, toModel: true },
              blocks: [
                {
                  id: 'moonshot-tool-result-text',
                  kind: 'text',
                  text: 'value=42',
                  visibility: { toHuman: true, toModel: true },
                },
              ],
            },
          ],
        })
        const second = await invokeModel({
          ...input,
          target: {
            kind: 'model_call',
            callId: unwrap(parseOpaqueIdentifier('moonshot-second-call', 'ModelCallId')),
            dispatch: 1,
          },
          messages: [...input.messages, assistant, toolResult],
          transport: host.transport,
          credential: 'test-secret',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        if (!('outcome' in second))
          throw new Error(`second request refused: ${JSON.stringify(second)}`)
        expect(second.outcome).toBe('complete')
        expect(second.blocks).toMatchObject([{ kind: 'text', text: 'Found it.' }])
        expect(host.requests).toHaveLength(2)
        const request = host.requests[1]
        if (!request) throw new Error('second HTTP request missing')
        const parsed = readJsonStrict(request.body)
        if (!('ok' in parsed)) throw new Error('invalid second HTTP body')
        expect(parsed.ok).toMatchObject({
          provider: { order: [provider], allow_fallbacks: false, require_parameters: true },
          messages: [
            { role: 'user' },
            { role: 'user', content: [{ type: 'text', text: 'Look up value' }] },
            {
              role: 'assistant',
              reasoning_details: [{ type: 'reasoning.encrypted', data: 'opaque-moonshot' }],
              tool_calls: [
                { id: call.callId, function: { name: tool.name, arguments: '{"query":"value"}' } },
              ],
            },
            { role: 'tool', tool_call_id: call.callId, content: 'value=42' },
          ],
        })
        expect(writeJsonLossless(parsed.ok)).not.toContain('cache_control')
      } finally {
        await host.close()
      }
    },
  )
})
