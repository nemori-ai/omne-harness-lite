import { describe, expect, it } from 'vitest'
import { followSession } from '../src/index.ts'
import { createMemoryIndex, createMemoryLog } from '../src/testing.ts'
import { S1, TENANT, said } from './search-support.ts'

function followed() {
  const log = createMemoryLog()
  const index = createMemoryIndex()
  const generation = index.ready()
  const deps = { index, log: log.reader }
  const step = (maxBytes = 1 << 20) =>
    followSession(deps, {
      tenant: TENANT,
      generation,
      session: S1,
      cover: index.coverOf(generation, S1),
      maxBytes,
    })
  const rows = async () => {
    const found = await index.candidates({
      tenant: TENANT,
      generation,
      plan: { kind: 'any' },
      sessions: null,
      window: { from: null, to: null },
      before: null,
      limit: 100,
      known: null,
    })
    if ('failure' in found) throw new Error(found.failure)
    return found.ok.rows.map(row => `${row.position}@${String(BigInt(row.doc) >> 20n)}`)
  }
  return { log, index, generation, step, rows }
}

describe('following the log of a session (SH-2)', () => {
  it('appends the documents of a page and moves the cover to where the page ends', async () => {
    const w = followed()
    w.log.commit(S1, [said('one'), said('two', 'message.delivered')], 1000)
    w.log.commit(S1, [said('three')], 2000)
    expect(await w.step()).toEqual({ ok: { through: '2', at: 2000, exhausted: true, entries: 2 } })
    expect(await w.rows()).toEqual(['3@2000', '1@1000'])
    expect(w.index.coverOf(w.generation, S1)).toEqual({ through: '2', at: 2000 })
  })

  it('goes on from the cover, a page at a time, and writes nothing twice', async () => {
    const w = followed()
    for (let turn = 1; turn <= 3; turn += 1) w.log.commit(S1, [said(`turn ${turn}`)], turn * 1000)
    expect(await w.step(1)).toMatchObject({ ok: { through: '1', exhausted: false, entries: 1 } })
    expect(await w.step(1)).toMatchObject({ ok: { through: '2', exhausted: false } })
    expect(await w.step(1)).toMatchObject({ ok: { through: '3', exhausted: true } })
    expect(await w.step(1)).toEqual({ ok: { through: '3', at: 3000, exhausted: true, entries: 0 } })
    expect(await w.rows()).toEqual(['3@3000', '2@2000', '1@1000'])
  })

  it('counts an entry with no recorded time at the last recorded one, across pages too', async () => {
    const w = followed()
    w.log.commit(S1, [said('untimed first')], null)
    w.log.commit(S1, [said('timed')], 4000)
    w.log.commit(S1, [said('untimed after')], null)
    await w.step(1)
    expect(w.index.coverOf(w.generation, S1)).toEqual({ through: '1', at: 0 })
    await w.step(1)
    await w.step(1)
    expect(await w.rows()).toEqual(['3@4000', '2@4000', '1@0'])
    expect(w.index.coverOf(w.generation, S1)).toEqual({ through: '3', at: 4000 })
  })

  it('moves the cover over commits that have nothing to index', async () => {
    const w = followed()
    w.log.commit(S1, [said('delivered', 'message.delivered')], 1000)
    w.log.commit(S1, [{ kind: 'message.user', blocks: [] }], 2000)
    expect(await w.step()).toMatchObject({ ok: { through: '2', entries: 1 } })
    expect(await w.rows()).toEqual([])
    expect(w.index.coverOf(w.generation, S1)).toEqual({ through: '2', at: 2000 })
  })

  it('passes on what the log or the index cannot do, and then leaves the cover alone', async () => {
    const w = followed()
    w.log.commit(S1, [said('one')], 1000)
    w.log.faults.entries = true
    expect(await w.step()).toEqual({ failure: 'unavailable' })
    w.log.faults.entries = false
    w.index.faults.failing = 'generation-gone'
    expect(await w.step()).toEqual({ failure: 'generation-gone' })
    w.index.faults.failing = null
    expect(w.index.coverOf(w.generation, S1)).toEqual({ through: '0', at: 0 })
  })
})
