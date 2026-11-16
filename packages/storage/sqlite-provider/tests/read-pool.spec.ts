import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ReaderClient } from '../src/reader-client.ts'
import { advance, atLimit, chance, stillPending, until } from './gate.ts'
import {
  buildReadMaterials,
  closeProviders,
  heldRead,
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

const readerLeases = (): string[] => leases.admitted.filter(name => name.includes('/reader/'))

describe('Worker exit and idle close', () => {
  it('reports worker_exited for a read in flight when the Worker dies, and the next read works', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 1)
    expect(summary(await storage.read(readRequest('crash')))).toBe('unavailable/worker_exited')
    expect(summary(await storage.read(readRequest('page')))).toBe('read')
    expect(new Set(readerLeases()).size).toBe(2)
  })

  it('closes an idle reader after readerIdleMs and returns its lease only after the exit', async () => {
    const { storage } = await readyProvider(workspace, built, { readerIdleMs: 100 }, 1)
    const before = leases.released
    expect(summary(await storage.read(readRequest('page')))).toBe('read')
    advance(99)
    await chance()
    expect(leases.released).toBe(before)
    advance(1)
    await until(() => leases.released === before + 1)
    expect(summary(await storage.read(readRequest('page')))).toBe('read')
    expect(new Set(readerLeases()).size).toBe(2)
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
    const running = await heldRead(storage, workspace, 'held', { signal: abort.signal })
    abort.abort()
    expect((await running.result).kind).toBe('cancelled')
    const waiting = storage.read(readRequest('page'))
    expect(summary(await storage.read(readRequest('page')))).toBe('unavailable/queue_full')
    running.gate.open()
    expect(summary(await waiting)).toBe('read')
    expect(summary(await storage.read(readRequest('page')))).toBe('read')
  })

  it('does not hand the connection of a cancelled running read to the next request', async () => {
    const { storage } = await readyProvider(workspace, built, one, 0)
    const abort = new AbortController()
    const running = await heldRead(storage, workspace, 'held', { signal: abort.signal })
    abort.abort()
    await running.result
    const next = storage.read(readRequest('page'))
    await stillPending(next)
    running.gate.open()
    expect((await next).kind).toBe('read')
    expect(readerLeases()).toHaveLength(1)
  })

  it('takes a queued read out at once and returns its reservation', async () => {
    const { storage } = await readyProvider(
      workspace,
      built,
      { ...one, readQueuePerDomain: 2, readQueueGlobal: 2 },
      0,
    )
    const running = await heldRead(storage, workspace)
    const abort = new AbortController()
    const queued = storage.read(readRequest('page'), { signal: abort.signal })
    abort.abort()
    expect((await queued).kind).toBe('cancelled')
    const third = storage.read(readRequest('page'))
    running.gate.open()
    expect((await Promise.all([third, running.result])).map(summary)).toEqual(['read', 'read'])
  })
})

describe('timeouts (SPEC 9.2 steps 9 and 10)', () => {
  it('ends observation at readObservationMs and does not reuse the connection before it is clean', async () => {
    const { storage } = await readyProvider(workspace, built, { ...one, readObservationMs: 100 }, 0)
    const running = await heldRead(storage, workspace)
    expect(summary(await atLimit(running.result, 100))).toBe('unavailable/read_timeout')
    const next = storage.read(readRequest('page'))
    await stillPending(next)
    running.gate.open()
    expect(summary(await next)).toBe('read')
    expect(readerLeases()).toHaveLength(1)
  })

  it('returns queue_timeout when no reader is free in time', async () => {
    const { storage } = await readyProvider(
      workspace,
      built,
      { ...one, readQueueTimeoutMs: 100 },
      0,
    )
    const running = await heldRead(storage, workspace)
    const waiting = storage.read(readRequest('page'))
    expect(summary(await atLimit(waiting, 100))).toBe('unavailable/queue_timeout')
    running.gate.open()
    expect(summary(await running.result)).toBe('read')
  })
})

describe('result byte budget (SPEC 9.2 step 6)', () => {
  it('admits as many reads as the global budget holds; the next waits until one ends, then reads', async () => {
    const { storage } = await readyProvider(
      workspace,
      built,
      { maxReadResultBytes: 4096, globalReadResultBytes: 8192, maxReadWorkersPerDomain: 3 },
      0,
    )
    const first = await heldRead(storage, workspace)
    const second = await heldRead(storage, workspace)
    const third = storage.read(readRequest('page'))
    await stillPending(third)
    first.gate.open()
    expect(summary(await third)).toBe('read')
    second.gate.open()
    expect([summary(await first.result), summary(await second.result)]).toEqual(['read', 'read'])
    expect(readerLeases()).toHaveLength(2)
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
    const { storage } = await readyProvider(workspace, full, {}, 0)
    const events: string[] = []
    const running = await heldRead(storage, workspace)
    const reading = running.result.then(result => {
      events.push('read')
      return result
    })
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
    await chance()
    expect(events).toEqual([])
    running.gate.open()
    expect((await reading).kind).toBe('read')
    expect((await registering).kind).toBe('registered')
    expect(events).toEqual(['read', 'register'])
    expect(leases.released).toBeGreaterThan(before)
    expect(summary(await storage.read(readRequest('page')))).toBe('read')
    expect(new Set(readerLeases()).size).toBe(2)
  })
})
