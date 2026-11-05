import { describe, expect, it } from 'vitest'
import { succeed, fail } from '@omne-harness/operation-result'
import type { ToolCatalog, ToolConsumerProfile } from '@omne-harness/tool-contract'
import { createLocalToolCatalog } from '../src/catalog.ts'
import type { LocalToolCatalogView } from '../src/catalog-view.ts'
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
