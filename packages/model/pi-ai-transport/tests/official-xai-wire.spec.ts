import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { ModelRequestParameters } from '@omne-harness-lite/model-profile'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
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
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/yWQAAAAASUVORK5CYII='
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

function multiRoundInput(definition: (typeof definitions)[number]): PlanInput {
  const base = request(definition, { reasoningEffort: 'high', maxOutputTokens: 256 })
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

function authenticationInput(definition: (typeof definitions)[number]): PlanInput {
  const base = request(definition, { reasoningEffort: 'high', maxOutputTokens: 128 })
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

function imageAuthenticationInput(definition: (typeof definitions)[number]): PlanInput {
  return {
    ...request(definition, { maxOutputTokens: 128 }),
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
  it('keeps credential-free authentication cases aligned with the public planner', () => {
    const cases: unknown = JSON.parse(
      readFileSync(new URL('./fixtures/xai/authentication-cases.json', import.meta.url), 'utf8'),
    )
    if (!Array.isArray(cases)) throw new Error('invalid xAI authentication cases')
    const rows: readonly unknown[] = cases
    for (const [scenario, input] of [
      ['tool_text', authenticationInput(definition)],
      ['image', imageAuthenticationInput(definition)],
    ] as const) {
      const planned = planRequest(input, [definition], syntheticInputMeter(definition, 'xai'))
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
      expect(selected.body).toEqual(body)
    }
  })

  it('keeps the exact contribution unavailable without an applicable model meter and sends no HTTP', async () => {
    const input = multiRoundInput(definition)
    expect(planRequest(input, [definition])).toEqual({ rejected: 'unavailable' })
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
      expect(noMeter.plan(input)).toEqual({ rejected: 'unavailable' })
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
    const input = multiRoundInput(definition)
    const meter = syntheticInputMeter(definition, 'xai')
    const planned = planRequest(input, [definition], meter)
    if ('rejected' in planned) throw new Error(planned.rejected)
    expect(planned.planned.inputLimitEvidence).toMatchObject({
      meterRevision: 'synthetic-route-tests-1',
      requestBytes: Buffer.byteLength(planned.planned.serialized),
      imageBytes: [68],
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
})
