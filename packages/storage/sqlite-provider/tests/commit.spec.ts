// Single-operation commit (SQL contract SPEC 7.1 to 7.6): recognition, rejection order, failure
// classification, response evidence, the fact cell and cancellation by observation.
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CommitResultV2, RolledBackV2 } from '@omne-harness/sql-contract'
import {
  DOMAIN,
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

const domainFile = (): string =>
  join(workspace.storageRoot, 'domains', `${Buffer.from(DOMAIN).toString('hex')}.sqlite`)

function rows(sql: string): unknown[] {
  const db = new DatabaseSync(domainFile(), { readOnly: true })
  try {
    return db.prepare(sql).all()
  } finally {
    db.close()
  }
}

function rolledBack(result: CommitResultV2): RolledBackV2 {
  if (result.kind !== 'rolled_back') throw new Error(`expected rolled_back, got ${kindOf(result)}`)
  return result
}

describe('execution and evidence', () => {
  it('runs participants in dependency order with real SQL, and keeps one receipt with its responses', async () => {
    const { storage, control } = await ready()
    const result = await storage.commit(commitRequest(built))
    expect(result.kind).toBe('committed')
    if (result.kind !== 'committed') return
    expect(result.responses.map(entry => entry.participant)).toEqual(['ledger', 'auditor'])
    expect(result.responses[0]?.reply).toEqual({
      kind: 'participated',
      response: { id: '1', changes: '1' },
    })
    expect(result.responses[1]?.reply).toEqual({
      kind: 'participated',
      response: { saw: '1', count: '1', max: '1' },
    })
    await control.close({ initiator: 'disposal' })
    expect(rows('select note from t_ledger')).toEqual([{ note: 'first' }])
    expect(rows('select kind, operation, operation_key from _sql_receipt')).toEqual([
      { kind: 'committed', operation: 'op', operation_key: 'key-1' },
    ])
  })

  it('recognizes the same identity and input, also in a new provider, and refuses another input', async () => {
    const first = await ready()
    const request = commitRequest(built)
    const committed = await first.storage.commit(request)
    expect(await first.storage.commit(request)).toEqual(committed)
    const changed = commitRequest(built, {
      commands: [command('ledger', { note: 'other' }), command('auditor')],
    })
    expect(await first.storage.commit(changed)).toEqual({
      kind: 'identity_conflict',
      identity: request.identity,
      existing: committed,
    })
    await first.control.close({ initiator: 'disposal' })
    const second = await createProvider(workspace, built)
    providers.push(second)
    expect(await second.storage.commit(request)).toEqual(committed)
    expect(await second.storage.query(request.identity)).toEqual(committed)
    expect(rows('select count(*) n from t_ledger')).toEqual([{ n: 1 }])
  })

  it('a different operation key is a new identity and runs again', async () => {
    const { storage } = await ready()
    await storage.commit(commitRequest(built))
    const next = await storage.commit(
      commitRequest(built, { identity: identity({ operationKey: 'key-2' }) }),
    )
    expect(next.kind).toBe('committed')
    if (next.kind === 'committed')
      expect(next.responses[1]?.reply).toMatchObject({ response: { count: '2' } })
  })

  it('rolls back the prefix with the stopping reply, saves both as the evidence, and writes nothing else', async () => {
    const { storage, control } = await ready()
    const request = commitRequest(built, {
      commands: [command('ledger', { note: 'gone' }), command('auditor', { mode: 'conflict' })],
    })
    const result = rolledBack(await storage.commit(request))
    expect(result.responses.map(entry => `${entry.participant}:${entry.reply.kind}`)).toEqual([
      'ledger:participated',
      'auditor:conflict',
    ])
    expect(await storage.query(request.identity)).toEqual(result)
    expect(await storage.commit(request)).toEqual(result)
    const later = await storage.commit(
      commitRequest(built, { identity: identity({ operationKey: 'later' }) }),
    )
    expect(later.kind === 'committed' && later.responses[1]?.reply).toMatchObject({
      response: { count: '1' },
    })
    await control.close({ initiator: 'disposal' })
    expect(rows('select note from t_ledger')).toEqual([{ note: 'first' }])
    expect(rows('select kind from _sql_receipt order by kind')).toEqual([
      { kind: 'committed' },
      { kind: 'rolled_back' },
    ])
  })
})

describe('failure classification (SPEC 7.6)', () => {
  const cases: readonly [string, string][] = [
    ['write-foreign', 'port_violation'],
    ['read-foreign', 'port_violation'],
    ['ddl', 'port_violation'],
    ['pragma', 'port_violation'],
    ['savepoint', 'port_violation'],
    ['txn', 'port_violation'],
    ['attach', 'port_violation'],
    ['random', 'port_violation'],
    ['receipts', 'port_violation'],
    ['schema', 'port_violation'],
    ['constraint', 'sql_error'],
    ['catch-participate', 'sql_error'],
    ['throw', 'participant_threw'],
    ['invalid', 'invalid_reply'],
    ['big', 'response_limit'],
  ]
  for (const [mode, category] of cases) {
    it(`${mode} rolls back as ${category}`, async () => {
      const { storage } = await ready()
      const result = rolledBack(
        await storage.commit(
          commitRequest(built, {
            commands: [command('ledger', { mode }), command('auditor')],
          }),
        ),
      )
      const last = result.responses[result.responses.length - 1]
      expect(last?.reply.kind === 'failed' && last.reply.category).toBe(category)
      const check = await storage.commit(
        commitRequest(built, { identity: identity({ operationKey: 'after' }) }),
      )
      expect(check.kind === 'committed' && check.responses[1]?.reply).toMatchObject({
        response: { count: '1' },
      })
    })
  }

  it('keeps the reply of a participant that caught a data error and then reported a conflict', async () => {
    const { storage } = await ready()
    const result = rolledBack(
      await storage.commit(
        commitRequest(built, {
          commands: [command('ledger', { mode: 'catch-conflict' }), command('auditor')],
        }),
      ),
    )
    expect(result.responses[0]?.reply).toEqual({
      kind: 'conflict',
      basis: { why: 'caught' },
    })
  })

  it('an environment error (write lock wait expired) is unknown and writes no rollback receipt', async () => {
    const { storage } = await ready({ lockWaitMs: 150 })
    const blocker = new DatabaseSync(domainFile())
    blocker.exec('begin immediate')
    try {
      const result = await storage.commit(commitRequest(built))
      expect(result.kind).toBe('unknown')
    } finally {
      blocker.exec('rollback')
      blocker.close()
    }
    expect(rows('select count(*) n from _sql_receipt')).toEqual([{ n: 0 }])
    const queried = await storage.query(identity())
    expect(queried.kind).toBe('not_committed')
  })
})

describe('the fact cell lives for one operation', () => {
  it('a fact provided by an earlier operation is not readable in the next one', async () => {
    const { storage } = await ready()
    expect((await storage.commit(commitRequest(built))).kind).toBe('committed')
    const next = rolledBack(
      await storage.commit(
        commitRequest(built, {
          identity: identity({ operationKey: 'key-2' }),
          commands: [command('ledger', { mode: 'no-provide' }), command('auditor')],
        }),
      ),
    )
    const last = next.responses[next.responses.length - 1]
    expect(last?.participant).toBe('auditor')
    expect(last?.reply.kind === 'failed' && last.reply.category).toBe('fact_violation')
  })
})

describe('rejection order (SPEC 7.2, adjacent steps)', () => {
  it('step 1 closing before step 2 cancelled', async () => {
    const { storage, control } = await ready()
    await control.close({ initiator: 'disposal' })
    const result = await storage.commit(commitRequest(built), { signal: AbortSignal.abort() })
    expect(kindOf(result)).toBe('rejected_before_accept/closing')
  })

  it('step 2 cancelled before step 3 field_missing', async () => {
    const { storage } = await ready()
    const result = await storage.commit(commitRequest(built, { commands: [] }), {
      signal: AbortSignal.abort(),
    })
    expect(kindOf(result)).toBe('rejected_before_accept/cancelled')
  })

  it('step 3 field_missing before step 4 unsupported_protocol', async () => {
    const { storage } = await ready()
    const result = await storage.commit(
      commitRequest(built, {
        identity: { ...identity({ operationKey: '' }), protocolVersion: '1' as never },
      }),
    )
    expect(kindOf(result)).toBe('rejected_before_accept/field_missing')
  })

  it('step 4 unsupported_protocol before step 5 participant_repeated', async () => {
    const { storage } = await ready()
    const result = await storage.commit(
      commitRequest(built, {
        identity: { ...identity(), protocolVersion: '1' as never },
        commands: [command('ledger'), command('ledger')],
      }),
    )
    expect(kindOf(result)).toBe('rejected_before_accept/unsupported_protocol')
  })

  it('step 5 participant_repeated before step 6 facts_not_json', async () => {
    const { storage } = await ready()
    const result = await storage.commit(
      commitRequest(built, {
        commands: [command('ledger', { a: undefined as never }), command('ledger')],
      }),
    )
    expect(kindOf(result)).toBe('rejected_before_accept/participant_repeated')
  })

  it('step 6 facts_not_json before step 7 command_limit', async () => {
    const { storage } = await ready({ maxCommandsPerCommit: 1 })
    const result = await storage.commit(
      commitRequest(built, {
        commands: [command('ledger', { a: undefined as never }), command('auditor')],
      }),
    )
    expect(kindOf(result)).toBe('rejected_before_accept/facts_not_json')
  })

  it('step 7 command_limit before step 8 queue_full', async () => {
    const { storage } = await ready({
      admissionQueueLimit: 1,
      globalAdmissionLimit: 1,
      groupMaxOperations: 1,
      maxCommandsPerCommit: 2,
    })
    const holding = storage.commit(commitRequest(built))
    const tooMany = await storage.commit(
      commitRequest(built, {
        identity: identity({ operationKey: 'many' }),
        commands: [command('ledger'), command('auditor'), command('extra')],
      }),
    )
    expect(kindOf(tooMany)).toBe('rejected_before_accept/command_limit')
    const full = await storage.commit(commitRequest(built, { identity: identity({ operationKey: 'k3' }) }))
    expect(kindOf(full)).toBe('rejected_before_accept/queue_full')
    expect((await holding).kind).toBe('committed')
  })

  it('step 11 combination_unregistered before step 12 manifest_mismatch', async () => {
    const { storage } = await ready()
    const result = await storage.commit(
      commitRequest(built, { combinationVersion: 'zz', manifestDigest: 'f'.repeat(64) }),
    )
    expect(kindOf(result)).toBe('rejected_before_accept/combination_unregistered')
  })

  it('step 12 manifest_mismatch before step 13 material_unavailable', async () => {
    await ready()
    const changed = await buildMaterials(workspace, { suffix: '-x', ledgerExtra: '// v2\n', declaredVersion: 'v9' })
    const second = await createProvider(workspace, changed)
    providers.push(second)
    const result = await second.storage.commit(
      commitRequest(changed, { manifestDigest: 'f'.repeat(64) }),
    )
    expect(kindOf(result)).toBe('rejected_before_accept/manifest_mismatch')
  })

  it('step 13 material_unavailable before step 14 participant_not_in_combination', async () => {
    await ready()
    const changed = await buildMaterials(workspace, { suffix: '-x', ledgerExtra: '// v2\n', declaredVersion: 'v9' })
    const second = await createProvider(workspace, changed)
    providers.push(second)
    const result = await second.storage.commit(
      commitRequest(changed, {
        manifestDigest: built.digest(['auditor', 'ledger']),
        commands: [command('ghost')],
      }),
    )
    expect(kindOf(result)).toBe('rejected_before_accept/material_unavailable')
  })

  it('step 14 participant_not_in_combination before step 15 participant_dependency_missing', async () => {
    const { storage } = await ready()
    const result = await storage.commit(
      commitRequest(built, { commands: [command('auditor'), command('ghost')] }),
    )
    expect(kindOf(result)).toBe('rejected_before_accept/participant_not_in_combination')
  })

  it('step 15 participant_dependency_missing when a required fact has no provider among the commands', async () => {
    const { storage } = await ready()
    const result = await storage.commit(commitRequest(built, { commands: [command('auditor')] }))
    expect(kindOf(result)).toBe('rejected_before_accept/participant_dependency_missing')
  })

  it('a rejection stores no receipt and runs no command', async () => {
    const { storage, control } = await ready()
    await storage.commit(commitRequest(built, { commands: [command('auditor')] }))
    await control.close({ initiator: 'disposal' })
    expect(rows('select count(*) n from _sql_receipt')).toEqual([{ n: 0 }])
    expect(rows('select count(*) n from t_ledger')).toEqual([{ n: 0 }])
  })
})

describe('observation cancel (SPEC 7.1)', () => {
  it('a signal that is already aborted is refused and reserves nothing', async () => {
    const { storage } = await ready()
    const refused = await storage.commit(commitRequest(built), { signal: AbortSignal.abort() })
    expect(kindOf(refused)).toBe('rejected_before_accept/cancelled')
    expect((await storage.query(identity())).kind).toBe('not_committed')
  })

  it('an abort after the call settles unknown with observer_detached, and the operation still completes', async () => {
    const { storage } = await ready()
    const controller = new AbortController()
    const request = commitRequest(built)
    const pending = storage.commit(request, { signal: controller.signal })
    controller.abort()
    const result = await pending
    expect(result).toMatchObject({ kind: 'unknown', diagnostic: 'observer_detached' })
    let found = await storage.query(request.identity)
    for (let i = 0; i < 200 && found.kind === 'unknown'; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 10))
      found = await storage.query(request.identity)
    }
    expect(found.kind).toBe('committed')
  })
})
