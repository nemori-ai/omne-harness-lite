import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { reclaimContributions } from '../src/contribution.ts'
import { bootstrapScope } from '../src/scope.ts'
import { canonical, scopeKey } from '../src/encoding.ts'
import { databasePort, definition, openDatabase } from './database.ts'
import { scope } from './operation-world.ts'

const databases: DatabaseSync[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})
const key = scopeKey(scope)

function setup() {
  const db = openDatabase()
  databases.push(db)
  const port: ParticipantPort = {
    ...databasePort(db),
    requireFact() {
      throw new Error('No fixture facts')
    },
    provideFact() {
      throw new Error('No fixture facts')
    },
  }
  bootstrapScope(port, { scope, epoch: 'first', previousEpoch: null })
  definition(db)
  const lease = (id: string, epoch: string) =>
    db
      .prepare(
        "INSERT INTO gc_contribution VALUES (?,?,'contributor','generation',?,'alice','definition','released',?)",
      )
      .run(key, id, epoch, `op-${id}`)
  lease('free', 'first')
  lease('kept', 'first')
  bootstrapScope(port, { scope, epoch: 'second', previousEpoch: 'first' })
  lease('current', 'second')
  function operation(owner: 'contribute' | 'withdraw', id: string, request: unknown) {
    db.prepare(`INSERT INTO gc_operation
      (scope_key,command_owner,principal_ref,operation_id,request_digest,request_json,accepted_epoch,sql_identity_json,execution_json,held_json,state,result_json)
      VALUES (?,?,'alice',?,?,?,'first','{}',NULL,NULL,'accepted',NULL)`).run(
      key,
      owner,
      id,
      'a'.repeat(64),
      canonical(request),
    )
  }
  function remaining() {
    reclaimContributions(port, scope)
    return db
      .prepare('SELECT registration_id id FROM gc_contribution ORDER BY registration_id')
      .all()
      .map(row => row.id)
  }
  return { db, operation, remaining }
}

it('keeps a released lease of a closed epoch that a member row still references', () => {
  const { db, remaining } = setup()
  db.prepare("INSERT INTO gc_member VALUES (?, 'kept', 'definition', 'first')").run(key)
  expect(remaining()).toEqual(['current', 'kept'])
})

it('keeps a released lease of a closed epoch whose registering operation is still kept', () => {
  const { operation, remaining } = setup()
  operation('contribute', 'op-kept', {})
  expect(remaining()).toEqual(['current', 'kept'])
})

it('keeps a released lease of a closed epoch that a kept withdrawal names', () => {
  const { operation, remaining } = setup()
  operation('withdraw', 'withdraw-kept', {
    owner: 'withdraw',
    command: {
      operationId: 'withdraw-kept',
      contribution: {
        scope,
        contributorId: 'contributor',
        generation: 'generation',
        registrationId: 'kept',
      },
    },
  })
  expect(remaining()).toEqual(['current', 'kept'])
})
