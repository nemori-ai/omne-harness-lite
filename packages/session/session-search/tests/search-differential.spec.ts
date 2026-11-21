import { describe, expect, it } from 'vitest'
import type { SessionId } from '@omne-harness/session-contract'
import { randomCommit, randomQuery, type Rng } from '../src/testing.ts'
import { TENANT, keysOf, world } from './search-support.ts'
import { random } from './support.ts'

// SH-1 as a difference: whatever the index covers, a search that says it is through gives the
// entries a scan of every log gives, each once. A failure prints its seed; the seed reruns it.

type World = ReturnType<typeof world>
const SESSIONS = ['s-a', 's-b', 's-c', 's-d', 's-e'] as readonly string[] as readonly SessionId[]
const commit = (w: World, rng: Rng, clock: { at: number }) =>
  randomCommit(w.log, rng, clock, SESSIONS)
const queryOfSeed = (rng: Rng, top: number) => randomQuery(rng, top, SESSIONS)

type IndexShape = 'none' | 'partial' | 'building' | 'rebuilding'

async function prepared(seed: number, shape: IndexShape) {
  const rng = random(seed)
  const w = world()
  const clock = { at: 1000 }
  for (let n = 5 + rng.below(40); n > 0; n -= 1) commit(w, rng, clock)
  for (const session of w.log.sessions()) w.log.archive(session, rng.below(4) === 0)
  const cover = async (generation: number) => {
    for (const session of w.log.sessions()) {
      const upTo = rng.below(Number(w.log.tail(session)) + 1)
      if (upTo > 0) await w.follow(generation, session, String(upTo))
    }
  }
  if (shape === 'partial' || shape === 'rebuilding') await cover(w.index.ready())
  if (shape === 'building' || shape === 'rebuilding') {
    const begun = await w.index.beginRebuild(TENANT, w.log.sessions().length)
    if ('failure' in begun) throw new Error('begin')
    await cover(begun.ok.generation)
  }
  return { w, rng, clock }
}

const SEEDS = Array.from({ length: 150 }, (_, at) => 7001 + at * 13)

describe.each(['none', 'partial', 'building', 'rebuilding'] as const)(
  'a search with the index %s gives what a scan gives (SH-1)',
  shape => {
    it('in one roomy page', async () => {
      for (const seed of SEEDS) {
        const { w, rng, clock } = await prepared(seed, shape)
        for (let turn = 0; turn < 4; turn += 1) {
          const query = queryOfSeed(rng, clock.at)
          const page = await w.page(query, { pageSize: 10_000 })
          const told = `seed ${seed}, query ${JSON.stringify(query)}`
          expect(page.complete, told).toBe(true)
          expect(keysOf([page]).sort(), told).toEqual(w.scan(query))
        }
      }
    })
  },
)

describe.each(['partial', 'rebuilding'] as const)(
  'a paged search with the index %s, while the log and the index move on (SH-1)',
  shape => {
    it('gives every entry that was there at the start, once, and none that never was', async () => {
      for (const seed of SEEDS) {
        const { w, rng, clock } = await prepared(seed, shape)
        const generation = (await w.index.state(TENANT)) as { generation: number }
        const query = queryOfSeed(rng, clock.at + 500)
        const told = `seed ${seed}, query ${JSON.stringify(query)}`
        const atStart = w.scan(query)
        const limits = {
          candidateBatch: 1 + rng.below(5),
          verifyBatch: 1 + rng.below(4),
          maxCandidates: 1 + rng.below(12),
          scanBytes: 100 + rng.below(1500),
          tailPageBytes: 1 + rng.below(600),
        }
        const pages = await w.pages(query, { pageSize: 1 + rng.below(6), limits }, async () => {
          if (rng.below(2) === 0) commit(w, rng, clock)
          if (rng.below(2) === 0) await w.follow(generation.generation, rng.pick(w.log.sessions()))
        })
        const keys = keysOf(pages)
        expect(new Set(keys).size, told).toBe(keys.length)
        expect(pages.at(-1), told).toMatchObject({ complete: true, next: null })
        const atEnd = new Set(w.scan(query))
        expect(
          keys.filter(key => !atEnd.has(key)),
          told,
        ).toEqual([])
        const found = new Set(keys)
        expect(
          atStart.filter(key => !found.has(key)),
          told,
        ).toEqual([])
      }
    })
  },
)

describe('a search that is not through', () => {
  it('still gives only entries a scan gives, with no index and a short budget', async () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const { w, rng, clock } = await prepared(seed, 'none')
      const query = queryOfSeed(rng, clock.at)
      const limits = { scanBytes: 1 + rng.below(800), tailPageBytes: 1 + rng.below(300) }
      const page = await w.page(query, { pageSize: 1 + rng.below(5), limits })
      const all = new Set(w.scan(query))
      const keys = keysOf([page])
      expect(keys.filter(key => !all.has(key))).toEqual([])
      expect(new Set(keys).size).toBe(keys.length)
      if (!page.complete) expect(page.next).toBeNull()
      else expect([...keys].sort()).toEqual(w.scan(query))
    }
  })
})
