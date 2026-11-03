// C-WORKCACHE A3 (R2-D90): the Session rows of the history index are kept in the Worker module and
// grow by the rows after their cursor. The answer of a kept index is the answer of a whole read
// (T-A3-1); a gap after the cursor fails the call and the next call builds again (T-A3-2); the
// inputs stay those of the scope (T-A3-3); an SE15 row without its SE13 is left out as before, and
// a later SE13 brings it in (T-A3-4). Rows of an open transaction are never kept, a log that is not
// the folded one is built again, and the kept sessions have a bound.
//
// The whole read is the same function in a fresh module instance: its kept map is empty.
import { describe, expect, it, vi } from 'vitest'
import type {
  SessionHistoryIndex,
  SessionHistoryReads,
  SessionInputScope,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { operationId, sessionId } from '@omne-harness/session-contract/testing'
import { encodeValue } from '../src/codec.ts'
import { readHistory } from '../src/worker/history-index.ts'
import { app, textOf, TENANT_A, type App } from './fixtures/app.ts'
import { activeRun, cancelRun, startRun, workOf } from './fixtures/real-provider.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

type Port = Parameters<typeof readHistory>[0]
type Answer = Readonly<{ index: SessionHistoryIndex; reads: SessionHistoryReads }>

const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}

/** The rows each statement on `port` returned, and the rows of the five kinds read in total. */
function counting(port: Port) {
  const reads: { sql: string; rows: number }[] = []
  const counted: Port = {
    execute: (sql, params) => {
      const result = port.execute(sql, params)
      reads.push({ sql, rows: result.rows.length })
      return result
    },
  }
  const indexed = () =>
    reads
      .filter(item => /kind IN \('intake\.routed'/u.test(item.sql))
      .reduce((n, i) => n + i.rows, 0)
  return { port: counted, reads, indexed }
}

/** `readHistory` of a fresh module instance: nothing is kept, so it reads every row. */
async function wholeRead(...args: Parameters<typeof readHistory>) {
  vi.resetModules()
  const fresh = await import('../src/worker/history-index.ts')
  return fresh.readHistory(...args)
}

const answered = (value: ReturnType<typeof readHistory>): Answer => {
  if (value === 'too-many') throw new Error('too many rows')
  return value
}

// ---------------------------------------------------------------------------------------------
// Through the port: every commit of a scene, the kept index against a whole read.

const SESSION = 'session-1'
const DOMAIN = 'dom_0'

const selectPort = (a: App): Port => ({
  execute: (sql, params) => a.provider.select(DOMAIN, sql, params as never) as never,
})

function maxPosition(a: App): bigint {
  const [[max]] = a.provider.select(
    DOMAIN,
    'SELECT MAX(position) AS p FROM sl_entry WHERE tenant = ? AND session = ?',
    [textOf(TENANT_A), SESSION],
  ).rows as unknown as [[bigint]]
  return max
}

async function readBoth(a: App) {
  const work = await workOf(a)
  const scope: SessionInputScope = { kind: 'pending', inputs: work.pending }
  const args = [selectPort(a), textOf(TENANT_A), SESSION, work, scope] as const
  const kept = answered(readHistory(...args))
  const whole = answered(await wholeRead(...args))
  return { kept, whole, work }
}

function claim(a: App, run: string, name: string) {
  return a.port.commit({
    access: a.access(TENANT_A),
    command: {
      kind: 'claim',
      input: {
        tenant: TENANT_A,
        session: sessionId(SESSION),
        operation: operationId(name),
        run,
        instance: { owner: 'agent', id: 'instance-2' },
        continuity: { owner: 'test', record: 'continuity', revision: '1', digest: 'd' },
      },
    } as never,
    guards: [],
  })
}

describe('T-A3-1: the kept index answers as a whole read after every commit', () => {
  it('routed inputs, SE13, SE15, the controls and their original executions are equal', async () => {
    const a = await app()
    const answers: Answer[] = []
    const step = async (commit: () => Promise<unknown>) => {
      ok(await commit())
      const { kept, whole } = await readBoth(a)
      expect(kept).toEqual(whole)
      answers.push(kept)
    }
    await step(() => a.create(TENANT_A))
    await step(() => a.accept(TENANT_A, SESSION, 'input-1'))
    await step(() => startRun(a, 'start-run-1'))
    const first = activeRun(await workOf(a))
    await step(() => claim(a, first.run, 'claim-1'))
    await step(() => cancelRun(a, first.run, 'cancel-1'))
    await step(() => a.accept(TENANT_A, SESSION, 'input-2'))
    await step(() => startRun(a, 'start-run-2'))
    const second = activeRun(await workOf(a))
    await step(() => cancelRun(a, second.run, 'cancel-2'))
    await step(() => a.accept(TENANT_A, SESSION, 'input-3'))

    const last = answers[answers.length - 1]
    if (last === undefined) throw new Error('no answer')
    // The original execution of each control is the Run that was active when it was requested,
    // folded in an earlier call than the control row itself.
    expect((last.reads.controls ?? []).map(item => item.execution)).toEqual([
      first.execution,
      second.execution,
    ])
    expect(last.index.attempts.map(item => [item.run, item.execution])).toEqual([
      [first.run, first.execution],
      [first.run, first.execution],
      [second.run, second.execution],
    ])
  })

  it('a second read with no new row reads no row of the five kinds; a commit adds only its own', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, SESSION, 'input-1'))
    ok(await startRun(a, 'start-run-1'))
    const work = await workOf(a)
    const scope: SessionInputScope = { kind: 'pending', inputs: work.pending }
    answered(readHistory(selectPort(a), textOf(TENANT_A), SESSION, work, scope))
    const again = counting(selectPort(a))
    answered(readHistory(again.port, textOf(TENANT_A), SESSION, work, scope))
    expect(again.indexed()).toBe(0)

    const before = maxPosition(a)
    ok(await cancelRun(a, activeRun(work).run, 'cancel-1'))
    const [[written]] = a.provider.select(
      DOMAIN,
      `SELECT COUNT(*) AS n FROM sl_entry WHERE tenant = ? AND session = ? AND position > ?
        AND kind IN ('intake.routed', 'run.started', 'run.attempt-started', 'run.terminal', 'control.requested')`,
      [textOf(TENANT_A), SESSION, before],
    ).rows as unknown as [[bigint]]
    expect(written).toBeGreaterThan(0n)
    // Nothing has read since the cancel committed: this read folds exactly the rows it wrote.
    const next = counting(selectPort(a))
    answered(readHistory(next.port, textOf(TENANT_A), SESSION, work, scope))
    expect(next.indexed()).toBe(Number(written))
  })
})

// ---------------------------------------------------------------------------------------------
// Module level, over one migrated database: rows written directly.

/** The json-text tree that the Session entries store their payloads as (read back by plainOf). */
function tree(value: unknown): unknown {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(tree) }
  return {
    kind: 'object',
    entries: Object.entries(value as object).map(([key, member]) => ({ key, value: tree(member) })),
  }
}

type Db = ReturnType<typeof migratedPort>['port']

function entryText(position: number, revision: number, kind: string, data: object): string {
  return JSON.stringify(
    encodeValue({ id: String(position), revision: String(revision), kind, payload: tree(data) }),
  )
}

function insert(
  db: Db,
  session: string,
  position: number,
  revision: number,
  kind: string,
  data: object,
) {
  db.execute(
    'INSERT INTO sl_entry (tenant, session, position, revision, kind, entry, bytes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      't',
      session,
      BigInt(position),
      BigInt(revision),
      kind,
      entryText(position, revision, kind, data),
      1n,
    ],
  )
}

function tail(db: Db, session: string, revision: number) {
  db.execute(
    'INSERT OR REPLACE INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, ?, ?, ?, ?)',
    ['t', session, BigInt(revision), BigInt(revision), 'epoch:0'],
  )
}

const snapshotOf = (session: string) =>
  ({ tenant: 't', session, revision: '1' }) as unknown as WorkSnapshot
const pending = (...inputs: string[]): SessionInputScope =>
  ({ kind: 'pending', inputs }) as unknown as SessionInputScope
const read = (db: Db | Port, session: string, scope: SessionInputScope = pending()) =>
  answered(readHistory(db as Port, 't', session, snapshotOf(session), scope))
const inputsOf = (answer: Answer) => answer.index.inputs.map(item => item.input)

describe('T-A3-2: a gap after the cursor fails the call, and the next call builds again', () => {
  it('module level: the read with the gap throws; the next one lists the row', () => {
    const { port: db } = migratedPort()
    insert(db, 'gap', 1, 1, 'intake.routed', { input: 'in-1' })
    insert(db, 'gap', 2, 1, 'intake.routed', { input: 'in-2' })
    tail(db, 'gap', 1)
    expect(inputsOf(read(db, 'gap'))).toEqual(['in-1', 'in-2'])
    // Position 3 is missing: the log was not only appended to.
    insert(db, 'gap', 4, 2, 'intake.routed', { input: 'in-4' })
    tail(db, 'gap', 2)
    expect(() => read(db, 'gap')).toThrow(/gap in the Session log after position 2/u)
    expect(inputsOf(read(db, 'gap'))).toEqual(['in-1', 'in-2', 'in-4'])
  })

  it('through the port: the commit after the gap is unavailable and writes nothing', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, SESSION, 'input-1'))
    const before = ok<{ revision: string }>(await a.port.readWork(a.access(TENANT_A)))
    const at = Number(maxPosition(a)) + 2
    a.provider.seed(
      DOMAIN,
      'INSERT INTO sl_entry (tenant, session, position, revision, kind, entry, bytes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        textOf(TENANT_A),
        SESSION,
        BigInt(at),
        BigInt(before.revision),
        'intake.routed',
        entryText(at, Number(before.revision), 'intake.routed', { input: 'seeded' }),
        1n,
      ],
    )
    const refused = await a.accept(TENANT_A, SESSION, 'input-2')
    expect(refused).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(JSON.stringify(refused)).toContain('gap in the Session log')
    expect(ok<{ revision: string }>(await a.port.readWork(a.access(TENANT_A))).revision).toBe(
      before.revision,
    )
    // The kept index was dropped: the next commit builds it again from the first row.
    ok(await a.accept(TENANT_A, SESSION, 'input-2'))
    const { kept, whole } = await readBoth(a)
    expect(kept).toEqual(whole)
  })
})

describe('T-A3-3: the inputs are those of the scope', () => {
  it('a routed input outside the scope is not listed once the session has an admission, kept or not', async () => {
    const { port: db } = migratedPort()
    for (const [n, input] of [
      [1, 'in-1'],
      [2, 'in-2'],
      [3, 'in-3'],
    ] as const)
      insert(db, 'scope', n, 1, 'intake.routed', { input })
    db.execute(
      'INSERT INTO er_admission_idx (tenant, session, input, ordinal, execution, operation, accepted, grant_ref, attachment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['t', 'scope', 'in-3', 0n, 'e-9', 'op', '{}', '{}', 'a'],
    )
    tail(db, 'scope', 1)
    const args = [db as Port, 't', 'scope', snapshotOf('scope'), pending('in-1')] as const
    expect(inputsOf(answered(await wholeRead(...args)))).toEqual(['in-1'])
    expect(inputsOf(read(db, 'scope', pending('in-1')))).toEqual(['in-1'])
    // Kept now; a new routed row is folded and still listed only when in scope.
    insert(db, 'scope', 4, 2, 'intake.routed', { input: 'in-4' })
    tail(db, 'scope', 2)
    expect(inputsOf(read(db, 'scope', pending('in-1')))).toEqual(['in-1'])
    expect(inputsOf(read(db, 'scope', pending('in-4')))).toEqual(['in-4'])
    expect(read(db, 'scope', pending('in-4'))).toEqual(
      answered(await wholeRead(db as Port, 't', 'scope', snapshotOf('scope'), pending('in-4'))),
    )
  })
})

describe('T-A3-4: an SE15 row whose Run has no SE13 is left out, as a whole read leaves it out', () => {
  it('until the SE13 of its Run is folded in a later call', async () => {
    const { port: db } = migratedPort()
    insert(db, 'attempts', 1, 1, 'run.attempt-started', {
      run: 'r-1',
      attempt: 'a-1',
      ordinal: '1',
    })
    insert(db, 'attempts', 2, 1, 'run.attempt-started', {
      run: 'r-2',
      attempt: 'a-2',
      ordinal: '1',
    })
    tail(db, 'attempts', 1)
    const whole = async () =>
      answered(await wholeRead(db as Port, 't', 'attempts', snapshotOf('attempts'), pending()))
    expect(read(db, 'attempts').index.attempts).toEqual([])
    expect((await whole()).index.attempts).toEqual([])
    insert(db, 'attempts', 3, 2, 'run.started', { run: 'r-1', execution: 'e-1' })
    tail(db, 'attempts', 2)
    const kept = read(db, 'attempts')
    expect(kept.index.attempts.map(item => [item.run, item.attempt, item.execution])).toEqual([
      ['r-1', 'a-1', 'e-1'],
    ])
    expect(kept).toEqual(await whole())
  })
})

describe('what is kept', () => {
  it('rows of a revision past the journal tail (an open transaction) are read every time, never kept', () => {
    const { port: db } = migratedPort()
    insert(db, 'open', 1, 1, 'intake.routed', { input: 'in-1' })
    insert(db, 'open', 2, 1, 'intake.routed', { input: 'in-2' })
    expect(inputsOf(read(db, 'open'))).toEqual(['in-1', 'in-2'])
    // The transaction rolled back and another wrote a different row 1 under the same row 2.
    db.execute('UPDATE sl_entry SET entry = ? WHERE tenant = ? AND session = ? AND position = 1', [
      entryText(1, 1, 'intake.routed', { input: 'in-x' }),
      't',
      'open',
    ])
    expect(inputsOf(read(db, 'open'))).toEqual(['in-x', 'in-2'])
    // Committed now: the rows are kept, and a stored row is not read again (the log is append-only).
    tail(db, 'open', 1)
    expect(inputsOf(read(db, 'open'))).toEqual(['in-x', 'in-2'])
    db.execute('UPDATE sl_entry SET entry = ? WHERE tenant = ? AND session = ? AND position = 1', [
      entryText(1, 1, 'intake.routed', { input: 'in-y' }),
      't',
      'open',
    ])
    expect(inputsOf(read(db, 'open'))).toEqual(['in-x', 'in-2'])
  })

  it('rows of an open transaction folded over a kept index are folded into a copy: the kept index does not take them', () => {
    const { port: db } = migratedPort()
    insert(db, 'clone', 1, 1, 'intake.routed', { input: 'in-1' })
    tail(db, 'clone', 1)
    expect(inputsOf(read(db, 'clone'))).toEqual(['in-1'])
    // An open transaction past the kept cursor: rows 2 and 3 of revision 2, read over the kept index.
    insert(db, 'clone', 2, 2, 'intake.routed', { input: 'in-2' })
    insert(db, 'clone', 3, 2, 'intake.routed', { input: 'in-3' })
    expect(inputsOf(read(db, 'clone'))).toEqual(['in-1', 'in-2', 'in-3'])
    // It rolled back; another transaction committed a different row 2 and the same row 3.
    db.execute('DELETE FROM sl_entry WHERE tenant = ? AND session = ? AND position > 1', [
      't',
      'clone',
    ])
    insert(db, 'clone', 2, 2, 'intake.routed', { input: 'in-X' })
    insert(db, 'clone', 3, 2, 'intake.routed', { input: 'in-3' })
    tail(db, 'clone', 2)
    expect(inputsOf(read(db, 'clone'))).toEqual(['in-1', 'in-X', 'in-3'])
  })

  it('another log under the same tenant and session (another database of this module) is read whole', () => {
    const first = migratedPort().port
    insert(first, 'shared', 1, 1, 'intake.routed', { input: 'in-a' })
    insert(first, 'shared', 2, 1, 'intake.routed', { input: 'in-b' })
    tail(first, 'shared', 1)
    expect(inputsOf(read(first, 'shared'))).toEqual(['in-a', 'in-b'])
    const second = migratedPort().port
    insert(second, 'shared', 1, 1, 'intake.routed', { input: 'in-c' })
    tail(second, 'shared', 1)
    expect(inputsOf(read(second, 'shared'))).toEqual(['in-c'])
    const third = migratedPort().port
    insert(third, 'shared', 1, 1, 'intake.routed', { input: 'in-d' })
    insert(third, 'shared', 2, 1, 'intake.routed', { input: 'in-e' })
    insert(third, 'shared', 3, 1, 'intake.routed', { input: 'in-f' })
    tail(third, 'shared', 1)
    expect(inputsOf(read(third, 'shared'))).toEqual(['in-d', 'in-e', 'in-f'])
  })

  it('the row bound counts the kept rows: over it the answer is too-many, as a whole read', () => {
    const { port: db } = migratedPort()
    for (const n of [1, 2, 3]) insert(db, 'bound', n, 1, 'intake.routed', { input: `in-${n}` })
    tail(db, 'bound', 1)
    read(db, 'bound')
    const counted = counting(db as Port)
    expect(readHistory(counted.port, 't', 'bound', snapshotOf('bound'), pending(), 2)).toBe(
      'too-many',
    )
    expect(counted.indexed()).toBe(0)
    expect(readHistory(db as Port, 't', 'bound', snapshotOf('bound'), pending(), 3)).not.toBe(
      'too-many',
    )
  })

  it('at most 256 sessions are kept: the least recently used one is read whole again', () => {
    const { port: db } = migratedPort()
    const name = (n: number) => `lru-${String(n)}`
    for (let n = 0; n <= 256; n += 1) {
      insert(db, name(n), 1, 1, 'intake.routed', { input: 'in-1' })
      tail(db, name(n), 1)
      read(db, name(n))
    }
    const newest = counting(db as Port)
    read(newest.port, name(256))
    expect(newest.indexed()).toBe(0)
    const oldest = counting(db as Port)
    read(oldest.port, name(0))
    expect(oldest.indexed()).toBe(1)
  })
})
