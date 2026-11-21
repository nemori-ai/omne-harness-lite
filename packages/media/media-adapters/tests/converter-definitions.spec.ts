import { describe, expect, it } from 'vitest'
import {
  readBodyText,
  type AssetLayer,
  type AssetLayerSource,
  type Candidate,
  type LayerInput,
} from '@omne-harness/assets'
import { createConverterDefinitions, type ConverterLayers } from '@omne-harness/media-adapters'
import { T1 } from './world.ts'

const LIMITS = {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 32,
  maxStringLength: 512,
  maxNumberLength: 20,
}
function read(body: unknown): unknown {
  const text = readBodyText(JSON.stringify(body), LIMITS)
  if (text.kind !== 'ok') throw new Error(text.kind)
  return text.value
}
const bodyOf = (kind: string, engine: string) =>
  read({ kind, engine, parameters: { language: 'en' }, egress: { kind: 'in-process' } })

type Held = Readonly<{ version: string; body: unknown; disabled?: boolean }>
/** One layer: per asset name what it holds, or that it cannot be read. */
type Layer = Readonly<Record<string, Held>> | 'unreadable'

function source(layer: AssetLayer, held: Layer, asked: string[]): AssetLayerSource {
  return {
    layer,
    list: async () => ({ layer, state: 'not-applicable' }),
    async candidates(capability): Promise<LayerInput> {
      asked.push(`${layer}:${capability.category}/${capability.name}`)
      if (held === 'unreadable') return { layer, state: 'unavailable' }
      const one = held[capability.name]
      if (one === undefined) return { layer, state: 'read', candidates: [] }
      const candidate: Candidate = {
        asset: `${layer}/${capability.category}/${capability.name}`,
        version: one.version,
        disabled: one.disabled ?? false,
        immutable: false,
        replaceLocked: false,
      }
      return { layer, state: 'read', candidates: [candidate] }
    },
  }
}

function definitions(official: Layer, tenant: Layer, unreadableBodies: readonly string[] = []) {
  const asked: string[] = []
  const all = { official, tenant }
  const layers: ConverterLayers = {
    sources: [source('official', official, asked), source('tenant', tenant, asked)],
    async body(candidate) {
      if (unreadableBodies.includes(candidate.asset)) return undefined
      const [layer, , name] = candidate.asset.split('/') as [keyof typeof all, string, string]
      const held = all[layer]
      return held === 'unreadable' ? undefined : held[name]?.body
    },
  }
  return { asked, port: createConverterDefinitions({ layersOf: async () => layers }) }
}
const resolve = (port: ReturnType<typeof definitions>['port'], mediaType = 'audio/wav') =>
  port.resolve({ tenant: T1, mediaType })
const resolved = (name: string, revision: string, engine: string) => ({
  ok: {
    kind: 'resolved',
    definition: { name, revision },
    engine,
    parameters: { language: 'en' },
    egress: { kind: 'in-process' },
  },
})

const OFFICIAL: Layer = { voice: { version: 'o1', body: bodyOf('voice', 'voice.transcribe') } }
const MINE: Held = { version: 't1', body: bodyOf('voice', 'voice.other') }

describe('which converter definition is in force', () => {
  it('neither layer holds one: none, after asking the type and then the modality', async () => {
    const { port, asked } = definitions({}, {})
    expect(await resolve(port)).toEqual({ ok: { kind: 'none' } })
    expect(asked).toEqual([
      'official:converter/audio-wav',
      'tenant:converter/audio-wav',
      'official:converter/voice',
      'tenant:converter/voice',
    ])
  })

  it('the official one when the tenant holds none', async () => {
    expect(await resolve(definitions(OFFICIAL, {}).port)).toEqual(
      resolved('voice', 'o1', 'voice.transcribe'),
    )
  })

  it("the tenant's own, enabled, over the official one and with none", async () => {
    expect(await resolve(definitions(OFFICIAL, { voice: MINE }).port)).toEqual(
      resolved('voice', 't1', 'voice.other'),
    )
    expect(await resolve(definitions({}, { voice: MINE }).port)).toEqual(
      resolved('voice', 't1', 'voice.other'),
    )
  })

  it("the official one again when the tenant's own is disabled; none when there is no official one", async () => {
    const disabled = { voice: { ...MINE, disabled: true } }
    expect(await resolve(definitions(OFFICIAL, disabled).port)).toEqual(
      resolved('voice', 'o1', 'voice.transcribe'),
    )
    expect(await resolve(definitions({}, disabled).port)).toEqual({ ok: { kind: 'none' } })
  })

  it('the name of the type before the name of the modality', async () => {
    const wav = { 'audio-wav': { version: 't2', body: bodyOf('audio-wav', 'wav.only') } }
    expect(await resolve(definitions(OFFICIAL, wav).port)).toEqual(
      resolved('audio-wav', 't2', 'wav.only'),
    )
    expect(await resolve(definitions(OFFICIAL, wav).port, 'audio/mpeg')).toEqual(
      resolved('voice', 'o1', 'voice.transcribe'),
    )
  })

  it('a layer that cannot be read is the basis unavailable, not skipped', async () => {
    const answer = await resolve(definitions(OFFICIAL, 'unreadable').port)
    expect(answer).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('a tenant whose assets cannot be had, or a lookup that throws, is the basis unavailable', async () => {
    const none = createConverterDefinitions({ layersOf: async () => undefined })
    expect(await resolve(none)).toMatchObject({ failure: { kind: 'unavailable' } })
    const throwing = createConverterDefinitions({
      layersOf: () => Promise.reject(new Error('boom')),
    })
    expect(await resolve(throwing)).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('a winner whose body cannot be read, or no longer holds, is the basis unavailable: no other layer is tried', async () => {
    const unread = definitions(OFFICIAL, { voice: MINE }, ['tenant/converter/voice'])
    expect(await resolve(unread.port)).toMatchObject({ failure: { kind: 'unavailable' } })
    const broken = { voice: { version: 't3', body: read({ kind: 'voice', engine: 'Bad Name' }) } }
    const answer = await resolve(definitions(OFFICIAL, broken).port)
    expect(answer).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(JSON.stringify(answer)).toContain('invalid-engine')
  })
})
