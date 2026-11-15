import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SqlIdentity } from '@omne-harness/sql-contract'
import {
  command,
  commitRequest,
  createProvider,
  identity,
  kindOf,
  makeWorkspace,
  registration,
  TENANT_A,
  type Built,
  type Provider,
  type Workspace,
} from './support.ts'
import { buildReadMaterials, readRequest, summary } from './read-support.ts'

let workspace: Workspace
let built: Built
const providers: Provider[] = []

beforeEach(async () => {
  workspace = await makeWorkspace()
  built = await buildReadMaterials(workspace)
})

afterEach(async () => {
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
const spinning = (key: string, ms: number) =>
  commitRequest(built, {
    identity: keyOf(key),
    commands: [command('ledger', { mode: 'spin', ms: String(ms), note: key })],
  })
const plain = (key: string) =>
  commitRequest(built, { identity: keyOf(key), commands: [command('ledger', { note: key })] })
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const ONE_WRITE = { admissionQueueLimit: 1, globalAdmissionLimit: 1, groupMaxOperations: 1 }

describe('commit: the write reservations are full', () => {
  it('waits, and commits once the holder ends', async () => {
    const { storage } = await ready({ ...ONE_WRITE, admissionWaitMs: 10_000 })
    const holder = storage.commit(spinning('hold', 300))
    const waiter = await storage.commit(plain('wait'))
    expect(kindOf(waiter)).toBe('committed')
    expect(kindOf(await holder)).toBe('committed')
  })

  it('past admissionWaitMs it is refused queue_full, and nothing was sent', async () => {
    const { storage } = await ready({ ...ONE_WRITE, admissionWaitMs: 100 })
    const holder = storage.commit(spinning('hold', 1500))
    const start = performance.now()
    const waiter = await storage.commit(plain('wait'))
    expect(kindOf(waiter)).toBe('rejected_before_accept/queue_full')
    expect(performance.now() - start).toBeGreaterThanOrEqual(95)
    await holder
    expect((await storage.query(keyOf('wait'))).kind).toBe('not_committed')
  })

  it('an abort while it waits answers cancelled, and nothing was sent', async () => {
    const { storage } = await ready({ ...ONE_WRITE, admissionWaitMs: 10_000 })
    const holder = storage.commit(spinning('hold', 800))
    const abort = new AbortController()
    const waiting = storage.commit(plain('wait'), { signal: abort.signal })
    await sleep(50)
    abort.abort()
    expect(kindOf(await waiting)).toBe('rejected_before_accept/cancelled')
    await holder
    expect((await storage.query(keyOf('wait'))).kind).toBe('not_committed')
  })

  it('while it waits, a query of its identity answers unknown (the pending index)', async () => {
    const { storage } = await ready({ ...ONE_WRITE, admissionWaitMs: 10_000 })
    const holder = storage.commit(spinning('hold', 800))
    const waiting = storage.commit(plain('wait'))
    await sleep(50)
    expect((await storage.query(keyOf('wait'))).kind).toBe('unknown')
    expect(kindOf(await waiting)).toBe('committed')
    await holder
  })

  it('the waiting list is bounded: one more is refused at once while the first waits', async () => {
    const { storage } = await ready({ ...ONE_WRITE, admissionWaitMs: 10_000 })
    let holderDone = false
    const holder = storage.commit(spinning('hold', 2000)).then(result => {
      holderDone = true
      return result
    })
    const first = storage.commit(plain('first'))
    await sleep(50)
    const second = await storage.commit(plain('second'))
    expect(kindOf(second)).toBe('rejected_before_accept/queue_full')
    expect(holderDone).toBe(false)
    expect(kindOf(await first)).toBe('committed')
    await holder
  })

  it('an abort between the grant and the send settles unknown with observer_detached', async () => {
    const { storage } = await ready({ ...ONE_WRITE, admissionWaitMs: 10_000 })
    const holder = storage.commit(spinning('hold', 300))
    let aborted = false
    const signal = {
      get aborted() {
        return aborted
      },
      addEventListener: () => undefined,
      removeEventListener: () => void (aborted = true),
    } as unknown as AbortSignal
    const waiter = await storage.commit(plain('wait'), { signal })
    expect(waiter).toMatchObject({ kind: 'unknown', diagnostic: 'observer_detached' })
    await holder
  })

  it('a close while it waits answers closing', async () => {
    const provider = await ready({ ...ONE_WRITE, admissionWaitMs: 10_000 })
    const holder = provider.storage.commit(spinning('hold', 800))
    const waiting = provider.storage.commit(plain('wait'))
    await sleep(50)
    const closed = provider.control.close({ initiator: 'disposal' })
    expect(kindOf(await waiting)).toBe('rejected_before_accept/closing')
    await holder
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
    const holder = provider.storage.commit(spinning('hold', 600))
    await sleep(50)
    const first = provider.storage.query(keyOf('q1'))
    const second = provider.storage.query(keyOf('q2'))
    await sleep(50)
    const closed = provider.control.close({ initiator: 'disposal' })
    expect(await second).toMatchObject({ kind: 'unknown', diagnostic: 'closing' })
    await Promise.allSettled([first, holder, closed])
  })

  it('a registration that waits for a place is answered closing when the close starts', async () => {
    const provider = await ready({
      controlQueuePerDomain: 1,
      controlQueueGlobal: 1,
      admissionWaitMs: 10_000,
    })
    const holder = provider.storage.commit(spinning('hold', 600))
    await sleep(50)
    const first = provider.storage.registerCombination(registration(built))
    const second = provider.storage.registerCombination(registration(built))
    await sleep(50)
    const closed = provider.control.close({ initiator: 'disposal' })
    expect(kindOf(await second)).toBe('rejected_before_accept/closing')
    await Promise.allSettled([first, holder, closed])
  })

  it('a query waits for a place behind a query the busy Worker holds', async () => {
    const { storage } = await ready({
      queryQueuePerDomain: 1,
      queryQueueGlobal: 1,
      admissionWaitMs: 10_000,
    })
    const holder = storage.commit(spinning('hold', 400))
    await sleep(50)
    const first = storage.query(keyOf('q1'))
    const second = await storage.query(keyOf('q2'))
    expect(second.kind).toBe('not_committed')
    expect((await first).kind).toBe('not_committed')
    await holder
  })

  it('a registration waits for a place behind a registration the busy Worker holds', async () => {
    const { storage } = await ready({
      controlQueuePerDomain: 1,
      controlQueueGlobal: 1,
      admissionWaitMs: 10_000,
    })
    const holder = storage.commit(spinning('hold', 400))
    await sleep(50)
    const first = storage.registerCombination(registration(built))
    const second = await storage.registerCombination(registration(built))
    expect(kindOf(second)).toBe('registered')
    expect(kindOf(await first)).toBe('registered')
    await holder
  })
})

describe('read: the read queue is full', () => {
  const ONE_READ = { readQueuePerDomain: 1, readQueueGlobal: 1 }

  it('waits, and reads once the holder ends', async () => {
    const { storage } = await ready({ ...ONE_READ, readQueueTimeoutMs: 10_000 })
    const holder = storage.read(readRequest('slow', { ms: 300 }))
    await sleep(20)
    expect(summary(await storage.read(readRequest('page')))).toBe('read')
    expect(summary(await holder)).toBe('read')
  })

  it('an abort while it waits answers cancelled', async () => {
    const { storage } = await ready({ ...ONE_READ, readQueueTimeoutMs: 10_000 })
    const holder = storage.read(readRequest('slow', { ms: 400 }))
    await sleep(20)
    const abort = new AbortController()
    const waiting = storage.read(readRequest('page'), { signal: abort.signal })
    await sleep(20)
    abort.abort()
    expect((await waiting).kind).toBe('cancelled')
    expect(summary(await holder)).toBe('read')
  })

  it('a close while it waits answers closing at once, not when the running read ends', async () => {
    const provider = await ready({ ...ONE_READ, readQueueTimeoutMs: 10_000 })
    const holder = provider.storage.read(readRequest('slow', { ms: 1500 }))
    await sleep(20)
    const waiting = provider.storage.read(readRequest('page'))
    await sleep(20)
    const start = performance.now()
    const closed = provider.control.close({ initiator: 'disposal' })
    expect(summary(await waiting)).toBe('unavailable/closing')
    expect(performance.now() - start).toBeLessThan(700)
    await Promise.allSettled([holder, closed])
  })

  it('holds at most readQueueGlobal reads in all: a read of another domain waits for one to end', async () => {
    const { storage } = await ready({ ...ONE_READ, readQueueTimeoutMs: 10_000 })
    const other = await storage.registerCombination(
      registration(built, { transactionDomain: 'domain-b' }),
    )
    expect(kindOf(other)).toBe('registered')
    const ended: string[] = []
    const holder = storage.read(readRequest('slow', { ms: 300 })).then(result => {
      ended.push('slow')
      return summary(result)
    })
    await sleep(20)
    const next = await storage.read({
      ...readRequest('page'),
      domain: { scope: TENANT_A, transactionDomain: 'domain-b' },
    })
    ended.push('other')
    expect(summary(next)).toBe('read')
    expect(await holder).toBe('read')
    expect(ended).toEqual(['slow', 'other'])
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
    const ended: string[] = []
    const track = (name: string, read: ReturnType<typeof storage.read>) =>
      read.then(result => {
        ended.push(name)
        return summary(result)
      })
    const holder = track('slow', storage.read(readRequest('slow', { ms: 600 })))
    await sleep(20)
    const blocked = track('same-domain', storage.read(readRequest('page')))
    await sleep(20)
    const otherDomain = track(
      'other-domain',
      storage.read({
        ...readRequest('page'),
        domain: { scope: TENANT_A, transactionDomain: 'domain-b' },
      }),
    )
    expect(await Promise.all([holder, blocked, otherDomain])).toEqual(['read', 'read', 'read'])
    expect(ended[0]).toBe('other-domain')
  })

  it('the deadline runs from the call: the wait for a reservation and the wait in the queue add up', async () => {
    const { storage } = await ready({
      ...ONE_READ,
      maxReadWorkersPerDomain: 2,
      readQueueTimeoutMs: 500,
    })
    const holder = storage.read(readRequest('slow', { ms: 400 }))
    const write = storage.commit(spinning('long', 2000))
    await sleep(20)
    const start = performance.now()
    const serial = await storage.read(readRequest('serial'))
    expect(summary(serial)).toBe('unavailable/queue_timeout')
    expect(performance.now() - start).toBeLessThan(900)
    await Promise.allSettled([holder, write])
  })

  it('the wait counts towards readQueueTimeoutMs: past it the read is queue_timeout', async () => {
    const { storage } = await ready({ ...ONE_READ, readQueueTimeoutMs: 200 })
    const holder = storage.read(readRequest('slow', { ms: 1500 }))
    await sleep(20)
    expect(summary(await storage.read(readRequest('page')))).toBe('unavailable/queue_timeout')
    expect(summary(await holder)).toBe('read')
  })
})
