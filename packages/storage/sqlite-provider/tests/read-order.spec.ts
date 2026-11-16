import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { advance, atLimit, chance, gate, until } from './gate.ts'
import {
  buildReadMaterials,
  closeProviders,
  commitOf,
  heldRead,
  readRequest,
  readyProvider,
} from './read-support.ts'
import {
  DOMAIN,
  TENANT_A,
  heldCommit,
  identity,
  leases,
  makeWorkspace,
  type Built,
  type Provider,
  type Workspace,
} from './support.ts'

let workspace: Workspace
let built: Built

async function warmReaders(storage: Provider['storage']): Promise<void> {
  const first = await heldRead(storage, workspace, 'page')
  const second = await heldRead(storage, workspace, 'page')
  first.gate.open()
  second.gate.open()
  for (const result of [await first.result, await second.result])
    if (result.kind !== 'read') throw new Error(`warm-up read is ${result.kind}`)
}

const readerLeases = (): string[] => leases.admitted.filter(name => name.includes('/reader/'))

beforeEach(async () => {
  workspace = await makeWorkspace()
  built = await buildReadMaterials(workspace)
  leases.admitted.length = 0
})

afterEach(async () => {
  await closeProviders()
  await workspace.remove()
})

describe('domain-serial', () => {
  it('holds the barrier until the read has ended: a commit that arrives meanwhile completes after it', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 1)
    const events: string[] = []
    const running = await heldRead(storage, workspace, 'serial')
    const reading = running.result.then(result => {
      events.push('read')
      return result
    })
    const committing = storage.commit(commitOf(built, 'during')).then(result => {
      events.push('commit')
      return result
    })
    await chance()
    expect(events).toEqual([])
    running.gate.open()
    expect(await reading).toMatchObject({ kind: 'read', output: { a: '1', b: '1' } })
    expect((await committing).kind).toBe('committed')
    expect(events).toEqual(['read', 'commit'])
  })

  it('runs two domain-serial reads one after the other', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 1)
    const gates = [gate(workspace.root), gate(workspace.root)] as const
    const both = gates.map(held => storage.read(readRequest('serial', { gate: held.path })))
    await until(() => gates.some(held => held.isEntered()))
    const [lead, follower] = gates[0].isEntered() ? gates : ([gates[1], gates[0]] as const)
    await chance()
    expect(follower.isEntered()).toBe(false)
    lead.open()
    await follower.entered()
    follower.open()
    expect((await Promise.all(both)).map(item => item.kind)).toEqual(['read', 'read'])
  })

  it('lets snapshot reads run side by side', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 1)
    const first = await heldRead(storage, workspace, 'page')
    const second = await heldRead(storage, workspace, 'page')
    first.gate.open()
    second.gate.open()
    expect([(await first.result).kind, (await second.result).kind]).toEqual(['read', 'read'])
  })
})

describe('one arrival order for writes and barriers (SPEC 9.3)', () => {
  it('a commit makes progress while domain-serial reads keep arriving', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 1)
    await warmReaders(storage)
    let committed = false
    let reads = 0
    const stream = async (): Promise<void> => {
      while (!committed) {
        const result = await storage.read(readRequest('serial'))
        if (result.kind !== 'read') throw new Error(`stream read is ${result.kind}`)
        reads += 1
      }
    }
    const streams = Array.from({ length: 6 }, stream)
    await until(() => reads >= 12)
    const result = await storage.commit(commitOf(built, 'during-stream'))
    committed = true
    expect(result.kind).toBe('committed')
    await Promise.all(streams)
  })

  it('keeps the place of a sent write until the Worker answers, also after its caller stopped observing', async () => {
    const { storage } = await readyProvider(workspace, built, { lockWaitMs: 200 }, 0)
    await warmReaders(storage)
    const writing = await heldCommit(storage, workspace, built, 'held')
    advance(2 * 200)
    expect(await writing.result).toMatchObject({
      kind: 'unknown',
      diagnostic: 'reply_wait_expired',
    })
    const reading = storage.read(readRequest('serial'))
    writing.gate.open()
    expect(await reading).toMatchObject({ kind: 'read', output: { a: '1', b: '1' } })
    expect((await storage.query(identity({ operationKey: 'held' }))).kind).toBe('committed')
  })

  it('withdraws a write that waited at the barrier longer than lockWaitMs: unknown, no place kept, not pending', async () => {
    const { storage } = await readyProvider(workspace, built, { lockWaitMs: 200 }, 1)
    await warmReaders(storage)
    const reading = await heldRead(storage, workspace, 'serial')
    const committing = storage.commit(commitOf(built, 'expired'))
    expect(await atLimit(committing, 200)).toMatchObject({
      kind: 'unknown',
      diagnostic: 'barrier_wait_expired',
    })
    const second = storage.read(readRequest('serial'))
    reading.gate.open()
    expect((await reading.result).kind).toBe('read')
    expect((await second).kind).toBe('read')
    expect((await storage.query(identity({ operationKey: 'expired' }))).kind).toBe('not_committed')
  })

  it('withdraws a domain-serial read that times out while it waits at the barrier: its reader serves the next read at once', async () => {
    const { storage } = await readyProvider(workspace, built, { readQueueTimeoutMs: 100 }, 1)
    await warmReaders(storage)
    const first = await heldRead(storage, workspace, 'serial')
    const expiring = storage.read(readRequest('serial'))
    advance(100)
    expect(await expiring).toMatchObject({ kind: 'unavailable', reason: 'queue_timeout' })
    expect((await storage.read(readRequest('page'))).kind).toBe('read')
    first.gate.open()
    expect((await first.result).kind).toBe('read')
    expect(readerLeases()).toHaveLength(2)
  })

  it('withdraws a write whose observer aborts while it waits at the barrier: the write never runs', async () => {
    const { storage } = await readyProvider(workspace, built, {}, 1)
    await warmReaders(storage)
    const reading = await heldRead(storage, workspace, 'serial')
    const abort = new AbortController()
    const pending = storage.commit(commitOf(built, 'aborted'), { signal: abort.signal })
    abort.abort()
    expect(await pending).toMatchObject({ kind: 'unknown', diagnostic: 'observer_detached' })
    reading.gate.open()
    expect((await reading.result).kind).toBe('read')
    expect((await storage.query(identity({ operationKey: 'aborted' }))).kind).toBe('not_committed')
  })
})

describe('the barrier is held for at most readObservationMs (SPEC 9.3)', () => {
  it('releases the barrier at the observation deadline: a commit does not wait for the abandoned read', async () => {
    const { storage } = await readyProvider(workspace, built, { readObservationMs: 100 }, 1)
    await warmReaders(storage)
    const reading = await heldRead(storage, workspace, 'serial')
    const committing = storage.commit(commitOf(built, 'after-deadline'))
    expect((await atLimit(committing, 100)).kind).toBe('committed')
    expect(await reading.result).toMatchObject({ kind: 'unavailable', reason: 'read_timeout' })
  })

  it('a cancelled observation does not stop the deadline: the barrier of a cancelled read still goes at it', async () => {
    const { storage } = await readyProvider(workspace, built, { readObservationMs: 100 }, 1)
    await warmReaders(storage)
    const abort = new AbortController()
    const reading = await heldRead(storage, workspace, 'serial', { signal: abort.signal })
    abort.abort()
    expect((await reading.result).kind).toBe('cancelled')
    const committing = storage.commit(commitOf(built, 'after-cancel'))
    expect((await atLimit(committing, 100)).kind).toBe('committed')
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
    expect(readerLeases()).toEqual([])
    expect(leases.admitted.filter(name => name.includes('/writer/'))).toHaveLength(1)
  })
})
