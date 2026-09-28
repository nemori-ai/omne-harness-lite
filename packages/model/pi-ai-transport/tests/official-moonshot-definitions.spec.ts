import { describe, expect, it } from 'vitest'
import { judgeModelProfileDocument } from '@omne-harness-lite/model-profile'
import {
  configurationSchema,
  createOfficialProfileContent,
  interpretConfiguration,
} from '../src/configuration.ts'
import { ownDefinitions, readModelDefinition } from '../src/definitions.ts'
import {
  moonshotAutomaticConfiguration,
  moonshotDefinitions,
  moonshotModelRoutes,
} from '../src/official-models/moonshot.ts'

const selected = [
  {
    id: 'moonshotai/kimi-k3',
    provider: 'moonshotai/mxfp4',
    inputModalities: ['image', 'text', 'video'],
    contextWindow: 1048576,
    maxOutputTokens: 943718,
  },
  {
    id: 'moonshotai/kimi-k2.7-code',
    provider: 'moonshotai/int4',
    inputModalities: ['image', 'text'],
    contextWindow: 262144,
    maxOutputTokens: 235929,
  },
] as const

function coordinates(definition: (typeof moonshotDefinitions)[number]) {
  return {
    implementation: definition.implementation,
    definition: { modelId: definition.modelId, revision: definition.revision },
  }
}

describe('official Moonshot MP4 definitions', () => {
  it('publishes exactly the two selected routes with complete six-field capabilities', () => {
    expect(moonshotDefinitions).toHaveLength(2)
    expect(moonshotDefinitions.map(definition => definition.modelId)).toEqual(
      selected.map(row => row.id),
    )

    for (const row of selected) {
      const definition = moonshotDefinitions.find(item => item.modelId === row.id)
      if (!definition) throw new Error(`missing ${row.id}`)
      const expectedRoute = moonshotModelRoutes[row.id]
      expect(definition.revision).toBe('1')
      expect(definition.implementation).toEqual({ name: 'pi-ai:moonshot', revision: 'mp4-1' })
      expect(definition.routes).toEqual(expectedRoute)
      expect(Object.keys(definition.routes)).toEqual([row.provider])
      expect(definition.capabilities).toEqual({
        inputModalities: row.inputModalities,
        outputModalities: ['text'],
        maxInputTokens: row.contextWindow - row.maxOutputTokens,
        maxOutputTokens: row.maxOutputTokens,
        inputConstraints: { maxImageBytes: 4194304 },
        upstreamInputLimits: {
          maxInputTokens: { status: 'unknown' },
          maxRequestBytes: { status: 'unknown' },
          maxImageBytes: { status: 'unknown' },
          maxImages: { status: 'unknown' },
        },
      })
      expect(readModelDefinition(moonshotDefinitions, coordinates(definition))).toEqual({
        ok: definition,
      })

      const profile = createOfficialProfileContent(definition, {
        providers: [row.provider],
        allowFallback: false,
        configuration: moonshotAutomaticConfiguration,
      })
      if ('rejected' in profile) throw new Error(`${row.id}: ${profile.rejected}`)
      expect(judgeModelProfileDocument('ModelProfileContent', profile.ok)).toEqual({ ok: true })
      expect(profile.ok.adaptation).toEqual({
        ...coordinates(definition),
        configuration: moonshotAutomaticConfiguration,
      })
      expect(profile.ok.upstreamInputLimits).toEqual(definition.capabilities.upstreamInputLimits)
      expect(profile.ok.inputConstraints).toEqual({ maxImageBytes: 4194304 })
      expect(profile.ok).not.toHaveProperty('registration')
      expect(profile.ok).not.toHaveProperty('updatedAt')

      const schema = configurationSchema(definition, row.provider)
      if ('rejected' in schema) throw new Error(`${row.id}: ${schema.rejected}`)
      expect(JSON.stringify(schema.ok)).not.toContain('default')
      expect(
        interpretConfiguration(definition, moonshotAutomaticConfiguration.values, row.provider),
      ).toEqual({ ok: { mode: 'automatic' } })
      expect(
        interpretConfiguration(
          definition,
          { cache: { mode: 'explicit', ttl: '1h' } },
          row.provider,
        ),
      ).toEqual({ rejected: 'invalidInput' })
      expect(configurationSchema(definition, 'moonshotai/other')).toEqual({
        rejected: 'unavailable',
      })
    }
  })

  it('keeps K3 effort selection and K2.7 effort drop in their exact model routes', () => {
    const [k3, k27] = moonshotDefinitions
    expect(k3?.routes['moonshotai/mxfp4']?.parameters.reasoningEffort).toEqual({
      kind: 'select',
      accepted: { values: ['low', 'high', 'max'] },
      otherwise: { drop: true },
    })
    expect(k27?.routes['moonshotai/int4']?.parameters.reasoningEffort).toEqual({ kind: 'drop' })
    expect(k3?.routes['moonshotai/mxfp4']?.reminderRole).toBe('user')
    expect(k27?.routes['moonshotai/int4']?.reminderRole).toBe('user')
  })

  it.each(moonshotDefinitions)(
    'rejects malformed MP4 facts and missing project caps for %s',
    definition => {
      const accepted = coordinates(definition)
      const missingImageCap = structuredClone(definition)
      Reflect.deleteProperty(missingImageCap.capabilities.inputConstraints, 'maxImageBytes')
      const missingFact = structuredClone(definition)
      Reflect.deleteProperty(missingFact.capabilities.upstreamInputLimits, 'maxRequestBytes')
      const invalidUnknown = structuredClone(definition)
      Reflect.set(invalidUnknown.capabilities.upstreamInputLimits, 'maxImages', {
        status: 'unknown',
        value: 100,
      })
      const narrowerUpstream = structuredClone(definition)
      Reflect.set(narrowerUpstream.capabilities.upstreamInputLimits, 'maxImageBytes', {
        status: 'limited',
        value: 4194303,
      })

      for (const invalid of [missingImageCap, missingFact, invalidUnknown, narrowerUpstream]) {
        expect(readModelDefinition([invalid], accepted)).toEqual({ rejected: 'invalidInput' })
        expect(
          createOfficialProfileContent(invalid, {
            providers: [Object.keys(definition.routes)[0] ?? ''],
            allowFallback: false,
            configuration: moonshotAutomaticConfiguration,
          }),
        ).toEqual({ rejected: 'invalidInput' })
      }
    },
  )

  it('copies every nested fact and route before publishing an owned definition', () => {
    const original = moonshotDefinitions[0]
    if (!original) throw new Error('missing K3 definition')
    const source = structuredClone(original)
    const owned = ownDefinitions([source])[0]
    if (!owned) throw new Error('missing owned K3 definition')
    Reflect.set(source.capabilities.upstreamInputLimits.maxInputTokens, 'status', 'unbounded')
    Reflect.set(source.capabilities.inputConstraints, 'maxImageBytes', 1)
    Reflect.set(source.routes['moonshotai/mxfp4']?.parameters.reasoningEffort ?? {}, 'kind', 'pass')
    expect(owned).toEqual(original)
    expect(
      Reflect.set(owned.capabilities.upstreamInputLimits.maxInputTokens, 'status', 'unbounded'),
    ).toBe(false)
    expect(Reflect.set(owned.capabilities.inputConstraints, 'maxImageBytes', 1)).toBe(false)
  })
})
