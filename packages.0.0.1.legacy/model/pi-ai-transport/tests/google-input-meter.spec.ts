// @module-tag slow
// 归慢层：网络＋重 CPU：经本地 HTTPS 服务（openssl 现生成证书）走真实传输与读取，输入计量用真实分词器。
import { testImagePreparerFor, imagePreparation } from './image-transport-support.ts'
import { directFull } from './direct-full-input.ts'
import { describe, expect, it } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import {
  createModelTransportService,
  createPiAiTransport,
  planRequest,
} from '@omne-harness-lite/pi-ai-transport'
import { createGoogleInputMeter } from '../src/input-meters/google.ts'
import { googleDefinitions } from '../src/official-models/google.ts'
import { googleCalibrationRequest } from './fixtures/google/calibration.ts'
import { googleCertificationRequest } from './fixtures/google/cases.ts'
import { certificate, content, finish, fixture, policy, sse } from './support.ts'

const expected = { F1: 16, F2: 90, H1: 34, H2: 154 } as const
const retirement = {
  waitMilliseconds: 30,
  force: false,
  schedule: (ms: number, callback: () => void) => {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}

describe('Google AI Studio rough text/tool input meter', () => {
  it.each(googleDefinitions)(
    '$modelId limits effort to its declared structure',
    async definition => {
      const meter = createGoogleInputMeter(definition)
      if (!meter) throw new Error('Google meter unavailable')
      const input = googleCalibrationRequest(definition.modelId, 'H2')
      const base = await planRequest(
        input,
        [definition],
        meter,
        {
          signal: new AbortController().signal,
        },
        testImagePreparerFor(planRequest),
      )
      if ('rejected' in base) throw new Error(JSON.stringify(base))
      for (const effort of ['low', 'medium', 'high'] as const) {
        const result = await planRequest(
          { ...input, parameters: { ...input.parameters, reasoningEffort: effort } },
          [definition],
          meter,
          { signal: new AbortController().signal },
          testImagePreparerFor(planRequest),
        )
        if ('rejected' in result) throw new Error(JSON.stringify(result))
        expect(result.planned.body.reasoning).toEqual({ effort })
        expect(result.planned.inputLimitEvidence.inputTokens).toEqual(
          base.planned.inputLimitEvidence.inputTokens,
        )
        expect(result.planned.inputLimitEvidence.admissionTokens).toBe(
          base.planned.inputLimitEvidence.admissionTokens,
        )
        expect(result.planned.body.messages).toEqual(base.planned.body.messages)
        expect(result.planned.body.tools).toEqual(base.planned.body.tools)
      }
      for (const reasoning of [
        {},
        { effort: 'none' },
        { effort: 'max' },
        { effort: 3 },
        { effort: 'low', unknown: true },
      ]) {
        const body = { ...base.planned.body, reasoning }
        expect(directFull(meter, { body, serialized: writeJsonLossless(body) })).toEqual({
          kind: 'unavailable',
        })
      }
      const dropped = await planRequest(
        { ...input, parameters: { ...input.parameters, reasoningEffort: 'none' } },
        [definition],
        meter,
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
      )
      if ('rejected' in dropped) throw new Error(JSON.stringify(dropped))
      expect(dropped.planned.body.reasoning).toBeUndefined()
      expect(dropped.planned.droppedParameters).toContain('reasoningEffort')
    },
  )

  it.each(googleDefinitions)(
    '$modelId reproduces frozen fit and holdout features',
    async definition => {
      const meter = createGoogleInputMeter(definition)
      if (!meter) throw new Error('Google meter unavailable')
      expect(meter).toMatchObject({
        modelId: definition.modelId,
        definitionRevision: definition.revision,
        implementation: definition.implementation,
        provider: 'google-ai-studio',
        algorithmRevision: 'gemma4-visible-text-tools-effort-offset6-2',
      })
      expect(
        createGoogleInputMeter({
          ...definition,
          revision: '1',
          implementation: { name: 'pi-ai:google', revision: 'mp4-2' },
        }),
      ).toBeUndefined()
      expect(
        createGoogleInputMeter({
          ...definition,
          capabilities: { ...definition.capabilities, maxInputTokens: 983039 },
        }),
      ).toBeUndefined()
      for (const [id, tokens] of Object.entries(expected) as [keyof typeof expected, number][]) {
        const planned = await planRequest(
          googleCalibrationRequest(definition.modelId, id),
          [definition],
          meter,
          { signal: new AbortController().signal },
          testImagePreparerFor(planRequest),
        )
        if ('rejected' in planned) throw new Error(`${id}: ${JSON.stringify(planned)}`)
        expect(planned.planned.inputLimitEvidence.inputTokens).toEqual({
          kind: 'estimated',
          tokens,
        })
        expect(planned.planned.inputLimitEvidence.admissionTokens).toBe(
          Math.ceil(tokens * 1.2) + 32,
        )
      }
    },
  )

  it.each(googleDefinitions)(
    '$modelId refuses uncovered media and protocol controls',
    async definition => {
      const meter = createGoogleInputMeter(definition)
      if (!meter) throw new Error('Google meter unavailable')
      expect(
        await planRequest(
          googleCertificationRequest(definition.modelId),
          [definition],
          meter,
          {
            signal: new AbortController().signal,
          },
          testImagePreparerFor(planRequest),
        ),
      ).toEqual({
        rejected: 'invalidInput',
        reason: 'input_size_unavailable',
        metrics: ['maxInputTokens'],
      })
      const opaqueBody = {
        model: definition.modelId,
        provider: {
          order: ['google-ai-studio'],
          allow_fallbacks: false,
          require_parameters: true,
        },
        stream: true,
        store: false,
        messages: [
          {
            role: 'assistant',
            content: '',
            reasoning_details: [{ type: 'reasoning.encrypted', data: 'opaque' }],
          },
        ],
      }
      expect(
        directFull(meter, { body: opaqueBody, serialized: writeJsonLossless(opaqueBody) }),
      ).toEqual({
        kind: 'unavailable',
      })
    },
  )

  it.each(googleDefinitions)(
    '$modelId rejects body/serialized drift before counting',
    async definition => {
      const meter = createGoogleInputMeter(definition)
      if (!meter) throw new Error('Google meter unavailable')
      const planned = await planRequest(
        googleCalibrationRequest(definition.modelId, 'F2'),
        [definition],
        meter,
        { signal: new AbortController().signal },
        testImagePreparerFor(planRequest),
      )
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      const { body, serialized } = planned.planned
      expect(directFull(meter, { body, serialized })).toEqual({ kind: 'estimated', tokens: 90 })
      expect(directFull(meter, { body, serialized: `${serialized} ` })).toEqual({
        kind: 'unavailable',
      })
      expect(directFull(meter, { body: { ...body, max_tokens: 64 }, serialized })).toEqual({
        kind: 'unavailable',
      })
    },
  )

  it.each(googleDefinitions)(
    '$modelId sends the same checked bytes by public and leased transport',
    async definition => {
      const cert = certificate()
      const host = await fixture(
        cert.tls,
        res =>
          res.end(
            content('ok') +
              sse({ choices: [], usage: { prompt_tokens: 94, completion_tokens: 2 } }) +
              finish(),
          ),
        {},
        undefined,
        [definition],
      )
      const meter = createGoogleInputMeter(definition)
      if (!meter) throw new Error('Google meter unavailable')
      const direct = createPiAiTransport({
        ...host.options,
        definitions: [definition],
        inputMeters: [meter],
      })
      const service = createModelTransportService(host.options)
      const registered = service.registerAdaptation(definition, meter, {}, () => {})
      if ('rejected' in registered) throw new Error('Google service registration failed')
      try {
        const input = googleCalibrationRequest(definition.modelId, 'H2')
        const publicPlan = await direct.plan(input, { signal: new AbortController().signal })
        if ('rejected' in publicPlan) throw new Error(JSON.stringify(publicPlan))
        const publicSent = await direct.send(
          publicPlan.planned,
          'google-local-credential',
          new AbortController().signal,
        )
        if (!('response' in publicSent)) throw new Error('public local TLS send failed')
        for await (const _event of direct.read(
          publicSent.response,
          publicPlan.planned,
          new AbortController().signal,
        )) {
          // Draining verifies the reader's normal terminal path.
        }
        const acquired = service.acquire(input.snapshot.adaptation, input.routeName)
        if ('rejected' in acquired) throw new Error('Google lease unavailable')
        const lease = acquired.lease
        try {
          const servicePlan = await lease.transport.plan(input, {
            signal: new AbortController().signal,
          })
          if ('rejected' in servicePlan) throw new Error(JSON.stringify(servicePlan))
          expect(servicePlan.planned.inputLimitEvidence.inputTokens).toEqual({
            kind: 'estimated',
            tokens: 154,
          })
          const serviceSent = await lease.transport.send(
            servicePlan.planned,
            'google-local-credential',
            new AbortController().signal,
          )
          if (!('response' in serviceSent)) throw new Error('leased local TLS send failed')
          for await (const _event of lease.transport.read(
            serviceSent.response,
            servicePlan.planned,
            new AbortController().signal,
          )) {
            // Drain before releasing the lease.
          }
          expect(host.requests.map(request => request.body)).toEqual([
            publicPlan.planned.serialized,
            servicePlan.planned.serialized,
          ])
        } finally {
          lease.release()
        }
        const media = await direct.plan(googleCertificationRequest(definition.modelId), {
          signal: new AbortController().signal,
        })
        expect(media).toMatchObject({ rejected: 'invalidInput', reason: 'input_size_unavailable' })
        expect(host.requests).toHaveLength(2)
      } finally {
        await direct.close()
        await service.close(retirement)
        await host.close()
        cert.dispose()
      }
    },
  )

  it.each(
    googleDefinitions.flatMap(definition =>
      (['low', 'medium', 'high'] as const).map(effort => ({
        definition,
        effort,
        modelId: definition.modelId,
      })),
    ),
  )(
    '$modelId $effort completes public and leased invokeModel text/tool roundtrips with the actual meter',
    async ({ definition, effort }) => {
      const cert = certificate()
      let responses = 0
      const host = await fixture(
        cert.tls,
        res => {
          responses++
          const body =
            responses === 1
              ? content('Google text reply')
              : sse({
                  choices: [
                    {
                      delta: {
                        tool_calls: [
                          {
                            index: 0,
                            id: 'call_google_next',
                            type: 'function',
                            function: { name: 'lookup__google', arguments: '{"key":"next"}' },
                          },
                        ],
                      },
                    },
                  ],
                })
          res.end(
            body +
              sse({
                id: `google-local-${responses}`,
                model: definition.modelId,
                provider: 'google-ai-studio',
                choices: [],
                usage: {
                  prompt_tokens: 94,
                  completion_tokens: 3,
                  prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
                  cost: 0.000001,
                },
              }) +
              finish(responses === 1 ? 'stop' : 'tool_calls'),
          )
        },
        {},
        undefined,
        [definition],
      )
      const meter = createGoogleInputMeter(definition)
      if (!meter) throw new Error('Google meter unavailable')
      const direct = createPiAiTransport({
        ...host.options,
        definitions: [definition],
        inputMeters: [meter],
      })
      const service = createModelTransportService(host.options)
      const registered = service.registerAdaptation(definition, meter, {}, () => {})
      if ('rejected' in registered) throw new Error('Google service registration failed')
      try {
        const base = googleCalibrationRequest(definition.modelId, 'H2')
        const input = { ...base, parameters: { ...base.parameters, reasoningEffort: effort } }
        const planned = await direct.plan(input, { signal: new AbortController().signal })
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        expect(planned.planned.inputLimitEvidence.inputTokens).toEqual({
          kind: 'estimated',
          tokens: 154,
        })
        expect(planned.planned.body.reasoning).toEqual({ effort })
        const publicResult = await invokeModel({
          ...input,
          transport: direct,
          credential: 'google-local-credential',
          signal: new AbortController().signal,
          policy: policy(),
        }).outcome
        if (!('outcome' in publicResult)) throw new Error(JSON.stringify(publicResult))
        expect(publicResult.outcome).toBe('complete')
        expect(publicResult.blocks).toMatchObject([{ kind: 'text', text: 'Google text reply' }])
        expect(publicResult.servingProvider).toBe('google-ai-studio')
        if (publicResult.usage.input_tokens === 'unknown') throw new Error('missing upstream usage')
        expect(
          ExactDecimal.from(publicResult.usage.input_tokens).compare(ExactDecimal.from(94)),
        ).toBe(0)
        expect(writeJsonLossless(publicResult.cost)).toContain('0.000001')

        const acquired = service.acquire(input.snapshot.adaptation, input.routeName)
        if ('rejected' in acquired) throw new Error('Google service lease unavailable')
        const lease = acquired.lease
        try {
          const serviceResult = await lease.track(
            invokeModel({
              ...input,
              transport: lease.transport,
              credential: 'google-local-credential',
              signal: lease.signal,
              policy: policy(),
            }).outcome,
          )
          if (!('outcome' in serviceResult)) throw new Error(JSON.stringify(serviceResult))
          expect(serviceResult.outcome).toBe('complete')
          expect(serviceResult.blocks).toMatchObject([
            {
              kind: 'tool_call',
              tool: 'lookup__google',
              complete: true,
              arguments: { key: 'next' },
            },
          ])
          expect(serviceResult.servingProvider).toBe('google-ai-studio')
          if (serviceResult.usage.input_tokens === 'unknown')
            throw new Error('missing upstream usage')
          expect(
            ExactDecimal.from(serviceResult.usage.input_tokens).compare(ExactDecimal.from(94)),
          ).toBe(0)
          expect(writeJsonLossless(serviceResult.cost)).toContain('0.000001')
        } finally {
          lease.release()
        }
        expect(host.requests).toHaveLength(2)
        expect(host.requests.map(request => request.body)).toEqual([
          planned.planned.serialized,
          planned.planned.serialized,
        ])
        expect(host.requests.every(request => request.path === '/api/v1/chat/completions')).toBe(
          true,
        )
      } finally {
        await direct.close()
        await service.close(retirement)
        await host.close()
        cert.dispose()
      }
    },
  )
})
