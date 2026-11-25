import {
  type AssetLayer,
  type AssetLayerListing,
  type AssetLayerSource,
  type Candidate,
  capabilityId,
  readBodyText,
} from '@omne-harness/assets'
import { heldPrompts, onePrompt, type PromptLayers } from '@omne-harness/prompt-command-source'
import { describe, expect, it } from 'vitest'

type Held = Readonly<{ name: string; version: string; disabled?: boolean; prompt?: string }>

const body = (name: string, prompt: string) => {
  const read = readBodyText(JSON.stringify({ name, description: `${name} 的说明`, prompt }), {
    maxBytes: 9999,
    maxDepth: 8,
    maxItems: 64,
    maxMembers: 16,
    maxStringLength: 9999,
    maxNumberLength: 20,
  })
  if (read.kind !== 'ok') throw new Error('not a document')
  return read.value
}

function layer(name: AssetLayer, held: readonly Held[] | 'down'): AssetLayerSource {
  const candidate = (one: Held): Candidate => ({
    asset: `${name}:${one.name}`,
    version: one.version,
    disabled: one.disabled === true,
    immutable: false,
    replaceLocked: false,
  })
  return {
    layer: name,
    async list(): Promise<AssetLayerListing> {
      if (held === 'down') return { layer: name, state: 'unavailable' }
      const items = held.map(one => {
        const id = capabilityId('prompt', one.name)
        if (!id.ok) throw new Error('no id')
        return {
          capability: id.id,
          layer: name,
          asset: `${name}:${one.name}`,
          version: one.version,
          selection: 'follow' as const,
          enabled: one.disabled !== true,
        }
      })
      return { layer: name, state: 'read', page: { items, next: null, completeness: 'complete' } }
    },
    async candidates(id) {
      if (held === 'down') return { layer: name, state: 'unavailable' }
      return {
        layer: name,
        state: 'read',
        candidates: held.filter(one => one.name === id.name).map(candidate),
      }
    },
  }
}

function layers(...sources: AssetLayerSource[]): PromptLayers {
  return {
    sources,
    async body(candidate) {
      const name = candidate.asset.split(':')[1] ?? ''
      return body(name, `${candidate.asset} 的提示词 ${candidate.version}`)
    },
  }
}

describe('the prompt command in force, by the layers of the assets', () => {
  it('takes the workspace one over the tenant one, and keeps a disabled one as disabled', async () => {
    const both = layers(
      layer('tenant', [
        { name: 'commit', version: 'v1' },
        { name: 'old', version: 'v1', disabled: true },
      ]),
      layer('workspace', [{ name: 'commit', version: 'v2' }]),
    )
    expect(await onePrompt(both, 'commit')).toEqual({
      ok: {
        kind: 'in-force',
        body: {
          name: 'commit',
          description: 'commit 的说明',
          prompt: 'workspace:commit 的提示词 v2',
        },
        from: { layer: 'workspace', version: 'v2', digest: 'v2' },
      },
    })
    const held = await heldPrompts(both)
    expect(held).toMatchObject({
      ok: [
        { kind: 'in-force', from: { layer: 'workspace' } },
        { kind: 'disabled', name: 'old' },
      ],
    })
    expect(await onePrompt(both, 'gone')).toEqual({ ok: null })
    expect(await onePrompt(both, 'omne-official:x')).toEqual({ ok: null })
  })

  it('the tenant one stands where the workspace has none', async () => {
    const tenantOnly = layers(
      layer('tenant', [{ name: 'commit', version: 'v1' }]),
      layer('workspace', []),
    )
    expect(await onePrompt(tenantOnly, 'commit')).toMatchObject({
      ok: { from: { layer: 'tenant' } },
    })
  })

  it('cannot tell when a layer cannot be read, or the winner cannot be read', async () => {
    const down = layers(
      layer('tenant', [{ name: 'commit', version: 'v1' }]),
      layer('workspace', 'down'),
    )
    expect(await onePrompt(down, 'commit')).toEqual({ failure: 'unavailable' })
    expect(await heldPrompts(down)).toEqual({ failure: 'unavailable' })
    const unread: PromptLayers = {
      ...layers(layer('tenant', [{ name: 'commit', version: 'v1' }])),
      body: async () => undefined,
    }
    expect(await onePrompt(unread, 'commit')).toEqual({ failure: 'unavailable' })
  })
})
