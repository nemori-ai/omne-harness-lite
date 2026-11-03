// Read ordering (SQL contract SPEC 9.3, scenarios C10 and C11): the domain-serial barrier and the
// reads that stay on the write path.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildReadMaterials,
  closeProviders,
  commitOf,
  delay,
  readRequest,
  readyProvider,
} from './read-support.ts'
import {
  DOMAIN,
  TENANT_A,
  identity,
  leases,
  makeWorkspace,
  type Built,
  type Workspace,
} from './support.ts'

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

describe('domain-serial (C10)', () => {
  it('holds the barrier until the read has ended: a commit that arrives meanwhile completes after it', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 1)
    const events: string[] = []
    const reading = storage.read(readRequest('serial', { sleepMs: 600 })).then(result => {
      events.push('read')
      return result
    })
    await delay(250)
    const committing = storage.commit(commitOf(built, 'during')).then(result => {
      events.push('commit')
      return result
    })
    expect(await reading).toMatchObject({ kind: 'read', output: { a: '1', b: '1' } })
    expect((await committing).kind).toBe('committed')
    expect(events).toEqual(['read', 'commit'])
  })

  it('runs two domain-serial reads one after the other', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 1)
    const start = Date.now()
    const both = await Promise.all([
      storage.read(readRequest('serial', { sleepMs: 300 })),
      storage.read(readRequest('serial', { sleepMs: 300 })),
    ])
    expect(both.map(item => item.kind)).toEqual(['read', 'read'])
    expect(Date.now() - start).toBeGreaterThanOrEqual(580)
  })

  it('lets snapshot reads run side by side', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 1)
    const start = Date.now()
    await Promise.all([
      storage.read(readRequest('page', { sleepMs: 300 })),
      storage.read(readRequest('page', { sleepMs: 300 })),
    ])
    expect(Date.now() - start).toBeLessThan(560)
  })
})

describe('one arrival order for writes and barriers (SPEC 9.3)', () => {
  it('a commit makes progress while domain-serial reads keep arriving', async () => {
    // Defect: a write waits while any barrier is queued (the old barrier). Three streams keep a
    // barrier queued at all times, so the commit would wait until the streams end (about 2 s).
    const { storage } = await readyProvider(workspace, built, {}, 1)
    const stopAt = Date.now() + 2000
    const stream = async (): Promise<void> => {
      while (Date.now() < stopAt) {
        const result = await storage.read(readRequest('serial', { sleepMs: 100 }))
        if (result.kind !== 'read') throw new Error(`stream read is ${result.kind}`)
      }
    }
    const streams = [stream(), stream(), stream()]
    await delay(200)
    const start = Date.now()
    expect((await storage.commit(commitOf(built, 'during-stream'))).kind).toBe('committed')
    expect(Date.now() - start).toBeLessThan(1000)
    await Promise.all(streams)
  })

  it('withdraws a write that waited at the barrier longer than lockWaitMs: unknown, no place kept, not pending', async () => {
    // Defect: the wait has no bound (the commit would come back `committed` after the read), or
    // the expired write keeps its place (the second serial read would wait behind it for ever).
    const { storage } = await readyProvider(workspace, built, { lockWaitMs: 200 }, 1)
    const reading = storage.read(readRequest('serial', { sleepMs: 700 }))
    await delay(150)
    const start = Date.now()
    const result = await storage.commit(commitOf(built, 'expired'))
    expect(result).toMatchObject({ kind: 'unknown', diagnostic: 'barrier_wait_expired' })
    expect(Date.now() - start).toBeLessThan(500)
    const second = storage.read(readRequest('serial', { sleepMs: 50 }))
    expect((await reading).kind).toBe('read')
    expect((await second).kind).toBe('read')
    // Nothing was sent: the identity is neither pending nor committed.
    expect((await storage.query(identity({ operationKey: 'expired' }))).kind).toBe('not_committed')
  })

  it('withdraws a domain-serial read that times out while it waits at the barrier: its reader serves the next read at once', async () => {
    // Defect: the expired read keeps its place and its reader until the barrier is granted to it
    // (the old code): the snapshot read would wait for the first read to end (about 600 ms).
    const { storage } = await readyProvider(workspace, built, { readQueueTimeoutMs: 100 }, 1)
    const first = storage.read(readRequest('serial', { sleepMs: 600 }))
    await delay(100)
    const expired = await storage.read(readRequest('serial', { sleepMs: 50 }))
    expect(expired).toMatchObject({ kind: 'unavailable', reason: 'queue_timeout' })
    const start = Date.now()
    expect((await storage.read(readRequest('page'))).kind).toBe('read')
    expect(Date.now() - start).toBeLessThan(300)
    expect((await first).kind).toBe('read')
  })

  it('withdraws a write whose observer aborts while it waits at the barrier: the write never runs', async () => {
    // Defect: the abort only detaches the observer and the write is still sent after the read
    // (the old code): the query would find it `committed`.
    const { storage } = await readyProvider(workspace, built, {}, 1)
    const reading = storage.read(readRequest('serial', { sleepMs: 500 }))
    await delay(150)
    const abort = new AbortController()
    const pending = storage.commit(commitOf(built, 'aborted'), { signal: abort.signal })
    await delay(50)
    abort.abort()
    expect(await pending).toMatchObject({ kind: 'unknown', diagnostic: 'observer_detached' })
    expect((await reading).kind).toBe('read')
    expect((await storage.query(identity({ operationKey: 'aborted' }))).kind).toBe('not_committed')
  })
})

describe('the barrier is held for at most readObservationMs (SPEC 9.3)', () => {
  it('releases the barrier at the observation deadline: a commit does not wait for the abandoned read', async () => {
    // Defect: the barrier is held until the SQL of the read ends (the old code): the commit would
    // wait the whole 800 ms sleep.
    const { storage } = await readyProvider(workspace, built, { readObservationMs: 100 }, 1)
    const start = Date.now()
    const reading = storage.read(readRequest('serial', { sleepMs: 800 }))
    await delay(50)
    expect((await storage.commit(commitOf(built, 'after-deadline'))).kind).toBe('committed')
    expect(Date.now() - start).toBeLessThan(600)
    expect((await reading).kind).toBe('unavailable')
    expect(await reading).toMatchObject({ reason: 'read_timeout' })
  })

  it('a cancelled observation does not stop the deadline: the barrier of a cancelled read still goes at it', async () => {
    // Defect: the cancel stops the timers of the task and the barrier is held until the SQL ends
    // (the old code): the commit would wait the whole 800 ms sleep.
    const { storage } = await readyProvider(workspace, built, { readObservationMs: 100 }, 1)
    const start = Date.now()
    const abort = new AbortController()
    const reading = storage.read(readRequest('serial', { sleepMs: 800 }), { signal: abort.signal })
    await delay(50)
    abort.abort()
    expect((await reading).kind).toBe('cancelled')
    expect((await storage.commit(commitOf(built, 'after-cancel'))).kind).toBe('committed')
    expect(Date.now() - start).toBeLessThan(600)
  })
})

describe('reads that stay on the write path (C11)', () => {
  it('starts no read Worker for commit, query or registration', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 1)
    await storage.commit(commitOf(built, 'k'))
    await storage.query(identity({ operationKey: 'k' }))
    await storage.registerCombination({
      scope: TENANT_A,
      transactionDomain: DOMAIN,
      combinationVersion: 'v1',
      manifestDigest: built.digest(['auditor', 'ledger']),
      participants: ['auditor', 'ledger'],
    })
    expect(leases.admitted.filter(name => name.includes('/reader/'))).toEqual([])
    expect(leases.admitted.filter(name => name.includes('/writer/'))).toHaveLength(1)
  })
})
