// C-WORKCACHE A2: the participant keeps the parsed snapshot of each session and reuses it when the
// head row that the transaction read holds the same text (R2-D96: by content, not only by the
// revision). The head carries the token of the chunk rows (R2-D292), and the participant keeps the
// snapshot that a commit wrote under the head it wrote. These cases run the real participant over
// the node:sqlite test provider, which runs every database of a test file in one module instance.
// Each case starts with no kept snapshot, but no result depends on that: T-A2-4 runs two databases
// in one case. The cases cover the commit path (`commandStart`) and the log path (`judgeLog`).
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  SessionFailure,
  SessionLogCommitObservation,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { ParsedSnapshots, parsedSnapshots } from '../src/worker/participant.ts'
import { assemble } from '../src/worker/state-rows.ts'
import { app, textOf, TENANT_A, TENANT_B, type App } from './fixtures/app.ts'
import {
  activeRun,
  agentEventOf,
  agentPublisher,
  eventOf,
  registrationOf,
  startRun,
  workOf,
} from './fixtures/real-provider.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

const SESSION = 'session-1'

beforeEach(() => {
  parsedSnapshots.clear()
})

const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}
const failureOf = (value: unknown): SessionFailure => {
  expect(value, JSON.stringify(value)).toHaveProperty('failure')
  return (value as { failure: SessionFailure }).failure
}

/** The `sl_state` row of `tenant`'s session-1, read outside any transaction. */
function stored(a: App, tenant = TENANT_A): Readonly<{ covered: bigint; text: string }> {
  const row = a.provider.select(
    tenant === TENANT_A ? 'dom_0' : 'dom_1',
    'SELECT covered, snapshot FROM sl_state WHERE tenant = ? AND session = ?',
    [textOf(tenant), SESSION],
  ).rows[0]
  if (row === undefined) throw new Error('no sl_state row')
  return { covered: BigInt(row[0] as bigint), text: String(row[1]) }
}

/** The snapshot that the head row and the chunk rows of `tenant`'s session-1 hold. */
function storedSnapshot(a: App, tenant = TENANT_A): WorkSnapshot {
  const domain = tenant === TENANT_A ? 'dom_0' : 'dom_1'
  const port = {
    execute: (sql: string, params: readonly never[]) => a.provider.select(domain, sql, params),
  }
  return assemble(port, textOf(tenant), SESSION, stored(a, tenant).text).snapshot
}

/** How many times a participant read the chunk rows so far. */
const chunkReads = (a: App): number =>
  a.provider.participantReads.filter(read => /FROM sl_state_item\b/u.test(read.sql)).length

const keptOf = (tenant = TENANT_A) => parsedSnapshots.peek(textOf(tenant), SESSION)

/** How many times a participant read `sl_state` so far. */
const stateReads = (a: App): number =>
  a.provider.participantReads.filter(read => /FROM sl_state\b/u.test(read.sql)).length

/** Every object and array reachable from `value` is frozen. */
function deeplyFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true
  return Object.isFrozen(value) && Object.values(value).every(member => deeplyFrozen(member))
}

/** A commit that reads the snapshot and is refused: no pending input to start a Run on. */
async function refusedStart(a: App, name: string): Promise<void> {
  expect(failureOf(await startRun(a, name)).kind).not.toBe('unavailable')
}

describe('T-A2-1: two commits that read the same snapshot parse it once', () => {
  it('the second refused commit reads the row again but reuses the parsed snapshot', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    await refusedStart(a, 'start-1')
    const first = keptOf()
    expect(first?.covered).toBe(1n)
    expect(first?.snapshot).toEqual(storedSnapshot(a))
    const reads = stateReads(a)
    const chunks = chunkReads(a)
    await refusedStart(a, 'start-2')
    // A parse makes a new snapshot; the same one is the one of revision 1.
    expect(keptOf()?.snapshot).toBe(first?.snapshot)
    expect(stateReads(a)).toBe(reads + 1)
    expect(chunkReads(a)).toBe(chunks)
  })

  it('a commit after a committed one starts from the snapshot that commit wrote, without the chunk rows', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    await refusedStart(a, 'start-1')
    const before = keptOf()
    ok(await a.accept(TENANT_A, SESSION, 'input-1'))
    // accept started from the kept revision 1, committed revision 2 and kept what it wrote.
    const second = stored(a)
    expect(second.covered).toBe(2n)
    const written = keptOf()
    expect(written?.snapshot).not.toBe(before?.snapshot)
    expect(written?.covered).toBe(2n)
    expect(written?.text).toBe(second.text)
    expect(written?.snapshot).toEqual(storedSnapshot(a))
    const reads = stateReads(a)
    const chunks = chunkReads(a)
    ok(await a.accept(TENANT_A, SESSION, 'input-2'))
    expect(stateReads(a)).toBe(reads + 1)
    expect(chunkReads(a)).toBe(chunks)
    expect(keptOf()?.covered).toBe(3n)
    expect(keptOf()?.snapshot).toEqual(storedSnapshot(a))
  })
})

describe('T-A2-2: the snapshot of a commit that fails is kept, but the next commit does not use it', () => {
  // A BEFORE UPDATE trigger that ignores the row makes the conditional tail update change no row,
  // so the participant answers failed and the storage rolls the transaction back.
  const IGNORE_TAIL =
    'CREATE TRIGGER ignore_tail BEFORE UPDATE ON sl_journal BEGIN SELECT RAISE(IGNORE); END'

  it('after the tail update changed no row, the kept snapshot is the stored one, and the next commit starts from it', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, SESSION, 'input-1'))
    const committed = stored(a)
    expect(committed.covered).toBe(2n)

    a.provider.seed('dom_0', IGNORE_TAIL)
    failureOf(await a.accept(TENANT_A, SESSION, 'input-2'))
    a.provider.seed('dom_0', 'DROP TRIGGER ignore_tail')

    // The failed commit left the stored row. The kept snapshot is the one it computed, under a head
    // text that the row does not hold.
    expect(stored(a)).toEqual(committed)
    expect(keptOf()?.text).not.toBe(committed.text)

    // The next commit starts from the stored snapshot: input-2 was never admitted.
    const chunks = chunkReads(a)
    ok(await a.accept(TENANT_A, SESSION, 'input-3'))
    expect(chunkReads(a)).toBe(chunks + 1)
    const after = storedSnapshot(a)
    expect(stored(a).covered).toBe(3n)
    expect(after.pending).toEqual((await workOf(a)).pending)
    expect(after.pending.map(String)).toEqual(
      expect.arrayContaining([expect.stringContaining('input-3')]),
    )
    expect(after.pending.some(input => String(input).includes('input-2'))).toBe(false)
  })

  it('after a write fails in the log path, the kept snapshot is the stored one and the retry reuses it', async () => {
    const a = await app()
    const agent = agentPublisher({
      storage: a.provider.storage,
      combination: { combinationVersion: 'c1', manifestDigest: 'a'.repeat(64) },
      domainOf: tenant => (textOf(tenant) === textOf(TENANT_A) ? 'dom_0' : 'dom_1'),
    })
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, SESSION, 'input-1'))
    ok(await startRun(a, 'start-run-1'))
    const scene = activeRun(await workOf(a))
    const observation: SessionLogCommitObservation = eventOf(
      scene,
      1,
      [registrationOf(scene.attempt, 1)],
      'log-1',
    )
    await agent.publish(agentEventOf(observation))
    const committed = stored(a)
    if (a.port.commitLog === undefined) throw new Error('the SQL port offers no commitLog')

    a.provider.failWrite(/UPDATE sl_journal/u)
    expect(failureOf(await a.port.commitLog({ observation })).kind).toBe('unavailable')
    a.provider.failWrite(null)
    expect(stored(a)).toEqual(committed)
    expect(keptOf()?.text).not.toBe(committed.text)

    const reads = stateReads(a)
    const chunks = chunkReads(a)
    ok(await a.port.commitLog({ observation }))
    // The retry read the stored rows again, then committed the next revision.
    expect(stateReads(a)).toBe(reads + 1)
    expect(chunkReads(a)).toBe(chunks + 1)
    expect(stored(a).covered).toBe(committed.covered + 1n)
    const work = await workOf(a)
    expect(work.run.kind === 'active' ? work.run.execution.readThrough : null).toBe('1')
  })
})

describe('T-A2-3: the snapshot that a commit starts from is deep-frozen', () => {
  it('every object of the kept snapshot is frozen, and a write into it throws', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, SESSION, 'input-1'))
    ok(await a.accept(TENANT_A, SESSION, 'input-2'))
    const kept = keptOf()?.snapshot
    expect(kept).toBeDefined()
    expect(deeplyFrozen(kept)).toBe(true)
    expect(() => {
      ;(kept as unknown as { pending: unknown[] }).pending.push('x')
    }).toThrow(TypeError)
    // The failed write changed nothing that a later reader sees.
    expect(keptOf()?.snapshot).toEqual(storedSnapshot(a))
  })
})

describe('the key of a kept snapshot', () => {
  it('the same session name of two tenants keeps two snapshots', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    ok(await a.create(TENANT_B))
    ok(await a.accept(TENANT_B, SESSION, 'only-in-tenant-b'))
    await refusedStart(a, 'start-a')
    const ofA = keptOf(TENANT_A)
    ok(await a.accept(TENANT_B, SESSION, 'second-in-tenant-b'))
    expect(keptOf(TENANT_A)?.snapshot).toBe(ofA?.snapshot)
    expect(ofA?.snapshot.pending).toEqual([])
    // Tenant B's commit wrote B's revision 3, with B's two pending inputs.
    expect(keptOf(TENANT_B)?.covered).toBe(3n)
    expect(keptOf(TENANT_B)?.snapshot.pending).toHaveLength(2)
  })
})

describe('T-A2-4: the kept snapshot is checked against the row, not only by its revision', () => {
  // Two databases in one module instance (the test provider), with no clear between them: the same
  // tenant, the same session and the same revision, with other rows. The commits alternate.
  it('two databases at the same revision with other rows: each commit starts from its own row', async () => {
    const a = await app()
    const b = await app()
    ok(await a.create(TENANT_A))
    ok(await b.create(TENANT_A))
    for (const round of [1, 2, 3]) {
      ok(await a.accept(TENANT_A, SESSION, `a-${String(round)}`))
      ok(await b.accept(TENANT_A, SESSION, `b-${String(round)}`))
      expect(stored(a).covered).toBe(stored(b).covered)
      expect(stored(a).text).not.toBe(stored(b).text)
    }
    const inputs = (x: App) => storedSnapshot(x).pending.map(String)
    expect(inputs(a)).toHaveLength(3)
    expect(inputs(b)).toHaveLength(3)
    expect(inputs(a).every(input => input.includes('a-'))).toBe(true)
    expect(inputs(b).every(input => input.includes('b-'))).toBe(true)
    expect((await workOf(a)).pending).toEqual(storedSnapshot(a).pending)
    expect((await workOf(b)).pending).toEqual(storedSnapshot(b).pending)
  })
})

describe('the parsed snapshots against the rows of one database', () => {
  /** A database with session `s` at `covered`, whose snapshot text names the revision. */
  function database(sessions: readonly string[], covered = 1n) {
    const { port } = migratedPort()
    for (const session of sessions) {
      port.execute(
        'INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, ?, ?, ?, ?)',
        ['t', session, covered, covered, 'epoch:0'],
      )
      port.execute(
        'INSERT INTO sl_state (tenant, session, snapshot, covered) VALUES (?, ?, ?, ?)',
        ['t', session, JSON.stringify({ session, revision: String(covered) }), covered],
      )
    }
    return port
  }
  const move = (port: ReturnType<typeof database>, session: string, covered: bigint) => {
    port.execute('UPDATE sl_journal SET tail = ? WHERE tenant = ? AND session = ?', [
      covered,
      't',
      session,
    ])
    port.execute('UPDATE sl_state SET snapshot = ?, covered = ? WHERE tenant = ? AND session = ?', [
      JSON.stringify({ session, revision: String(covered) }),
      covered,
      't',
      session,
    ])
  }

  it('keeps the least recently used sessions up to the session bound', () => {
    const port = database(['s1', 's2', 's3'])
    const cache = new ParsedSnapshots(2)
    const s1 = cache.covering(port, 't', 's1', 1n)
    cache.covering(port, 't', 's2', 1n)
    expect(cache.covering(port, 't', 's1', 1n)).toBe(s1)
    cache.covering(port, 't', 's3', 1n)
    expect(cache.size.sessions).toBe(2)
    expect(cache.peek('t', 's1')?.snapshot).toBe(s1)
    expect(cache.peek('t', 's2')).toBeUndefined()
    expect(cache.peek('t', 's3')).toBeDefined()
  })

  it('keeps nothing with a session bound of zero', () => {
    const port = database(['s1'])
    const cache = new ParsedSnapshots(0)
    const first = cache.covering(port, 't', 's1', 1n)
    expect(cache.covering(port, 't', 's1', 1n)).not.toBe(first)
    expect(cache.size).toEqual({ sessions: 0, text: 0 })
  })

  it('a tail above or below the kept revision reads the row again', () => {
    const port = database(['s1'], 5n)
    const cache = new ParsedSnapshots()
    cache.covering(port, 't', 's1', 5n)
    move(port, 's1', 6n)
    expect(cache.covering(port, 't', 's1', 6n)).toEqual({ session: 's1', revision: '6' })
    // A tail that moved back (a restored database) is read again, never answered from revision 6.
    move(port, 's1', 3n)
    expect(cache.covering(port, 't', 's1', 3n)).toEqual({ session: 's1', revision: '3' })
    expect(cache.peek('t', 's1')?.covered).toBe(3n)
  })

  it('the same revision with another text (a rewritten row) is parsed again', () => {
    const port = database(['s1'])
    const cache = new ParsedSnapshots()
    cache.covering(port, 't', 's1', 1n)
    port.execute('UPDATE sl_state SET snapshot = ? WHERE tenant = ? AND session = ?', [
      JSON.stringify({ session: 's1', revision: '1', rewritten: true }),
      't',
      's1',
    ])
    expect(cache.covering(port, 't', 's1', 1n)).toEqual({
      session: 's1',
      revision: '1',
      rewritten: true,
    })
  })

  it('keeps no more text than the text bound, and no entry larger than it', () => {
    const port = database(['s1', 's2'])
    const textOfRow = (session: string) => JSON.stringify({ session, revision: '1' })
    const cache = new ParsedSnapshots(10, textOfRow('s1').length + 5)
    cache.covering(port, 't', 's1', 1n)
    expect(cache.size).toEqual({ sessions: 1, text: textOfRow('s1').length })
    cache.covering(port, 't', 's2', 1n)
    expect(cache.peek('t', 's1')).toBeUndefined()
    expect(cache.size).toEqual({ sessions: 1, text: textOfRow('s2').length })
    const small = new ParsedSnapshots(10, 5)
    expect(small.covering(port, 't', 's1', 1n)).toEqual({ session: 's1', revision: '1' })
    expect(small.size).toEqual({ sessions: 0, text: 0 })
  })

  it('a row that does not cover the tail is behind and drops the kept snapshot', () => {
    const port = database(['s1'])
    const cache = new ParsedSnapshots()
    cache.covering(port, 't', 's1', 1n)
    expect(cache.covering(port, 't', 's1', 2n)).toBe('behind')
    expect(cache.peek('t', 's1')).toBeUndefined()
  })

  it('a row that does not parse throws and keeps nothing for the session', () => {
    const port = database(['s1'])
    const cache = new ParsedSnapshots()
    cache.covering(port, 't', 's1', 1n)
    port.execute('UPDATE sl_state SET snapshot = ?, covered = 2', ['{not json'])
    expect(() => cache.covering(port, 't', 's1', 2n)).toThrow()
    expect(cache.peek('t', 's1')).toBeUndefined()
  })
})
