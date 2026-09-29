import { directFull } from './direct-full-input.ts'
import { describe, expect, it } from 'vitest'
import { createPiAiTransport, planRequest } from '@omne-harness-lite/pi-ai-transport'
import {
  googleCandidateFeatures,
  fitGoogleCandidate,
  estimateGoogleCandidate,
  createGoogleCalibrationMeter,
} from '../src/input-meters/google-candidate.ts'
import { googleDefinitions } from '../src/official-models/google.ts'
import {
  googleCalibrationCaseIds,
  googleCalibrationRequest,
} from './fixtures/google/calibration.ts'
import { syntheticInputMeter } from './synthetic-input-meter.ts'
import { certificate, content, finish, fixture, sse } from './support.ts'
import { googleCertificationRequest } from './fixtures/google/cases.ts'

const countCharacters = (text: string): number => text.length

describe('Google candidate calibration boundary', () => {
  it('has an independent scalar and structure golden for messages and nested tool schema', () => {
    const result = googleCandidateFeatures(
      {
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [
          {
            type: 'function',
            function: { name: 'f', description: 'd', parameters: { type: 'object' } },
          },
        ],
      },
      countCharacters,
    )
    expect(result).toEqual({ textTokens: 74, messages: 1, tools: 1, objects: 4, arrays: 2 })
  })

  it('counts reasoning, tool arguments, results and prior turns from final projected bodies', () => {
    for (const definition of googleDefinitions) {
      const features = new Map()
      for (const id of googleCalibrationCaseIds) {
        const planned = planRequest(
          googleCalibrationRequest(definition.modelId, id),
          [definition],
          syntheticInputMeter(definition, 'google-ai-studio'),
        )
        if ('rejected' in planned) throw new Error(`${id}: ${planned.rejected}`)
        const body = planned.planned.body
        features.set(id, googleCandidateFeatures(body, countCharacters))
        if (id === 'H2') {
          expect(planned.planned.serialized).toContain('consider lookup')
          expect(planned.planned.serialized).toContain('found')
          expect(planned.planned.serialized).toContain('lookup__google')
          expect(planned.planned.serialized).toContain('"key"')
        }
      }
      expect(features.get('F2')?.tools).toBe(1)
      expect(features.get('H2')?.messages).toBeGreaterThan(features.get('F2')?.messages)
      expect(features.get('H2')?.textTokens).toBeGreaterThan(features.get('F2')?.textTokens)
    }
  })

  it('does not drop opaque reasoning details from the semantic projection', () => {
    const short = googleCandidateFeatures(
      {
        messages: [
          { role: 'assistant', reasoning_details: [{ type: 'reasoning.text', text: 'a' }] },
        ],
      },
      countCharacters,
    )
    const longer = googleCandidateFeatures(
      {
        messages: [
          { role: 'assistant', reasoning_details: [{ type: 'reasoning.text', text: 'abc' }] },
        ],
      },
      countCharacters,
    )
    if (!short || !longer) throw new Error('reasoning detail rejected')
    expect(longer.textTokens - short.textTokens).toBe(2)
    expect(longer.objects).toBe(short.objects)
  })

  it('fits only one offset and does not infer token counts for media', () => {
    const features = { textTokens: 10, messages: 1, tools: 0, objects: 1, arrays: 1 }
    const fit = fitGoogleCandidate('google/gemini-3.8-flash', {
      F1: { features, promptTokens: 15 },
      F2: { features: { ...features, textTokens: 30 }, promptTokens: 32 },
    })
    expect(fit.offset).toBe(4)
    expect(estimateGoogleCandidate(fit, { ...features, textTokens: 50 })).toBe(54)
    const definition = googleDefinitions[0]
    if (!definition) throw new Error('Google definition missing')
    const meter = createGoogleCalibrationMeter(definition, fit, countCharacters)
    expect(
      directFull(meter, {
        body: {
          model: definition.modelId,
          messages: [
            {
              role: 'user',
              content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }],
            },
          ],
        },
        serialized: '',
      }),
    ).toEqual({ kind: 'unavailable' })
  })

  it.each(googleDefinitions)(
    '$modelId carries the calibrated full history over local TLS',
    async definition => {
      const cert = certificate()
      const host = await fixture(
        cert.tls,
        res =>
          res.end(
            content('ok') +
              sse({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 2 } }) +
              finish(),
          ),
        {},
        undefined,
        [definition],
      )
      const candidate = createPiAiTransport({
        ...host.options,
        definitions: [definition],
        inputMeters: [
          createGoogleCalibrationMeter(
            definition,
            {
              revision: 'google-gemma4-experimental-1',
              modelId: definition.modelId,
              offset: 6,
              fitCaseIds: ['F1', 'F2'],
            },
            countCharacters,
          ),
        ],
      })
      try {
        const result = candidate.plan(googleCalibrationRequest(definition.modelId, 'H2'))
        if ('rejected' in result) throw new Error(result.rejected)
        const sent = await candidate.send(
          result.planned,
          'google-candidate-local-credential',
          new AbortController().signal,
        )
        if (!('response' in sent)) throw new Error('local TLS send failed')
        for await (const _event of candidate.read(
          sent.response,
          result.planned,
          new AbortController().signal,
        )) {
          // Drain the actual reader before closing its socket.
        }
        expect(host.requests).toHaveLength(1)
        expect(host.requests[0]?.body).toBe(result.planned.serialized)
        expect(host.requests[0]?.body).toContain('consider lookup')
        expect(host.requests[0]?.body).toContain('lookup__google')
        const media = candidate.plan(googleCertificationRequest(definition.modelId))
        expect(media).toEqual({
          rejected: 'invalidInput',
          reason: 'input_size_unavailable',
          metrics: ['maxInputTokens'],
        })
        expect(host.requests).toHaveLength(1)
      } finally {
        await candidate.close()
        await host.close()
        cert.dispose()
      }
    },
  )
})
