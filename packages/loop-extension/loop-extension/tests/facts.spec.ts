import { describe, expect, it } from 'vitest'
import type { LoopExtensionDeclaration } from '@omne-harness/agent-contract'
import {
  capabilityId,
  type AssetEntry,
  type AssetLayerSource,
  type Candidate,
} from '@omne-harness/assets'
import { gatherFacts } from '@omne-harness/loop-extension'
import type { RunSetting, TenantExtensionSources } from '@omne-harness/loop-extension-contract'

const declaration = (name: string): LoopExtensionDeclaration => ({
  name,
  position: 'execution_started',
  power: 'observe',
  implementation: { kind: 'builtin', builtinName: name },
})

function capability(name: string) {
  const made = capabilityId('loop-extension', name)
  if (!made.ok) throw new Error('not a capability')
  return made.id
}

type Held = Readonly<{ name: string; version: string; enabled: boolean }>

/** A tenant layer over a list of holdings, and what a test wants to break. */
function sources(
  held: readonly Held[],
  broken: Partial<{
    list: 'unavailable' | 'partial' | 'throws'
    candidates: string
    body: string
    run: Readonly<Record<string, RunSetting>>
  }> = {},
) {
  const reads: string[] = []
  const entry = (item: Held): AssetEntry => ({
    capability: capability(item.name),
    layer: 'tenant',
    asset: `asset/${item.name}`,
    version: item.version,
    selection: 'follow',
    enabled: item.enabled,
  })
  const layer: AssetLayerSource = {
    layer: 'tenant',
    async list(request) {
      reads.push(`list:${request.after ?? ''}`)
      if (broken.list === 'throws') throw new Error('the layer is away')
      if (broken.list === 'unavailable') return { layer: 'tenant', state: 'unavailable' }
      const start = request.after === null ? 0 : Number(request.after)
      const items = held.slice(start, start + 2).map(entry)
      const next = start + 2 < held.length ? String(start + 2) : null
      const completeness = broken.list === 'partial' ? 'partial' : 'complete'
      return { layer: 'tenant', state: 'read', page: { items, next, completeness } }
    },
    async candidates(asked) {
      reads.push(`candidates:${asked.name}`)
      if (broken.candidates === asked.name) return { layer: 'tenant', state: 'unavailable' }
      const candidates: Candidate[] = held
        .filter(item => item.name === asked.name)
        .map(item => ({
          asset: `asset/${item.name}`,
          version: item.version,
          disabled: !item.enabled,
          immutable: false,
          replaceLocked: false,
        }))
      return { layer: 'tenant', state: 'read', candidates }
    },
  }
  const given: Pick<TenantExtensionSources, 'layers' | 'body' | 'run'> = {
    layers: [layer],
    async body(version) {
      reads.push(`body:${version.asset}@${version.version}`)
      const name = version.asset.slice('asset/'.length)
      return broken.body === name ? undefined : { declaration: declaration(name) }
    },
    async run(asked) {
      reads.push(`run:${asked.capability.name}`)
      return broken.run?.[asked.capability.name] ?? { kind: 'value', value: true }
    },
  }
  return { given, reads }
}

const plain = (body: unknown) =>
  (body as { declaration: LoopExtensionDeclaration } | undefined)?.declaration ?? null

describe('the facts of the extensions a tenant holds', () => {
  it('reads every page of the holdings, and for each one the winning version, its declaration and the run setting', async () => {
    const { given } = sources([
      { name: 'a', version: 'v1', enabled: true },
      { name: 'b', version: 'v2', enabled: true },
      { name: 'c', version: 'v3', enabled: true },
    ])
    expect(await gatherFacts(given, plain)).toEqual(
      ['a', 'b', 'c'].map((name, index) => ({
        capability: name,
        assetRef: `asset/${name}`,
        holding: 'enabled',
        winner: { kind: 'version', version: `v${index + 1}`, declaration: declaration(name) },
        run: { kind: 'value', value: true },
      })),
    )
  })

  it('reads nothing more of a holding that is disabled', async () => {
    const { given, reads } = sources([{ name: 'off', version: 'v1', enabled: false }])
    expect(await gatherFacts(given, plain)).toEqual([
      {
        capability: 'off',
        assetRef: 'asset/off',
        holding: 'disabled',
        winner: { kind: 'none' },
        run: { kind: 'absent' },
      },
    ])
    expect(reads).toEqual(['list:'])
  })

  it.each(['unavailable', 'partial', 'throws'] as const)(
    'answers unavailable when the list of the holdings is %s',
    async list => {
      const { given } = sources([{ name: 'a', version: 'v1', enabled: true }], { list })
      expect(await gatherFacts(given, plain)).toBe('unavailable')
    },
  )

  it('keeps an unreadable layer, an unreadable declaration and an unreadable run setting as facts of that extension', async () => {
    const held = ['layer', 'body', 'run', 'fine'].map(name => ({
      name,
      version: 'v1',
      enabled: true,
    }))
    const { given } = sources(held, {
      candidates: 'layer',
      body: 'body',
      run: { run: { kind: 'unavailable' }, fine: { kind: 'absent' } },
    })
    const facts = await gatherFacts(given, plain)
    if (facts === 'unavailable') throw new Error('the list was readable')
    expect(facts.map(item => [item.capability, item.winner, item.run])).toEqual([
      ['layer', { kind: 'unavailable' }, { kind: 'absent' }],
      [
        'body',
        { kind: 'version', version: 'v1', declaration: null },
        { kind: 'value', value: true },
      ],
      [
        'run',
        { kind: 'version', version: 'v1', declaration: declaration('run') },
        { kind: 'unavailable' },
      ],
      [
        'fine',
        { kind: 'version', version: 'v1', declaration: declaration('fine') },
        { kind: 'absent' },
      ],
    ])
  })
})
