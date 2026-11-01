// The read pool (SQL contract SPEC 9.5, scenarios C12 read part and C15 read side): Worker
// crash, idle close, cancellation, timeouts, reply matching and migration.
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ReaderClient } from '../src/reader-client.ts'
import {
  buildReadMaterials,
  closeProviders,
  delay,
  readRequest,
  readyProvider,
  summary,
} from './read-support.ts'
import { DOMAIN, TENANT_A, leases, makeWorkspace, type Built, type Workspace } from './support.ts'

let workspace: Workspace
let built: Built

beforeEach(async () => {
  workspace = await makeWorkspace()
  built = await buildReadMaterials(workspace)
  leases.admitted.length = 0
})

afterEach(async () => {
  await closeProviders()
  await workspace.remove()
})

const one = { maxReadWorkersPerDomain: 1 }

describe('Worker exit and idle close', () => {
  it('reports worker_exited for a read in flight when the Worker dies, and the next read works', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 1)
    expect(summary(await storage.read(readRequest('crash')))).toBe('unavailable/worker_exited')
    expect(summary(await storage.read(readRequest('page')))).toBe('read')
    const readers = leases.admitted.filter(name => name.includes('/reader/'))
    expect(new Set(readers).size).toBe(2)
  })

  it('closes an idle reader after readerIdleMs and returns its lease only after the exit', async () => {
    const { storage } = await readyProvider(workspace, built, { readerIdleMs: 100 }, 1)
    const before = leases.released
    expect(summary(await storage.read(readRequest('page')))).toBe('read')
    expect(leases.released).toBe(before)
    await delay(600)
    expect(leases.released).toBe(before + 1)
    expect(summary(await storage.read(readRequest('page')))).toBe('read')
  })
})

describe('cancellation (C12)', () => {
  it('keeps the reservation of a cancelled running read until the Worker is done', async () => {
    const { storage } = await readyProvider(
      workspace,
      built,
      { ...one, readQueuePerDomain: 1, readQueueGlobal: 1 },
      0,
    )
    const abort = new AbortController()
    const running = storage.read(readRequest('slow', { ms: 400 }), { signal: abort.signal })
    await delay(100)
    abort.abort()
    expect((await running).kind).toBe('cancelled')
    expect(summary(await storage.read(readRequest('page')))).toBe('unavailable/queue_full')
    await delay(500)
    expect(summary(await storage.read(readRequest('page')))).toBe('read')
  })

  it('does not hand the connection of a cancelled running read to the next request', async () => {
    const { storage } = await readyProvider(workspace, built, one, 0)
    const abort = new AbortController()
    const running = storage.read(readRequest('slow', { ms: 400 }), { signal: abort.signal })
    await delay(100)
    const start = Date.now()
    abort.abort()
    await running
    const next = await storage.read(readRequest('page'))
    expect(next.kind).toBe('read')
    expect(Date.now() - start).toBeGreaterThanOrEqual(250)
  })

  it('takes a queued read out at once and returns its reservation', async () => {
    const { storage } = await readyProvider(
      workspace,
      built,
      { ...one, readQueuePerDomain: 2, readQueueGlobal: 2 },
      0,
    )
    const running = storage.read(readRequest('slow', { ms: 400 }))
    await delay(100)
    const abort = new AbortController()
    const queued = storage.read(readRequest('page'), { signal: abort.signal })
    await delay(30)
    const start = Date.now()
    abort.abort()
    expect((await queued).kind).toBe('cancelled')
    expect(Date.now() - start).toBeLessThan(150)
    const third = storage.read(readRequest('page'))
    expect((await Promise.all([third, running])).map(summary)).toEqual(['read', 'read'])
  })
})

describe('timeouts (SPEC 9.2 steps 9 and 10)', () => {
  it('ends observation at readObservationMs and does not reuse the connection before it is clean', async () => {
    const { storage } = await readyProvider(workspace, built, { ...one, readObservationMs: 100 }, 0)
    const start = Date.now()
    expect(summary(await storage.read(readRequest('slow', { ms: 500 })))).toBe(
      'unavailable/read_timeout',
    )
    expect(Date.now() - start).toBeLessThan(400)
    expect(summary(await storage.read(readRequest('page')))).toBe('read')
    expect(Date.now() - start).toBeGreaterThanOrEqual(450)
  })

  it('returns queue_timeout when no reader is free in time', async () => {
    const { storage } = await readyProvider(
      workspace,
      built,
      { ...one, readQueueTimeoutMs: 100 },
      0,
    )
    const running = storage.read(readRequest('slow', { ms: 500 }))
    await delay(50)
    expect(summary(await storage.read(readRequest('page')))).toBe('unavailable/queue_timeout')
    expect(summary(await running)).toBe('read')
  })
})

describe('reply matching (SPEC 9.5)', () => {
  it('accepts a reply only when generation, request number and token all match, once', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 0)
    await storage.read(readRequest('page'))
    const file = join(
      workspace.storageRoot,
      'domains',
      `${Buffer.from(DOMAIN).toString('hex')}.sqlite`,
    )
    const client = new ReaderClient(
      { file, domain: DOMAIN, lockWaitMs: 1000, generation: 7 },
      () => undefined,
    )
    const pending = client.call({ kind: 'open' }, 'tok')
    const stale = { kind: 'read_failed', diagnostic: 'late' } as const
    expect(client.receive({ generation: 6, seq: 1, token: 'tok', reply: stale })).toBe(false)
    expect(client.receive({ generation: 7, seq: 2, token: 'tok', reply: stale })).toBe(false)
    expect(client.receive({ generation: 7, seq: 1, token: 'other', reply: stale })).toBe(false)
    expect((await pending).kind).toBe('ready')
    expect(client.receive({ generation: 7, seq: 1, token: 'tok', reply: stale })).toBe(false)
    await client.close()
  })
})

describe('migration (SPEC 9.5, last item)', () => {
  it('waits for the read in flight, then closes the old connection before the migration', async () => {
    const full = await buildReadMaterials(workspace, {}, { journal: 'ok', declaredVersion: 'v1' })
    // The domain is created with v1, then v2 arrives with a new migration (the journal tables).
    const { storage } = await readyProvider(workspace, full, {}, 0)
    const events: string[] = []
    const reading = storage.read(readRequest('slow', { ms: 500 })).then(result => {
      events.push('read')
      return result
    })
    await delay(150)
    const before = leases.released
    const registering = storage
      .registerCombination({
        scope: TENANT_A,
        transactionDomain: DOMAIN,
        combinationVersion: 'v2',
        manifestDigest: full.digest(['auditor', 'journal', 'ledger']),
        participants: ['auditor', 'journal', 'ledger'],
      })
      .then(result => {
        events.push('register')
        return result
      })
    expect((await reading).kind).toBe('read')
    expect((await registering).kind).toBe('registered')
    expect(events).toEqual(['read', 'register'])
    expect(leases.released).toBeGreaterThan(before)
    expect(summary(await storage.read(readRequest('page')))).toBe('read')
    const readers = leases.admitted.filter(name => name.includes('/reader/'))
    expect(new Set(readers).size).toBe(2)
  })
})
