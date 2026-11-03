// C-WORKCACHE A2: the participant keeps the parsed `sl_state` snapshot of each session and reuses it
// when the journal tail that the transaction read equals the revision the snapshot covers. These
// cases run the real participant over the node:sqlite test provider. That provider runs every
// database of a test file in one module instance, while sqlite-provider runs one write Worker per
// transaction domain; so each case here starts with no kept snapshot. The cases cover the commit
// path (`commandStart`) and the log path (`judgeLog`); the entries path reads its own snapshot.
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  SessionFailure,
  SessionLogCommitObservation,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { decodeValue } from '../src/codec.ts'
import { ParsedSnapshots, parsedSnapshots } from '../src/worker/participant.ts'
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

const parsedOf = (text: string): WorkSnapshot =>
  decodeValue(JSON.parse(text) as never) as WorkSnapshot

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
  it('the second refused commit reuses the parsed snapshot and does not read sl_state', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    await refusedStart(a, 'start-1')
    const first = keptOf()
    expect(first?.covered).toBe(1n)
    expect(first?.snapshot).toEqual(parsedOf(stored(a).text))
    const reads = stateReads(a)
    await refusedStart(a, 'start-2')
    // A parse makes a new entry; the same entry is the one parse of revision 1.
    expect(keptOf()).toBe(first)
    expect(stateReads(a)).toBe(reads)
  })

  it('a commit after a committed one reads and parses the new revision', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    await refusedStart(a, 'start-1')
    const before = keptOf()
    ok(await a.accept(TENANT_A, SESSION, 'input-1'))
    // accept started from the kept revision 1 and committed revision 2.
    expect(keptOf()).toBe(before)
    const second = stored(a)
    expect(second.covered).toBe(2n)
    const reads = stateReads(a)
    ok(await a.accept(TENANT_A, SESSION, 'input-2'))
    expect(stateReads(a)).toBe(reads + 1)
    expect(keptOf()?.covered).toBe(2n)
    expect(keptOf()?.snapshot).toEqual(parsedOf(second.text))
  })
})

describe('T-A2-2: a commit that fails keeps the snapshot it read, not the one it computed', () => {
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

    // The failed commit left the stored row, and the kept snapshot is that row at its revision.
    expect(stored(a)).toEqual(committed)
    expect(keptOf()?.covered).toBe(committed.covered)
    expect(keptOf()?.snapshot).toEqual(parsedOf(committed.text))

    // The next commit starts from the stored snapshot: input-2 was never admitted.
    ok(await a.accept(TENANT_A, SESSION, 'input-3'))
    const after = parsedOf(stored(a).text)
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
    const kept = keptOf()
    expect(kept?.covered).toBe(committed.covered)
    expect(kept?.snapshot).toEqual(parsedOf(committed.text))

    const reads = stateReads(a)
    ok(await a.port.commitLog({ observation }))
    // The retry started from the kept snapshot, then committed the next revision.
    expect(keptOf()).toBe(kept)
    expect(stateReads(a)).toBe(reads)
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
    const read = stored(a)
    ok(await a.accept(TENANT_A, SESSION, 'input-2'))
    const kept = keptOf()?.snapshot
    expect(kept).toBeDefined()
    expect(deeplyFrozen(kept)).toBe(true)
    expect(() => {
      ;(kept as unknown as { pending: unknown[] }).pending.push('x')
    }).toThrow(TypeError)
    // The failed write changed nothing that a later reader sees.
    expect(keptOf()?.snapshot).toEqual(parsedOf(read.text))
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
    expect(keptOf(TENANT_A)).toBe(ofA)
    expect(ofA?.snapshot.pending).toEqual([])
    // Tenant B's commit started from B's revision 2, with B's one pending input.
    expect(keptOf(TENANT_B)?.covered).toBe(2n)
    expect(keptOf(TENANT_B)?.snapshot.pending).toHaveLength(1)
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
    expect(cache.size).toBe(2)
    expect(cache.peek('t', 's1')?.snapshot).toBe(s1)
    expect(cache.peek('t', 's2')).toBeUndefined()
    expect(cache.peek('t', 's3')).toBeDefined()
  })

  it('keeps nothing with a session bound of zero', () => {
    const port = database(['s1'])
    const cache = new ParsedSnapshots(0)
    const first = cache.covering(port, 't', 's1', 1n)
    expect(cache.covering(port, 't', 's1', 1n)).not.toBe(first)
    expect(cache.size).toBe(0)
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
