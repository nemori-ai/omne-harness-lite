import { mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { GramPlan, IndexDocument } from '@omne-harness/session-search'
import { createStore, type Store, type StoreCandidateRequest } from '../src/store.ts'

const roots: string[] = []
const stores: Store[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function rootOf(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'history-index-')))
  roots.push(root)
  return root
}
function storeOf(root: string, over: Partial<Parameters<typeof createStore>[0]> = {}): Store {
  const store = createStore({ root, extraction: 1, readOnly: false, vocabularyLimit: 4, ...over })
  stores.push(store)
  return store
}

const TENANT = 'tenant-a'
const gram = (text: string): GramPlan => ({ kind: 'gram', gram: text })
const ANY: GramPlan = { kind: 'any' }
const document = (text: string, kind = 'u'): IndexDocument => ({
  visibility: 'model',
  text,
  markers: [`\u0002k${kind}`, '\u0002m1'],
})
const item = (position: number, text: string, at: number | null = 1000 + position) => ({
  position: String(position),
  at,
  document: document(text),
})
const ask = (generation: number, plan: GramPlan, over: Partial<StoreCandidateRequest> = {}) =>
  ({
    tenant: TENANT,
    generation,
    plan,
    sessions: null,
    window: { from: null, to: null },
    before: null,
    limit: 50,
    ...over,
  }) satisfies StoreCandidateRequest

function ready(store: Store): number {
  const begun = store.beginRebuild(TENANT, 0)
  if (begun === 'unavailable') throw new Error('begin')
  expect(store.adopt(TENANT, begun.generation)).toBeNull()
  return begun.generation
}
function found(store: Store, request: StoreCandidateRequest) {
  const answer = store.candidates(request)
  if (typeof answer === 'string') throw new Error(answer)
  return answer
}
const positions = (store: Store, request: StoreCandidateRequest): string[] =>
  found(store, request).rows.map(row => `${row.session}:${row.position}`)

describe('the states of the index of a tenant', () => {
  it('is absent until a build begins, being built until it is adopted, then ready', () => {
    const store = storeOf(rootOf())
    expect(store.state(TENANT)).toEqual({ kind: 'absent' })
    expect(store.beginRebuild(TENANT, 3)).toEqual({ generation: 1 })
    expect(store.state(TENANT)).toEqual({
      kind: 'rebuilding',
      generation: null,
      building: 1,
      indexed: 0,
      total: 3,
    })
    expect(
      store.append({
        tenant: TENANT,
        generation: 1,
        session: 's1',
        through: '2',
        documents: [item(1, 'hello')],
      }),
    ).toBeNull()
    expect(store.state(TENANT)).toMatchObject({ kind: 'rebuilding', indexed: 1, total: 3 })
    expect(store.adopt(TENANT, 1)).toBeNull()
    expect(store.state(TENANT)).toEqual({ kind: 'ready', generation: 1 })
    expect(store.state('another tenant')).toEqual({ kind: 'absent' })
  })

  it('keeps the earlier generation readable while a new one is built, and drops it when the new one is adopted', () => {
    const root = rootOf()
    const store = storeOf(root)
    const first = ready(store)
    store.append({
      tenant: TENANT,
      generation: first,
      session: 's1',
      through: '1',
      documents: [item(1, 'old text')],
    })
    expect(store.beginRebuild(TENANT, 1)).toEqual({ generation: 2 })
    expect(store.beginRebuild(TENANT, 9)).toEqual({ generation: 2 })
    expect(store.state(TENANT)).toEqual({
      kind: 'rebuilding',
      generation: 1,
      building: 2,
      indexed: 0,
      total: 1,
    })
    expect(positions(store, ask(first, gram('old')))).toEqual(['s1:1'])
    expect(store.candidates(ask(2, gram('old')))).toBe('generation-gone')
    store.append({
      tenant: TENANT,
      generation: 2,
      session: 's1',
      through: '1',
      documents: [item(1, 'new text')],
    })
    expect(store.adopt(TENANT, 2)).toBeNull()
    expect(store.state(TENANT)).toEqual({ kind: 'ready', generation: 2 })
    expect(store.candidates(ask(first, gram('old')))).toBe('generation-gone')
    expect(positions(store, ask(2, gram('new')))).toEqual(['s1:1'])
    const [directory] = readdirSync(root)
    expect(readdirSync(join(root, directory!)).filter(name => name.startsWith('g1'))).toEqual([])
  })

  it('answers each operation in each state: nothing is written to, or read from, a generation that is not there', () => {
    const store = storeOf(rootOf())
    const batch = { tenant: TENANT, session: 's1', through: '1', documents: [item(1, 'text')] }
    expect(store.candidates(ask(1, ANY))).toBe('generation-gone')
    expect(store.append({ ...batch, generation: 1 })).toBe('generation-gone')
    expect(store.adopt(TENANT, 1)).toBe('generation-gone')
    const first = ready(store)
    expect(store.append({ ...batch, generation: first + 1 })).toBe('generation-gone')
    expect(store.adopt(TENANT, first)).toBe('generation-gone')
    expect(store.append({ ...batch, generation: first })).toBeNull()
    expect(store.append({ ...batch, generation: first, through: 'not a position' })).toBe(
      'unavailable',
    )
  })

  it('is broken when its file is gone, cannot be opened, or was built with other text rules', () => {
    const root = rootOf()
    const store = storeOf(root)
    const generation = ready(store)
    store.close()
    expect(storeOf(root, { extraction: 2 }).state(TENANT)).toEqual({
      kind: 'broken',
      diagnostic: 'the index was built with other text rules',
    })
    const directory = join(root, readdirSync(root)[0]!)
    writeFileSync(join(directory, `g${String(generation)}.db`), 'not a database')
    expect(storeOf(root).state(TENANT).kind).toBe('broken')
    for (const name of readdirSync(directory).filter(file => file.startsWith('g')))
      rmSync(join(directory, name))
    expect(storeOf(root).state(TENANT)).toEqual({
      kind: 'broken',
      diagnostic: 'the index file is missing',
    })
    expect(storeOf(root).candidates(ask(generation, ANY))).toBe('unavailable')
  })

  it('starts a new build from a broken index: the next generation, beside what is there', () => {
    const root = rootOf()
    const generation = ready(storeOf(root))
    const other = storeOf(root, { extraction: 2 })
    expect(other.beginRebuild(TENANT, 0)).toEqual({ generation: generation + 1 })
    expect(other.adopt(TENANT, generation + 1)).toBeNull()
    expect(other.state(TENANT)).toEqual({ kind: 'ready', generation: generation + 1 })
  })
})

describe('the candidates of a plan', () => {
  function filled(): Readonly<{ store: Store; generation: number }> {
    const store = storeOf(rootOf())
    const generation = ready(store)
    store.append({
      tenant: TENANT,
      generation,
      session: 's1',
      through: '4',
      documents: [
        item(1, 'the needle one'),
        item(2, 'nothing here'),
        item(3, 'needle two'),
        item(4, '受理 again'),
      ],
    })
    store.append({
      tenant: TENANT,
      generation,
      session: 's2',
      through: '2',
      documents: [item(1, 'needle in another', 5000), item(2, '受理x and 受理y', 5001)],
    })
    return { store, generation }
  }

  it('come newest first, with how far each session is indexed', () => {
    const { store, generation } = filled()
    const answer = found(store, ask(generation, gram('nee')))
    expect(answer.rows.map(row => `${row.session}:${row.position}`)).toEqual([
      's2:1',
      's1:3',
      's1:1',
    ])
    expect(answer.covered).toEqual([
      { session: 's1', position: '4' },
      { session: 's2', position: '2' },
    ])
    const docs = answer.rows.map(row => BigInt(row.doc))
    expect(docs).toEqual([...docs].sort((left, right) => (left > right ? -1 : 1)))
  })

  it('go on after a document, a page at a time', () => {
    const { store, generation } = filled()
    const first = found(store, ask(generation, gram('nee'), { limit: 2 }))
    expect(first.rows.map(row => row.position)).toEqual(['1', '3'])
    const next = found(
      store,
      ask(generation, gram('nee'), { limit: 2, before: first.rows[1]!.doc }),
    )
    expect(next.rows.map(row => `${row.session}:${row.position}`)).toEqual(['s1:1'])
    expect(found(store, ask(generation, gram('nee'), { before: next.rows[0]!.doc })).rows).toEqual(
      [],
    )
  })

  it('stay within a window of commit times, both ends included', () => {
    const { store, generation } = filled()
    expect(
      positions(store, ask(generation, gram('nee'), { window: { from: 1003, to: 5000 } })),
    ).toEqual(['s2:1', 's1:3'])
    expect(
      positions(store, ask(generation, gram('nee'), { window: { from: 1004, to: 4999 } })),
    ).toEqual([])
    expect(
      positions(store, ask(generation, gram('nee'), { window: { from: null, to: 1001 } })),
    ).toEqual(['s1:1'])
    expect(
      positions(store, ask(generation, gram('nee'), { window: { from: 5000, to: null } })),
    ).toEqual(['s2:1'])
  })

  it('stay within the sessions asked for; a session the index has never seen has none', () => {
    const { store, generation } = filled()
    expect(positions(store, ask(generation, gram('nee'), { sessions: ['s1'] }))).toEqual([
      's1:3',
      's1:1',
    ])
    expect(positions(store, ask(generation, gram('nee'), { sessions: ['s2', 'unknown'] }))).toEqual(
      ['s2:1'],
    )
    expect(positions(store, ask(generation, gram('nee'), { sessions: ['unknown'] }))).toEqual([])
    expect(positions(store, ask(generation, ANY, { sessions: ['s2'] }))).toEqual(['s2:2', 's2:1'])
  })

  it('are every document, newest first, when the plan narrows nothing', () => {
    const { store, generation } = filled()
    expect(positions(store, ask(generation, ANY))).toEqual([
      's2:2',
      's2:1',
      's1:4',
      's1:3',
      's1:2',
      's1:1',
    ])
    expect(
      positions(store, ask(generation, ANY, { limit: 2, window: { from: null, to: 1004 } })),
    ).toEqual(['s1:4', 's1:3'])
  })

  it('find two code points through the vocabulary, at the end of a text too', () => {
    const { store, generation } = filled()
    expect(positions(store, ask(generation, { kind: 'short', prefix: '受理' }))).toEqual([
      's2:2',
      's1:4',
    ])
    expect(positions(store, ask(generation, { kind: 'short', prefix: 'wo' }))).toEqual(['s1:3'])
    expect(positions(store, ask(generation, { kind: 'short', prefix: 'zz' }))).toEqual([])
  })

  it('walk every document when two code points expand to more terms than the limit', () => {
    const store = storeOf(rootOf(), { vocabularyLimit: 2 })
    const generation = ready(store)
    store.append({
      tenant: TENANT,
      generation,
      session: 's1',
      through: '3',
      documents: [item(1, 'aba abb abc'), item(2, 'no such'), item(3, 'abd')],
    })
    expect(positions(store, ask(generation, { kind: 'short', prefix: 'ab' }))).toEqual([
      's1:3',
      's1:2',
      's1:1',
    ])
  })

  it('narrow by the markers of a document like by any other trigram', () => {
    const store = storeOf(rootOf())
    const generation = ready(store)
    store.append({
      tenant: TENANT,
      generation,
      session: 's1',
      through: '2',
      documents: [
        { position: '1', at: 1, document: document('needle', 'u') },
        { position: '2', at: 2, document: document('needle', 'a') },
      ],
    })
    const plan: GramPlan = { kind: 'and', of: [gram('nee'), gram('\u0002ka')] }
    expect(positions(store, ask(generation, plan))).toEqual(['s1:2'])
  })

  it('order documents without a commit time after the last one of their session that had one', () => {
    const store = storeOf(rootOf())
    const generation = ready(store)
    store.append({
      tenant: TENANT,
      generation,
      session: 's1',
      through: '3',
      documents: [item(1, 'needle a', 7000), item(2, 'needle b', null), item(3, 'needle c', null)],
    })
    store.append({
      tenant: TENANT,
      generation,
      session: 's1',
      through: '4',
      documents: [item(4, 'needle d', null)],
    })
    expect(positions(store, ask(generation, gram('nee')))).toEqual(['s1:4', 's1:3', 's1:2', 's1:1'])
    expect(
      positions(store, ask(generation, gram('nee'), { window: { from: 7000, to: 7000 } })),
    ).toHaveLength(4)
  })
})

describe('a batch of documents and the cover of its session (SH-2)', () => {
  it('writes a batch once: the same batch again, or one behind the cover, changes nothing', () => {
    const store = storeOf(rootOf())
    const generation = ready(store)
    const batch = {
      tenant: TENANT,
      generation,
      session: 's1',
      through: '2',
      documents: [item(1, 'needle'), item(2, 'needle')],
    }
    expect(store.append(batch)).toBeNull()
    expect(store.append(batch)).toBeNull()
    expect(store.append({ ...batch, through: '1', documents: [item(1, 'needle')] })).toBeNull()
    const answer = found(store, ask(generation, gram('nee')))
    expect(answer.rows.map(row => row.position)).toEqual(['2', '1'])
    expect(answer.covered).toEqual([{ session: 's1', position: '2' }])
  })

  it('writes only what lies past the cover of a batch that overlaps it', () => {
    const store = storeOf(rootOf())
    const generation = ready(store)
    store.append({
      tenant: TENANT,
      generation,
      session: 's1',
      through: '2',
      documents: [item(1, 'needle'), item(2, 'needle')],
    })
    store.append({
      tenant: TENANT,
      generation,
      session: 's1',
      through: '5',
      documents: [item(2, 'needle'), item(4, 'needle')],
    })
    const answer = found(store, ask(generation, gram('nee')))
    expect(answer.rows.map(row => row.position)).toEqual(['4', '2', '1'])
    expect(answer.covered).toEqual([{ session: 's1', position: '5' }])
  })

  it('moves the cover of a batch without documents: the entries it read had nothing to search', () => {
    const store = storeOf(rootOf())
    const generation = ready(store)
    expect(
      store.append({ tenant: TENANT, generation, session: 's1', through: '9', documents: [] }),
    ).toBeNull()
    expect(found(store, ask(generation, ANY))).toEqual({
      covered: [{ session: 's1', position: '9' }],
      rows: [],
    })
  })

  it('leaves neither rows nor cover of a batch that stops between the two', () => {
    const store = storeOf(rootOf())
    const generation = ready(store)
    store.append({
      tenant: TENANT,
      generation,
      session: 's1',
      through: '1',
      documents: [item(1, 'needle')],
    })
    const stopped = store.append(
      {
        tenant: TENANT,
        generation,
        session: 's1',
        through: '3',
        documents: [item(2, 'needle'), item(3, 'needle')],
      },
      {
        afterRows: () => {
          throw new Error('stopped between the rows and the cover')
        },
      },
    )
    expect(stopped).toBe('unavailable')
    expect(found(store, ask(generation, gram('nee')))).toMatchObject({
      covered: [{ session: 's1', position: '1' }],
      rows: [{ position: '1' }],
    })
    expect(
      store.append({
        tenant: TENANT,
        generation,
        session: 's1',
        through: '3',
        documents: [item(2, 'needle'), item(3, 'needle')],
      }),
    ).toBeNull()
    expect(found(store, ask(generation, gram('nee'))).rows.map(row => row.position)).toEqual([
      '3',
      '2',
      '1',
    ])
  })

  it('reads the cover no later than the rows: a batch written in between is not vouched for', () => {
    const root = rootOf()
    const writer = storeOf(root)
    const generation = ready(writer)
    writer.append({
      tenant: TENANT,
      generation,
      session: 's1',
      through: '10',
      documents: [item(5, 'needle')],
    })
    const reader = storeOf(root, { readOnly: true })
    const answer = reader.candidates(ask(generation, gram('nee')), {
      betweenReads: () => {
        writer.append({
          tenant: TENANT,
          generation,
          session: 's1',
          through: '20',
          documents: [item(15, 'needle')],
        })
      },
    })
    if (typeof answer === 'string') throw new Error(answer)
    const cover = BigInt(answer.covered.find(row => row.session === 's1')!.position)
    // Whatever the cover says is indexed must be among the rows: 15 is, only if the cover reached it.
    const seen = answer.rows.map(row => BigInt(row.position))
    if (cover >= 15n) expect(seen).toContain(15n)
    expect(seen).toContain(5n)
    expect(found(reader, ask(generation, gram('nee'))).rows.map(row => row.position)).toEqual([
      '15',
      '5',
    ])
  })
})
