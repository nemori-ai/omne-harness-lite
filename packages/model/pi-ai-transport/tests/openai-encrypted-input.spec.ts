import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { invokeModel, type PlanInput } from '@omne-harness-lite/model-request-runtime'
import { createOfficialProfileContent } from '../src/configuration.ts'
import { createOpenAiInputMeter } from '../src/input-meters/openai.ts'
import { openaiConfiguration, openaiDefinitions } from '../src/official-models/openai.ts'
import { createPiAiTransport } from '../src/transport.ts'
import { createModelTransportService } from '../src/registry.ts'
import {
  at,
  certificate,
  content,
  finish,
  fixture,
  input as testInput,
  judgedMessage,
  policy,
} from './support.ts'

const models = [
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-sol-pro',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-terra-pro',
  'openai/gpt-5.6-luna',
  'openai/gpt-5.6-luna-pro',
]
const unavailable = {
  rejected: 'invalidInput',
  reason: 'input_size_unavailable',
  metrics: ['maxInputTokens'],
}
const encrypted = { type: 'reasoning.encrypted', data: 'fixture-only-ciphertext', index: 0 }
const visibleDetails = [
  {
    type: 'reasoning.text',
    text: 'Consider the visible facts.',
    index: 0,
    id: 'visible-reasoning',
  },
  {
    type: 'reasoning.summary',
    summary: 'Use the available facts.',
    index: 1,
    id: null,
    format: 'openai-responses-v1',
  },
]
function definition(modelId: string) {
  const selected = openaiDefinitions.find(value => value.modelId === modelId)
  if (!selected) throw new Error('missing exact OpenAI definition')
  return selected
}
function request(modelId: string, details: JsonValue[], mixed: boolean): PlanInput {
  const selected = definition(modelId)
  const profile = createOfficialProfileContent(selected, {
    providers: ['openai'],
    allowFallback: false,
    configuration: openaiConfiguration,
  })
  if ('rejected' in profile) throw new Error(profile.rejected)
  const original = testInput()
  return {
    ...original,
    routeName: modelId,
    provider: 'openai',
    tokenMargin: { multiplier: 1.1, reserveTokens: 64 },
    messages: [
      ...original.messages,
      judgedMessage({
        id: 'previous-assistant',
        type: 'assistant',
        response: 'previous-response',
        ending: 'complete',
        createdAt: at,
        blocks: [
          {
            id: 'previous-thinking',
            kind: 'thinking',
            text: '',
            opaque: { routeName: modelId, reasoning_details: details },
            visibility: { toHuman: false, toModel: true },
          },
          ...(mixed
            ? [
                {
                  id: 'previous-text',
                  kind: 'text',
                  text: 'Visible answer.',
                  visibility: { toHuman: true, toModel: true },
                },
              ]
            : []),
        ],
      }),
    ],
    snapshot: {
      ...original.snapshot,
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      inputModalities: profile.ok.inputModalities,
      outputModalities: profile.ok.outputModalities,
      maxInputTokens: profile.ok.maxInputTokens,
      maxOutputTokens: profile.ok.maxOutputTokens,
      inputConstraints: profile.ok.inputConstraints,
      upstreamInputLimits: profile.ok.upstreamInputLimits,
    },
  }
}

describe('OpenAI encrypted replay has no applicable input-token estimate', () => {
  let cert: ReturnType<typeof certificate>
  beforeAll(() => {
    cert = certificate()
  })
  afterAll(() => cert.dispose())

  it.each(models)(
    '%s refuses complete and mixed encrypted history before public HTTP, retaining the entire projection',
    async modelId => {
      const selected = definition(modelId)
      const meter = createOpenAiInputMeter(selected)
      const measured: { body: JsonObject; serialized: string }[] = []
      const host = await fixture(
        cert.tls,
        res => res.end(content('unexpected') + finish()),
        {},
        undefined,
        [selected],
      )
      const transport = createPiAiTransport({
        ...host.options,
        definitions: [selected],
        inputMeters: [
          {
            ...meter,
            measure(value) {
              // Observe the real serializer while retaining the real meter's rejection.
              // This wrapper never supplies synthetic successful measurement evidence.
              measured.push({ body: value.body, serialized: value.serialized })
              return meter.measure(value)
            },
          },
        ],
      })
      try {
        for (const mixed of [false, true]) {
          const details = mixed ? [...visibleDetails, encrypted] : [encrypted]
          const input = request(modelId, details, mixed)
          const before = writeJsonLossless(input)
          expect(transport.plan(input)).toEqual(unavailable)
          const projected = measured.at(-1)
          expect(projected?.body.messages).toContainEqual({
            role: 'assistant',
            content: mixed ? 'Visible answer.' : '',
            reasoning_details: details,
          })
          expect(projected?.serialized).toContain('fixture-only-ciphertext')
          if (mixed) expect(projected?.serialized).toContain('Visible answer.')
          let accepted = 0
          let gates = 0
          const invoked = await invokeModel({
            ...input,
            transport,
            credential: 'controlled-local-credential',
            signal: new AbortController().signal,
            policy: policy(),
            onAccepted: () => {
              accepted++
            },
            beforeFirstContent: async () => {
              gates++
            },
          }).outcome
          expect(invoked).toEqual(unavailable)
          expect(accepted).toBe(0)
          expect(gates).toBe(0)
          expect(writeJsonLossless(input)).toBe(before)
          expect(host.requests).toHaveLength(0)
        }
      } finally {
        await transport.close()
        await host.close()
      }
    },
  )

  it.each(models)(
    '%s retains visible text and summary details but refuses uninterpretable detail shapes',
    modelId => {
      const meter = createOpenAiInputMeter(definition(modelId))
      const measure = (details: JsonValue) => {
        const body = {
          model: modelId,
          messages: [{ role: 'assistant', content: '', reasoning_details: details }],
        }
        const serialized = writeJsonLossless(body)
        const result = meter.measure({ body, serialized })
        expect(writeJsonLossless(body)).toBe(serialized)
        return result
      }
      expect(measure(visibleDetails)).toMatchObject({ kind: 'estimated' })
      expect(measure([])).toMatchObject({ kind: 'estimated' })
      for (const details of [
        [encrypted],
        [...visibleDetails, encrypted],
        [{ type: 'reasoning.future', data: 'unknown' }],
        [{ type: 'reasoning.text', text: 'visible', data: 'unexplained' }],
        [{ type: 'reasoning.summary', summary: 'visible', signature: 'unexplained' }],
        [{ type: 'reasoning.text', text: 'visible', id: { data: 'unexplained' } }],
        [{ type: 'reasoning.text', text: 'visible', format: { data: 'unexplained' } }],
        [{ type: 'reasoning.text', text: 'visible', index: -1 }],
        [{ type: 'reasoning.text', text: null }],
        { type: 'reasoning.encrypted', data: 'not-an-array' },
      ])
        expect(measure(details)).toEqual({ kind: 'unavailable' })
    },
  )

  it.each(models)(
    '%s requires a new exact definition and implementation, without a legacy alias',
    async modelId => {
      const selected = definition(modelId)
      const meter = createOpenAiInputMeter(selected)
      expect(selected).toMatchObject({
        revision: '4',
        implementation: { name: 'pi-ai:openai', revision: 'mp4-5' },
      })
      expect(meter.algorithmRevision).toBe('openai-gpt-5.6-o200k-base-4')
      for (const old of [
        { ...selected, revision: '3' },
        { ...selected, implementation: { ...selected.implementation, revision: 'mp4-3' } },
        {
          ...selected,
          revision: '3',
          implementation: { ...selected.implementation, revision: 'mp4-3' },
        },
      ])
        expect(() => createOpenAiInputMeter(old)).toThrow(TypeError)
      const host = await fixture(cert.tls, res => res.end(finish()), {}, undefined, [selected])
      const service = createModelTransportService(host.options)
      try {
        const legacyMeter = {
          ...meter,
          definitionRevision: '3',
          implementation: { ...meter.implementation, revision: 'mp4-3' },
        }
        expect(service.registerAdaptation(selected, legacyMeter, {}, () => {})).toEqual({
          rejected: 'invalidInput',
        })
        expect(service.registerAdaptation(selected, meter, {}, () => {})).toHaveProperty(
          'registered',
        )
        const current = request(modelId, visibleDetails, true)
        expect(
          service.acquire(
            {
              ...current.snapshot.adaptation,
              definition: { modelId, revision: '3' },
              implementation: { name: 'pi-ai:openai', revision: 'mp4-3' },
            },
            modelId,
          ),
        ).toEqual({ rejected: 'unavailable' })
        expect(host.requests).toHaveLength(0)
      } finally {
        await service.close({
          force: false,
          waitMilliseconds: 20,
          schedule(ms, callback) {
            const timer = setTimeout(callback, ms)
            return () => clearTimeout(timer)
          },
        })
        await service.closed
        await host.close()
      }
    },
  )
})
