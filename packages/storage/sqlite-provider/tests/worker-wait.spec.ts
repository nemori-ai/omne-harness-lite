import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SqlIdentity } from '@omne-harness/sql-contract'
import { advance, atLimit, deadlines, openGates, tick, until } from './gate.ts'
import {
  DOMAIN,
  TENANT_A,
  buildMaterials,
  command,
  commitRequest,
  createProvider,
  heldCommit,
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
  openGates()
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

const keyOf = (key: string): SqlIdentity => identity({ operationKey: key })

const plain = (key: string): ReturnType<typeof commitRequest> =>
  commitRequest(built, { identity: keyOf(key), commands: [command('ledger', { note: key })] })

const LOCK_WAIT = { lockWaitMs: 200 }
const REPLY_WAIT_MS = 2 * LOCK_WAIT.lockWaitMs

describe('a sent commit with no reply within twice lockWaitMs', () => {
  it('settles unknown (reply_wait_expired) at the limit, keeps its reservation, and is recognized once the Worker answers', async () => {
    const { storage } = await ready({
      ...LOCK_WAIT,
      admissionQueueLimit: 1,
      groupMaxOperations: 1,
      admissionWaitMs: 0,
    })
    const slow = await heldCommit(storage, workspace, built, 'slow')
    expect(await atLimit(slow.result, REPLY_WAIT_MS)).toMatchObject({
      kind: 'unknown',
      diagnostic: 'reply_wait_expired',
    })
    expect(kindOf(await storage.commit(plain('next')))).toBe('rejected_before_accept/queue_full')
    slow.gate.open()
    expect(kindOf(await storage.query(keyOf('slow')))).toBe('committed')
    expect(kindOf(await storage.commit(plain('next')))).toBe('committed')
  })
})

describe('a sent query with no reply within twice lockWaitMs', () => {
  it('settles unknown (reply_wait_expired) at the limit; its queue place goes back with the reply', async () => {
    const { storage } = await ready({
      ...LOCK_WAIT,
      queryQueuePerDomain: 1,
      queryQueueGlobal: 1,
      admissionWaitMs: 0,
    })
    const busy = await heldCommit(storage, workspace, built, 'busy')
    const before = deadlines()
    const asked = storage.query(keyOf('busy'))
    await until(() => deadlines() > before)
    advance(REPLY_WAIT_MS)
    expect(await asked).toMatchObject({ kind: 'unknown', diagnostic: 'reply_wait_expired' })
    expect(await storage.query(keyOf('busy'))).toMatchObject({
      kind: 'unknown',
      diagnostic: 'queue_full',
    })
    busy.gate.open()
    await busy.result
    let recognized = await storage.query(keyOf('busy'))
    while (recognized.kind === 'unknown') {
      await tick()
      recognized = await storage.query(keyOf('busy'))
    }
    expect(kindOf(recognized)).toBe('committed')
  })
})

describe('a sent registration with no reply within twice lockWaitMs', () => {
  it('settles unknown (reply_wait_expired) at the limit, and the registration lands once the Worker answers', async () => {
    const full = await buildMaterials(workspace, { journal: 'ok', declaredVersion: 'v1' })
    const { storage } = await ready(LOCK_WAIT, full)
    const busy = await heldCommit(storage, workspace, built, 'busy')
    const next = {
      scope: TENANT_A,
      transactionDomain: DOMAIN,
      combinationVersion: 'v2',
      manifestDigest: full.digest(['auditor', 'journal', 'ledger']),
      participants: ['auditor', 'journal', 'ledger'],
    }
    const before = deadlines()
    const registering = storage.registerCombination(next)
    await until(() => deadlines() > before)
    advance(REPLY_WAIT_MS)
    expect(await registering).toMatchObject({ kind: 'unknown', diagnostic: 'reply_wait_expired' })
    busy.gate.open()
    await busy.result
    expect(kindOf(await storage.registerCombination(next))).toBe('registered')
  })
})
