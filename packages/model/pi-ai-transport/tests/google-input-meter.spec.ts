import { describe, expect, it } from 'vitest'
import {
  createModelTransportService,
  createPiAiTransport,
  planRequest,
} from '@omne-harness-lite/pi-ai-transport'
import { createGoogleInputMeter } from '../src/input-meters/google.ts'
import { googleDefinitions } from '../src/official-models/google.ts'
import { googleCalibrationRequest } from './fixtures/google/calibration.ts'
import { googleCertificationRequest } from './fixtures/google/cases.ts'
import { certificate, content, finish, fixture, sse } from './support.ts'

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
      expect(
        meter.measure({
          body: {
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
          },
          serialized: '',
        }),
      ).toEqual({ kind: 'unavailable' })
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
})
