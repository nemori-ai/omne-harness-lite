import { describe, expect, it } from 'vitest'
import {
  capabilityId,
  createCategoryPoint,
  createTenantManagement,
  type AssetLayerSource,
  type AssetRow,
  type BodyContract,
  type CapabilityId,
  type HoldingChange,
  type StoreChange,
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
  } = {},
) {
  const categories = createCategoryPoint()
  categories.contribute({ contract, display: { title: 'Note', summary: 'Notes.' } })
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
    layer: layer(),
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

describe('list one category', () => {
  const list = (limit = 10, category = 'note') => ({ ...scope, category, after: null, limit })

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
    const s = setup({ store: { layer: layer('disabled') } })
    expect(await s.management.describe(describing)).toMatchObject({
      standing: { kind: 'filtered', reason: 'disabled' },
    })
  })

  it('a layer that cannot be read gives an unavailable standing', async () => {
    const s = setup({ store: { layer: layer('unavailable') } })
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
