// The admission wait at the four admission points (sql-contract SPEC 准入等待), through the public
// SqlStorage. A spinning commit keeps the write Worker busy, so what it holds stays held for as
// long as the case needs; a slow read does the same for the read queue. Each case was red before
// the waiting list: a full point refused at once.
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

/** One write reservation in all, so a second commit has to wait for the first. */
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
    // It waited: before the waiting list a full point answered at once.
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

  it('the wait counts towards readQueueTimeoutMs: past it the read is queue_timeout', async () => {
    const { storage } = await ready({ ...ONE_READ, readQueueTimeoutMs: 200 })
    const holder = storage.read(readRequest('slow', { ms: 1500 }))
    await sleep(20)
    expect(summary(await storage.read(readRequest('page')))).toBe('unavailable/queue_timeout')
    expect(summary(await holder)).toBe('read')
  })
})
