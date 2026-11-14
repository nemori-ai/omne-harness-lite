import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SqlIdentity } from '@omne-harness/sql-contract'
import {
  DOMAIN,
  TENANT_A,
  buildMaterials,
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

async function ready(config = {}, materials: Built = built): Promise<Provider> {
  const provider = await createProvider(workspace, materials, config)
  providers.push(provider)
  const result = await provider.storage.registerCombination(registration(materials))
  if (result.kind !== 'registered') throw new Error(`registration is ${result.kind}`)
  return provider
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const keyOf = (key: string): SqlIdentity => identity({ operationKey: key })

const spinning = (key: string, ms: number): ReturnType<typeof commitRequest> =>
  commitRequest(built, {
    identity: keyOf(key),
    commands: [command('ledger', { mode: 'spin', ms: String(ms), note: key })],
  })

const plain = (key: string): ReturnType<typeof commitRequest> =>
  commitRequest(built, { identity: keyOf(key), commands: [command('ledger', { note: key })] })

const LOCK_WAIT = { lockWaitMs: 200 }
const SPIN = 1000

describe('a sent commit with no reply within twice lockWaitMs', () => {
  it('settles unknown (reply_wait_expired) in time, keeps its reservation, and is recognized once the Worker answers', async () => {
    const { storage } = await ready({
      ...LOCK_WAIT,
      admissionQueueLimit: 1,
      groupMaxOperations: 1,
      admissionWaitMs: 0,
    })
    const start = Date.now()
    const result = await storage.commit(spinning('slow', SPIN))
    expect(result).toMatchObject({ kind: 'unknown', diagnostic: 'reply_wait_expired' })
    expect(Date.now() - start).toBeLessThan(800)
    expect(kindOf(await storage.commit(plain('next')))).toBe('rejected_before_accept/queue_full')
    await sleep(SPIN + 200)
    expect(kindOf(await storage.query(keyOf('slow')))).toBe('committed')
    expect(kindOf(await storage.commit(plain('next')))).toBe('committed')
  })
})

describe('a sent query with no reply within twice lockWaitMs', () => {
  it('settles unknown (reply_wait_expired) in time; its queue place goes back with the reply', async () => {
    const { storage } = await ready({
      ...LOCK_WAIT,
      queryQueuePerDomain: 1,
      queryQueueGlobal: 1,
      admissionWaitMs: 0,
    })
    const busy = storage.commit(spinning('busy', SPIN))
    await sleep(100)
    const start = Date.now()
    const result = await storage.query(keyOf('busy'))
    expect(result).toMatchObject({ kind: 'unknown', diagnostic: 'reply_wait_expired' })
    expect(Date.now() - start).toBeLessThan(800)
    expect(await storage.query(keyOf('busy'))).toMatchObject({
      kind: 'unknown',
      diagnostic: 'queue_full',
    })
    await busy
    await sleep(SPIN + 200)
    expect(kindOf(await storage.query(keyOf('busy')))).toBe('committed')
  })
})

describe('a sent registration with no reply within twice lockWaitMs', () => {
  it('settles unknown (reply_wait_expired) in time, and the registration lands once the Worker answers', async () => {
    const full = await buildMaterials(workspace, { journal: 'ok', declaredVersion: 'v1' })
    const { storage } = await ready(LOCK_WAIT, full)
    const busy = storage.commit(spinning('busy', SPIN))
    await sleep(100)
    const next = {
      scope: TENANT_A,
      transactionDomain: DOMAIN,
      combinationVersion: 'v2',
      manifestDigest: full.digest(['auditor', 'journal', 'ledger']),
      participants: ['auditor', 'journal', 'ledger'],
    }
    const start = Date.now()
    const result = await storage.registerCombination(next)
    expect(result).toMatchObject({ kind: 'unknown', diagnostic: 'reply_wait_expired' })
    expect(Date.now() - start).toBeLessThan(800)
    await busy
    await sleep(SPIN + 200)
    expect(kindOf(await storage.registerCombination(next))).toBe('registered')
  })
})
