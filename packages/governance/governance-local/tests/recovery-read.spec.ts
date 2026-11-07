import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import {
  recoveryPageSchema,
  RECOVERY_HANDLER,
  readRecoveryPage,
  recoveryCandidatesSql,
  type RecoveryPageRequest,
} from '../src/recovery-read.ts'
import migration from '../src/migration.ts'
import recoveryMigration from '../src/recovery-migration.ts'
import { bootstrapScope } from '../src/scope.ts'
import { scopeKey } from '../src/encoding.ts'
import { standingCustodySchema } from '../src/standing-schema.ts'
import { command, binding, execution, openOperations, scope } from './operation-world.ts'
import { databasePort, openDatabase } from './database.ts'

const databases: DatabaseSync[] = []
const worlds: Awaited<ReturnType<typeof openOperations>>[] = []
afterEach(async () => {
  for (const db of databases.splice(0)) db.close()
  for (const w of worlds.splice(0)) await w.close()
})
function seed(db: DatabaseSync, id: string, state: string, custody: string | null) {
  db.prepare(`INSERT INTO gc_operation
    (scope_key,command_owner,principal_ref,operation_id,request_digest,request_json,accepted_epoch,sql_identity_json,execution_json,held_json,state,result_json)
    VALUES (?,'contribute','alice',?,?,'{}','first','{}',?,?,?,?)`).run(
    scopeKey(scope),
    id,
    'a'.repeat(64),
    state === 'accepted' ? null : '{}',
    custody ? JSON.stringify({ kind: custody }) : null,
    state,
    state === 'accepted' || state === 'submitted' ? null : '{}',
  )
}
function setup() {
  const db = openDatabase()
  databases.push(db)
  bootstrapScope(
    {
      ...databasePort(db),
      requireFact() {
        throw new Error('No facts')
      },
      provideFact() {
        throw new Error('No facts')
      },
    },
    { scope, epoch: 'first', previousEpoch: null },
  )
  return db
}
it('enumerates the full product of business and custody states, including unfinished holds on terminals', () => {
  const db = setup(),
    port = databasePort(db)
  for (const state of ['accepted', 'submitted', 'committed', 'aborted']) {
    for (const custody of [null, 'requested', 'held', 'settled'])
      seed(db, `${state}-${custody ?? 'none'}`, state, custody)
  }
  const page = recoveryPageSchema.parse(readRecoveryPage(port, { scope, after: null, limit: 64 }))
  expect(page.items.map(i => i.key.operationId).sort()).toEqual(
    [
      'accepted-none',
      'accepted-requested',
      'accepted-held',
      'accepted-settled',
      'submitted-none',
      'submitted-requested',
      'submitted-held',
      'submitted-settled',
      'committed-requested',
      'committed-held',
      'aborted-requested',
      'aborted-held',
    ].sort(),
  )
  expect(page.next).toBeNull()
})
it('uses the recovery index for bounded keyset pages across ten thousand settled historical operations', () => {
  const db = setup(),
    port = databasePort(db)
  db.exec('BEGIN')
  for (let n = 0; n < 10000; n++) seed(db, 'history-' + n, 'committed', 'settled')
  for (const id of ['a', 'b', 'c', 'd', 'e']) seed(db, id, 'aborted', 'held')
  db.exec('COMMIT')
  const ids: string[] = []
  let after: RecoveryPageRequest['after'] = null
  do {
    const page = recoveryPageSchema.parse(readRecoveryPage(port, { scope, after, limit: 2 }))
    ids.push(...page.items.map(i => i.key.operationId))
    after = page.next
  } while (after)
  expect(ids).toEqual(['a', 'b', 'c', 'd', 'e'])
  const plan = db
    .prepare('EXPLAIN QUERY PLAN ' + recoveryCandidatesSql)
    .all(scopeKey(scope), '', '', '', 3)
    .map(row => String(row.detail))
    .join('\n')
  expect(plan).toContain('USING INDEX gc_operation_recovery')
  expect(plan).not.toMatch(/SCAN gc_operation/)
  expect(plan).not.toContain('TEMP B-TREE')
  expect(
    readRecoveryPage(port, {
      scope,
      after: {
        scope: { ...scope, logicalServiceId: 'other' },
        owner: 'contribute',
        principalRef: 'alice',
        operationId: 'b',
      },
      limit: 2,
    }),
  ).toEqual({ kind: 'conflict', reason: 'basis' })
})
it('adds the recovery index to a prior schema without modifying saved terminal rows', () => {
  const db = new DatabaseSync(':memory:')
  databases.push(db)
  const port = databasePort(db)
  migration.up(port)
  bootstrapScope(
    {
      ...port,
      requireFact() {
        throw new Error('No facts')
      },
      provideFact() {
        throw new Error('No facts')
      },
    },
    { scope, epoch: 'first', previousEpoch: null },
  )
  seed(db, 'orphaned-hold', 'committed', 'held')
  const before = db.prepare('SELECT * FROM gc_operation').get()
  recoveryMigration.up(port)
  expect(recoveryMigration.verify(port)).toEqual({ kind: 'verified' })
  expect(db.prepare('SELECT * FROM gc_operation').get()).toEqual(before)
  expect(
    recoveryPageSchema
      .parse(readRecoveryPage(port, { scope, after: null, limit: 64 }))
      .items.map(i => i.key.operationId),
  ).toEqual(['orphaned-hold'])
})
it('reads through the real Worker after reopen and removes a terminal only when custody is settled', async () => {
  let w = await openOperations()
  worlds.push(w)
  await w.call({ kind: 'bootstrap', input: { scope, epoch: 'first', previousEpoch: null } })
  const input = command('terminal-held'),
    operation = binding(input)
  await w.call({ kind: 'accept', input })
  const custody = standingCustodySchema.parse(
    await w.call({
      kind: 'standing-prepare',
      input: { operation, destination: 'governance', required: [] },
    }),
  )
  const reservation = { ...custody.request, id: custody.reservationId }
  await w.call({ kind: 'standing-held', binding: operation, reservation })
  await w.call({ kind: 'submit', binding: operation, execution })
  await w.call({ kind: 'standing-apply', binding: operation, execution })
  worlds.splice(worlds.indexOf(w), 1)
  await w.close(false)
  w = await openOperations(w.root)
  worlds.push(w)
  async function read() {
    const result = await w.storage.read({
      domain: w.domain,
      ...RECOVERY_HANDLER,
      requestKey: randomUUID(),
      input: { scope, after: null, limit: 64 },
    })
    if (result.kind !== 'read') throw new Error(JSON.stringify(result))
    return recoveryPageSchema.parse(result.output)
  }
  expect(await read()).toEqual({
    kind: 'page',
    currentEpoch: 'first',
    next: null,
    items: [{ key: operation.ref, requestDigest: operation.requestDigest, acceptedEpoch: 'first' }],
  })
  await w.call({ kind: 'standing-settled', binding: operation, reservation, outcome: 'committed' })
  expect(await read()).toEqual({ kind: 'page', currentEpoch: 'first', items: [], next: null })
})
