import {
  existsSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
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
// The one directory of a tenant under a root.
const directoryIn = (root: string): string => join(root, readdirSync(root)[0]!)
const gram = (text: string): GramPlan => ({ kind: 'gram', gram: text })
const ANY: GramPlan = { kind: 'any' }
const document = (text: string, kind = 'u'): IndexDocument => ({
  visibility: 'model',
  text,
  markers: [`\u0002k${kind}`, '\u0002m1'],
})
const item = (position: number, text: string, at = 1000 + position) => ({
  position: String(position),
  revision: String(position),
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
    known: null,
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
        at: 1002,
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
      at: 1001,
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
      at: 1001,
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
    const batch = {
      tenant: TENANT,
      session: 's1',
      through: '1',
      at: 1001,
      documents: [item(1, 'text')],
    }
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
      at: 1004,
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
      at: 1002,
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
      { session: 's1', through: '4', at: expect.any(Number) },
      { session: 's2', through: '2', at: expect.any(Number) },
    ])
    const docs = answer.rows.map(row => BigInt(row.doc))
    expect(docs).toEqual([...docs].sort((left, right) => (left > right ? -1 : 1)))
  })

  it('come with the covers once: while the stamp the asker holds stands, only the stamp is sent', () => {
    const { store, generation } = filled()
    const first = found(store, ask(generation, gram('nee')))
    expect(first.stamp).toEqual({ sessions: 2, total: '6' })
    expect(first.covered).toHaveLength(2)
    const again = found(store, ask(generation, gram('nee'), { known: first.stamp }))
    expect(again).toEqual({ ...first, covered: null })
    // Narrowing to sessions works without the covers being read.
    expect(
      positions(
        store,
        ask(generation, gram('nee'), { known: first.stamp, sessions: ['s2', 'sx'] }),
      ),
    ).toEqual(['s2:1'])
    // A cover that moved, or a session that came, changes the stamp: the covers are sent again.
    store.append({
      tenant: TENANT,
      generation,
      session: 's1',
      through: '5',
      at: 1005,
      documents: [],
    })
    const moved = found(store, ask(generation, gram('nee'), { known: first.stamp }))
    expect(moved.stamp).toEqual({ sessions: 2, total: '7' })
    expect(moved.covered).toContainEqual({ session: 's1', through: '5', at: 1005 })
    store.append({
      tenant: TENANT,
      generation,
      session: 's3',
      through: '0',
      at: 0,
      documents: [],
    })
    const joined = found(store, ask(generation, gram('nee'), { known: moved.stamp }))
    expect(joined.stamp).toEqual({ sessions: 3, total: '7' })
    expect(joined.covered).toHaveLength(3)
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
      at: 1003,
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
      at: 1002,
      documents: [
        { position: '1', revision: '1', at: 1, document: document('needle', 'u') },
        { position: '2', revision: '2', at: 2, document: document('needle', 'a') },
      ],
    })
    const plan: GramPlan = { kind: 'and', of: [gram('nee'), gram('\u0002ka')] }
    expect(positions(store, ask(generation, plan))).toEqual(['s1:2'])
  })

  it('order documents of one millisecond by when they were written, later ones first', () => {
    const store = storeOf(rootOf())
    const generation = ready(store)
    store.append({
      tenant: TENANT,
      generation,
      session: 's1',
      through: '3',
      at: 7000,
      documents: [item(1, 'needle a', 7000), item(2, 'needle b', 7000), item(3, 'needle c', 7000)],
    })
    store.append({
      tenant: TENANT,
      generation,
      session: 's1',
      through: '4',
      at: 7000,
      documents: [item(4, 'needle d', 7000)],
    })
    expect(positions(store, ask(generation, gram('nee')))).toEqual(['s1:4', 's1:3', 's1:2', 's1:1'])
    expect(
      positions(store, ask(generation, gram('nee'), { window: { from: 7000, to: 7000 } })),
    ).toHaveLength(4)
  })

  it('records the last commit time it is told with the cover, documents or none', () => {
    const store = storeOf(rootOf())
    const generation = ready(store)
    store.append({
      tenant: TENANT,
      generation,
      session: 's1',
      through: '2',
      at: 8200,
      documents: [],
    })
    expect(found(store, ask(generation, ANY)).covered).toEqual([
      { session: 's1', through: '2', at: 8200 },
    ])
  })
})

describe('a generation being built and the disk (SH-3)', () => {
  const built = (root: string, boot: number) =>
    createStore({ root, extraction: 1, readOnly: false, vocabularyLimit: 512, boot })

  it('goes on with a build after the process restarts, and drops one from before the machine restarted', () => {
    const root = rootOf()
    const first = built(root, 1000)
    stores.push(first)
    expect(first.beginRebuild(TENANT, 2)).toEqual({ generation: 1 })
    const batch = { tenant: TENANT, generation: 1, session: 's1', through: '1', at: 1001 }
    expect(first.append({ ...batch, documents: [item(1, 'needle')] })).toBeNull()
    first.close()
    // The same start of the machine (a minute of slack either way): the build is still there.
    const again = built(root, 1001)
    stores.push(again)
    expect(again.state(TENANT)).toMatchObject({ kind: 'rebuilding', building: 1, indexed: 1 })
    expect(again.covers(TENANT, 1)).toEqual([{ session: 's1', through: '1', at: 1001 }])
    again.close()
    // Another start of the machine: what was written without waiting for the disk is not trusted.
    const after = built(root, 1500)
    stores.push(after)
    expect(after.state(TENANT)).toEqual({ kind: 'absent' })
    expect(after.covers(TENANT, 1)).toBe('generation-gone')
    expect(after.append({ ...batch, documents: [item(1, 'needle')] })).toBe('generation-gone')
    expect(after.beginRebuild(TENANT, 2)).toEqual({ generation: 2 })
    expect(readdirSync(directoryIn(root)).filter(name => name.startsWith('g1.'))).toEqual([])
    expect(after.covers(TENANT, 2)).toEqual([])
  })

  it('keeps the generation in use when a build from before a restart is dropped', () => {
    const root = rootOf()
    const first = built(root, 1000)
    stores.push(first)
    const generation = ready(first)
    first.append({
      tenant: TENANT,
      generation,
      session: 's1',
      through: '1',
      at: 1001,
      documents: [item(1, 'needle')],
    })
    expect(first.beginRebuild(TENANT, 1)).toEqual({ generation: 2 })
    first.close()
    const after = built(root, 2000)
    stores.push(after)
    expect(after.state(TENANT)).toEqual({ kind: 'ready', generation })
    expect(positions(after, ask(generation, gram('nee')))).toEqual(['s1:1'])
    expect(after.beginRebuild(TENANT, 1)).toEqual({ generation: 3 })
    expect(positions(after, ask(generation, gram('nee')))).toEqual(['s1:1'])
  })

  it('puts a build on the disk whole before it is adopted: nothing of it is left in the write-ahead log', () => {
    const root = rootOf()
    const store = built(root, 1000)
    stores.push(store)
    expect(store.beginRebuild(TENANT, 1)).toEqual({ generation: 1 })
    for (let n = 1; n <= 50; n += 1)
      store.append({
        tenant: TENANT,
        generation: 1,
        session: 's1',
        through: String(n),
        at: 1000 + n,
        documents: [item(n, `needle ${String(n)} `.repeat(40))],
      })
    const wal = join(directoryIn(root), 'g1.db-wal')
    expect(statSync(wal).size).toBeGreaterThan(0)
    expect(store.adopt(TENANT, 1)).toBeNull()
    expect(existsSync(wal) ? statSync(wal).size : 0).toBe(0)
    expect(positions(store, ask(1, gram('nee'), { limit: 100 }))).toHaveLength(50)
    // It goes on as the generation in use: a later batch is written and read as before.
    store.append({
      tenant: TENANT,
      generation: 1,
      session: 's1',
      through: '51',
      at: 2000,
      documents: [item(51, 'needle late')],
    })
    expect(positions(store, ask(1, gram('nee'), { limit: 100 }))).toHaveLength(51)
  })
})

describe('the covers of a generation', () => {
  it('are read from the current generation and from the one being built, not from a gone one', () => {
    const store = storeOf(rootOf())
    const first = ready(store)
    store.append({
      tenant: TENANT,
      generation: first,
      session: 's1',
      through: '4',
      at: 77,
      documents: [],
    })
    expect(store.covers(TENANT, first)).toEqual([{ session: 's1', through: '4', at: 77 }])
    const begun = store.beginRebuild(TENANT, 1)
    if (begun === 'unavailable') throw new Error('begin')
    expect(store.covers(TENANT, begun.generation)).toEqual([])
    store.append({
      tenant: TENANT,
      generation: begun.generation,
      session: 's2',
      through: '2',
      at: 5,
      documents: [],
    })
    expect(store.covers(TENANT, begun.generation)).toEqual([{ session: 's2', through: '2', at: 5 }])
    expect(store.covers(TENANT, first)).toEqual([{ session: 's1', through: '4', at: 77 }])
    expect(store.adopt(TENANT, begun.generation)).toBeNull()
    expect(store.covers(TENANT, first)).toBe('generation-gone')
    expect(store.covers(TENANT, 99)).toBe('generation-gone')
    expect(store.covers('tenant-none', 1)).toBe('generation-gone')
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
      at: 1002,
      documents: [item(1, 'needle'), item(2, 'needle')],
    }
    expect(store.append(batch)).toBeNull()
    expect(store.append(batch)).toBeNull()
    expect(store.append({ ...batch, through: '1', documents: [item(1, 'needle')] })).toBeNull()
    const answer = found(store, ask(generation, gram('nee')))
    expect(answer.rows.map(row => row.position)).toEqual(['2', '1'])
    expect(answer.covered).toEqual([{ session: 's1', through: '2', at: expect.any(Number) }])
  })

  it('writes only what lies past the cover of a batch that overlaps it', () => {
    const store = storeOf(rootOf())
    const generation = ready(store)
    store.append({
      tenant: TENANT,
      generation,
      session: 's1',
      through: '2',
      at: 1002,
      documents: [item(1, 'needle'), item(2, 'needle')],
    })
    store.append({
      tenant: TENANT,
      generation,
      session: 's1',
      through: '5',
      at: 1005,
      documents: [item(2, 'needle'), item(4, 'needle')],
    })
    const answer = found(store, ask(generation, gram('nee')))
    expect(answer.rows.map(row => row.position)).toEqual(['4', '2', '1'])
    expect(answer.covered).toEqual([{ session: 's1', through: '5', at: expect.any(Number) }])
  })

  it('counts the cover in commits: entries of one commit share a revision, and are skipped together', () => {
    const store = storeOf(rootOf())
    const generation = ready(store)
    const entry = (position: number, revision: number) => ({
      ...item(position, 'needle'),
      revision: String(revision),
    })
    store.append({
      tenant: TENANT,
      generation,
      session: 's1',
      through: '1',
      at: 1001,
      documents: [entry(1, 1), entry(2, 1)],
    })
    store.append({
      tenant: TENANT,
      generation,
      session: 's1',
      through: '2',
      at: 1002,
      documents: [entry(1, 1), entry(2, 1), entry(3, 2), entry(4, 2)],
    })
    const answer = found(store, ask(generation, gram('nee')))
    expect(answer.rows.map(row => row.position)).toEqual(['4', '3', '2', '1'])
    expect(answer.covered).toEqual([{ session: 's1', through: '2', at: expect.any(Number) }])
  })

  it('moves the cover of a batch without documents: the entries it read had nothing to search', () => {
    const store = storeOf(rootOf())
    const generation = ready(store)
    expect(
      store.append({
        tenant: TENANT,
        generation,
        session: 's1',
        through: '9',
        at: 1009,
        documents: [],
      }),
    ).toBeNull()
    expect(found(store, ask(generation, ANY))).toEqual({
      stamp: { sessions: 1, total: '9' },
      covered: [{ session: 's1', through: '9', at: expect.any(Number) }],
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
      at: 1001,
      documents: [item(1, 'needle')],
    })
    const stopped = store.append(
      {
        tenant: TENANT,
        generation,
        session: 's1',
        through: '3',
        at: 1003,
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
      covered: [{ session: 's1', through: '1', at: expect.any(Number) }],
      rows: [{ position: '1' }],
    })
    expect(
      store.append({
        tenant: TENANT,
        generation,
        session: 's1',
        through: '3',
        at: 1003,
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
      at: 1010,
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
          at: 1020,
          documents: [item(15, 'needle')],
        })
      },
    })
    if (typeof answer === 'string') throw new Error(answer)
    const cover = BigInt(answer.covered!.find(row => row.session === 's1')!.through)
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

describe('the number of a row in the file: its day, then a serial', () => {
  const DAY = 86_400_000
  const T = Date.UTC(2026, 0, 10)
  const fileIn = (root: string, generation: number): DatabaseSync =>
    new DatabaseSync(join(directoryIn(root), `g${String(generation)}.db`))

  // Three sessions written one after the other; their times interleave over three days. One row
  // has no time, one is from before the days are counted.
  function spread(): Readonly<{ store: Store; generation: number; root: string }> {
    const root = rootOf()
    const store = storeOf(root)
    const generation = ready(store)
    const write = (session: string, times: readonly number[]) =>
      expect(
        store.append({
          tenant: TENANT,
          generation,
          session,
          through: String(times.length),
          at: times.at(-1)!,
          documents: times.map((at, index) => item(index + 1, `needle ${session}`, at)),
        }),
      ).toBeNull()
    write('s1', [T + 1000, T + DAY + 1000, T + DAY + 3000, T + 2 * DAY + 1000])
    write('s2', [T + 2000, T + DAY + 2000, T + DAY + 3000, T + 2 * DAY + 500])
    write('s3', [0, Date.UTC(2019, 5, 1)])
    return { store, generation, root }
  }
  const NEWEST_FIRST = [
    's1:4',
    's2:4',
    's2:3',
    's1:3',
    's2:2',
    's1:2',
    's2:1',
    's1:1',
    's3:2',
    's3:1',
  ]

  it('gives rows newest first by the time they count at, whatever order they were written in', () => {
    const { store, generation } = spread()
    expect(positions(store, ask(generation, gram('nee')))).toEqual(NEWEST_FIRST)
    expect(positions(store, ask(generation, ANY))).toEqual(NEWEST_FIRST)
    const docs = found(store, ask(generation, gram('nee'))).rows.map(row => BigInt(row.doc))
    expect(docs.map(doc => Number(doc >> 20n))).toEqual([
      T + 2 * DAY + 1000,
      T + 2 * DAY + 500,
      T + DAY + 3000,
      T + DAY + 3000,
      T + DAY + 2000,
      T + DAY + 1000,
      T + 2000,
      T + 1000,
      Date.UTC(2019, 5, 1),
      0,
    ])
    expect(new Set(docs).size).toBe(docs.length)
  })

  it('goes on after any row, a row at a time, and gives each row once', () => {
    const { store, generation } = spread()
    for (const plan of [gram('nee'), ANY]) {
      const walked: string[] = []
      let before: string | null = null
      for (let turn = 0; turn < 2 * NEWEST_FIRST.length; turn += 1) {
        const rows: readonly Readonly<{ doc: string; session: string; position: string }>[] = found(
          store,
          ask(generation, plan, { limit: 1, before }),
        ).rows
        if (rows.length === 0) break
        walked.push(`${rows[0]!.session}:${rows[0]!.position}`)
        before = rows[0]!.doc
      }
      expect(walked).toEqual(NEWEST_FIRST)
    }
  })

  it.each([1, 2, 3, 4, 5, 7, 9, 10, 11])(
    'gives the same rows in the same order whatever the batch: %i at a time',
    limit => {
      const { store, generation } = spread()
      for (const plan of [gram('nee'), ANY]) {
        const walked: string[] = []
        let before: string | null = null
        for (let turn = 0; turn < 2 * NEWEST_FIRST.length; turn += 1) {
          const rows: readonly Readonly<{ doc: string; session: string; position: string }>[] =
            found(store, ask(generation, plan, { limit, before })).rows
          expect(rows.length).toBeLessThanOrEqual(limit)
          if (rows.length === 0) break
          for (const row of rows) walked.push(`${row.session}:${row.position}`)
          before = rows.at(-1)!.doc
        }
        expect(walked).toEqual(NEWEST_FIRST)
      }
    },
  )

  it('keeps a window in every batch size, also when it cuts a day', () => {
    const { store, generation } = spread()
    for (const limit of [1, 2, 3, 10]) {
      const walked: string[] = []
      let before: string | null = null
      for (let turn = 0; turn < 20; turn += 1) {
        const window = { from: T + 1001, to: T + 2 * DAY + 500 }
        const rows: readonly Readonly<{ doc: string; session: string; position: string }>[] = found(
          store,
          ask(generation, gram('nee'), { limit, before, window }),
        ).rows
        if (rows.length === 0) break
        for (const row of rows) walked.push(`${row.session}:${row.position}`)
        before = rows.at(-1)!.doc
      }
      expect(walked).toEqual(['s2:4', 's2:3', 's1:3', 's2:2', 's1:2', 's2:1'])
    }
  })

  it('keeps a window exact inside a day, across days, and for rows with no time', () => {
    const { store, generation } = spread()
    const within = (from: number | null, to: number | null, before: string | null = null) =>
      positions(store, ask(generation, gram('nee'), { window: { from, to }, before }))
    expect(within(T + DAY + 2000, T + DAY + 3000)).toEqual(['s2:3', 's1:3', 's2:2'])
    expect(within(T + 1001, T + DAY + 1000)).toEqual(['s1:2', 's2:1'])
    expect(within(null, 0)).toEqual(['s3:1'])
    expect(within(1, Date.UTC(2020, 0, 1))).toEqual(['s3:2'])
    expect(within(T + 2 * DAY + 501, null)).toEqual(['s1:4'])
    const tied = found(store, ask(generation, gram('nee'))).rows[2]!
    expect(within(T + DAY + 2000, null, tied.doc)).toEqual(['s1:3', 's2:2'])
  })

  it('keeps the row numbers of the file small: a day counted from 2020 and a serial within it', () => {
    const { root, generation } = spread()
    const file = fileIn(root, generation)
    const ids = file
      .prepare('SELECT id FROM doc ORDER BY id')
      .all()
      .map(row => Number(row['id']))
    file.close()
    // The index stores row numbers whole at the head of each list: a large number costs bytes there.
    expect(Math.max(...ids)).toBeLessThan(2 ** 35)
    expect(ids.slice(0, 2)).toEqual([0, 1])
    expect(new Set(ids.map(id => Math.floor(id / 2 ** 20))).size).toBe(4)
  })

  it('answers unavailable, and moves no cover, when a day has no number left', () => {
    const { store, generation, root } = spread()
    const file = fileIn(root, generation)
    const last = Number(file.prepare('SELECT max(id) AS id FROM doc').get()!['id'])
    const full = Math.floor(last / 2 ** 20) * 2 ** 20 + 2 ** 20 - 1
    file.prepare('INSERT INTO doc (id, session, position, at) VALUES (?, 1, 99, ?)').run(full, T)
    file.close()
    const more = (at: number) =>
      store.append({
        tenant: TENANT,
        generation,
        session: 's1',
        through: '5',
        at,
        documents: [item(5, 'needle late', at)],
      })
    const covers = store.covers(TENANT, generation)
    expect(more(T + 2 * DAY + 2000)).toBe('unavailable')
    expect(store.covers(TENANT, generation)).toEqual(covers)
    expect(positions(store, ask(generation, gram('nee')))).toEqual(NEWEST_FIRST)
    expect(more(T + 3 * DAY)).toBeNull()
    expect(positions(store, ask(generation, gram('nee')))[0]).toBe('s1:5')
  })
})

describe('a generation is put in order before it is adopted', () => {
  it('is one merged index with no free pages: smaller than what the build left', () => {
    const root = rootOf()
    const store = storeOf(root)
    expect(store.beginRebuild(TENANT, 1)).toEqual({ generation: 1 })
    // Each batch has words of its own, so each leaves a part of the index that shares little.
    const words = (n: number): string =>
      Array.from({ length: 150 }, (_, k) => (n * 7919 + k * 104_729).toString(36)).join(' ')
    for (let n = 1; n <= 120; n += 1)
      store.append({
        tenant: TENANT,
        generation: 1,
        session: `s${String(n % 7)}`,
        through: String(n),
        at: 1000 + n,
        documents: [item(n, `needle ${words(n)}`)],
      })
    const pages = (): Readonly<{ all: number; free: number }> => {
      const file = new DatabaseSync(join(directoryIn(root), 'g1.db'))
      const all = Number(file.prepare('PRAGMA page_count').get()!['page_count'])
      const free = Number(file.prepare('PRAGMA freelist_count').get()!['freelist_count'])
      file.close()
      return { all, free }
    }
    const before = pages()
    expect(store.adopt(TENANT, 1)).toBeNull()
    const after = pages()
    expect(after.free).toBe(0)
    expect(after.all).toBeLessThan(before.all - before.free)
    expect(positions(store, ask(1, gram('nee'), { limit: 200 }))).toHaveLength(120)
  })
})
