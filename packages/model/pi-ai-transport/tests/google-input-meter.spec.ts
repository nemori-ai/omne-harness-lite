import { describe, expect, it } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { invokeModel } from '@omne-harness-lite/model-request-runtime'
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
  it.each(googleDefinitions)('$modelId reproduces frozen fit and holdout features', definition => {
    const meter = createGoogleInputMeter(definition)
    if (!meter) throw new Error('Google meter unavailable')
    expect(meter).toMatchObject({
      modelId: definition.modelId,
      definitionRevision: definition.revision,
      implementation: definition.implementation,
      provider: 'google-ai-studio',
      algorithmRevision: 'gemma4-visible-text-tools-offset6-1',
    })
    expect(
      createGoogleInputMeter({
        ...definition,
        capabilities: { ...definition.capabilities, maxInputTokens: 983039 },
      }),
    ).toBeUndefined()
    for (const [id, tokens] of Object.entries(expected) as [keyof typeof expected, number][]) {
      const planned = planRequest(
        googleCalibrationRequest(definition.modelId, id),
        [definition],
        meter,
      )
      if ('rejected' in planned) throw new Error(`${id}: ${JSON.stringify(planned)}`)
      expect(planned.planned.inputLimitEvidence.inputTokens).toEqual({ kind: 'estimated', tokens })
      expect(planned.planned.inputLimitEvidence.admissionTokens).toBe(Math.ceil(tokens * 1.2) + 32)
    }
  })

  it.each(googleDefinitions)(
    '$modelId refuses uncovered media and protocol controls',
    definition => {
      const meter = createGoogleInputMeter(definition)
      if (!meter) throw new Error('Google meter unavailable')
      expect(
        planRequest(googleCertificationRequest(definition.modelId), [definition], meter),
      ).toEqual({
        rejected: 'invalidInput',
        reason: 'input_size_unavailable',
        metrics: ['maxInputTokens'],
      })
      const effort = googleCalibrationRequest(definition.modelId, 'F1')
      expect(
        planRequest(
          { ...effort, parameters: { ...effort.parameters, reasoningEffort: 'medium' } },
          [definition],
          meter,
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
        meter.measure({ body: opaqueBody, serialized: writeJsonLossless(opaqueBody) }),
      ).toEqual({
        kind: 'unavailable',
      })
    },
  )

  it.each(googleDefinitions)(
    '$modelId rejects body/serialized drift before counting',
    definition => {
      const meter = createGoogleInputMeter(definition)
      if (!meter) throw new Error('Google meter unavailable')
      const planned = planRequest(
        googleCalibrationRequest(definition.modelId, 'F2'),
        [definition],
        meter,
      )
      if ('rejected' in planned) throw new Error(JSON.stringify(planned))
      const { body, serialized } = planned.planned
      expect(meter.measure({ body, serialized })).toEqual({ kind: 'estimated', tokens: 90 })
      expect(meter.measure({ body, serialized: `${serialized} ` })).toEqual({
        kind: 'unavailable',
      })
      expect(meter.measure({ body: { ...body, max_tokens: 64 }, serialized })).toEqual({
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
        const publicPlan = direct.plan(input)
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
          const servicePlan = lease.transport.plan(input)
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
        const media = direct.plan(googleCertificationRequest(definition.modelId))
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

  it.each(googleDefinitions)(
    '$modelId completes public and leased invokeModel text/tool roundtrips with the actual meter',
    async definition => {
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
        const input = googleCalibrationRequest(definition.modelId, 'H2')
        const planned = direct.plan(input)
        if ('rejected' in planned) throw new Error(JSON.stringify(planned))
        expect(planned.planned.inputLimitEvidence.inputTokens).toEqual({
          kind: 'estimated',
          tokens: 154,
        })
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
