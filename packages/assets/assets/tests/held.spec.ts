import {
  candidates as readPoint,
  declare,
  empty,
  install,
  type Contract,
  type Entry,
  type Registry,
} from '@omne-harness/dynamis'
import { describe, expect, it } from 'vitest'
import {
  capabilityId,
  createHeldBook,
  evaluate,
  heldLayerSource,
  heldPoint,
  layerInputsOf,
  layerOfScope,
  scopeOfLayer,
  type Candidate,
  type Eligibility,
  type Evaluation,
  type HeldItem,
  type LayerInput,
} from '../src/index.ts'

const POINT = 'skill.skills'
const NAMES = ['review', 'report', 'ledger']
const TENANTS = ['tenant-a', 'tenant-b']

const contract: Contract = {
  ...heldPoint({
    name: POINT,
    key: 'the name of a skill',
    summary: 'the skills each layer holds',
  }),
  title: 'test',
}

type Random = () => number

function randomOf(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

const below = (random: Random, limit: number): number => Math.floor(random() * limit)
const pick = <T>(random: Random, from: readonly T[]): T => from[below(random, from.length)] as T
const chance = (random: Random, one: number): boolean => below(random, one) === 0

/** The ledger: what each layer holds under each name, kept apart from the registry. */
type World = { official: Map<string, HeldItem>; tenants: Map<string, Map<string, HeldItem>> }

const newWorld = (): World => ({
  official: new Map(),
  tenants: new Map(TENANTS.map(tenant => [tenant, new Map<string, HeldItem>()])),
})

let minted = 0

function mintItem(random: Random, owner: string, name: string, official: boolean): HeldItem {
  minted += 1
  return {
    asset: `${owner}/${name}#${minted}`,
    version: `v${minted}`,
    disabled: chance(random, 4),
    immutable: official && chance(random, 5),
    replaceLocked: official && chance(random, 5),
  }
}

function step(random: Random, world: World): void {
  const name = pick(random, NAMES)
  if (chance(random, 3)) {
    if (chance(random, 4)) world.official.delete(name)
    else world.official.set(name, mintItem(random, 'official', name, true))
    return
  }
  const tenant = pick(random, TENANTS)
  const held = world.tenants.get(tenant) as Map<string, HeldItem>
  const current = held.get(name)
  const action = current === undefined ? 0 : below(random, 5)
  if (action === 0) held.set(name, mintItem(random, tenant, name, false))
  else if (action === 1) held.set(name, { ...(current as HeldItem), disabled: true })
  else if (action === 2) held.set(name, { ...(current as HeldItem), disabled: false })
  else if (action === 3) held.delete(name)
  else held.set(name, { ...(current as HeldItem), version: `v${(minted += 1)}` })
}

const entryOf = (name: string, scope: readonly string[], item: HeldItem): Entry<HeldItem> => ({
  point: POINT,
  key: name,
  id: '',
  scope,
  rank: 0,
  digest: JSON.stringify([
    item.asset,
    item.version,
    item.disabled,
    item.immutable,
    item.replaceLocked,
  ]),
  item,
})

function put(registry: Registry, fiber: string, entries: readonly Entry[]): Registry {
  const outcome = install(registry, { fiber, generation: 1 }, entries)
  if (outcome.kind !== 'installed') throw new Error(`refused: ${outcome.detail}`)
  return outcome.registry
}

function registryOf(world: World): Registry {
  let registry = put(empty, 'skills', [declare(contract)])
  registry = put(
    registry,
    'release',
    [...world.official].map(([name, item]) => entryOf(name, scopeOfLayer('official'), item)),
  )
  for (const [tenant, held] of world.tenants)
    registry = put(
      registry,
      `assets:${tenant}`,
      [...held].map(([name, item]) => entryOf(name, scopeOfLayer('tenant', tenant), item)),
    )
  return registry
}

const read = (layer: string, item: HeldItem | undefined): LayerInput => ({
  layer,
  state: 'read',
  candidates: item === undefined ? [] : [item],
})

const direct = (world: World, tenant: string, name: string): readonly LayerInput[] => [
  read('official', world.official.get(name)),
  read('tenant', world.tenants.get(tenant)?.get(name)),
]

const viaPoint = (registry: Registry, tenant: string, name: string): readonly LayerInput[] =>
  layerInputsOf(readPoint<HeldItem>(registry, POINT, name, scopeOfLayer('tenant', tenant)), tenant)

function eligibilityOf(random: Random): Eligibility {
  const verdicts = new Map<string, 'yes' | 'no' | 'unknown'>()
  const mood = below(random, 12)
  return candidate => {
    const known = verdicts.get(candidate.asset)
    if (known !== undefined) return known
    const verdict = mood === 0 ? 'unknown' : mood < 4 && chance(random, 2) ? 'no' : 'yes'
    verdicts.set(candidate.asset, verdict)
    return verdict
  }
}

describe('scopeOfLayer and layerOfScope: one place maps a layer to a scope', () => {
  it('每一层去了再回来是原处', () => {
    expect(scopeOfLayer('official')).toEqual([])
    expect(scopeOfLayer('tenant', 'tenant-a')).toEqual(['tenant', 'tenant-a'])
    expect(layerOfScope(scopeOfLayer('official'))).toBe('official')
    expect(layerOfScope(scopeOfLayer('tenant', 'tenant-a'))).toBe('tenant')
  })

  it('认不得的作用域答 null', () => {
    for (const scope of [
      ['tenant'],
      ['tenant', ''],
      ['tenant', 'a', 'workspace', 'w'],
      ['organization', 'o'],
      ['Tenant', 'a'],
      [''],
    ])
      expect(layerOfScope(scope)).toBeNull()
  })

  it('租户层没有给租户时拒绝，不给出一条空的作用域', () => {
    expect(() => scopeOfLayer('tenant', '')).toThrow('needs a tenant')
  })
})

describe('layerInputsOf: the entries of a point read back as the layers of an evaluation', () => {
  it('两层都答 read；没有条目的层是空候选，不是 not-applicable', () => {
    expect(layerInputsOf({ kind: 'read', entries: [] }, 'tenant-a')).toEqual([
      { layer: 'official', state: 'read', candidates: [] },
      { layer: 'tenant', state: 'read', candidates: [] },
    ])
  })

  it('点读不出时两层都答 unavailable', () => {
    expect(layerInputsOf({ kind: 'unavailable' }, 'tenant-a')).toEqual([
      { layer: 'official', state: 'unavailable' },
      { layer: 'tenant', state: 'unavailable' },
    ])
  })

  it('别的租户的条目与认不得的作用域不进任何一层', () => {
    const mine: HeldItem = {
      asset: 'a',
      version: '1',
      disabled: false,
      immutable: false,
      replaceLocked: false,
    }
    const other = { ...mine, asset: 'b' }
    const deep = { ...mine, asset: 'c' }
    const inputs = layerInputsOf(
      {
        kind: 'read',
        entries: [
          { scope: ['tenant', 'tenant-b'], item: other },
          { scope: ['tenant', 'tenant-a'], item: mine },
          { scope: ['tenant', 'tenant-a', 'workspace', 'w'], item: deep },
        ],
      },
      'tenant-a',
    )
    expect(inputs).toEqual([
      { layer: 'official', state: 'read', candidates: [] },
      { layer: 'tenant', state: 'read', candidates: [mine] },
    ])
  })

  it('一份带着正文在包的哪个子目录：它与同一版的整个包是两份，`within` 原样交出', () => {
    const whole: HeldItem = {
      asset: 'plugin/tidy',
      version: '1',
      disabled: false,
      immutable: true,
      replaceLocked: false,
    }
    const inner: HeldItem = { ...whole, within: 'skills/notes' }
    const scope = scopeOfLayer('tenant', 'tenant-a')
    const inputs = layerInputsOf(
      {
        kind: 'read',
        entries: [
          { scope, item: whole },
          { scope, item: inner },
          { scope, item: { ...inner } },
        ],
      },
      'tenant-a',
    )
    expect(inputs[1]).toEqual({ layer: 'tenant', state: 'read', candidates: [whole, inner] })
  })

  it('同一层两份不同的原样交出两份；两个持有者放的同一份只算一份', () => {
    const first: HeldItem = {
      asset: 'a',
      version: '1',
      disabled: false,
      immutable: false,
      replaceLocked: false,
    }
    const second = { ...first, asset: 'b' }
    const scope = scopeOfLayer('tenant', 'tenant-a')
    const inputs = layerInputsOf(
      {
        kind: 'read',
        entries: [
          { scope, item: first },
          { scope, item: second },
          { scope, item: { ...first } },
        ],
      },
      'tenant-a',
    )
    expect(inputs[1]).toEqual({ layer: 'tenant', state: 'read', candidates: [first, second] })
  })

  it('五栏里有一栏不同就是两份', () => {
    const base: HeldItem = {
      asset: 'a',
      version: '1',
      disabled: false,
      immutable: false,
      replaceLocked: false,
    }
    const variants: HeldItem[] = [
      { ...base, asset: 'b' },
      { ...base, version: '2' },
      { ...base, disabled: true },
      { ...base, immutable: true },
      { ...base, replaceLocked: true },
    ]
    for (const other of variants) {
      const entries = [base, other].map(item => ({ scope: scopeOfLayer('official'), item }))
      expect(layerInputsOf({ kind: 'read', entries }, 'tenant-a')[0]).toEqual({
        layer: 'official',
        state: 'read',
        candidates: [base, other],
      })
    }
  })
})

describe('differential: candidates given by layer, and read back from the point', () => {
  it('随机的持有历史上，两条路交给 evaluate 的结果逐项相同', () => {
    const seen = new Map<string, number>()
    const count = (mark: string): void => void seen.set(mark, (seen.get(mark) ?? 0) + 1)
    const note = (result: Evaluation): void => {
      count(result.kind === 'winner' ? `winner:${result.layer}` : result.kind)
      if (result.kind !== 'unavailable') for (const out of result.filtered) count(out.reason)
    }
    for (let seed = 1; seed <= 40; seed += 1) {
      const random = randomOf(seed)
      const world = newWorld()
      for (let turn = 0; turn < 60; turn += 1) {
        step(random, world)
        const registry = registryOf(world)
        const eligible = eligibilityOf(random)
        for (const tenant of TENANTS)
          for (const name of NAMES) {
            const expected = evaluate({ layers: direct(world, tenant, name), eligible })
            const actual = evaluate({ layers: viaPoint(registry, tenant, name), eligible })
            expect(actual, `seed ${seed} turn ${turn} ${tenant} ${name}`).toEqual(expected)
            note(expected)
          }
      }
    }
    for (const mark of [
      'winner:official',
      'winner:tenant',
      'none',
      'unavailable',
      'disabled',
      'ineligible',
      'blocked',
    ])
      expect(seen.get(mark) ?? 0, mark).toBeGreaterThan(20)
  })

  it('一个租户的候选里没有另一个租户的持有', () => {
    const world = newWorld()
    const item: Candidate = {
      asset: 'tenant-b/review#1',
      version: 'v1',
      disabled: false,
      immutable: false,
      replaceLocked: false,
    }
    world.tenants.get('tenant-b')?.set('review', item)
    const registry = registryOf(world)
    expect(viaPoint(registry, 'tenant-a', 'review')[1]).toEqual({
      layer: 'tenant',
      state: 'read',
      candidates: [],
    })
    expect(viaPoint(registry, 'tenant-b', 'review')[1]).toEqual({
      layer: 'tenant',
      state: 'read',
      candidates: [item],
    })
  })

  it('点没有声明时两层都答 unavailable，求值答依据不可用', () => {
    const inputs = layerInputsOf(
      readPoint<HeldItem>(empty, POINT, 'review', scopeOfLayer('tenant', 'tenant-a')),
      'tenant-a',
    )
    expect(evaluate({ layers: inputs, eligible: () => 'yes' })).toEqual({
      kind: 'unavailable',
      layer: 'official',
    })
  })
})

describe('heldPoint: the rules of the point of a category', () => {
  it('gives rules the registry takes: keyed, most specific, an item of the five facts, keys private unless said', () => {
    const point = heldPoint({ name: 'gadget.items', key: 'the gadget name', summary: 'Gadgets.' })
    expect(point).toEqual({
      name: 'gadget.items',
      tree: 'server',
      arity: 'keyed-one',
      keyFrom: null,
      key: 'the gadget name',
      gives: expect.stringMatching(/\S/u),
      item: {
        kind: 'data',
        fields: {
          asset: 'string',
          version: 'string',
          disabled: 'boolean',
          immutable: 'boolean',
          replaceLocked: 'boolean',
        },
      },
      resolve: 'most-specific',
      binding: 'run',
      onError: expect.stringMatching(/\S/u),
      version: 1,
      revision: 1,
      keys: 'private',
      conformance: null,
      summary: 'Gadgets.',
    })
    expect(heldPoint({ name: 'a.b', key: 'k', summary: 's', keys: 'public' }).keys).toBe('public')
  })

  it('an entry that lacks one of the five facts breaks the rules and is no candidate', () => {
    const whole = {
      asset: 'a',
      version: '1',
      disabled: false,
      immutable: false,
      replaceLocked: false,
    }
    const { version: _version, ...lacking } = whole
    let registry = put(empty, 'skills', [declare(contract)])
    registry = put(registry, 'release', [
      entryOf('whole', [], whole),
      { ...entryOf('lacking', [], whole), item: lacking as never },
    ])
    const read = readPoint<HeldItem>(registry, POINT, null, [])
    if (read.kind !== 'read') throw new Error(read.kind)
    expect(read.entries.map(entry => entry.key)).toEqual(['whole'])
    expect(read.filtered.map(out => [out.entry.key, out.reason])).toEqual([['lacking', 'breach']])
  })
})

describe('scopeOfLayer without a tenant', () => {
  it('refuses the tenant layer when no tenant is given at all', () => {
    expect(() => scopeOfLayer('tenant', undefined as never)).toThrow('needs a tenant')
  })
})

describe('a layer of one tenant as a source, without a registry', () => {
  const alpha = {
    asset: 'tenant-a/gadget/alpha',
    version: '1',
    disabled: false,
    immutable: false,
    replaceLocked: false,
  }
  const id = (category: string, name: string) => {
    const made = capabilityId(category, name)
    if (!made.ok) throw new Error('capability')
    return made.id
  }
  const listing = async () => ({ layer: 'tenant' as const, state: 'not-applicable' as const })

  it('the book reads as unavailable until it is told, then gives what it was told under that name', () => {
    const book = createHeldBook('tenant-a')
    expect(book.read(id('gadget', 'alpha'))).toEqual({ kind: 'unavailable' })
    book.sync([
      { category: 'gadget', name: 'alpha', item: alpha },
      { category: 'gadget', name: 'beta', item: { ...alpha, asset: 'tenant-a/gadget/beta' } },
      { category: 'widget', name: 'alpha', item: { ...alpha, asset: 'tenant-a/widget/alpha' } },
    ])
    expect(book.read(id('gadget', 'alpha'))).toEqual({
      kind: 'read',
      entries: [{ scope: ['tenant', 'tenant-a'], item: alpha }],
    })
    expect(book.read(id('gadget', 'gamma'))).toEqual({ kind: 'read', entries: [] })
    book.missed('failed')
    expect(book.read(id('gadget', 'alpha'))).toEqual({ kind: 'unavailable' })
    book.sync([])
    expect(book.read(id('gadget', 'alpha'))).toEqual({ kind: 'read', entries: [] })
  })

  it('the source gives the candidates of its own layer, and unavailable when the reading is', async () => {
    const book = createHeldBook('tenant-a')
    const source = heldLayerSource({
      layer: 'tenant',
      tenant: 'tenant-a',
      read: book.read,
      list: listing,
    })
    expect(source.layer).toBe('tenant')
    expect(source.list).toBe(listing)
    expect(await source.candidates(id('gadget', 'alpha'))).toEqual({
      layer: 'tenant',
      state: 'unavailable',
    })
    book.sync([{ category: 'gadget', name: 'alpha', item: alpha }])
    expect(await source.candidates(id('gadget', 'alpha'))).toEqual({
      layer: 'tenant',
      state: 'read',
      candidates: [alpha],
    })
    const official = heldLayerSource({
      layer: 'official',
      tenant: 'tenant-a',
      read: book.read,
      list: listing,
    })
    expect(await official.candidates(id('gadget', 'alpha'))).toEqual({
      layer: 'official',
      state: 'read',
      candidates: [],
    })
    const other = heldLayerSource({
      layer: 'tenant',
      tenant: 'tenant-b',
      read: book.read,
      list: listing,
    })
    expect(await other.candidates(id('gadget', 'alpha'))).toEqual({
      layer: 'tenant',
      state: 'read',
      candidates: [],
    })
  })
})
