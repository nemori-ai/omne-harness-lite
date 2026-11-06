import { describe, expect, it } from 'vitest'
import { succeed, fail } from '@omne-harness/operation-result'
import type { ToolCatalog, ToolConsumerProfile } from '@omne-harness/tool-contract'
import { createLocalToolCatalog } from '../src/catalog.ts'
import type { LocalToolCatalogView } from '../src/catalog-view.ts'
import {
  accessOf,
  authorityFor,
  fiberedRegistry,
  loadedFor,
  scriptedVerifier,
  tenantA,
} from './binding-values.ts'

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
} as const
const search = { k1: 1.2, b: 0.75, maxCachedCorpora: 2 }
function row(name: string, description: string, revision = '1', programmable = true) {
  const loaded = loadedFor(authorityFor({ kind: 'official' }, name, name, revision), revision, {
    programmable,
  })
  return {
    entry: {
      key: loaded.key,
      ordinal: '1',
      digest: revision,
      shape: loaded.shape,
      state: 'live' as const,
      fiber: '1',
    },
    definition: { ...loaded.definition, description },
    executor: { ...loaded.executor, revision },
  }
}
function setup() {
  let rows = [row('alpha', 'apple'), row('bravo', 'pear pear pear'), row('charlie', 'apple pear')]
  let view: LocalToolCatalogView = {
    scope: evidence('session-A'),
    revision: '1',
    entries: rows.map(r => ({ key: r.entry.key, resident: false })),
  }
  let gate: (() => Promise<void>) | undefined
  let missing = false
  let broken = false
  let denied = ''
  let unavailable = ''
  let reads = 0
  const catalog = createLocalToolCatalog({
    registry: { listings: () => succeed(rows) },
    view: {
      read: async () => {
        reads++
        if (broken) throw new Error('source')
        return missing
          ? fail({ kind: 'unavailable', dependency: 'view', diagnostic: 'unknown' })
          : succeed(view)
      },
    },
    search,
    availability: {
      judge: async ({ definition }) => {
        await gate?.()
        if (definition.name === unavailable)
          return fail({
            kind: 'unavailable',
            dependency: 'availability',
            diagnostic: 'retired tool',
          })
        return succeed({
          ...allowed,
          qualification: definition.name === denied ? 'denied' : 'allowed',
        })
      },
    },
  })
  return {
    catalog,
    get rows() {
      return rows
    },
    set rows(value) {
      rows = value
    },
    get view() {
      return view
    },
    set view(value) {
      view = value
    },
    set gate(value: (() => Promise<void>) | undefined) {
      gate = value
    },
    set missing(value: boolean) {
      missing = value
    },
    set broken(value: boolean) {
      broken = value
    },
    set denied(value: string) {
      denied = value
    },
    set unavailable(value: string) {
      unavailable = value
    },
    get reads() {
      return reads
    },
  }
}
async function page(
  catalog: ToolCatalog<string>,
  options: Partial<Parameters<ToolCatalog<string>['search']>[0]> = {},
) {
  return catalog.search({
    ...access,
    consumer,
    query: 'apple pear',
    invocation: 'direct',
    after: null,
    limit: 50,
    ...options,
  })
}
async function names(catalog: ToolCatalog<string>, options: Parameters<typeof page>[1] = {}) {
  const result = await page(catalog, options)
  if ('failure' in result) throw new Error(JSON.stringify(result.failure))
  return result.ok.entries.map(e => e.definition.name)
}

describe('legal catalog view and BM25', () => {
  it('matches the complete binding including the source layer', async () => {
    const w = setup()
    w.view = {
      ...w.view,
      entries: w.view.entries.map(entry => ({
        ...entry,
        key: { ...entry.key, layer: { kind: 'tenant', tenant: tenantA } },
      })),
    }
    expect(await names(w.catalog)).toEqual([])
    expect(
      await w.catalog.inspect({ ...access, consumer, name: 'alpha', command: null }),
    ).toMatchObject({
      failure: { kind: 'invalid', field: 'name', reason: 'unknown-tool' },
    })
  })

  it('selects a retained definition after a same-name entry without metadata', async () => {
    const w = setup()
    const first = row('alpha', 'without metadata')
    const retained = row('alpha', 'retained pear', '2')
    w.rows = []
    w.view = {
      ...w.view,
      entries: [
        { key: first.entry.key, resident: false },
        { key: retained.entry.key, resident: false, knownDefinition: retained.definition },
      ],
    }
    expect(
      await w.catalog.inspect({ ...access, consumer, name: 'alpha', command: null }),
    ).toMatchObject({
      ok: { kind: 'known-unavailable', definition: retained.definition },
    })
  })

  it('excludes retained definitions before judging programmatic availability', async () => {
    const w = setup()
    const retained = row('retired', 'apple pear')
    w.view = {
      ...w.view,
      entries: [
        ...w.view.entries,
        {
          key: retained.entry.key,
          resident: false,
          knownDefinition: retained.definition,
        },
      ],
    }
    w.unavailable = 'retired'
    expect(await names(w.catalog, { invocation: 'programmatic' })).toEqual([
      'charlie',
      'bravo',
      'alpha',
    ])
    expect(await page(w.catalog)).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'availability', diagnostic: 'retired tool' },
    })
  })
  it('ranks the complete legal corpus with BM25, no substring fallback or search history', async () => {
    const w = setup()
    expect(await names(w.catalog)).toEqual(['charlie', 'bravo', 'alpha'])
    await names(w.catalog, { query: 'apple' })
    await names(w.catalog, { query: 'pear' })
    expect(await names(w.catalog)).toEqual(['charlie', 'bravo', 'alpha'])
    expect(await names(w.catalog, { query: 'app' })).toEqual([])
    expect(await names(w.catalog, { query: '!!!' })).toEqual([])
    expect(await names(w.catalog, { query: '  ' })).toEqual(['alpha', 'bravo', 'charlie'])
  })
  it('hidden entries do not change df, rankings, or pages and disclosure is exact-version scoped', async () => {
    const w = setup()
    const before = await page(w.catalog, { limit: 1 })
    w.rows = [...w.rows, ...Array.from({ length: 100 }, (_, i) => row(`hidden${i}`, 'pear'))]
    expect(await page(w.catalog, { limit: 1 })).toEqual(before)
    w.denied = 'alpha'
    expect(await page(w.catalog)).toMatchObject({
      ok: {
        entries: expect.arrayContaining([
          expect.objectContaining({
            kind: 'known-unavailable',
            definition: expect.objectContaining({ name: 'alpha' }),
          }),
        ]),
      },
    })
    expect(await names(w.catalog, { invocation: 'programmatic' })).toEqual(['charlie', 'bravo'])
    w.view = {
      ...w.view,
      scope: evidence('session-B'),
      entries: [{ key: w.rows[1]!.entry.key, resident: true }],
    }
    expect(await names(w.catalog)).toEqual([])
    expect(
      await w.catalog.inspect({ ...access, consumer, name: 'bravo', command: null }),
    ).toMatchObject({ ok: { kind: 'available', definition: { name: 'bravo' } } })
    expect(
      await w.catalog.inspect({ ...access, consumer, name: 'alpha', command: null }),
    ).toMatchObject({ failure: { reason: 'unknown-tool' } })
    w.view = {
      ...w.view,
      entries: [{ key: row('alpha', 'apple', '2').entry.key, resident: false }],
    }
    expect(await names(w.catalog)).toEqual([])
  })
  it('ranked pages concatenate to full search and reject changed query, consumer, invocation, scope and revision', async () => {
    const w = setup()
    const first = await page(w.catalog, { limit: 1 })
    if ('failure' in first || first.ok.next === null) throw new Error('missing page')
    let after: string | null = null
    const all: string[] = []
    do {
      const result = await page(w.catalog, { limit: 1, after })
      if ('failure' in result) throw new Error('page')
      all.push(...result.ok.entries.map(e => e.definition.name))
      after = result.ok.next
    } while (after !== null)
    expect(all).toEqual(await names(w.catalog))
    for (const options of [
      { query: 'apple' },
      { consumer: { ...consumer, capabilities: evidence('other') } },
      { invocation: 'programmatic' as const },
      { after: 'x'.repeat(4096) },
      { after: first.ok.next + '=' },
    ]) {
      expect(await page(w.catalog, { after: first.ok.next, ...options })).toMatchObject({
        failure: { kind: 'invalid-cursor' },
      })
    }
    w.view = { ...w.view, scope: evidence('session-B') }
    expect(await page(w.catalog, { after: first.ok.next })).toMatchObject({
      failure: { kind: 'invalid-cursor' },
    })
    w.view = { ...w.view, scope: evidence('session-A'), revision: '2' }
    expect(await page(w.catalog, { after: first.ok.next })).toMatchObject({
      failure: { kind: 'invalid-cursor' },
    })
  })
  it('metadata replacement removes resident search entries while inspect and usage keep fresh metadata', async () => {
    const w = setup()
    const first = await page(w.catalog, { limit: 1 })
    if ('failure' in first || first.ok.next === null) throw new Error('page')
    w.rows = w.rows.map(r => row(r.definition.name, r.definition.description, '2'))
    w.view = { ...w.view, entries: w.rows.map(r => ({ key: r.entry.key, resident: true })) }
    const fresh = await page(w.catalog)
    expect(fresh).toEqual({ ok: { entries: [], next: null } })
    expect(await page(w.catalog, { query: '  ' })).toEqual({ ok: { entries: [], next: null } })
    expect(
      await w.catalog.inspect({ ...access, consumer, name: 'alpha', command: null }),
    ).toMatchObject({
      ok: {
        kind: 'available',
        definition: { adoption: { revision: '2' } },
        executor: { revision: '2' },
      },
    })
    const alpha = w.rows.find(r => r.definition.name === 'alpha')
    if (alpha === undefined) throw new Error('missing alpha')
    expect(
      await w.catalog.usage({
        ...access,
        consumer,
        name: 'alpha',
        command: null,
        adoption: alpha.definition.adoption,
      }),
    ).toMatchObject({
      ok: { definition: { revision: '2' } },
    })
    expect(await page(w.catalog, { after: first.ok.next })).toMatchObject({
      failure: { kind: 'invalid-cursor' },
    })
  })

  it('resident matches cannot change non-resident BM25 statistics, top-k or ranked pages', async () => {
    const w = setup()
    const expected = await names(w.catalog)
    const residents = Array.from({ length: 100 }, (_, i) => row(`resident${i}`, 'pear'))
    w.rows = [...w.rows, ...residents]
    w.view = {
      ...w.view,
      entries: [...w.view.entries, ...residents.map(r => ({ key: r.entry.key, resident: true }))],
    }
    expect(await names(w.catalog)).toEqual(expected)
    expect(await names(w.catalog, { limit: 1 })).toEqual(expected.slice(0, 1))
    expect(await names(w.catalog, { query: 'resident0' })).toEqual([])
    let after: string | null = null
    const paged: string[] = []
    do {
      const result = await page(w.catalog, { limit: 1, after })
      if ('failure' in result) throw new Error('page')
      expect(result.ok.entries.every(entry => entry.resident === false)).toBe(true)
      paged.push(...result.ok.entries.map(entry => entry.definition.name))
      after = result.ok.next
    } while (after !== null)
    expect(paged).toEqual(expected)
  })

  it('reads changed resident facts without a revision change and rejects the old cursor', async () => {
    const w = setup()
    const first = await page(w.catalog, { limit: 1 })
    if ('failure' in first || first.ok.next === null) throw new Error('page')
    w.view = { ...w.view, entries: w.view.entries.map(entry => ({ ...entry, resident: true })) }
    expect(await page(w.catalog, { after: first.ok.next })).toMatchObject({
      failure: { kind: 'invalid-cursor' },
    })
    expect(await page(w.catalog)).toEqual({ ok: { entries: [], next: null } })
  })
  it('rechecks after async judgments and keeps missing, throwing and unknown sources as failures', async () => {
    const w = setup()
    const pending = Promise.withResolvers<void>()
    w.gate = () => pending.promise
    const result = page(w.catalog)
    await Promise.resolve()
    await Promise.resolve()
    w.view = { ...w.view, revision: '2' }
    pending.resolve()
    expect(await result).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(w.reads).toBe(2)
    w.gate = undefined
    w.missing = true
    expect(await page(w.catalog)).toHaveProperty('failure')
    w.missing = false
    w.broken = true
    expect(await page(w.catalog)).toMatchObject({ failure: { kind: 'unavailable' } })
    const absent = createLocalToolCatalog({
      registry: { listings: () => succeed([]) },
      view: null,
      search,
      availability: { judge: async () => succeed(allowed) },
    })
    expect(await page(absent)).toMatchObject({ failure: { kind: 'unavailable' } })
  })
  it('rejects registry replacement during judgment even when the disclosure view is unchanged', async () => {
    for (const continuing of [false, true]) {
      const w = setup()
      const first = await page(w.catalog, { limit: 1 })
      if ('failure' in first) throw new Error('missing first page')
      const entered = Promise.withResolvers<void>()
      const resume = Promise.withResolvers<void>()
      w.gate = async () => {
        entered.resolve()
        await resume.promise
      }
      const pending = page(w.catalog, { limit: 1, after: continuing ? first.ok.next : null })
      await entered.promise
      w.rows = w.rows.map(row => ({
        ...row,
        entry: { ...row.entry, ordinal: '2' },
        executor: { ...row.executor, revision: '2' },
      }))
      resume.resolve()
      expect(await pending).toMatchObject({
        failure: { kind: continuing ? 'invalid-cursor' : 'unavailable' },
      })
    }
  })
})

function knownWorld() {
  const tools = [
    { name: 'alpha', description: 'apple' },
    { name: 'bravo', description: 'pear pear pear' },
    { name: 'charlie', description: 'apple pear' },
  ].map(({ name, description }) => {
    const authority = authorityFor({ kind: 'official' }, name)
    const loaded = loadedFor(authority, '1', { programmable: true })
    return { authority, loaded: { ...loaded, definition: { ...loaded.definition, description } } }
  })
  const { registry, asFiber } = fiberedRegistry(scriptedVerifier(tools.map(tool => tool.authority)))
  for (const tool of tools) {
    const registered = asFiber(tool.authority.asset.name, () =>
      registry.register({ ...access, ...tool }),
    )
    if ('failure' in registered) throw new Error('registration failed')
  }
  let view: LocalToolCatalogView = {
    scope: evidence('known-session'),
    revision: '1',
    entries: tools.map(tool => ({
      key: tool.loaded.key,
      resident: false,
      knownDefinition: tool.loaded.definition,
    })),
  }
  let qualification: 'allowed' | 'denied' = 'allowed'
  let gate: (() => Promise<void>) | undefined
  const catalog = createLocalToolCatalog({
    registry,
    view: { read: async () => succeed(view) },
    search,
    availability: {
      judge: async () => {
        await gate?.()
        return succeed({ ...allowed, qualification })
      },
    },
  })
  return {
    catalog,
    registry,
    tools,
    get view() {
      return view
    },
    set view(value: LocalToolCatalogView) {
      view = value
    },
    set qualification(value: 'allowed' | 'denied') {
      qualification = value
    },
    set gate(value: (() => Promise<void>) | undefined) {
      gate = value
    },
  }
}

describe('currently disclosed known definitions after contribution retirement', () => {
  it('keeps the definition and usage without manufacturing an executable binding', async () => {
    const w = knownWorld()
    const tool = w.tools[0]
    if (tool === undefined) throw new Error('missing alpha')
    const inspected = { ...access, consumer, name: 'alpha', command: null }
    expect(await w.catalog.inspect(inspected)).toMatchObject({ ok: { kind: 'available' } })
    w.registry.retire('alpha')
    const retired = await w.catalog.inspect(inspected)
    expect(retired).toMatchObject({
      ok: {
        kind: 'known-unavailable',
        definition: tool.loaded.definition,
        reason: expect.stringContaining('implementation'),
      },
    })
    if ('failure' in retired) throw new Error('missing retained definition')
    expect(retired.ok).not.toHaveProperty('executor')
    expect(
      await w.catalog.usage({ ...inspected, adoption: tool.loaded.definition.adoption }),
    ).toMatchObject({
      ok: { description: 'apple', definition: tool.loaded.definition.adoption },
    })
    expect(await names(w.catalog, { query: 'apple' })).toContain('alpha')
    expect(await names(w.catalog, { query: 'apple', invocation: 'programmatic' })).not.toContain(
      'alpha',
    )
    w.qualification = 'denied'
    expect(
      await w.catalog.usage({ ...inspected, adoption: tool.loaded.definition.adoption }),
    ).toMatchObject({
      failure: { kind: 'denied', action: 'usage' },
    })
    expect(await w.catalog.inspect(inspected)).toMatchObject({ ok: { kind: 'known-unavailable' } })
  })

  it('withdraws disclosure immediately and retains no metadata outside the supplied view', async () => {
    const w = knownWorld()
    const original = w.view.entries
    w.registry.retire('alpha')
    expect(await names(w.catalog, { query: 'apple' })).toContain('alpha')
    w.view = { ...w.view, entries: original.filter(entry => entry.key.asset.name !== 'alpha') }
    expect(
      await w.catalog.inspect({ ...access, consumer, name: 'alpha', command: null }),
    ).toMatchObject({
      failure: { kind: 'invalid', reason: 'unknown-tool' },
    })
    expect(await names(w.catalog, { query: 'apple' })).not.toContain('alpha')
    w.view = { ...w.view, entries: original.map(({ key, resident }) => ({ key, resident })) }
    expect(
      await w.catalog.inspect({ ...access, consumer, name: 'alpha', command: null }),
    ).toMatchObject({
      failure: { kind: 'invalid', reason: 'unknown-tool' },
    })
  })

  it('preserves BM25 order for retired definitions and excludes resident known metadata before ranking', async () => {
    const w = knownWorld()
    const expected = await names(w.catalog)
    for (const tool of w.tools) w.registry.retire(tool.authority.asset.name)
    expect(await names(w.catalog)).toEqual(expected)
    expect(await names(w.catalog, { invocation: 'programmatic' })).toEqual([])
    const residents = Array.from({ length: 100 }, (_, index) =>
      row(`known-resident${index}`, 'pear'),
    )
    w.view = {
      ...w.view,
      entries: [
        ...w.view.entries,
        ...residents.map(item => ({
          key: item.entry.key,
          resident: true,
          knownDefinition: item.definition,
        })),
      ],
    }
    expect(await names(w.catalog)).toEqual(expected)
    expect(await names(w.catalog, { limit: 1 })).toEqual(expected.slice(0, 1))
    w.view = { ...w.view, entries: w.view.entries.map(entry => ({ ...entry, resident: true })) }
    expect(await names(w.catalog)).toEqual([])
    expect(
      await w.catalog.inspect({ ...access, consumer, name: 'alpha', command: null }),
    ).toMatchObject({
      ok: { kind: 'known-unavailable' },
    })
  })

  it('keeps live selection and invalidates cursors on retirement or retained metadata changes', async () => {
    const w = knownWorld()
    const first = await page(w.catalog, { limit: 1 })
    if ('failure' in first || first.ok.next === null) throw new Error('missing cursor')
    w.registry.retire('alpha')
    expect(await page(w.catalog, { limit: 1, after: first.ok.next })).toMatchObject({
      failure: { kind: 'invalid-cursor' },
    })
    const retired = await page(w.catalog, { limit: 1 })
    if ('failure' in retired || retired.ok.next === null) throw new Error('missing retired cursor')
    w.view = {
      ...w.view,
      entries: w.view.entries.map(entry => ({
        ...entry,
        ...(entry.key.asset.name !== 'bravo' || entry.knownDefinition === undefined
          ? {}
          : {
              knownDefinition: {
                ...entry.knownDefinition,
                description: 'changed retained metadata',
              },
            }),
      })),
    }
    expect(await page(w.catalog, { limit: 1, after: retired.ok.next })).toMatchObject({
      failure: { kind: 'invalid-cursor' },
    })
    expect(
      await w.catalog.inspect({ ...access, consumer, name: 'bravo', command: null }),
    ).toMatchObject({
      ok: { kind: 'available', definition: { description: 'pear pear pear' } },
    })
  })

  it('rejects mismatched or malformed metadata and returns an immutable copy of valid definitions', async () => {
    for (const mismatch of ['name', 'adoption', 'shape'] as const) {
      const w = knownWorld()
      w.view = {
        ...w.view,
        entries: w.view.entries.map(entry => ({
          ...entry,
          ...(entry.knownDefinition === undefined
            ? {}
            : {
                knownDefinition:
                  mismatch === 'name'
                    ? { ...entry.knownDefinition, name: 'different-name' }
                    : mismatch === 'adoption'
                      ? {
                          ...entry.knownDefinition,
                          adoption: { ...entry.knownDefinition.adoption, revision: 'different' },
                        }
                      : { ...entry.knownDefinition, description: '' },
              }),
        })),
      }
      expect(await page(w.catalog)).toEqual({
        failure:
          mismatch === 'shape'
            ? { kind: 'invalid', field: 'description', reason: 'blank' }
            : { kind: 'invalid', field: 'knownDefinition', reason: 'definition-key-mismatch' },
      })
    }
    const w = knownWorld()
    const original = w.tools[0]?.loaded.definition
    if (original === undefined) throw new Error('missing definition')
    w.registry.retire('alpha')
    const inspected = await w.catalog.inspect({ ...access, consumer, name: 'alpha', command: null })
    if ('failure' in inspected) throw new Error('missing retained definition')
    expect(inspected.ok.definition).not.toBe(original)
    expect(Object.isFrozen(inspected.ok.definition)).toBe(true)
    expect(Object.isFrozen(inspected.ok.definition.adoption)).toBe(true)
    Object.assign(original, { description: 'changed at the source' })
    expect(inspected.ok.definition.description).toBe('apple')
  })

  it('preserves the lowest live ordinal before considering same-name known definitions', async () => {
    const w = setup()
    const alternate = row('alpha', 'alternate live definition', '2')
    w.view = {
      ...w.view,
      entries: [
        {
          key: alternate.entry.key,
          resident: false,
          knownDefinition: { ...alternate.definition, description: 'retained metadata' },
        },
        ...w.view.entries,
      ],
    }
    w.rows = [...w.rows, { ...alternate, entry: { ...alternate.entry, ordinal: '2' } }]
    const request = { ...access, consumer, name: 'alpha', command: null }
    expect(await w.catalog.inspect(request)).toMatchObject({
      ok: { kind: 'available', definition: { description: 'apple', adoption: { revision: '1' } } },
    })
    w.rows = w.rows.map(item =>
      item === w.rows[0] ? { ...item, entry: { ...item.entry, ordinal: '3' } } : item,
    )
    expect(await w.catalog.inspect(request)).toMatchObject({
      ok: {
        kind: 'available',
        definition: { description: 'alternate live definition', adoption: { revision: '2' } },
      },
    })
  })

  it('rejects changed known metadata after an asynchronous availability judgment', async () => {
    const w = knownWorld()
    w.registry.retire('alpha')
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    w.gate = async () => {
      entered.resolve()
      await resume.promise
    }
    const pending = w.catalog.inspect({ ...access, consumer, name: 'alpha', command: null })
    expect(
      await Promise.race([entered.promise.then(() => 'judging'), pending.then(() => 'returned')]),
    ).toBe('judging')
    w.view = {
      ...w.view,
      entries: w.view.entries.filter(entry => entry.key.asset.name !== 'alpha'),
    }
    resume.resolve()
    expect(await pending).toMatchObject({ failure: { kind: 'unavailable' } })
  })
})
