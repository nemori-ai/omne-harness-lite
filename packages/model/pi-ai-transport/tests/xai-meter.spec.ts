import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  jsonNumberSource,
  writeJsonLossless,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import {
  createOfficialProfileContent,
  createPiAiTransport,
} from '@omne-harness-lite/pi-ai-transport'
import { createXaiInputMeter } from '../src/input-meters/xai.ts'
import { xaiDefinitions } from '../src/official-models/xai.ts'
import type { ModelDefinition } from '../src/definitions.ts'
import { certificate, content, finish, fixture, judgedMessage, policy } from './support.ts'

interface Golden {
  readonly scenario: string
  readonly body: JsonObject
  readonly wireSha256: string
  readonly requestBytes: number
  readonly totalPromptTokens: number
}
const rows: readonly Golden[] = JSON.parse(
  readFileSync(new URL('./fixtures/xai/grok46-text-calibration.json', import.meta.url), 'utf8'),
)
const definition = xaiDefinitions.find(item => item.modelId === 'x-ai/grok-4.6')!
function requiredMeter(value: ModelDefinition) {
  const meter = createXaiInputMeter(value)
  if (!meter) throw new Error('missing bound meter')
  return meter
}
const meter = requiredMeter(definition)

describe('Grok 4.6 limited visible text/tool estimate', () => {
  it.each(rows)(
    'keeps exact frozen $scenario wire and independent complete prompt observation',
    row => {
      const serialized = writeJsonLossless(row.body)
      expect(Buffer.byteLength(serialized, 'utf8')).toBe(row.requestBytes)
      expect(createHash('sha256').update(serialized).digest('hex')).toBe(row.wireSha256)
      const expected =
        row.scenario === 'fit-short' ? 219 : row.scenario === 'fit-multilingual' ? 241 : 369
      expect(meter.measure({ body: row.body, serialized })).toEqual({
        kind: 'estimated',
        tokens: expected,
      })
      expect(expected - row.totalPromptTokens).toBe(
        row.scenario === 'fit-short' ? 0 : row.scenario === 'fit-multilingual' ? 1 : 35,
      )
    },
  )
  it('binds only exact current 4.6 definition, never uncalibrated 4.7 or old revision', () => {
    expect(
      createXaiInputMeter(xaiDefinitions.find(item => item.modelId === 'x-ai/grok-4.7')!),
    ).toBeUndefined()
    expect(
      createXaiInputMeter({
        ...definition,
        implementation: { ...definition.implementation, revision: 'mp4-1' },
      }),
    ).toBeUndefined()
    expect(
      createXaiInputMeter({
        ...definition,
        capabilities: { ...definition.capabilities, maxInputTokens: 49999 },
      }),
    ).toBeUndefined()
  })
  it('handles actual JsonNumber bytes and refuses mismatched serialization', () => {
    const body = { ...rows[0]!.body, max_tokens: new LosslessNumber('128') }
    expect(meter.measure({ body, serialized: writeJsonLossless(body) })).toEqual({
      kind: 'estimated',
      tokens: 219,
    })
    expect(meter.measure({ body, serialized: '{}' })).toEqual({ kind: 'unavailable' })
  })
  it('refuses opaque/media/unknown controls without removing historical input', () => {
    const body = rows[2]!.body
    const original = writeJsonLossless(body)
    const unsupported = [
      {
        ...body,
        messages: [
          ...(body.messages as readonly JsonObject[]),
          {
            role: 'assistant',
            content: 'prior',
            reasoning_details: [{ type: 'reasoning.encrypted', data: 'ciphertext' }],
          },
        ],
      },
      {
        ...body,
        messages: [
          ...(body.messages as readonly JsonObject[]),
          {
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,YQ==' } }],
          },
        ],
      },
      {
        ...body,
        messages: [
          ...(body.messages as readonly JsonObject[]),
          {
            role: 'user',
            content: [{ type: 'input_audio', input_audio: { data: 'YQ==', format: 'wav' } }],
          },
        ],
      },
      { ...body, reasoning: { effort: 'low' } },
      { ...body, temperature: new LosslessNumber('0.5') },
      { ...body, tools: [{ type: 'web_search' }] },
    ]
    for (const input of unsupported)
      expect(meter.measure({ body: input, serialized: writeJsonLossless(input) })).toEqual({
        kind: 'unavailable',
      })
    expect(writeJsonLossless(body)).toBe(original)
  })
  it.each(xaiDefinitions.filter(item => item.modelId === 'x-ai/grok-4.6'))(
    '$modelId plans once and sends identical candidate-measured bytes over local TLS',
    async definition => {
      const profile = createOfficialProfileContent(definition, {
        providers: ['xai'],
        allowFallback: false,
        configuration: { revision: '1', values: { cache: { mode: 'automatic' } } },
      })
      if ('rejected' in profile) throw new Error(profile.rejected)
      const input: PlanInput = {
        tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
        target: {
          kind: 'model_call',
          callId: unwrap(parseOpaqueIdentifier('xai-candidate-call', 'ModelCallId')),
          dispatch: 1,
        },
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
          updatedAt: '2026-09-28T00:00:00Z',
        },
        parameters: { maxOutputTokens: 128 },
        tools: [],
        messages: [
          judgedMessage({
            id: 'xai-candidate-user',
            type: 'user',
            createdAt: '2026-09-28T00:00:00Z',
            blocks: [
              {
                id: 'xai-candidate-text',
                kind: 'text',
                text: 'hello',
                visibility: { toHuman: true, toModel: true },
              },
            ],
          }),
        ],
      }
      const cert = certificate()
      const host = await fixture(
        cert.tls,
        res => res.end(content('ok') + finish()),
        {},
        undefined,
        [definition],
      )
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [definition],
        inputMeters: [requiredMeter(definition)],
      })
      try {
        const planned = transport.plan(input)
        if ('rejected' in planned) throw new Error(planned.rejected)
        expect(planned.planned.inputLimitEvidence).toMatchObject({
          inputTokens: { kind: 'estimated' },
          meterRevision: 'grok-build-visible-text-tools-offset141-1',
        })
        const evidence = planned.planned.inputLimitEvidence
        if (evidence.inputTokens.kind !== 'estimated' || evidence.admissionTokens === undefined)
          throw new Error('expected estimate and admitted token count')
        expect(Number(jsonNumberSource(evidence.admissionTokens))).toBe(
          Math.ceil(Number(jsonNumberSource(evidence.inputTokens.tokens)) * 1.2) + 32,
        )
        const result = await invokeModel({
          ...input,
          transport,
          credential: 'local-test-secret',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        expect(result).toMatchObject({ outcome: 'complete' })
        expect(host.requests).toHaveLength(1)
        expect(host.requests[0]?.body).toBe(planned.planned.serialized)
      } finally {
        await transport.close()
        await host.close()
        cert.dispose()
      }
    },
  )
})
