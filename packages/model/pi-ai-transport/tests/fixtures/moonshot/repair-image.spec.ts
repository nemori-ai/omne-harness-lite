import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createOfficialProfileContent } from '../../../src/configuration.ts'
import { createMoonshotInputMeter } from '../../../src/input-meters/moonshot.ts'
import {
  moonshotAutomaticConfiguration,
  moonshotDefinitions,
} from '../../../src/official-models/moonshot.ts'
import { planRequest } from '../../../src/plan.ts'
import { input, judgedMessage } from '../../support.ts'

const png = readFileSync(new URL('valid-red-1x1.png', import.meta.url))

describe('repaired Moonshot image through the production final-input gate', () => {
  it.each([0, 1] as const)('plans model %i with the actual 70-byte inline PNG', index => {
    const definition = moonshotDefinitions[index]
    if (!definition) throw new Error('missing selected definition')
    const provider = index === 0 ? 'moonshotai/mxfp4' : 'moonshotai/int4'
    const profile = createOfficialProfileContent(definition, {
      providers: [provider],
      allowFallback: false,
      configuration: moonshotAutomaticConfiguration,
    })
    if ('rejected' in profile) throw new Error(profile.rejected)
    const base = input()
    const planned = planRequest(
      {
        ...base,
        routeName: definition.modelId,
        provider,
        tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
        parameters: { maxOutputTokens: 1024 },
        snapshot: {
          ...base.snapshot,
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
        messages: [
          ...base.messages,
          judgedMessage({
            id: `moonshot-valid-image-${index}`,
            type: 'user',
            createdAt: '2026-09-28T00:00:00Z',
            blocks: [
              {
                id: 'question',
                kind: 'text',
                text: 'Describe this image.',
                visibility: { toHuman: true, toModel: true },
              },
              {
                id: 'image',
                kind: 'image',
                mediaType: 'image/png',
                data: { inline: png.toString('base64') },
                visibility: { toHuman: true, toModel: true },
              },
            ],
          }),
        ],
      },
      moonshotDefinitions,
      createMoonshotInputMeter(definition),
    )
    if ('rejected' in planned) throw new Error(JSON.stringify(planned))
    expect(planned.planned.inputLimitEvidence.inputTokens.kind).toBe('estimated')
    expect(planned.planned.inputLimitEvidence.imageBytes).toEqual([png.length])
    expect(planned.planned.inputLimitEvidence.images).toBe(1)
    expect(planned.planned.serialized).toContain(`data:image/png;base64,${png.toString('base64')}`)
  })
})
