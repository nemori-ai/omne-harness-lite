import { describe, expect, it } from 'vitest'
import {
  capabilityId,
  collectCandidates,
  evaluate,
  listAssets,
  type AssetEntry,
  type AssetLayer,
  type AssetLayerListing,
  type AssetLayerSource,
  type AssetListInvalid,
  type AssetListRequest,
  type CapabilityId,
  type Candidate,
  type LayerInput,
} from '../src/index.ts'

function id(name: string): CapabilityId {
  const made = capabilityId('widget', name)
  if (!made.ok) throw new Error('invalid fixture')
  return made.id
}

const wanted = id('alpha')

function candidate(asset: string, flags: Partial<Omit<Candidate, 'asset'>> = {}): Candidate {
  return {
    asset,
    version: flags.version ?? `${asset}-v1`,
    disabled: flags.disabled ?? false,
    immutable: flags.immutable ?? false,
    replaceLocked: flags.replaceLocked ?? false,
  }
}

function entry(layer: AssetLayer, name: string): AssetEntry {
  return {
    capability: id(name),
    layer,
    asset: `${layer}/${name}`,
    version: '1',
    selection: 'follow',
    enabled: true,
  }
}

type Calls = { list: AssetListRequest[]; candidates: CapabilityId[] }

function source(
  layer: AssetLayer,
  behaviour: {
    candidates?: (capability: CapabilityId) => Promise<LayerInput>
    list?: (request: AssetListRequest) => Promise<AssetLayerListing | AssetListInvalid>
  },
): AssetLayerSource & { calls: Calls } {
  const calls: Calls = { list: [], candidates: [] }
  return {
    layer,
    calls,
    list(request) {
      calls.list.push(request)
      if (behaviour.list === undefined) throw new Error('list was not expected')
      return behaviour.list(request)
    },
    candidates(capability) {
      calls.candidates.push(capability)
      if (behaviour.candidates === undefined) throw new Error('candidates was not expected')
      return behaviour.candidates(capability)
    },
  }
}

function answering(layer: AssetLayer, answer: LayerInput) {
  return source(layer, { candidates: async () => answer })
}

function paged(
  layer: AssetLayer,
  entries: readonly AssetEntry[],
  completeness: 'complete' | 'partial' = 'complete',
) {
  return source(layer, {
    async list(request) {
      const start = request.after === null ? 0 : Number(request.after)
      const end = start + request.limit
      return {
        layer,
        state: 'read',
        page: {
          items: entries.slice(start, end),
          next: end < entries.length ? String(end) : null,
          completeness,
        },
      }
    },
  })
}

function listing(layer: AssetLayer, answer: AssetLayerListing | AssetListInvalid) {
  return source(layer, { list: async () => answer })
}

const request = (limit: number, after: string | null = null): AssetListRequest => ({
  category: 'widget',
  after,
  limit,
})

describe('collectCandidates: the layer answer by the layer position', () => {
  it('carries each answer unchanged at its own layer position', async () => {
    const tenant = candidate('tenant/alpha')
    const layers = await collectCandidates(
      [
        answering('official', { layer: 'official', state: 'not-applicable' }),
        answering('organization', { layer: 'organization', state: 'read', candidates: [] }),
        answering('tenant', { layer: 'tenant', state: 'read', candidates: [tenant] }),
        answering('workspace', { layer: 'workspace', state: 'unavailable' }),
      ],
      wanted,
    )
    expect(layers).toEqual([
      { layer: 'official', state: 'not-applicable' },
      { layer: 'organization', state: 'read', candidates: [] },
      { layer: 'tenant', state: 'read', candidates: [tenant] },
      { layer: 'workspace', state: 'unavailable' },
    ])
    const read = layers[2]
    expect(read?.state === 'read' ? read.candidates[0] : undefined).toBe(tenant)
  })

  it('asks every source for the same capability once', async () => {
    const sources = [
      answering('official', { layer: 'official', state: 'not-applicable' }),
      answering('tenant', { layer: 'tenant', state: 'read', candidates: [] }),
    ]
    await collectCandidates(sources, wanted)
    expect(sources.map(one => one.calls.candidates)).toEqual([[wanted], [wanted]])
  })

  it('puts sources given out of order back into the layer order', async () => {
    const layers = await collectCandidates(
      [
        answering('workspace', { layer: 'workspace', state: 'read', candidates: [] }),
        answering('tenant', { layer: 'tenant', state: 'not-applicable' }),
        answering('official', { layer: 'official', state: 'unavailable' }),
      ],
      wanted,
    )
    expect(layers.map(layer => layer.layer)).toEqual(['official', 'tenant', 'workspace'])
  })

  it('an unreadable layer stays unreadable, so the evaluation is unavailable', async () => {
    const layers = await collectCandidates(
      [
        answering('official', {
          layer: 'official',
          state: 'read',
          candidates: [candidate('official/alpha')],
        }),
        answering('tenant', { layer: 'tenant', state: 'unavailable' }),
      ],
      wanted,
    )
    expect(evaluate({ layers, eligible: () => 'yes' })).toEqual({
      kind: 'unavailable',
      layer: 'tenant',
    })
  })

  it('a source whose promise rejects counts as an unreadable layer', async () => {
    const layers = await collectCandidates(
      [
        answering('official', { layer: 'official', state: 'read', candidates: [] }),
        source('tenant', { candidates: () => Promise.reject(new Error('storage closed')) }),
      ],
      wanted,
    )
    expect(layers).toEqual([
      { layer: 'official', state: 'read', candidates: [] },
      { layer: 'tenant', state: 'unavailable' },
    ])
  })

  it('a source that throws synchronously counts as an unreadable layer', async () => {
    const throwing: AssetLayerSource = {
      layer: 'tenant',
      list: () => Promise.resolve({ state: 'invalid' }),
      candidates() {
        throw new Error('broken source')
      },
    }
    expect(await collectCandidates([throwing], wanted)).toEqual([
      { layer: 'tenant', state: 'unavailable' },
    ])
  })

  it('labels each answer with the layer of its source', async () => {
    const tenant = candidate('tenant/alpha')
    const layers = await collectCandidates(
      [answering('tenant', { layer: 'official', state: 'read', candidates: [tenant] })],
      wanted,
    )
    expect(layers).toEqual([{ layer: 'tenant', state: 'read', candidates: [tenant] }])
  })

  it('rejects two sources for the same layer without asking either', async () => {
    const first = answering('tenant', { layer: 'tenant', state: 'read', candidates: [] })
    const second = answering('tenant', { layer: 'tenant', state: 'read', candidates: [] })
    await expect(collectCandidates([first, second], wanted)).rejects.toThrow(TypeError)
    expect([first.calls.candidates, second.calls.candidates]).toEqual([[], []])
  })

  it('no sources give no layers, and the evaluation has no winner', async () => {
    const layers = await collectCandidates([], wanted)
    expect(layers).toEqual([])
    expect(evaluate({ layers, eligible: () => 'yes' })).toEqual({ kind: 'none', filtered: [] })
  })
})

describe('listAssets: the cursor by the layer answer', () => {
  const official = ['a', 'b', 'c', 'd'].map(name => entry('official', name))
  const tenant = ['e', 'f', 'g', 'h'].map(name => entry('tenant', name))

  it('two layers with two pages each take four calls in layer order, nothing repeated or lost', async () => {
    const sources = [paged('tenant', tenant), paged('official', official)]
    const seen: AssetEntry[] = []
    const cursors: (string | null)[] = []
    let after: string | null = null
    let calls = 0
    do {
      const answer = await listAssets(sources, request(2, after))
      calls += 1
      if (answer.state !== 'read') throw new Error(JSON.stringify(answer))
      expect(answer.page.items).toHaveLength(2)
      expect(answer.page.completeness).toBe('complete')
      seen.push(...answer.page.items)
      after = answer.page.next
      cursors.push(after)
    } while (after !== null && calls < 10)
    expect(calls).toBe(4)
    expect(seen).toEqual([...official, ...tenant])
    expect(new Set(cursors).size).toBe(4)
    expect(cursors.at(-1)).toBeNull()
  })

  it.each([0, 101, 1.5, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'limit %s is invalid and no source is asked',
    async limit => {
      const one = paged('tenant', tenant)
      expect(await listAssets([one], request(limit))).toEqual({ state: 'invalid' })
      expect(one.calls.list).toEqual([])
    },
  )

  it.each([1, 100])('limit %s is accepted', async limit => {
    const answer = await listAssets([paged('tenant', tenant)], request(limit))
    expect(answer.state).toBe('read')
  })

  it.each([
    ['text that is not JSON', 'tenant'],
    ['an empty array', '[]'],
    ['a layer that has no source here', JSON.stringify(['workspace', null])],
    ['a name that is not a layer', JSON.stringify(['nowhere', null])],
    ['a layer cursor that is not text', JSON.stringify(['tenant', 3])],
    ['three parts', JSON.stringify(['tenant', null, null])],
    ['an object', JSON.stringify({ layer: 'tenant' })],
  ])('a cursor that is %s is invalid and no source is asked', async (_what, after) => {
    const one = paged('tenant', tenant)
    expect(await listAssets([one], request(2, after))).toEqual({ state: 'invalid' })
    expect(one.calls.list).toEqual([])
  })

  it('skips a layer that does not apply', async () => {
    const answer = await listAssets(
      [
        listing('official', { layer: 'official', state: 'not-applicable' }),
        paged('tenant', tenant),
      ],
      request(10),
    )
    expect(answer).toEqual({
      state: 'read',
      page: { items: tenant, next: null, completeness: 'complete' },
    })
  })

  it('skips a layer that does not apply even when the cursor points at it', async () => {
    const answer = await listAssets(
      [
        listing('official', { layer: 'official', state: 'not-applicable' }),
        paged('tenant', tenant),
      ],
      request(10, JSON.stringify(['official', null])),
    )
    expect(answer.state === 'read' ? answer.page.items : []).toEqual(tenant)
  })

  it('an unreadable layer makes the whole page unavailable, even after items were read', async () => {
    const answer = await listAssets(
      [paged('official', official), listing('tenant', { layer: 'tenant', state: 'unavailable' })],
      request(10),
    )
    expect(answer).toEqual({ state: 'unavailable', layer: 'tenant' })
  })

  it('a source whose promise rejects makes the whole page unavailable', async () => {
    const answer = await listAssets(
      [source('tenant', { list: () => Promise.reject(new Error('storage closed')) })],
      request(10),
    )
    expect(answer).toEqual({ state: 'unavailable', layer: 'tenant' })
  })

  it('a source that answers invalid makes the whole page invalid', async () => {
    const answer = await listAssets(
      [paged('official', official), listing('tenant', { state: 'invalid' })],
      request(10),
    )
    expect(answer).toEqual({ state: 'invalid' })
  })

  it('a partial page from any layer makes the whole page partial', async () => {
    const answer = await listAssets(
      [paged('official', official), paged('tenant', tenant, 'partial')],
      request(10),
    )
    expect(answer).toEqual({
      state: 'read',
      page: { items: [...official, ...tenant], next: null, completeness: 'partial' },
    })
  })

  it('a partial page that is not consulted does not make the page partial', async () => {
    const answer = await listAssets(
      [paged('official', official), paged('tenant', tenant, 'partial')],
      request(4),
    )
    expect(answer.state === 'read' ? answer.page.completeness : undefined).toBe('complete')
  })

  it('a layer that ends with the page full points the cursor at the next layer', async () => {
    const tenantSource = paged('tenant', tenant)
    const first = await listAssets([paged('official', official), tenantSource], request(4))
    if (first.state !== 'read') throw new Error(JSON.stringify(first))
    expect(first.page.items).toEqual(official)
    expect(first.page.next).not.toBeNull()
    expect(tenantSource.calls.list).toEqual([])
    const second = await listAssets(
      [paged('official', official), tenantSource],
      request(4, first.page.next),
    )
    expect(second).toEqual({
      state: 'read',
      page: { items: tenant, next: null, completeness: 'complete' },
    })
    expect(tenantSource.calls.list).toEqual([request(4)])
  })

  it('a layer that ends before the page is full continues into the next layer for the rest', async () => {
    const tenantSource = paged('tenant', tenant)
    const answer = await listAssets([paged('official', official), tenantSource], request(6))
    if (answer.state !== 'read') throw new Error(JSON.stringify(answer))
    expect(answer.page.items).toEqual([...official, ...tenant.slice(0, 2)])
    expect(tenantSource.calls.list).toEqual([request(2)])
    const rest = await listAssets(
      [paged('official', official), tenantSource],
      request(6, answer.page.next),
    )
    expect(rest.state === 'read' ? rest.page.items : []).toEqual(tenant.slice(2))
  })

  it('passes the category and the cursor of the layer through to the source', async () => {
    const tenantSource = paged('tenant', tenant)
    const first = await listAssets([tenantSource], request(3))
    if (first.state !== 'read') throw new Error(JSON.stringify(first))
    await listAssets([tenantSource], request(3, first.page.next))
    expect(tenantSource.calls.list).toEqual([
      { category: 'widget', after: null, limit: 3 },
      { category: 'widget', after: '3', limit: 3 },
    ])
  })

  it('no sources give an empty, complete last page', async () => {
    expect(await listAssets([], request(10))).toEqual({
      state: 'read',
      page: { items: [], next: null, completeness: 'complete' },
    })
  })

  it('rejects two sources for the same layer without asking either', async () => {
    const first = paged('tenant', tenant)
    const second = paged('tenant', tenant)
    await expect(listAssets([first, second], request(2))).rejects.toThrow(TypeError)
    expect([first.calls.list, second.calls.list]).toEqual([[], []])
  })
})
