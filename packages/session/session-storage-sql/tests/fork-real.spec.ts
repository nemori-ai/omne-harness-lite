// @module-tag slow
import { statSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import type { ForkPoint, SessionCommand } from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  creation,
  initializationFixtureFacts,
  initializationFixtureGuard,
  operationId,
  sessionId,
} from '@omne-harness/session-contract/testing'
import { childOf, messageText } from './fixtures/forked.ts'
import { openRealApp, TENANT_A, textOf, type RealApp } from './fixtures/real-provider.ts'

// The fork on the real provider: a database file, its write-ahead log and the worker threads. What
// is written and read is counted in rows and pages; the times are printed, never asserted.

const apps: RealApp[] = []
afterEach(async () => {
  for (const app of apps.splice(0)) await app.dispose()
})

const T = textOf(TENANT_A)
const fileOf = (a: RealApp) => a.domainFile(a.domainOf(TENANT_A))

function onFile<R>(a: RealApp, use: (db: DatabaseSync) => R): R {
  const db = new DatabaseSync(fileOf(a))
  try {
    return use(db)
  } finally {
    db.close()
  }
}

/** The rows of every table of the session log, and the rows of the view under each session. */
function rowsOf(a: RealApp) {
  return onFile(a, db => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name LIKE 'sl\\_%' ESCAPE '\\'",
      )
      .all() as { name: string }[]
    const count = (sql: string) => Number((db.prepare(sql).get() as { n: number }).n)
    const total = tables.reduce(
      (sum, { name }) => sum + count(`SELECT COUNT(*) AS n FROM ${name}`),
      0,
    )
    const view = db
      .prepare('SELECT session, COUNT(*) AS n FROM sl_model_view GROUP BY session')
      .all() as { session: string; n: number }[]
    return { total, view: Object.fromEntries(view.map(row => [row.session, Number(row.n)])) }
  })
}

/** The bytes of the database once its write-ahead log is folded in: it grows by whole pages. */
function fileBytes(a: RealApp): number {
  onFile(a, db => db.exec('PRAGMA wal_checkpoint(TRUNCATE)'))
  return statSync(fileOf(a)).size
}

/** Gives the source `count` rows of its view, each with an entry, as its own commits would have. */
function seed(a: RealApp, count: number): void {
  onFile(a, db => {
    const from = Number(
      (
        db.prepare("SELECT MAX(position) AS p FROM sl_entry WHERE session = 'session-1'").get() as {
          p: number
        }
      ).p,
    )
    const entry = db.prepare(
      "INSERT INTO sl_entry (tenant, session, position, revision, kind, entry, bytes) VALUES (?, 'session-1', ?, 1, 'message.user', x'00', 1)",
    )
    const row = db.prepare(
      "INSERT INTO sl_model_view (tenant, session, epoch, seq, entry, bytes, prefix_digest, message) VALUES (?, 'session-1', 'epoch:0', ?, ?, 60, ?, ?)",
    )
    db.exec('BEGIN')
    for (let index = 1; index <= count; index += 1) {
      entry.run(T, from + index)
      row.run(
        T,
        index,
        String(from + index),
        `digest-${String(index)}`,
        messageText('user', `row ${String(index)}`),
      )
    }
    db.exec('COMMIT')
  })
}

async function viewOf(a: RealApp, session: string) {
  let after: string | null = null
  let basis = null
  let rows = 0
  let last = ''
  for (;;) {
    const page = await a.port.history.readModelView({
      ...a.access(TENANT_A, session),
      basis,
      after,
      pageBytes: 10_000_000,
    })
    if (!('ok' in page) || page.ok.kind !== 'page') throw new Error(JSON.stringify(page))
    rows += page.ok.rows.length
    last = page.ok.rows.at(-1)?.prefixDigest ?? last
    basis = page.ok.basis
    after = page.ok.next
    if (after === null) return { rows, last, basis: page.ok.basis }
  }
}

function fork(a: RealApp, session: string, point: ForkPoint) {
  const command: SessionCommand = {
    kind: 'create',
    input: {
      tenant: TENANT_A,
      session: sessionId(session),
      operation: operationId(`create-${session}`),
      creation: creation(childOf('session-1', point)),
    },
  }
  const fixture = initializationFixtureFacts(command, null, adoptedInitializationFixture(command))
  const guards = [initializationFixtureGuard(fixture)]
  return a.port.commit({ access: a.access(TENANT_A, session), command, guards })
}

const timed = async <R>(run: () => Promise<R>): Promise<{ value: R; ms: number }> => {
  const began = performance.now()
  const value = await run()
  return { value, ms: Math.round((performance.now() - began) * 10) / 10 }
}

async function measured(prefix: number) {
  const a = await openRealApp()
  apps.push(a)
  expect(await a.create(TENANT_A)).toHaveProperty('ok')
  seed(a, prefix)
  await viewOf(a, 'session-1')
  const source = await timed(() => viewOf(a, 'session-1'))
  const tail = onFile(a, db =>
    String(
      (
        db.prepare("SELECT MAX(position) AS p FROM sl_entry WHERE session = 'session-1'").get() as {
          p: number
        }
      ).p,
    ),
  )
  const point = { ...source.value.basis, position: tail }
  const before = { rows: rowsOf(a), bytes: fileBytes(a) }
  const created = await timed(() => fork(a, 'child-1', point))
  expect(created.value).toHaveProperty('ok')
  const after = { rows: rowsOf(a), bytes: fileBytes(a) }
  await viewOf(a, 'child-1')
  const child = await timed(() => viewOf(a, 'child-1'))
  expect(child.value.rows).toBe(prefix)
  expect(child.value.last).toBe(source.value.last)
  expect(after.rows.view['child-1'] ?? 0).toBe(0)
  expect(after.rows.view['session-1']).toBe(prefix)
  return {
    a,
    point,
    prefix,
    rowsWritten: after.rows.total - before.rows.total,
    bytesGrown: after.bytes - before.bytes,
    forkMs: created.ms,
    readForkedMs: child.ms,
    readSourceMs: source.ms,
  }
}

it(
  'writes the same rows for a fork whatever the length of its prefix, and reads the prefix where it stands',
  { tags: ['slow'], timeout: 240_000 },
  async () => {
    const small = await measured(100)
    const large = await measured(10_000)
    expect(large.rowsWritten).toBe(small.rowsWritten)
    // A copy of the 9900 more rows would be some hundred pages; the same rows differ by a few.
    expect(Math.abs(large.bytesGrown - small.bytesGrown)).toBeLessThanOrEqual(16 * 4096)

    const { a, point } = large
    const before = { rows: rowsOf(a), size: fileBytes(a) }
    const many = await timed(async () => {
      for (let index = 2; index <= 101; index += 1)
        expect(await fork(a, `child-${String(index)}`, point)).toHaveProperty('ok')
    })
    const after = { rows: rowsOf(a), size: fileBytes(a) }
    expect(after.rows.view['session-1']).toBe(10_000)
    expect(Object.keys(after.rows.view)).toEqual(['session-1'])
    // Later forks write no more rows than the first: the parent keeps its children in rows it updates.
    const written = after.rows.total - before.rows.total
    expect(written).toBeLessThanOrEqual(100 * large.rowsWritten)
    expect(written).toBeGreaterThan(0)
    const numbers = {
      rowsWrittenPerFork: { prefix100: small.rowsWritten, prefix10000: large.rowsWritten },
      fileBytesGrownByOneFork: { prefix100: small.bytesGrown, prefix10000: large.bytesGrown },
      forkMs: { prefix100: small.forkMs, prefix10000: large.forkMs },
      readWholeViewMs: {
        prefix100: { forked: small.readForkedMs, source: small.readSourceMs },
        prefix10000: { forked: large.readForkedMs, source: large.readSourceMs },
      },
      hundredForks: {
        ms: many.ms,
        sourceViewRows: after.rows.view['session-1'],
        rowsWritten: written,
        bytesPerFork: Math.round((after.size - before.size) / 100),
      },
    }
    console.log(`FORK-NUMBERS ${JSON.stringify(numbers)}`)
  },
)
