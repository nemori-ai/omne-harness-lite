import { imagePreparation } from './image-transport-support.ts'
import { directFull } from './direct-full-input.ts'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { writeJsonLossless, type JsonObject } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import {
  createOfficialProfileContent,
  createPiAiTransport,
} from '@omne-harness-lite/pi-ai-transport'
import { createXaiCandidateInputMeter } from '../src/input-meters/xai-candidate.ts'
import { xaiDefinitions } from '../src/official-models/xai.ts'
import { certificate, content, finish, fixture, judgedMessage, policy } from './support.ts'

interface Golden {
  readonly modelId: string
  readonly scenario: string
  readonly body: JsonObject
}
const rows: readonly Golden[] = JSON.parse(
  readFileSync(new URL('./fixtures/xai/authentication-cases.json', import.meta.url), 'utf8'),
)

describe('unbound Grok Build candidate', () => {
  it.each(rows)('counts the independent $modelId/$scenario final-wire golden', row => {
    const definition = xaiDefinitions.find(item => item.modelId === row.modelId)
    if (!definition) throw new Error('missing xAI definition')
    const meter = createXaiCandidateInputMeter(definition)
    expect(meter.algorithmRevision).toBe('grok-build-wire-projection-candidate-1')
    expect(directFull(meter, { body: row.body, serialized: writeJsonLossless(row.body) })).toEqual({
      kind: 'estimated',
      tokens: row.scenario === 'image' ? 836 : 175,
    })
  })

  it('retains complete tool/history/reasoning contributions and fails closed on opaque replay', () => {
    const definition = xaiDefinitions[0]
    const source = rows.find(
      row => row.modelId === definition?.modelId && row.scenario === 'tool_text',
    )
    if (!definition || !source) throw new Error('missing fixture')
    const meter = createXaiCandidateInputMeter(definition)
    const base = directFull(meter, {
      body: source.body,
      serialized: writeJsonLossless(source.body),
    })
    const history = {
      ...source.body,
      messages: [
        ...(Array.isArray(source.body.messages) ? source.body.messages : []),
        {
          role: 'assistant',
          content: 'prior answer',
          reasoning: 'checked',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'lookup__xai', arguments: '{"key":"alpha"}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', content: 'alpha=42' },
      ],
    }
    const later = directFull(meter, { body: history, serialized: writeJsonLossless(history) })
    expect(base.kind).toBe('estimated')
    expect(later.kind).toBe('estimated')
    if (base.kind !== 'estimated' || later.kind !== 'estimated')
      throw new Error('candidate unavailable')
    expect(Number(later.tokens)).toBeGreaterThan(Number(base.tokens))
    expect(
      directFull(meter, {
        body: {
          ...history,
          messages: [
            ...history.messages,
            {
              role: 'assistant',
              content: '',
              reasoning_details: [{ type: 'reasoning.encrypted', data: 'abc' }],
            },
          ],
        },
        serialized: writeJsonLossless({
          ...history,
          messages: [
            ...history.messages,
            {
              role: 'assistant',
              content: '',
              reasoning_details: [{ type: 'reasoning.encrypted', data: 'abc' }],
            },
          ],
        }),
      }),
    ).toEqual({ kind: 'unavailable' })
    expect(directFull(meter, { body: source.body, serialized: '{}' })).toEqual({
      kind: 'unavailable',
    })
  })

  it.each(xaiDefinitions)(
    '$modelId plans once and sends identical candidate-measured bytes over local TLS',
    async definition => {
      const profile = createOfficialProfileContent(definition, {
        providers: ['xai'],
        allowFallback: false,
        configuration: { revision: '1', values: { cache: { mode: 'automatic' } } },
      })
      if ('rejected' in profile) throw new Error(profile.rejected)
      const input: PlanInput = {
        calibration: { kind: 'none' as const, reason: 'no_observation' as const },
        outputHistory: [],
        tokenMargin: { multiplier: 1, reserveTokens: 0 },
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
        inputMeters: [createXaiCandidateInputMeter(definition)],
      })
      try {
        const planned = await transport.plan(input, { signal: new AbortController().signal })
        if ('rejected' in planned) throw new Error(planned.rejected)
        expect(planned.planned.inputLimitEvidence).toMatchObject({
          inputTokens: { kind: 'estimated' },
          meterRevision: 'grok-build-wire-projection-candidate-1',
        })
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
