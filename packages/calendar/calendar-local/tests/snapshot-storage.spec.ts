import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import canonicalize from 'canonicalize'
import { afterEach, expect, it } from 'vitest'
import { calendarVersionIdSchema } from '@omne-harness/calendar-contract'
import type { CalendarDispositionCommand } from '@omne-harness/calendar'
import { unpackText } from '@omne-harness/sql-contract/worker'
import { command, openWorld } from './world.ts'

type World = Awaited<ReturnType<typeof openWorld>>
const open: World[] = []
async function world(root?: string, wrap?: Parameters<typeof openWorld>[1]) {
  const opened = await openWorld(root, wrap)
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
async function close(w: World) {
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
function probeOf(value: CalendarDispositionCommand): string {
  const text = canonicalize(unpublished(value))
  if (text === undefined) throw new Error('fixture: the snapshot is not JSON')
  return text.slice(text.indexOf('"knowledgeAsOf"'), text.indexOf(',"synthesizedAt"'))
}

it('a snapshot held by a candidate and then published is stored once, and the candidate operation is still recognized', async () => {
  const receipts = bypassingReceipts()
  const w = await world(undefined, receipts.wrap)
  const withheld = held('held')
  const published = command('v2', 0, 'published')
  expect(await w.persistence.commitDisposition(withheld)).toMatchObject({
    kind: 'recorded',
    receipt: { disposition: 'withheld' },
  })
  expect(await w.persistence.commitDisposition(published)).toMatchObject({
    kind: 'recorded',
    receipt: { disposition: 'published', current: { versionId: 'v2', publicationGeneration: 1 } },
  })
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
  expect(probeOf(published)).toContain('"overrides":[{')
  expect(cellsHolding(root, probeOf(published))).toEqual(['ca_snapshots.snapshot'])
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
