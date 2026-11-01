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
