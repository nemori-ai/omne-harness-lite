// registerCombination (SQL contract SPEC 6): idempotence, conflict, new versions, and the rejection
// order. Every order case sets two adjacent conditions at once and expects the earlier step.
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DOMAIN,
  buildMaterials,
  createProvider,
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

async function provide(config = {}): Promise<Provider> {
  const provider = await createProvider(workspace, built, config)
  providers.push(provider)
  return provider
}

describe('registration results', () => {
  it('is idempotent and returns the saved registration with participants sorted', async () => {
    const { storage } = await provide()
    const input = registration(built, { participants: ['ledger', 'auditor'] })
    const first = await storage.registerCombination(input)
    expect(first).toEqual({
      kind: 'registered',
      registration: { ...input, participants: ['auditor', 'ledger'] },
    })
    expect(await storage.registerCombination(registration(built))).toEqual(first)
  })

  it('refuses the same key with other participants or another manifest as a conflict', async () => {
    const { storage } = await provide()
    await storage.registerCombination(registration(built))
    const narrower = registration(built, {
      participants: ['ledger'],
      manifestDigest: built.digest(['ledger']),
    })
    expect(kindOf(await storage.registerCombination(narrower))).toBe(
      'rejected_before_accept/registration_conflict',
    )
  })

  it('adds a second version without replacing the first, and a restart keeps both', async () => {
    const { storage, control } = await provide()
    await storage.registerCombination(registration(built))
    const second = registration(built, {
      combinationVersion: 'v2',
      participants: ['ledger'],
      manifestDigest: built.digest(['ledger']),
    })
    expect((await storage.registerCombination(second)).kind).toBe('registered')
    await control.close({ initiator: 'disposal' })
    const file = join(
      workspace.storageRoot,
      'domains',
      `${Buffer.from(DOMAIN).toString('hex')}.sqlite`,
    )
    const db = new DatabaseSync(file, { readOnly: true })
    const list = db.prepare('select combination_version v from _sql_registration order by 1').all()
    db.close()
    expect(list).toEqual([{ v: 'v1' }, { v: 'v2' }])
  })
})

describe('rejection order (SPEC 6.2, adjacent steps)', () => {
  it('step 1 closing before step 2 field_missing', async () => {
    const { storage, control } = await provide()
    await control.close({ initiator: 'disposal' })
    const result = await storage.registerCombination({ nonsense: true } as never)
    expect(kindOf(result)).toBe('rejected_before_accept/closing')
  })

  it('step 2 field_missing before step 3 participant_empty', async () => {
    const { storage } = await provide()
    const result = await storage.registerCombination(
      registration(built, { combinationVersion: '', participants: [] }),
    )
    expect(kindOf(result)).toBe('rejected_before_accept/field_missing')
  })

  it('step 3 participant_empty before step 4 participant_repeated', async () => {
    const { storage } = await provide()
    const result = await storage.registerCombination(
      registration(built, { participants: ['', ''] }),
    )
    expect(kindOf(result)).toBe('rejected_before_accept/participant_empty')
  })

  it('step 4 participant_repeated before step 5 material_unavailable', async () => {
    const { storage } = await provide()
    const result = await storage.registerCombination(
      registration(built, { participants: ['nope', 'nope'] }),
    )
    expect(kindOf(result)).toBe('rejected_before_accept/participant_repeated')
  })

  it('step 5 material_unavailable before step 6 combination_invalid', async () => {
    const { storage } = await provide()
    const result = await storage.registerCombination(
      registration(built, { participants: ['auditor', 'nope'] }),
    )
    expect(kindOf(result)).toBe('rejected_before_accept/material_unavailable')
  })

  it('step 6 combination_invalid before step 7 manifest_mismatch', async () => {
    const { storage } = await provide()
    const result = await storage.registerCombination(
      registration(built, { participants: ['auditor'], manifestDigest: 'f'.repeat(64) }),
    )
    expect(kindOf(result)).toBe('rejected_before_accept/combination_invalid')
  })

  it('step 7 manifest_mismatch before step 8 queue_full', async () => {
    const { storage } = await provide({ controlQueuePerDomain: 1, controlQueueGlobal: 1 })
    const holding = storage.registerCombination(registration(built))
    const mismatch = await storage.registerCombination(
      registration(built, { manifestDigest: 'f'.repeat(64) }),
    )
    expect(kindOf(mismatch)).toBe('rejected_before_accept/manifest_mismatch')
    const full = await storage.registerCombination(
      registration(built, { combinationVersion: 'v9' }),
    )
    expect(kindOf(full)).toBe('rejected_before_accept/queue_full')
    expect((await holding).kind).toBe('registered')
  })
})
