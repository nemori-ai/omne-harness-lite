// query (SQL contract SPEC 8): receipts, the pending index, the five proofs, and every unknown case.
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DOMAIN,
  buildMaterials,
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

let workspace: Workspace
let built: Built
const providers: Provider[] = []

beforeEach(async () => {
  workspace = await makeWorkspace()
  built = await buildMaterials(workspace)
})

afterEach(async () => {
  for (const provider of providers.splice(0))
    await provider.control.close({ initiator: 'disposal' }).catch(() => undefined)
  await workspace.remove()
})

async function ready(config = {}): Promise<Provider> {
  const provider = await createProvider(workspace, built, config)
  providers.push(provider)
  await provider.storage.registerCombination(registration(built))
  return provider
}

const domainFile = (): string =>
  join(workspace.storageRoot, 'domains', `${Buffer.from(DOMAIN).toString('hex')}.sqlite`)

describe('query on a ready domain', () => {
  it('returns the receipt with its evidence', async () => {
    const { storage } = await ready()
    const committed = await storage.commit(commitRequest(built))
    expect(await storage.query(identity())).toEqual(committed)
  })

  it('returns not_committed with all five proofs when nothing is saved and nothing is pending', async () => {
    const { storage } = await ready()
    expect(await storage.query(identity({ operationKey: 'never' }))).toEqual({
      kind: 'not_committed',
      identity: identity({ operationKey: 'never' }),
      proofs: {
        writerGenerationExcluded: true,
        oldTransactionTerminated: true,
        databaseRecoveryFinished: true,
        authoritativeReadSucceeded: true,
        operationNotQueued: true,
      },
    })
  })

  it('does not take another operation key, operation name or scope for the same identity', async () => {
    const { storage } = await ready()
    await storage.commit(commitRequest(built))
    expect((await storage.query(identity({ operationKey: 'key-2' }))).kind).toBe('not_committed')
    expect((await storage.query(identity({ operation: 'other-op' }))).kind).toBe('not_committed')
  })

  it('answers unknown, never not_committed, for an operation that is still pending', async () => {
    const { storage } = await ready({ lockWaitMs: 1500 })
    const blocker = new DatabaseSync(domainFile())
    blocker.exec('begin immediate')
    try {
      const pending = storage.commit(commitRequest(built))
      const asked = await storage.query(identity())
      expect(asked.kind).toBe('unknown')
      expect((await pending).kind).toBe('unknown')
    } finally {
      blocker.exec('rollback')
      blocker.close()
    }
    expect((await storage.query(identity())).kind).toBe('not_committed')
  })
})

describe('query answers unknown', () => {
  it('for an absent domain and for a domain of another scope', async () => {
    const { storage } = await ready()
    expect((await storage.query(identity({ transactionDomain: 'nowhere' }))).kind).toBe('unknown')
    expect(
      (await storage.query(identity({ scope: { kind: 'tenant', tenant: 'tenant-b' } }))).kind,
    ).toBe('unknown')
  })

  it('for a field violation and for another protocol version', async () => {
    const { storage } = await ready()
    expect((await storage.query(identity({ operationKey: '' }))).kind).toBe('unknown')
    expect((await storage.query({ ...identity(), protocolVersion: '1' as never })).kind).toBe(
      'unknown',
    )
  })

  it('after close begins', async () => {
    const { storage, control } = await ready()
    await control.close({ initiator: 'disposal' })
    expect(kindOf(await storage.query(identity()))).toBe('unknown')
  })

  it('when the queue is full, without an answer about the receipt', async () => {
    const { storage } = await ready({ queryQueuePerDomain: 1, queryQueueGlobal: 1 })
    const first = storage.query(identity())
    const second = await storage.query(identity({ operationKey: 'k2' }))
    expect(second.kind).toBe('unknown')
    expect((await first).kind).toBe('not_committed')
  })
})
