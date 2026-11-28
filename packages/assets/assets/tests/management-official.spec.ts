import { describe, expect, it } from 'vitest'
import {
  capabilityId,
  createCategoryPoint,
  createTenantManagement,
  type AssetLayerSource,
  type AssetRow,
  type BodyContract,
  type CapabilityId,
  type OfficialAsset,
  type TenantLayerStore,
} from '@omne-harness/assets'

type Principal = Readonly<{ tenant: string }>

function id(name: string): CapabilityId {
  const made = capabilityId('note', name)
  if (!made.ok) throw new Error('identity')
  return made.id
}

const contract: BodyContract = {
  category: 'note',
  schema: { kind: 'null' },
  judge: () => ({ ok: true }),
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
  summarize: (_, context) => ({
    title: `Note ${context?.capabilityName ?? '?'}`,
    description: 'One line.',
    facts: [],
  }),
  settings: (_, context) =>
    context?.capabilityName === 'keyed'
      ? {
          providerId: 'notes',
          definitionId: 'keyed',
          version: context.definition ?? '0',
          groups: [],
          items: [],
        }
      : null,
}

const BODY = { kind: 'string', value: 'body' } as const

const official = (name: string, version = `v-${name}`): OfficialAsset => ({
  capability: id(name),
  asset: `official/note/${name}`,
  version,
  body: BODY,
})

const tenantRow = (name: string, origin: AssetRow['origin'] = 'customized'): AssetRow => ({
  capability: id(name),
  layer: 'tenant',
  asset: `note/${name}`,
  version: 'v1',
  selection: 'follow',
  enabled: true,
  holding: `held-${name}`,
  origin,
  summary: null,
})

const officialRow = (asset: OfficialAsset): AssetRow => ({
  capability: asset.capability,
  layer: 'official',
  asset: asset.asset,
  version: asset.version,
  selection: 'pinned',
  enabled: true,
  holding: asset.asset,
  origin: 'official',
  summary: { title: `Note ${asset.capability.name}`, description: 'One line.', facts: [] },
})

const officialLayer = (assets: readonly OfficialAsset[]): AssetLayerSource => ({
  layer: 'official',
  list: async () => ({ layer: 'official', state: 'not-applicable' }),
  candidates: async () => ({
    layer: 'official',
    state: 'read',
    candidates: assets.map(asset => ({
      asset: asset.asset,
      version: asset.version,
      disabled: false,
      immutable: false,
      replaceLocked: false,
    })),
  }),
})

type Options = Readonly<{
  official?: readonly OfficialAsset[] | 'unavailable' | 'throws'
  /** The tenant layer's rows, paged two at a time by name. */
  rows?: readonly AssetRow[]
  store?: Partial<TenantLayerStore>
}>

function setup(options: Options = {}) {
  const categories = createCategoryPoint()
  categories.contribute({
    contract,
    display: { title: 'Note', summary: 'Notes.' },
    point: 'note.point',
  })
  const rows = options.rows ?? []
  const assets = Array.isArray(options.official) ? options.official : []
  const listed: Array<string | null> = []
  const store: TenantLayerStore = {
    async list({ after, limit }) {
      listed.push(after)
      const start = after === null ? 0 : rows.findIndex(row => row.capability.name === after) + 1
      const items = rows.slice(start, start + limit)
      const more = start + limit < rows.length
      return { kind: 'page', items, next: more ? (items.at(-1)?.capability.name ?? null) : null }
    },
    async held(capability) {
      const row = rows.find(each => each.capability.name === capability.name)
      return row === undefined
        ? { kind: 'absent' }
        : {
            kind: 'held',
            row,
            revision: 3,
            content: { kind: 'data', body: { kind: 'null' } },
            settings: false,
          }
    },
    files: async () => ({ kind: 'absent' }),
    holding: async () => ({ kind: 'absent' }),
    change: async () => ({ kind: 'committed', changed: true }),
    recall: async () => ({ kind: 'not-found' }),
    recallPublication: async () => ({ kind: 'not-found' }),
    recallById: async () => ({ kind: 'not-found' }),
    uploads: {
      begin: async () => ({ kind: 'unavailable' }),
      resume: async () => ({ kind: 'absent' }),
      append: async () => ({ kind: 'absent' }),
      reader: async () => ({ kind: 'absent' }),
      discard: async () => {},
    },
    layers: [officialLayer(assets)],
    ...options.store,
  }
  const management = createTenantManagement<Principal>({
    acting: {
      admit: async input => (input.principal.tenant === input.tenant ? 'admitted' : 'denied'),
    },
    categories,
    publishing: { publish: async () => ({ kind: 'unavailable' }) },
    storeOf: async () => store,
    official() {
      if (options.official === 'throws') throw new Error('the point cannot be read')
      return options.official ?? []
    },
  })
  return { management, listed }
}

const scope = { tenant: 'alice', principal: { tenant: 'alice' } } as const
const page = (after: string | null = null, limit = 10) => ({
  ...scope,
  category: 'note',
  after,
  limit,
})

describe('the list of a category holds its official assets', () => {
  it('lists the official assets first, by name, then the tenant layer', async () => {
    const s = setup({ official: [official('b'), official('a')], rows: [tenantRow('c')] })
    expect(await s.management.list(page())).toEqual({
      kind: 'page',
      items: [officialRow(official('a')), officialRow(official('b')), tenantRow('c')],
      next: null,
      completeness: 'complete',
    })
  })

  it('an official asset of another category is not listed', async () => {
    const other = { ...official('x'), capability: { category: 'tool', name: 'x' } }
    const s = setup({ official: [other as OfficialAsset] })
    expect(await s.management.list(page())).toMatchObject({ items: [] })
  })

  it('an official asset the tenant layer holds as installed is listed once, as the tenant holds it', async () => {
    const s = setup({ official: [official('a')], rows: [tenantRow('a', 'official')] })
    expect(await s.management.list(page())).toMatchObject({ items: [tenantRow('a', 'official')] })
  })

  it('a customized asset of the same name does not hide the official one', async () => {
    const s = setup({ official: [official('a')], rows: [tenantRow('a')] })
    expect(await s.management.list(page())).toMatchObject({
      items: [officialRow(official('a')), tenantRow('a')],
    })
  })

  it('more official assets than the page holds: the cursor stays in the official part', async () => {
    const s = setup({ official: [official('a'), official('b'), official('c')] })
    const first = await s.management.list(page(null, 2))
    expect(first).toMatchObject({ items: [officialRow(official('a')), officialRow(official('b'))] })
    if (first.kind !== 'page' || first.next === null) throw new Error('a next page')
    expect(await s.management.list(page(first.next, 2))).toEqual({
      kind: 'page',
      items: [officialRow(official('c'))],
      next: null,
      completeness: 'complete',
    })
  })

  it('a page the official assets fill exactly goes on with the tenant layer', async () => {
    const s = setup({ official: [official('a')], rows: [tenantRow('m'), tenantRow('n')] })
    const first = await s.management.list(page(null, 1))
    expect(first).toMatchObject({ items: [officialRow(official('a'))] })
    if (first.kind !== 'page' || first.next === null) throw new Error('a next page')
    const second = await s.management.list(page(first.next, 1))
    expect(second).toMatchObject({ items: [tenantRow('m')] })
    if (second.kind !== 'page' || second.next === null) throw new Error('a next page')
    expect(await s.management.list(page(second.next, 1))).toMatchObject({
      items: [tenantRow('n')],
      next: null,
    })
    expect(s.listed).toEqual([null, 'm'])
  })

  it('the room the official assets leave is filled from the tenant layer', async () => {
    const s = setup({
      official: [official('a')],
      rows: [tenantRow('m'), tenantRow('n'), tenantRow('o')],
    })
    const first = await s.management.list(page(null, 3))
    expect(first).toMatchObject({
      items: [officialRow(official('a')), tenantRow('m'), tenantRow('n')],
    })
    if (first.kind !== 'page' || first.next === null) throw new Error('a next page')
    expect(await s.management.list(page(first.next, 3))).toMatchObject({
      items: [tenantRow('o')],
      next: null,
    })
  })

  it.each(['unavailable', 'throws'] as const)(
    'official assets that %s answer unavailable, not a page without them',
    async official => {
      expect(await setup({ official }).management.list(page())).toEqual({ kind: 'unavailable' })
    },
  )

  it('a tenant layer that cannot say whether it holds an official asset answers unavailable', async () => {
    const s = setup({
      official: [official('a')],
      store: { held: async () => ({ kind: 'unavailable' }) },
    })
    expect(await s.management.list(page())).toEqual({ kind: 'unavailable' })
  })

  it('a cursor the list never gave is invalid', async () => {
    expect(await setup().management.list(page('a'))).toEqual({ kind: 'invalid' })
  })
})

describe('an official asset can be looked at', () => {
  const looking = (name: string) => ({ ...scope, capability: id(name) })

  it('the tenant layer does not hold it: its row, its body, its standing and its settings flag', async () => {
    const s = setup({ official: [official('keyed')] })
    expect(await s.management.describe(looking('keyed'))).toEqual({
      kind: 'asset',
      row: officialRow(official('keyed')),
      revision: 0,
      content: { kind: 'data', body: BODY },
      standing: { kind: 'selected' },
      settings: true,
    })
  })

  it('a category that declares no settings for it: no settings', async () => {
    const s = setup({ official: [official('plain')] })
    expect(await s.management.describe(looking('plain'))).toMatchObject({ settings: false })
  })

  it('held by the tenant layer: the tenant holding, as before', async () => {
    const s = setup({ official: [official('a')], rows: [tenantRow('a', 'official')] })
    expect(await s.management.describe(looking('a'))).toMatchObject({
      row: tenantRow('a', 'official'),
      revision: 3,
    })
  })

  it('neither layer has it: absent', async () => {
    expect(await setup({ official: [] }).management.describe(looking('a'))).toEqual({
      kind: 'absent',
    })
  })

  it.each(['unavailable', 'throws'] as const)(
    'official assets that %s answer unavailable, not absent',
    async official => {
      expect(await setup({ official }).management.describe(looking('a'))).toEqual({
        kind: 'unavailable',
      })
    },
  )

  it('its files are its body', async () => {
    const s = setup({ official: [official('a')] })
    expect(await s.management.files(looking('a'))).toEqual({
      kind: 'body',
      version: 'v-a',
      body: BODY,
    })
  })

  it('the files of one brought with the files of its version are those files', async () => {
    const from = {
      manifest: async () => ({ ok: { entries: [] } }),
      open: async () => ({ failure: 'entry-not-found' as const }),
    }
    const s = setup({ official: [{ ...official('a'), files: from }] })
    expect(await s.management.files(looking('a'))).toEqual({ kind: 'files', version: 'v-a', from })
  })

  it('files of an asset neither layer has: absent', async () => {
    expect(await setup({ official: [] }).management.files(looking('a'))).toEqual({
      kind: 'absent',
    })
  })
})

describe('an official asset cannot be disabled or removed', () => {
  const change = (holding: string) => ({ ...scope, operationId: 'op-1', holding })

  it.each([
    ['setEnabled', { enabled: false }],
    ['remove', {}],
  ] as const)('%s on its reference: not writable, official', async (action, extra) => {
    const s = setup({ official: [official('a')] })
    const input = { ...change('official/note/a'), ...extra }
    const answer =
      action === 'remove'
        ? await s.management.remove(input)
        : await s.management.setEnabled({ ...input, enabled: false })
    expect(answer).toEqual({ kind: 'not-writable', reason: 'official' })
  })

  it('a reference neither layer has: absent', async () => {
    const s = setup({ official: [official('a')] })
    expect(await s.management.remove(change('official/note/zzz'))).toEqual({ kind: 'absent' })
  })

  it('official assets that cannot be read: unavailable', async () => {
    const s = setup({ official: 'unavailable' })
    expect(await s.management.remove(change('official/note/a'))).toEqual({
      kind: 'unavailable',
    })
  })
})
