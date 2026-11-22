import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolConsumerProfile, ToolDefinition } from '@omne-harness/tool-contract'
import { createLocalToolCatalog } from '../src/catalog.ts'
import { readCatalogView, type LocalToolCatalogView } from '../src/catalog-view.ts'
import { accessOf, authorityFor, loadedFor, tenantA } from './binding-values.ts'

const evidence = (record: string) => ({ owner: 'test', record, revision: '1', digest: record })
const consumer: ToolConsumerProfile = {
  capabilities: evidence('caps'),
  conversion: null,
  attachmentAccess: evidence('attachments'),
}
const access = accessOf(tenantA)
const allowed = {
  qualification: 'allowed',
  dependencies: [],
  inputCompatible: true,
  outputCompatible: true,
  attachmentsReadable: true,
  productsStorable: true,
} as const
const search = { k1: 1.2, b: 0.75, maxCachedCorpora: 2 }

function row(name: string) {
  const loaded = loadedFor(authorityFor({ kind: 'official' }, name, name, '1'), '1')
  return {
    entry: {
      key: loaded.key,
      ordinal: '1',
      digest: '1',
      shape: loaded.shape,
      state: 'live' as const,
      fiber: '1',
    },
    definition: loaded.definition,
    executor: loaded.executor,
  }
}

function deepFrozen<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const member of Object.values(value)) deepFrozen(member)
    Object.freeze(value)
  }
  return value
}

function world(live: readonly string[], options: { retired?: string; failing?: string } = {}) {
  const rows = live.map(row)
  const retired = options.retired === undefined ? undefined : row(options.retired)
  let view: LocalToolCatalogView = {
    scope: evidence('session'),
    revision: '1',
    entries: [
      ...rows.map(item => ({ key: item.entry.key, resident: true })),
      ...(retired === undefined
        ? []
        : [{ key: retired.entry.key, resident: true, knownDefinition: retired.definition }]),
    ],
  }
  let reads = 0
  let changeAt = 0
  const catalog = createLocalToolCatalog<string>({
    registry: { listings: () => succeed(rows) },
    view: {
      read: async () => {
        reads++
        if (reads === changeAt) view = { ...view, revision: '2' }
        return succeed(view)
      },
    },
    search,
    availability: {
      judge: async ({ definition }) =>
        definition.name === options.failing
          ? fail({ kind: 'unavailable', dependency: 'availability', diagnostic: 'judge failed' })
          : succeed(allowed),
    },
  })
  return {
    catalog,
    get reads() {
      return reads
    },
    resetReads() {
      reads = 0
    },
    changeAtRead(count: number) {
      changeAt = count
    },
  }
}

const names = (count: number) => Array.from({ length: count }, (_, index) => `tool${index}`)

describe('the Catalog answers a group of names in one snapshot', () => {
  it('reads the view source twice for fifteen names, where one inspect per name reads it thirty times', async () => {
    const w = world(names(15))
    const answer = await w.catalog.inspectEach({ ...access, names: names(15), consumer })
    if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
    expect(answer.ok).toHaveLength(15)
    expect(answer.ok.every(one => 'ok' in one && one.ok.kind === 'available')).toBe(true)
    expect(w.reads).toBe(2)
    w.resetReads()
    for (const name of names(15))
      await w.catalog.inspect({ ...access, name, command: null, consumer })
    expect(w.reads).toBe(30)
  })

  it('gives each name the answer that inspect gives it on the same view, in order and with repeats', async () => {
    const w = world(['alpha', 'judged'], { retired: 'retired', failing: 'judged' })
    const asked = ['alpha', 'retired', 'missing', 'judged', 'alpha']
    const answer = await w.catalog.inspectEach({ ...access, names: asked, consumer })
    if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
    const each = []
    for (const name of asked)
      each.push(await w.catalog.inspect({ ...access, name, command: null, consumer }))
    expect(answer.ok).toEqual(each)
    expect(answer.ok.map(one => ('ok' in one ? one.ok.kind : one.failure.kind))).toEqual([
      'available',
      'known-unavailable',
      'invalid',
      'unavailable',
      'available',
    ])
    expect(answer.ok[2]).toEqual(fail({ kind: 'invalid', field: 'name', reason: 'unknown-tool' }))
  })

  it('still reads the view for an empty group, answers no position, and passes a denied view', async () => {
    const w = world(['alpha'])
    expect(await w.catalog.inspectEach({ ...access, names: [], consumer })).toEqual(succeed([]))
    expect(w.reads).toBeGreaterThan(0)
    const denied = createLocalToolCatalog<string>({
      registry: { listings: () => succeed([]) },
      view: { read: async () => fail({ kind: 'denied', action: 'catalog-view' }) },
      search,
      availability: { judge: async () => succeed(allowed) },
    })
    expect(await denied.inspectEach({ ...access, names: [], consumer })).toEqual(
      fail({ kind: 'denied', action: 'catalog-view' }),
    )
  })

  it('answers the whole group with a retry when the view changes during judgment', async () => {
    const w = world(names(3))
    w.changeAtRead(2)
    expect(await w.catalog.inspectEach({ ...access, names: names(3), consumer })).toEqual(
      fail({
        kind: 'unavailable',
        dependency: 'toolCatalogView',
        diagnostic: 'catalog snapshot changed; retry',
      }),
    )
  })
})

describe('the view digest follows adoptions, not definition text', () => {
  const keyOf = (definition: ToolDefinition) => ({
    layer: { kind: 'official' as const },
    asset: { name: definition.name, adoption: definition.adoption },
  })
  const viewOf = (definition: ToolDefinition): LocalToolCatalogView => ({
    scope: evidence('session'),
    revision: '1',
    entries: [{ key: keyOf(definition), resident: true, knownDefinition: definition }],
  })
  const read = async (definition: ToolDefinition) => {
    const observed = await readCatalogView(
      { read: async () => succeed(viewOf(definition)) },
      access,
    )
    if ('failure' in observed) throw new Error(JSON.stringify(observed.failure))
    return observed.ok
  }

  it('keeps the digest for another description under the same adoption and changes it for another adoption', async () => {
    const base = row('alpha').definition
    const one = deepFrozen(structuredClone({ ...base, description: 'one' }))
    const two = deepFrozen(structuredClone({ ...base, description: 'two' }))
    const moved = deepFrozen(
      structuredClone({
        ...base,
        description: 'one',
        adoption: { ...base.adoption, revision: '2' },
      }),
    )
    expect((await read(one)).digest).toBe((await read(two)).digest)
    expect((await read(one)).digest).not.toBe((await read(moved)).digest)
  })

  it('judges a frozen definition once and an unfrozen one on every read', async () => {
    const base = row('alpha').definition
    const frozen = deepFrozen(structuredClone(base))
    const first = (await read(frozen)).view.entries[0]?.knownDefinition
    const second = (await read(frozen)).view.entries[0]?.knownDefinition
    expect(first).toBeDefined()
    expect(second).toBe(first)
    const open = structuredClone(base)
    expect((await read(open)).view.entries[0]?.knownDefinition).not.toBe(
      (await read(open)).view.entries[0]?.knownDefinition,
    )
  })
})
