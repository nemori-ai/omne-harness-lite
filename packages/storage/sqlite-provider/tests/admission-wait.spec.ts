import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SqlIdentity } from '@omne-harness/sql-contract'
import { advance, atLimit, openGates, stillPending, tick } from './gate.ts'
import {
  command,
  commitRequest,
  createProvider,
  heldCommit,
  identity,
  kindOf,
  makeWorkspace,
  registration,
  TENANT_A,
  type Built,
  type HeldCommit,
  type Provider,
  type Workspace,
} from './support.ts'
import { buildReadMaterials, heldRead, readRequest, summary } from './read-support.ts'

let workspace: Workspace
let built: Built
const providers: Provider[] = []

beforeEach(async () => {
  workspace = await makeWorkspace()
  built = await buildReadMaterials(workspace)
})

afterEach(async () => {
  openGates()
  for (const provider of providers.splice(0))
    await provider.control.close({ initiator: 'disposal' }).catch(() => undefined)
  await workspace.remove()
})

async function ready(config = {}): Promise<Provider> {
  const provider = await createProvider(workspace, built, config)
  providers.push(provider)
  const result = await provider.storage.registerCombination(registration(built))
  if (result.kind !== 'registered') throw new Error(`registration is ${result.kind}`)
  return provider
}

const keyOf = (key: string): SqlIdentity => identity({ operationKey: key })
const plain = (key: string) =>
  commitRequest(built, { identity: keyOf(key), commands: [command('ledger', { note: key })] })
const holding = (storage: Provider['storage']): Promise<HeldCommit> =>
  heldCommit(storage, workspace, built, 'hold')

const ONE_WRITE = { admissionQueueLimit: 1, globalAdmissionLimit: 1, groupMaxOperations: 1 }

describe('commit: the write reservations are full', () => {
  it('waits, and commits once the holder ends', async () => {
    const { storage } = await ready({ ...ONE_WRITE, admissionWaitMs: 10_000 })
    const holder = await holding(storage)
    const waiter = storage.commit(plain('wait'))
    await stillPending(waiter)
    holder.gate.open()
    expect(kindOf(await waiter)).toBe('committed')
    expect(kindOf(await holder.result)).toBe('committed')
  })

  it('past admissionWaitMs it is refused queue_full, and nothing was sent', async () => {
    const { storage } = await ready({ ...ONE_WRITE, admissionWaitMs: 100 })
    const holder = await holding(storage)
    const waiter = storage.commit(plain('wait'))
    expect(kindOf(await atLimit(waiter, 100))).toBe('rejected_before_accept/queue_full')
    holder.gate.open()
    await holder.result
    expect((await storage.query(keyOf('wait'))).kind).toBe('not_committed')
  })

  it('an abort while it waits answers cancelled, and nothing was sent', async () => {
    const { storage } = await ready({ ...ONE_WRITE, admissionWaitMs: 10_000 })
    const holder = await holding(storage)
    const abort = new AbortController()
    const waiting = storage.commit(plain('wait'), { signal: abort.signal })
    abort.abort()
    expect(kindOf(await waiting)).toBe('rejected_before_accept/cancelled')
    holder.gate.open()
    await holder.result
    expect((await storage.query(keyOf('wait'))).kind).toBe('not_committed')
  })

  it('while it waits, a query of its identity answers unknown (the pending index)', async () => {
    const { storage } = await ready({ ...ONE_WRITE, admissionWaitMs: 10_000 })
    const holder = await holding(storage)
    const waiting = storage.commit(plain('wait'))
    const asked = storage.query(keyOf('wait'))
    await tick()
    holder.gate.open()
    expect((await asked).kind).toBe('unknown')
    expect(kindOf(await waiting)).toBe('committed')
    await holder.result
  })

  it('the waiting list is bounded: one more is refused at once while the first waits', async () => {
    const { storage } = await ready({ ...ONE_WRITE, admissionWaitMs: 10_000 })
    const holder = await holding(storage)
    const first = storage.commit(plain('first'))
    const second = await storage.commit(plain('second'))
    expect(kindOf(second)).toBe('rejected_before_accept/queue_full')
    holder.gate.open()
    expect(kindOf(await first)).toBe('committed')
    await holder.result
  })

  it('an abort between the grant and the send settles unknown with observer_detached', async () => {
    const { storage } = await ready({ ...ONE_WRITE, admissionWaitMs: 10_000 })
    const holder = await holding(storage)
    let aborted = false
    const signal = {
      get aborted() {
        return aborted
      },
      addEventListener: () => undefined,
      removeEventListener: () => void (aborted = true),
    } as unknown as AbortSignal
    const waiting = storage.commit(plain('wait'), { signal })
    holder.gate.open()
    expect(await waiting).toMatchObject({ kind: 'unknown', diagnostic: 'observer_detached' })
    await holder.result
  })

  it('a close while it waits answers closing', async () => {
    const provider = await ready({ ...ONE_WRITE, admissionWaitMs: 10_000 })
    const holder = await holding(provider.storage)
    const waiting = provider.storage.commit(plain('wait'))
    const closed = provider.control.close({ initiator: 'disposal' })
    expect(kindOf(await waiting)).toBe('rejected_before_accept/closing')
    holder.gate.open()
    await holder.result
    await closed
  })
})

describe('query and registration: their queues are full', () => {
  it('a query that waits for a place is answered closing when the close starts', async () => {
    const provider = await ready({
      queryQueuePerDomain: 1,
      queryQueueGlobal: 1,
      admissionWaitMs: 10_000,
    })
    const holder = await holding(provider.storage)
    const first = provider.storage.query(keyOf('q1'))
    const second = provider.storage.query(keyOf('q2'))
    const closed = provider.control.close({ initiator: 'disposal' })
    expect(await second).toMatchObject({ kind: 'unknown', diagnostic: 'closing' })
    holder.gate.open()
    await Promise.allSettled([first, holder.result, closed])
  })

  it('a registration that waits for a place is answered closing when the close starts', async () => {
    const provider = await ready({
      controlQueuePerDomain: 1,
      controlQueueGlobal: 1,
      admissionWaitMs: 10_000,
    })
    const holder = await holding(provider.storage)
    const first = provider.storage.registerCombination(registration(built))
    const second = provider.storage.registerCombination(registration(built))
    const closed = provider.control.close({ initiator: 'disposal' })
    expect(kindOf(await second)).toBe('rejected_before_accept/closing')
    holder.gate.open()
    await Promise.allSettled([first, holder.result, closed])
  })

  it('a query waits for a place behind a query the busy Worker holds', async () => {
    const { storage } = await ready({
      queryQueuePerDomain: 1,
      queryQueueGlobal: 1,
      admissionWaitMs: 10_000,
    })
    const holder = await holding(storage)
    const first = storage.query(keyOf('q1'))
    const second = storage.query(keyOf('q2'))
    await stillPending(second)
    holder.gate.open()
    expect((await second).kind).toBe('not_committed')
    expect((await first).kind).toBe('not_committed')
    await holder.result
  })

  it('a registration waits for a place behind a registration the busy Worker holds', async () => {
    const { storage } = await ready({
      controlQueuePerDomain: 1,
      controlQueueGlobal: 1,
      admissionWaitMs: 10_000,
    })
    const holder = await holding(storage)
    const first = storage.registerCombination(registration(built))
    const second = storage.registerCombination(registration(built))
    await stillPending(second)
    holder.gate.open()
    expect(kindOf(await second)).toBe('registered')
    expect(kindOf(await first)).toBe('registered')
    await holder.result
  })
})

describe('read: the read queue is full', () => {
  const ONE_READ = { readQueuePerDomain: 1, readQueueGlobal: 1 }
  const otherDomain = { scope: TENANT_A, transactionDomain: 'domain-b' }

  it('waits, and reads once the holder ends', async () => {
    const { storage } = await ready({ ...ONE_READ, readQueueTimeoutMs: 10_000 })
    const holder = await heldRead(storage, workspace)
    const waiting = storage.read(readRequest('page'))
    await stillPending(waiting)
    holder.gate.open()
    expect(summary(await waiting)).toBe('read')
    expect(summary(await holder.result)).toBe('read')
  })

  it('an abort while it waits answers cancelled', async () => {
    const { storage } = await ready({ ...ONE_READ, readQueueTimeoutMs: 10_000 })
    const holder = await heldRead(storage, workspace)
    const abort = new AbortController()
    const waiting = storage.read(readRequest('page'), { signal: abort.signal })
    abort.abort()
    expect((await waiting).kind).toBe('cancelled')
    holder.gate.open()
    expect(summary(await holder.result)).toBe('read')
  })

  it('a close while it waits answers closing at once, not when the running read ends', async () => {
    const provider = await ready({ ...ONE_READ, readQueueTimeoutMs: 10_000 })
    const holder = await heldRead(provider.storage, workspace)
    const waiting = provider.storage.read(readRequest('page'))
    const closed = provider.control.close({ initiator: 'disposal' })
    expect(summary(await waiting)).toBe('unavailable/closing')
    holder.gate.open()
    await Promise.allSettled([holder.result, closed])
  })

  it('holds at most readQueueGlobal reads in all: a read of another domain waits for one to end', async () => {
    const { storage } = await ready({ ...ONE_READ, readQueueTimeoutMs: 10_000 })
    const other = await storage.registerCombination(
      registration(built, { transactionDomain: 'domain-b' }),
    )
    expect(kindOf(other)).toBe('registered')
    const holder = await heldRead(storage, workspace)
    const next = storage.read({ ...readRequest('page'), domain: otherDomain })
    await stillPending(next)
    holder.gate.open()
    expect(summary(await next)).toBe('read')
    expect(summary(await holder.result)).toBe('read')
  })

  it('a read that only its own domain blocks does not hold up a read of another domain', async () => {
    const { storage } = await ready({
      readQueuePerDomain: 1,
      readQueueGlobal: 2,
      readQueueTimeoutMs: 10_000,
    })
    const other = await storage.registerCombination(
      registration(built, { transactionDomain: 'domain-b' }),
    )
    expect(kindOf(other)).toBe('registered')
    const holder = await heldRead(storage, workspace)
    const blocked = storage.read(readRequest('page'))
    expect(summary(await storage.read({ ...readRequest('page'), domain: otherDomain }))).toBe(
      'read',
    )
    holder.gate.open()
    expect([summary(await holder.result), summary(await blocked)]).toEqual(['read', 'read'])
  })

  it('the deadline runs from the call: the wait for a reservation and the wait in the queue add up', async () => {
    const { storage } = await ready({
      ...ONE_READ,
      maxReadWorkersPerDomain: 2,
      readQueueTimeoutMs: 500,
    })
    const holder = await heldRead(storage, workspace)
    const write = await heldCommit(storage, workspace, built, 'long')
    const serial = storage.read(readRequest('serial'))
    advance(400)
    holder.gate.open()
    expect(summary(await holder.result)).toBe('read')
    await tick()
    expect(summary(await atLimit(serial, 100))).toBe('unavailable/queue_timeout')
    write.gate.open()
    await write.result
  })

  it('the wait counts towards readQueueTimeoutMs: past it the read is queue_timeout', async () => {
    const { storage } = await ready({ ...ONE_READ, readQueueTimeoutMs: 200 })
    const holder = await heldRead(storage, workspace)
    const waiting = storage.read(readRequest('page'))
    advance(200)
    expect(summary(await waiting)).toBe('unavailable/queue_timeout')
    holder.gate.open()
    expect(summary(await holder.result)).toBe('read')
  })
})
