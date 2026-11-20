import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  calendarCallContextSchema,
  calendarVersionIdSchema,
  instantSchema,
} from '@omne-harness/calendar-contract'
import {
  createCalendarSupplyApplication,
  type CalendarDispositionCommand,
} from '@omne-harness/calendar'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { openJointWorld, scope } from './joint-world.ts'
import { command, openWorld } from './world.ts'

const MARKER = 'marker-of-this-snapshot'
const systemContext = calendarCallContextSchema.parse({
  principalRef: 'system-maintainer',
  owner: { kind: 'system', systemScopeRef: scope },
  actor: { kind: 'system', actorRef: 'test-runner' },
  authContextRef: 'test-authority',
  requestId: 'r1',
  originatingSessionRef: null,
})

type Closable = Readonly<{ close(): Promise<void> }>
const open: Closable[] = []
async function world(root?: string, wrap?: Parameters<typeof openWorld>[1]) {
  const opened = await openWorld(root, wrap)
  open.push(opened)
  return opened
}
async function joint(root?: string, wrap?: Parameters<typeof openJointWorld>[1]) {
  const opened = await openJointWorld(root, wrap)
  open.push(opened)
  return opened
}

const notCommitted = {
  writerGenerationExcluded: true,
  oldTransactionTerminated: true,
  databaseRecoveryFinished: true,
  authoritativeReadSucceeded: true,
  operationNotQueued: true,
} as const

function bypassingReceipts() {
  const state = { bypass: false, calls: 0 }
  const wrap: Parameters<typeof openWorld>[1] = storage => ({
    ...storage,
    query(identity) {
      return state.bypass
        ? Promise.resolve({ kind: 'not_committed', identity, proofs: notCommitted })
        : storage.query(identity)
    },
    commit(input, options) {
      if (!state.bypass) return storage.commit(input, options)
      state.calls += 1
      const identity = {
        ...input.identity,
        operationKey: `${input.identity.operationKey}-${String(state.calls)}`,
      }
      return storage.commit({ ...input, identity }, options)
    },
  })
  return { state, wrap }
}
async function close(w: Closable) {
  open.splice(open.indexOf(w), 1)
  await w.close()
}
afterEach(async () => {
  for (const opened of open.splice(0)) await opened.close()
})

const file = (root: string) =>
  join(root, 'domains', `${Buffer.from('system.calendar').toString('hex')}.sqlite`)

function cellText(cell: unknown): string {
  if (!(cell instanceof Uint8Array)) return String(cell)
  try {
    return unpackText(cell)
  } catch {
    return Buffer.from(cell).toString('utf8')
  }
}

function cellsHolding(root: string, probe: string): string[] {
  const db = new DatabaseSync(file(root), { readOnly: true })
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
      .all()
      .map(row => String(row['name']))
    const found: string[] = []
    for (const table of tables)
      for (const row of db.prepare(`SELECT * FROM "${table}"`).all())
        for (const [column, cell] of Object.entries(row))
          if (cellText(cell).includes(probe)) found.push(`${table}.${column}`)
    return found
  } finally {
    db.close()
  }
}

function held(key: string): CalendarDispositionCommand {
  return { ...command('v2', 0, key), disposition: { kind: 'withheld' } }
}
const unpublished = (value: CalendarDispositionCommand) => {
  if (value.candidate.snapshot === null) throw new Error('fixture: the candidate has no snapshot')
  return value.candidate.snapshot
}
function marked(value: CalendarDispositionCommand, marker: string): CalendarDispositionCommand {
  const base = unpublished(value)
  const snapshot = {
    ...base,
    overrides: base.overrides.map(item => ({ ...item, notes: [marker] })),
  }
  return {
    ...value,
    candidate: { ...value.candidate, snapshot },
    disposition:
      value.disposition.kind === 'publish' ? { kind: 'publish', snapshot } : value.disposition,
  }
}
const instant = instantSchema.parse('2026-01-02T00:00:00.000Z')
const queryOf = (value: CalendarDispositionCommand) => ({
  address: value.address,
  expectedFingerprint: value.expectedFingerprint,
})

it('a snapshot held by a candidate, published, and carried by a supply run is stored once after the run completes, and every operation is still recognized', async () => {
  const receipts = bypassingReceipts()
  const w = await joint(undefined, receipts.wrap)
  const withheld = marked(held('held'), MARKER)
  const published = marked(command('v2', 0, 'published'), MARKER)
  const run = { command: published, preparedAt: instant }
  expect(await w.persistence.commitDisposition(withheld)).toMatchObject({
    kind: 'recorded',
    receipt: { disposition: 'withheld' },
  })
  expect(await w.journal.prepareRun(run)).toEqual({ kind: 'ok', value: run })
  const recorded = await w.persistence.commitDisposition(published)
  expect(recorded).toMatchObject({
    kind: 'recorded',
    receipt: { disposition: 'published', current: { versionId: 'v2', publicationGeneration: 1 } },
  })
  if (recorded.kind !== 'recorded') throw new Error('fixture: not recorded')
  expect(
    await w.journal.completeRun({
      ...queryOf(published),
      operationRef: recorded.receipt.operationRef,
      completedAt: instant,
      disposition: 'published',
    }),
  ).toEqual({ kind: 'ok', value: null })
  const completed = await w.journal.readRun(queryOf(published))
  expect(completed).toMatchObject({
    kind: 'ok',
    value: {
      state: 'completed',
      run: { command: { candidate: { reasons: published.candidate.reasons } } },
    },
  })
  expect(
    await w.journal.findRun({ systemScopeRef: scope, operationRef: recorded.receipt.operationRef }),
  ).toEqual(completed)
  expect(await w.persistence.commitDisposition(published)).toMatchObject({
    kind: 'recorded',
    replayed: true,
  })
  receipts.state.bypass = true
  expect(await w.persistence.commitDisposition(published)).toMatchObject({
    kind: 'recorded',
    receipt: { disposition: 'published', current: { versionId: 'v2', publicationGeneration: 1 } },
  })
  expect(await w.persistence.commitDisposition(withheld)).toMatchObject({
    kind: 'recorded',
    receipt: { disposition: 'withheld' },
  })
  expect(
    await w.persistence.commitDisposition({
      ...published,
      candidate: { ...published.candidate, reasons: ['another intent under the same key'] },
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'operationKeyConflict' })
  expect(receipts.state.calls).toBe(3)
  const root = w.root
  await close(w)
  expect(cellsHolding(root, MARKER)).toEqual(['ca_snapshots.snapshot'])
})

it('recovery after a reopen finishes a run cut after its disposition and a run cut before it; once finished, each snapshot is stored once', async () => {
  const first = await joint()
  const published = marked(command('v2', 0, 'published'), 'marker-of-the-published-run')
  const later = marked(
    { ...command('v3', 1, 'later'), disposition: { kind: 'withheld' } },
    'marker-of-the-later-run',
  )
  expect(await first.journal.prepareRun({ command: published, preparedAt: instant })).toMatchObject(
    { kind: 'ok' },
  )
  expect(await first.persistence.commitDisposition(published)).toMatchObject({ kind: 'recorded' })
  expect(await first.journal.prepareRun({ command: later, preparedAt: instant })).toMatchObject({
    kind: 'ok',
  })
  const root = first.root
  await close(first)
  expect(cellsHolding(root, 'marker-of-the-published-run')).toEqual([
    'ca_snapshots.snapshot',
    'ca_supply_runs.record',
  ])
  expect(cellsHolding(root, 'marker-of-the-later-run')).toEqual(['ca_supply_runs.record'])
  const w = await joint(root)
  const application = createCalendarSupplyApplication({
    repository: w.repository,
    persistence: w.persistence,
    journal: w.journal,
    materials: w.materials,
    authority: { check: async () => ({ kind: 'allowed', authorityGuardRefs: ['fixture-grant'] }) },
    sourceAdapters: [],
    independenceRegistry: [],
    clock: { now: () => instant },
  })
  expect(await application.recover(systemContext, { limit: 10 })).toMatchObject({
    kind: 'ok',
    value: [
      { kind: 'ok', value: { kind: 'recorded', receipt: { disposition: 'published' } } },
      { kind: 'ok', value: { kind: 'recorded', receipt: { disposition: 'withheld' } } },
    ],
  })
  expect(
    await w.journal.health({ systemScopeRef: scope, calendarId: published.address.calendarId }),
  ).toMatchObject({ kind: 'ok', value: { pendingRuns: [] } })
  expect(await w.journal.readRun(queryOf(later))).toMatchObject({
    kind: 'ok',
    value: { state: 'completed' },
  })
  await close(w)
  expect(cellsHolding(root, 'marker-of-the-published-run')).toEqual(['ca_snapshots.snapshot'])
  expect(cellsHolding(root, 'marker-of-the-later-run')).toEqual(['ca_snapshots.snapshot'])
})

it('the version, the candidate and the page of candidates read back the whole snapshot', async () => {
  const w = await world()
  const withheld = held('held')
  const published = command('v2', 0, 'published')
  const first = await w.persistence.commitDisposition(withheld)
  const second = await w.persistence.commitDisposition(published)
  if (first.kind !== 'recorded' || second.kind !== 'recorded')
    throw new Error('fixture: not recorded')
  const calendarId = published.address.calendarId
  const versionId = calendarVersionIdSchema.parse('v2')
  const snapshot = { ...unpublished(published), publicationGeneration: 1 }
  expect(await w.repository.getSnapshot({ calendarId, version: { kind: 'current' } })).toEqual({
    kind: 'ok',
    value: snapshot,
  })
  expect(
    await w.repository.getSnapshot({ calendarId, version: { kind: 'pinned', versionId } }),
  ).toEqual({ kind: 'ok', value: snapshot })
  const heldRecord = {
    candidateRef: first.receipt.candidateRef,
    command: withheld,
    receipt: first.receipt,
  }
  const publishedRecord = {
    candidateRef: second.receipt.candidateRef,
    command: published,
    receipt: second.receipt,
  }
  expect(await w.repository.getCandidate({ candidateRef: first.receipt.candidateRef })).toEqual({
    kind: 'ok',
    value: heldRecord,
  })
  expect(await w.repository.getCandidate({ calendarId, versionId })).toEqual({
    kind: 'ok',
    value: publishedRecord,
  })
  expect(await w.repository.listCandidates({ calendarId, after: null, limit: 10 })).toEqual({
    kind: 'ok',
    value: { items: [heldRecord, publishedRecord], nextCursor: null },
  })
})

it('a version or candidate whose snapshot is gone reads as unavailable, not as absent', async () => {
  const first = await world()
  const published = command('v2', 0, 'published')
  expect(await first.persistence.commitDisposition(published)).toMatchObject({ kind: 'recorded' })
  const root = first.root
  await close(first)
  const db = new DatabaseSync(file(root))
  db.exec('DELETE FROM ca_snapshots')
  db.close()
  const w = await world(root)
  const calendarId = published.address.calendarId
  const versionId = calendarVersionIdSchema.parse('v2')
  expect(
    await w.repository.getSnapshot({ calendarId, version: { kind: 'current' } }),
  ).toMatchObject({ kind: 'unavailable' })
  expect(
    await w.repository.getSnapshot({ calendarId, version: { kind: 'pinned', versionId } }),
  ).toMatchObject({ kind: 'unavailable' })
  expect(await w.repository.getCandidate({ calendarId, versionId })).toMatchObject({
    kind: 'unavailable',
  })
  expect(await w.repository.listCandidates({ calendarId, after: null, limit: 10 })).toMatchObject({
    kind: 'unavailable',
  })
})
