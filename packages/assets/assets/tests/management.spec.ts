import { describe, expect, it } from 'vitest'
import {
  capabilityId,
  createCategoryPoint,
  createTenantManagement,
  type AssetLayerSource,
  type AssetRow,
  type BodyContract,
  type Candidate,
  type CapabilityId,
  type HoldingChange,
  type StoreChange,
  type StoreOperation,
  type TenantActing,
  type TenantLayerStore,
} from '@omne-harness/assets'

type Principal = Readonly<{ tenant: string }>

function id(category: string, name: string): CapabilityId {
  const made = capabilityId(category, name)
  if (!made.ok) throw new Error('identity')
  return made.id
}

const contract: BodyContract = {
  category: 'note',
  schema: { kind: 'null' },
  judge: () => ({ ok: true }),
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
}

const ROW: AssetRow = {
  capability: id('note', 'a'),
  layer: 'tenant',
  asset: 'note/a',
  version: 'v1',
  selection: 'follow',
  enabled: true,
  holding: 'held-1',
  origin: 'customized',
  summary: null,
}

type Holding = Readonly<{
  state: 'held' | 'removed'
  enabled: boolean
  origin: 'customized' | 'official'
  revision: number
}>

const HELD: Holding = { state: 'held', enabled: true, origin: 'customized', revision: 4 }

function layer(candidates: 'read' | 'disabled' | 'unavailable' = 'read'): AssetLayerSource {
  return {
    layer: 'tenant',
    list: async () => ({ state: 'invalid' }),
    candidates: async () =>
      candidates === 'unavailable'
        ? { layer: 'tenant', state: 'unavailable' }
        : {
            layer: 'tenant',
            state: 'read',
            candidates: [
              {
                asset: 'note/a',
                version: 'v1',
                disabled: candidates === 'disabled',
                immutable: false,
                replaceLocked: false,
              },
            ],
          },
  }
}

type Changed = {
  operationId: string
  holdingRef: string
  expectedRevision: number
  change: HoldingChange
}

function setup(
  options: {
    admit?: TenantActing<Principal>['admit']
    store?: Partial<TenantLayerStore> | 'missing' | 'throws'
    holding?: Holding | 'absent' | 'unavailable'
    change?: StoreChange | 'throws'
    recall?: StoreChange | { kind: 'not-found' } | 'throws'
    operation?: StoreOperation | 'throws'
    /** A second contribution of the category: it is a conflict and gives no contract. */
    rival?: true
  } = {},
) {
  const categories = createCategoryPoint()
  categories.contribute({
    contract,
    display: { title: 'Note', summary: 'Notes.' },
    point: 'test.site2',
  })
  if (options.rival === true)
    categories.contribute({
      contract,
      display: { title: 'Rival', summary: 'R.' },
      point: 'note.rival',
    })
  const asked: string[] = []
  const changed: Changed[] = []
  const reads: string[] = []
  const store: TenantLayerStore = {
    list: async () => ({ kind: 'page', items: [ROW], next: null }),
    held: async () => ({
      kind: 'held',
      row: ROW,
      revision: 4,
      content: { kind: 'data', body: { kind: 'null' } },
      settings: false,
    }),
    files: async () => ({ kind: 'body', version: 'v1', body: { kind: 'null' } }),
    async holding(ref) {
      reads.push(ref)
      const holding = options.holding ?? HELD
      return typeof holding === 'string' ? { kind: holding } : { kind: 'holding', ...holding }
    },
    async change(input) {
      changed.push(input)
      if (options.change === 'throws') throw new Error('the reply was lost')
      return options.change ?? { kind: 'committed', changed: true }
    },
    async recall() {
      if (options.recall === 'throws') throw new Error('the receipts cannot be read')
      return options.recall ?? { kind: 'not-found' }
    },
    recallPublication: async () => ({ kind: 'not-found' }),
    async recallById(operationId) {
      reads.push(`operation ${operationId}`)
      if (options.operation === 'throws') throw new Error('the receipts cannot be read')
      return options.operation ?? { kind: 'not-found' }
    },
    uploads: {
      begin: async () => ({ kind: 'unavailable' }),
      resume: async () => ({ kind: 'absent' }),
      append: async () => ({ kind: 'absent' }),
      reader: async () => ({ kind: 'absent' }),
      discard: async () => {},
    },
    layers: [layer()],
    ...(typeof options.store === 'object' ? options.store : {}),
  }
  const management = createTenantManagement<Principal>({
    acting: {
      admit:
        options.admit ??
        (async input => {
          asked.push(`${input.principal.tenant}->${input.tenant}`)
          return input.principal.tenant === input.tenant ? 'admitted' : 'denied'
        }),
    },
    categories,
    publishing: { publish: async () => ({ kind: 'unavailable' }) },
    official: () => [],
    async storeOf() {
      if (options.store === 'throws') throw new Error('the tenant set does not open')
      return options.store === 'missing' ? undefined : store
    },
  })
  return { management, asked, changed, reads }
}

const scope = { tenant: 'alice', principal: { tenant: 'alice' } } as const
const enable = (enabled: boolean, operationId = 'op-1') => ({
  ...scope,
  operationId,
  holding: 'held-1',
  enabled,
})
const removal = (operationId = 'op-1') => ({ ...scope, operationId, holding: 'held-1' })

describe('enable, disable and remove: the cells of table two', () => {
  it.each([
    ['setEnabled', (s: ReturnType<typeof setup>) => s.management.setEnabled(enable(false))],
    ['remove', (s: ReturnType<typeof setup>) => s.management.remove(removal())],
  ] as const)(
    '%s on a holding this tenant does not have: absent, nothing written',
    async (_, act) => {
      const s = setup({ holding: 'absent' })
      expect(await act(s)).toEqual({ kind: 'absent' })
      expect(s.changed).toEqual([])
    },
  )

  it.each([
    ['setEnabled', (s: ReturnType<typeof setup>) => s.management.setEnabled(enable(false))],
    ['remove', (s: ReturnType<typeof setup>) => s.management.remove(removal())],
  ] as const)(
    '%s on an official holding: not-writable, official, nothing written',
    async (_, act) => {
      const s = setup({ holding: { ...HELD, origin: 'official' } })
      expect(await act(s)).toEqual({ kind: 'not-writable', reason: 'official' })
      expect(s.changed).toEqual([])
    },
  )

  it('setEnabled to the state it is already in: no-change, nothing written', async () => {
    const s = setup()
    expect(await s.management.setEnabled(enable(true))).toEqual({ kind: 'no-change' })
    expect(s.changed).toEqual([])
  })

  it('setEnabled to the other state: written at the revision it read, changed', async () => {
    const s = setup()
    expect(await s.management.setEnabled(enable(false))).toEqual({ kind: 'changed' })
    expect(s.changed).toEqual([
      {
        operationId: 'op-1',
        holdingRef: 'held-1',
        expectedRevision: 4,
        change: { kind: 'setEnabled', enabled: false },
      },
    ])
  })

  it('remove a held holding: written at the revision it read, changed', async () => {
    const s = setup()
    expect(await s.management.remove(removal())).toEqual({ kind: 'changed' })
    expect(s.changed).toEqual([
      {
        operationId: 'op-1',
        holdingRef: 'held-1',
        expectedRevision: 4,
        change: { kind: 'remove' },
      },
    ])
  })

  it('a removed holding: setEnabled is not-writable, removed; remove again is no-change; nothing written', async () => {
    const s = setup({ holding: { ...HELD, state: 'removed' } })
    expect(await s.management.setEnabled(enable(false))).toEqual({
      kind: 'not-writable',
      reason: 'removed',
    })
    expect(await s.management.remove(removal())).toEqual({ kind: 'no-change' })
    expect(s.changed).toEqual([])
  })
})

describe('enable, disable and remove: the answers that do not depend on the state', () => {
  it('a principal that may not act for the tenant is denied, before the store is opened', async () => {
    const s = setup()
    expect(await s.management.remove({ ...removal(), tenant: 'bob' })).toEqual({ kind: 'denied' })
    expect(s.reads).toEqual([])
  })

  it('admission is asked on every call', async () => {
    const s = setup()
    await s.management.remove(removal('op-1'))
    await s.management.setEnabled(enable(false, 'op-2'))
    expect(s.asked).toEqual(['alice->alice', 'alice->alice'])
  })

  it.each([
    ['admission cannot answer', { admit: async () => 'unavailable' as const }],
    [
      'admission throws',
      {
        admit: async (): Promise<'admitted'> => {
          throw new Error('identity is down')
        },
      },
    ],
    ['the tenant store is not there', { store: 'missing' as const }],
    ['the tenant store throws', { store: 'throws' as const }],
    ['the holding cannot be read', { holding: 'unavailable' as const }],
    ['the receipts cannot be read', { recall: 'throws' as const }],
  ])('%s: unavailable, nothing written', async (_, options) => {
    const s = setup(options)
    expect(await s.management.remove(removal())).toEqual({ kind: 'unavailable' })
    expect(s.changed).toEqual([])
  })

  it('the revision moved between the read and the commit: conflict', async () => {
    const s = setup({ change: { kind: 'conflict' } })
    expect(await s.management.setEnabled(enable(false))).toEqual({ kind: 'conflict' })
  })

  it.each([
    ['the store answers it does not know', { kind: 'unknown' } as const],
    ['the commit throws', 'throws' as const],
  ])('%s: unknown, with the operation', async (_, change) => {
    const s = setup({ change })
    expect(await s.management.remove(removal('op-9'))).toEqual({
      kind: 'unknown',
      operationId: 'op-9',
    })
  })

  it('an operation with a receipt answers that receipt, without reading or writing again', async () => {
    const s = setup({
      recall: { kind: 'committed', changed: true },
      holding: { ...HELD, enabled: false },
    })
    expect(await s.management.setEnabled(enable(false))).toEqual({ kind: 'changed' })
    expect(s.reads).toEqual([])
    expect(s.changed).toEqual([])
  })

  it('an operation whose receipt is for another input is an operation conflict', async () => {
    const s = setup({ recall: { kind: 'operation-conflict' } })
    expect(await s.management.remove(removal())).toEqual({ kind: 'operation-conflict' })
    expect(s.changed).toEqual([])
  })

  it('an operation the store cannot settle is unknown', async () => {
    const s = setup({ recall: { kind: 'unknown' } })
    expect(await s.management.remove(removal('op-3'))).toEqual({
      kind: 'unknown',
      operationId: 'op-3',
    })
  })
})

describe('recall an operation by its id alone', () => {
  const byId = (operationId = 'op-7', tenant = 'alice') => ({ ...scope, tenant, operationId })

  it('a publication answers its capability, its version and its outcome', async () => {
    const outcome = {
      kind: 'published',
      version: 'v2',
      holdingRef: 'held-1',
      changed: true,
    } as const
    const s = setup({
      operation: { kind: 'publish', capability: id('note', 'a'), version: 'v2', outcome },
    })
    expect(await s.management.recallById(byId())).toEqual({
      kind: 'publish',
      capability: id('note', 'a'),
      version: 'v2',
      outcome,
    })
    expect(s.reads).toEqual(['operation op-7'])
    expect(s.changed).toEqual([])
  })

  it.each([
    [
      'a disable that changed it',
      { kind: 'setEnabled', enabled: false } as const,
      { kind: 'committed', changed: true } as const,
      { kind: 'setEnabled', enabled: false, outcome: { kind: 'changed' } },
    ],
    [
      'an enable that found it enabled',
      { kind: 'setEnabled', enabled: true } as const,
      { kind: 'committed', changed: false } as const,
      { kind: 'setEnabled', enabled: true, outcome: { kind: 'no-change' } },
    ],
    [
      'a removal whose commit is not known',
      { kind: 'remove' } as const,
      { kind: 'unknown' } as const,
      { kind: 'remove', outcome: { kind: 'unknown', operationId: 'op-7' } },
    ],
    [
      'a removal that lost the race',
      { kind: 'remove' } as const,
      { kind: 'conflict' } as const,
      { kind: 'remove', outcome: { kind: 'conflict' } },
    ],
  ])('%s answers what was asked and the receipt', async (_, change, answer, expected) => {
    const capability = id('note', 'a')
    const s = setup({
      operation: { kind: 'change', holding: 'held-1', capability, change, answer },
    })
    expect(await s.management.recallById(byId())).toEqual({
      holding: 'held-1',
      capability,
      ...expected,
    })
    expect(s.changed).toEqual([])
  })

  it('a change whose holding no longer names its capability says so with null', async () => {
    const s = setup({
      operation: {
        kind: 'change',
        holding: 'held-1',
        capability: null,
        change: { kind: 'remove' },
        answer: { kind: 'committed', changed: true },
      },
    })
    expect(await s.management.recallById(byId())).toEqual({
      kind: 'remove',
      holding: 'held-1',
      capability: null,
      outcome: { kind: 'changed' },
    })
  })

  it('an id under which nothing was done is absent', async () => {
    expect(await setup().management.recallById(byId())).toEqual({ kind: 'absent' })
  })

  it('a principal for another tenant is denied, before the store is opened', async () => {
    const s = setup()
    expect(await s.management.recallById(byId('op-7', 'bob'))).toEqual({ kind: 'denied' })
    expect(s.reads).toEqual([])
  })

  it.each([
    ['the store answers unavailable', { operation: { kind: 'unavailable' } as const }],
    ['the store throws', { operation: 'throws' as const }],
    ['the tenant store is not there', { store: 'missing' as const }],
  ])('%s: unavailable', async (_, options) => {
    expect(await setup(options).management.recallById(byId())).toEqual({ kind: 'unavailable' })
  })
})

describe('list one category', () => {
  const list = (limit = 10, category = 'note') => ({ ...scope, category, after: null, limit })

  it('a category that two contributions make a conflict is unavailable, not unknown and not listed', async () => {
    expect(await setup({ rival: true }).management.list(list())).toEqual({ kind: 'unavailable' })
  })

  it('gives the page of the store, complete', async () => {
    expect(await setup().management.list(list())).toEqual({
      kind: 'page',
      items: [ROW],
      next: null,
      completeness: 'complete',
    })
  })

  it('a principal for another tenant is denied', async () => {
    expect(await setup().management.list({ ...list(), tenant: 'bob' })).toEqual({ kind: 'denied' })
  })

  it('a category that is not registered is unknown-category', async () => {
    expect(await setup().management.list(list(10, 'nobody'))).toEqual({ kind: 'unknown-category' })
  })

  it.each([0, 101, 1.5])('a limit of %s is invalid', async limit => {
    expect(await setup().management.list(list(limit))).toEqual({ kind: 'invalid' })
  })

  it.each([
    ['answers invalid', { list: async () => ({ kind: 'invalid' as const }) }, 'invalid'],
    ['cannot read', { list: async () => ({ kind: 'unavailable' as const }) }, 'unavailable'],
    [
      'throws',
      {
        list: async (): Promise<{ kind: 'invalid' }> => {
          throw new Error('read failed')
        },
      },
      'unavailable',
    ],
  ])('a store that %s answers %s, not an empty page', async (_, store, kind) => {
    expect(await setup({ store }).management.list(list())).toEqual({ kind })
  })
})

describe('describe one asset', () => {
  const describing = { ...scope, capability: id('note', 'a') }

  it('gives the row, the revision, the content, the settings flag and the standing it evaluates now', async () => {
    expect(await setup().management.describe(describing)).toEqual({
      kind: 'asset',
      row: ROW,
      revision: 4,
      content: { kind: 'data', body: { kind: 'null' } },
      standing: { kind: 'selected' },
      settings: false,
    })
  })

  it('a disabled holding is filtered out, for being disabled', async () => {
    const s = setup({ store: { layers: [layer('disabled')] } })
    expect(await s.management.describe(describing)).toMatchObject({
      standing: { kind: 'filtered', reason: 'disabled' },
    })
  })

  describe('with the official layer beside the tenant layer', () => {
    const official = (
      over: Partial<Candidate> | 'none' | 'unavailable' = {},
    ): AssetLayerSource => ({
      layer: 'official',
      list: async () => ({ layer: 'official', state: 'not-applicable' }),
      candidates: async () => {
        if (over === 'unavailable') return { layer: 'official', state: 'unavailable' }
        const shipped = {
          asset: 'official/note/a',
          version: 'v0',
          disabled: false,
          immutable: false,
          replaceLocked: false,
          ...(over === 'none' ? {} : over),
        }
        return { layer: 'official', state: 'read', candidates: over === 'none' ? [] : [shipped] }
      },
    })
    const standing = async (...layers: AssetLayerSource[]) => {
      const s = setup({ store: { layers } })
      const described = await s.management.describe(describing)
      return described.kind === 'asset' ? described.standing : described.kind
    }

    it('the holding of the tenant is in use over what the release brings under the same name', async () => {
      expect(await standing(official(), layer())).toEqual({ kind: 'selected' })
      expect(await standing(official('none'), layer())).toEqual({ kind: 'selected' })
    })

    it('a disabled holding is filtered though the official one wins: the standing is of this holding', async () => {
      expect(await standing(official(), layer('disabled'))).toEqual({
        kind: 'filtered',
        reason: 'disabled',
      })
    })

    it('an official definition that locks the name blocks the holding, and says which layer does', async () => {
      const blocked = { kind: 'filtered', reason: 'blocked', by: 'official' }
      expect(await standing(official({ immutable: true }), layer())).toEqual(blocked)
      expect(await standing(official({ replaceLocked: true }), layer())).toEqual(blocked)
    })

    it('an official layer that cannot be read gives an unavailable standing that names it', async () => {
      expect(await standing(official('unavailable'), layer())).toEqual({
        kind: 'unavailable',
        layer: 'official',
      })
    })

    it('says why this holding is out, not why an earlier one is', async () => {
      const organization: AssetLayerSource = {
        layer: 'organization',
        list: async () => ({ layer: 'organization', state: 'not-applicable' }),
        candidates: async () => ({
          layer: 'organization',
          state: 'read',
          candidates: [
            {
              asset: 'organization/note/a',
              version: 'v9',
              disabled: false,
              immutable: true,
              replaceLocked: false,
            },
          ],
        }),
      }
      expect(await standing(official({ disabled: true }), organization, layer())).toEqual({
        kind: 'filtered',
        reason: 'blocked',
        by: 'organization',
      })
    })

    it('another version of the same asset is not this holding', async () => {
      const newer: AssetLayerSource = {
        layer: 'tenant',
        list: async () => ({ state: 'invalid' }),
        candidates: async () => ({
          layer: 'tenant',
          state: 'read',
          candidates: [
            {
              asset: 'note/a',
              version: 'v2',
              disabled: false,
              immutable: false,
              replaceLocked: false,
            },
          ],
        }),
      }
      expect(await standing(official('none'), newer)).toEqual({
        kind: 'unavailable',
        layer: 'tenant',
      })
    })

    it('a holding that is not among the candidates of its layer is unavailable, not in use', async () => {
      const elsewhere: AssetLayerSource = {
        layer: 'tenant',
        list: async () => ({ state: 'invalid' }),
        candidates: async () => ({ layer: 'tenant', state: 'read', candidates: [] }),
      }
      expect(await standing(official(), elsewhere)).toEqual({
        kind: 'unavailable',
        layer: 'tenant',
      })
    })
  })

  it('a filtered holding names the layer that blocks it only when one does', async () => {
    const s = setup({ store: { layers: [layer('disabled')] } })
    const described = await s.management.describe(describing)
    expect(described.kind === 'asset' && described.standing).toStrictEqual({
      kind: 'filtered',
      reason: 'disabled',
    })
  })

  it('another asset at the same version is not this holding', async () => {
    const other: AssetLayerSource = {
      layer: 'tenant',
      list: async () => ({ state: 'invalid' }),
      candidates: async () => ({
        layer: 'tenant',
        state: 'read',
        candidates: [
          {
            asset: 'note/other',
            version: 'v1',
            disabled: false,
            immutable: false,
            replaceLocked: false,
          },
        ],
      }),
    }
    const s = setup({ store: { layers: [other] } })
    expect(await s.management.describe(describing)).toMatchObject({
      standing: { kind: 'unavailable', layer: 'tenant' },
    })
  })

  it('a layer that cannot be read gives an unavailable standing', async () => {
    const s = setup({ store: { layers: [layer('unavailable')] } })
    expect(await s.management.describe(describing)).toMatchObject({
      standing: { kind: 'unavailable', layer: 'tenant' },
    })
  })

  it.each([
    ['absent', { held: async () => ({ kind: 'absent' as const }) }, 'absent'],
    ['unavailable', { held: async () => ({ kind: 'unavailable' as const }) }, 'unavailable'],
    [
      'a throw',
      {
        held: async (): Promise<{ kind: 'absent' }> => {
          throw new Error('read failed')
        },
      },
      'unavailable',
    ],
  ])('a store that answers %s answers %s', async (_, store, kind) => {
    expect(await setup({ store }).management.describe(describing)).toEqual({ kind })
  })

  it('a principal for another tenant is denied', async () => {
    expect(await setup().management.describe({ ...describing, tenant: 'bob' })).toEqual({
      kind: 'denied',
    })
  })
})

describe('the files of the held version', () => {
  const asking = { ...scope, capability: id('note', 'a') }

  it('gives what the store gives for the held version', async () => {
    expect(await setup().management.files(asking)).toEqual({
      kind: 'body',
      version: 'v1',
      body: { kind: 'null' },
    })
  })

  it('a principal for another tenant is denied, before the store is opened', async () => {
    const s = setup({ store: { files: async () => ({ kind: 'absent' as const }) } })
    expect(await s.management.files({ ...asking, tenant: 'bob' })).toEqual({ kind: 'denied' })
    expect(s.asked).toEqual(['alice->bob'])
  })

  it.each([
    ['answers absent', { files: async () => ({ kind: 'absent' as const }) }, 'absent'],
    ['cannot read', { files: async () => ({ kind: 'unavailable' as const }) }, 'unavailable'],
    [
      'throws',
      {
        files: async (): Promise<{ kind: 'absent' }> => {
          throw new Error('read failed')
        },
      },
      'unavailable',
    ],
  ])('a store that %s answers %s, never none', async (_, store, kind) => {
    expect(await setup({ store }).management.files(asking)).toEqual({ kind })
  })

  it.each(['missing', 'throws'] as const)(
    'a store of the tenant that is %s is unavailable',
    async store => {
      expect(await setup({ store }).management.files(asking)).toEqual({ kind: 'unavailable' })
    },
  )
})
