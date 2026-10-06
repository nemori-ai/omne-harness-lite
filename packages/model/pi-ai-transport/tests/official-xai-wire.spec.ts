import { testImagePreparerFor, imagePreparation } from './image-transport-support.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { ModelRequestParameters } from '@omne-harness-lite/model-profile'
import { invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import { type PlanInput } from '@omne-harness-lite/model-request-runtime'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import {
  createOfficialProfileContent,
  createPiAiTransport,
  planRequest,
} from '@omne-harness-lite/pi-ai-transport'
import { xaiDefinitions } from '../src/official-models/xai.ts'
import { syntheticInputMeter } from './synthetic-input-meter.ts'
import { certificate, content, finish, fixture, judgedMessage, policy, sse } from './support.ts'

const at = '2026-09-28T00:00:00Z'
const visible = { toHuman: true, toModel: true }
const pixel =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='
const tool: ModelToolEntry = {
  name: 'lookup__xai',
  description: 'Look up a value by key',
  parameters: {
    type: 'object',
    properties: { key: { type: 'string' } },
    required: ['key'],
    additionalProperties: false,
  },
}
const definitions = xaiDefinitions
let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

function request(
  definition: (typeof definitions)[number],
  parameters: ModelRequestParameters = {},
): PlanInput {
  const profile = createOfficialProfileContent(definition, {
    providers: ['xai'],
    allowFallback: false,
    configuration: { revision: '1', values: { cache: { mode: 'automatic' } } },
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  return {
    calibration: { kind: 'none' as const, reason: 'no_observation' as const },
    outputHistory: [],
    tokenMargin: { multiplier: 1.2, reserveTokens: 8 },
    target: { kind: 'model_call', callId: 'xai-wire-call', dispatch: 1 },
    routeName: definition.modelId,
    provider: 'xai',
    snapshot: {
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      inputModalities: profile.ok.inputModalities,
      outputModalities: profile.ok.outputModalities,
      maxInputTokens: profile.ok.maxInputTokens,
      maxOutputTokens: profile.ok.maxOutputTokens,
      inputConstraints: profile.ok.inputConstraints,
      upstreamInputLimits: profile.ok.upstreamInputLimits,
      updatedAt: at,
    },
    parameters,
    messages: [],
    tools: [],
  }
}

async function multiRoundInput(definition: (typeof definitions)[number]): Promise<PlanInput> {
  const base = await request(definition, { reasoningEffort: 'high', maxOutputTokens: 256 })
  const messages = [
    judgedMessage({
      id: 'xai-system',
      type: 'system',
      createdAt: at,
      blocks: [
        { id: 'xai-system-text', kind: 'text', text: 'Answer briefly', visibility: visible },
      ],
    }),
    judgedMessage({
      id: 'xai-reminder',
      type: 'system_reminder',
      createdAt: at,
      nature: 'event',
      source: { kind: 'attempt_started', attempt: 1, reason: 'first', at },
      blocks: [
        {
          id: 'xai-reminder-text',
          kind: 'text',
          text: 'Keep the cited value',
          visibility: visible,
        },
      ],
    }),
    judgedMessage({
      id: 'xai-assistant',
      type: 'assistant',
      response: 'xai-prior-response',
      ending: 'complete',
      createdAt: at,
      blocks: [
        { id: 'xai-thinking', kind: 'thinking', text: 'Need lookup', visibility: visible },
        {
          id: 'xai-call',
          kind: 'tool_call',
          callId: 'call_xai_1',
          tool: tool.name,
          complete: true,
          arguments: { key: 'alpha' },
          visibility: visible,
        },
      ],
    }),
    judgedMessage({
      id: 'xai-tool',
      type: 'tool',
      callId: 'call_xai_1',
      createdAt: at,
      blocks: [
        {
          id: 'xai-result',
          kind: 'tool_result',
          callId: 'call_xai_1',
          outcome: 'completed',
          visibility: visible,
          blocks: [{ id: 'xai-result-text', kind: 'text', text: 'alpha=42', visibility: visible }],
        },
      ],
    }),
    judgedMessage({
      id: 'xai-user',
      type: 'user',
      createdAt: at,
      blocks: [
        { id: 'xai-user-text', kind: 'text', text: 'Describe this image', visibility: visible },
        {
          id: 'xai-image',
          kind: 'image',
          mediaType: 'image/png',
          data: { inline: pixel },
          visibility: visible,
        },
      ],
    }),
  ]
  return { ...base, messages, tools: [tool] }
}

async function authenticationInput(definition: (typeof definitions)[number]): Promise<PlanInput> {
  const base = await request(definition, { reasoningEffort: 'high', maxOutputTokens: 128 })
  return {
    ...base,
    messages: [
      judgedMessage({
        id: 'xai-system',
        type: 'system',
        createdAt: at,
        blocks: [
          { id: 'xai-system-text', kind: 'text', text: 'Answer briefly', visibility: visible },
        ],
      }),
      judgedMessage({
        id: 'xai-reminder',
        type: 'system_reminder',
        createdAt: at,
        nature: 'event',
        source: { kind: 'attempt_started', attempt: 1, reason: 'first', at },
        blocks: [
          {
            id: 'xai-reminder-text',
            kind: 'text',
            text: 'Keep the cited value',
            visibility: visible,
          },
        ],
      }),
      judgedMessage({
        id: 'xai-user',
        type: 'user',
        createdAt: at,
        blocks: [
          {
            id: 'xai-user-text',
            kind: 'text',
            text: 'Use lookup__xai to find alpha',
            visibility: visible,
          },
        ],
      }),
    ],
    tools: [tool],
  }
}

async function imageAuthenticationInput(
  definition: (typeof definitions)[number],
): Promise<PlanInput> {
  return {
    ...(await request(definition, { maxOutputTokens: 128 })),
    messages: [
      judgedMessage({
        id: 'xai-image-user',
        type: 'user',
        createdAt: at,
        blocks: [
          {
            id: 'xai-image-question',
            kind: 'text',
            text: 'Describe this image',
            visibility: visible,
          },
          {
            id: 'xai-auth-image',
            kind: 'image',
            mediaType: 'image/png',
            data: { inline: pixel },
            visibility: visible,
          },
        ],
      }),
    ],
  }
}

describe.each(definitions)('$modelId fixed xai request', definition => {
  it('keeps credential-free authentication cases aligned with the public planner', async () => {
    const cases: unknown = JSON.parse(
      readFileSync(new URL('./fixtures/xai/authentication-cases.json', import.meta.url), 'utf8'),
    )
    if (!Array.isArray(cases)) throw new Error('invalid xAI authentication cases')
    const rows: readonly unknown[] = cases
    for (const [scenario, input] of [
      ['tool_text', await authenticationInput(definition)],
      ['image', await imageAuthenticationInput(definition)],
    ] as const) {
      const planned = await planRequest(
        input,
        [definition],
        syntheticInputMeter(definition, 'xai'),
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
      )
      if ('rejected' in planned) throw new Error(planned.rejected)
      const body: unknown = JSON.parse(planned.planned.serialized)
      const selected = rows.find(
        row =>
          typeof row === 'object' &&
          row !== null &&
          'modelId' in row &&
          row.modelId === definition.modelId &&
          'scenario' in row &&
          row.scenario === scenario,
      )
      if (!selected || typeof selected !== 'object' || !('body' in selected))
        throw new Error(`missing xAI authentication case: ${definition.modelId}/${scenario}`)
      // The archived authentication vector used a PNG with invalid native data.
      // D109 uses a real decoded 1x1 PNG here; all other archived fields remain exact.
      const expected = writeJsonLossless(selected.body).replace(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/yWQAAAAASUVORK5CYII=',
        pixel,
      )
      expect(JSON.parse(expected)).toEqual(body)
    }
  })

  it('keeps the exact contribution unavailable without an applicable model meter and sends no HTTP', async () => {
    const input = await multiRoundInput(definition)
    expect(
      await planRequest(
        input,
        [definition],
        undefined,
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
      ),
    ).toEqual({ rejected: 'unavailable' })
    const host = await fixture(
      cert.tls,
      res => res.end(content('unexpected') + finish()),
      {},
      undefined,
      [definition],
    )
    const noMeter = createPiAiTransport({
      ...host.options,
      definitions: [definition],
      inputMeters: [],
    })
    try {
      expect(await noMeter.plan(input, { signal: new AbortController().signal })).toEqual({
        rejected: 'unavailable',
      })
      expect(
        await invokeModel({
          ...input,
          transport: noMeter,
          credential: 'local-test-secret',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome,
      ).toEqual({ rejected: 'unavailable' })
      expect(host.requests).toHaveLength(0)
    } finally {
      await noMeter.close()
      await host.close()
    }
  })

  it('sends the planned final body over local TLS, keeping history, tool schema, image, cache and upstream usage distinct', async () => {
    const input = await multiRoundInput(definition)
    const meter = syntheticInputMeter(definition, 'xai')
    const planned = await planRequest(
      input,
      [definition],
      meter,
      {
        signal: new AbortController().signal,
      },
      testImagePreparerFor(planRequest),
    )
    if ('rejected' in planned) throw new Error(planned.rejected)
    expect(planned.planned.inputLimitEvidence).toMatchObject({
      meterRevision: 'synthetic-route-tests-1',
      requestBytes: Buffer.byteLength(planned.planned.serialized),
      imageBytes: [Buffer.from(pixel, 'base64').length],
      images: 1,
    })
    const parsed = readJsonStrict(planned.planned.serialized)
    if (!('ok' in parsed)) throw new Error(parsed.failed)
    expect(parsed.ok).toMatchObject({
      model: definition.modelId,
      provider: { order: ['xai'], allow_fallbacks: false, require_parameters: true },
      reasoning: { effort: 'high' },
      max_tokens: 256,
      tools: [{ type: 'function', function: tool }],
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'Answer briefly' }] },
        {
          role: 'user',
          content: [
            { type: 'text', text: '[system_reminder "xai-reminder"]' },
            { type: 'text', text: 'Keep the cited value' },
          ],
        },
        { role: 'assistant', reasoning: 'Need lookup', tool_calls: [{ id: 'call_xai_1' }] },
        { role: 'tool', tool_call_id: 'call_xai_1', content: 'alpha=42' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${pixel}` } },
          ],
        },
      ],
    })
    expect(writeJsonLossless(parsed.ok)).not.toContain('cache_control')
    expect(writeJsonLossless(parsed.ok)).not.toContain('ttl')
    const host = await fixture(
      cert.tls,
      res =>
        res.end(
          content('answer') +
            sse({
              choices: [],
              usage: {
                prompt_tokens: 31,
                completion_tokens: 2,
                prompt_tokens_details: { cached_tokens: 7, cache_write_tokens: 0 },
                cost: 0.001,
              },
            }) +
            finish(),
        ),
      {},
      undefined,
      [definition],
    )
    try {
      const result = await invokeModel({
        ...input,
        transport: host.transport,
        credential: 'local-test-secret',
        signal: new AbortController().signal,
        policy: policy(),
      }).outcome
      if (!('outcome' in result)) throw new Error(`invocation refused: ${JSON.stringify(result)}`)
      expect(result.outcome).toBe('complete')
      expect(result.usage).toMatchObject({
        source: 'upstream',
        output_tokens: 2,
        cache_read_tokens: 7,
        cache_write_tokens: 0,
      })
      expect(writeJsonLossless(result.usage)).toContain('"input_tokens":24')
      expect(host.requests).toHaveLength(1)
      expect(host.requests[0]).toMatchObject({ method: 'POST', path: '/api/v1/chat/completions' })
      expect(host.requests[0]?.body).toBe(planned.planned.serialized)
      expect(host.requests[0]?.headers.authorization).toBe('Bearer local-test-secret')
    } finally {
      await host.close()
    }
  })

  it('replays streamed reasoning and a completed tool call on the same exact route', async () => {
    const input = await authenticationInput(definition)
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
                      reasoning_details: [
                        {
                          type: 'reasoning.text',
                          text: 'Lookup required',
                          signature: 'xai-opaque',
                        },
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
                            id: 'call_xai_stream',
                            function: { name: tool.name, arguments: '{"key":' },
                          },
                        ],
                      },
                    },
                  ],
                }) +
                sse({
                  choices: [
                    { delta: { tool_calls: [{ index: 0, function: { arguments: '"alpha"}' } }] } },
                  ],
                }) +
                finish('tool_calls')
            : content('alpha=42') + finish(),
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
        credential: 'local-test-secret',
        signal: new AbortController().signal,
        policy: policy(),
      }).outcome
      if (!('outcome' in first)) throw new Error(`first request refused: ${JSON.stringify(first)}`)
      expect(first.outcome).toBe('complete')
      const thinking = first.blocks.find(block => block.kind === 'thinking')
      const call = first.blocks.find(block => block.kind === 'tool_call')
      if (!thinking || thinking.kind !== 'thinking' || !thinking.opaque)
        throw new Error('streamed reasoning was not retained')
      if (!call || call.kind !== 'tool_call' || !call.complete)
        throw new Error('streamed tool call was not completed')
      expect(call).toMatchObject({
        callId: expect.stringMatching(/^call_/),
        tool: tool.name,
        arguments: { key: 'alpha' },
      })

      const assistant = judgedMessage({
        id: 'xai-stream-assistant',
        type: 'assistant',
        response: 'xai-stream-response',
        ending: 'complete',
        createdAt: at,
        blocks: first.blocks,
      })
      const toolResult = judgedMessage({
        id: 'xai-stream-tool',
        type: 'tool',
        callId: call.callId,
        createdAt: at,
        blocks: [
          {
            id: 'xai-stream-result',
            kind: 'tool_result',
            callId: call.callId,
            outcome: 'completed',
            visibility: visible,
            blocks: [
              { id: 'xai-stream-value', kind: 'text', text: 'alpha=42', visibility: visible },
            ],
          },
        ],
      })
      const second = await invokeModel({
        ...input,
        target: { kind: 'model_call', callId: 'xai-stream-second-call', dispatch: 1 },
        messages: [...input.messages, assistant, toolResult],
        transport: host.transport,
        credential: 'local-test-secret',
        signal: new AbortController().signal,
        policy: policy(),
      }).outcome
      if (!('outcome' in second))
        throw new Error(`second request refused: ${JSON.stringify(second)}`)
      expect(second.outcome).toBe('complete')
      expect(host.requests).toHaveLength(2)
      const wire = host.requests[1]
      if (!wire) throw new Error('second HTTP request missing')
      const parsed = readJsonStrict(wire.body)
      if (!('ok' in parsed)) throw new Error(parsed.failed)
      expect(parsed.ok).toMatchObject({
        model: definition.modelId,
        provider: { order: ['xai'], allow_fallbacks: false, require_parameters: true },
        messages: [
          { role: 'system' },
          { role: 'user' },
          { role: 'user' },
          {
            role: 'assistant',
            reasoning_details: [
              { type: 'reasoning.text', text: 'Lookup required', signature: 'xai-opaque' },
            ],
            tool_calls: [
              {
                id: call.callId,
                function: { name: tool.name, arguments: '{"key":"alpha"}' },
              },
            ],
          },
          { role: 'tool', tool_call_id: call.callId, content: 'alpha=42' },
        ],
      })
    } finally {
      await host.close()
    }
  })
})
