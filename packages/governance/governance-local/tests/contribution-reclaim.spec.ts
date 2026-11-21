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
  const lease = (id: string, epoch: string, state = 'released') =>
    db
      .prepare(
        "INSERT INTO gc_contribution VALUES (?,?,'contributor','generation',?,'alice','definition',?,?)",
      )
      .run(key, id, epoch, state, `op-${id}`)
  lease('free', 'first')
  lease('kept', 'first')
  lease('crashed', 'first', 'active')
  db.prepare("INSERT INTO gc_member VALUES (?, 'crashed', 'definition', 'first')").run(key)
  db.prepare(
    "INSERT INTO gc_member_target VALUES (?, 'crashed', 'definition', 'first', 'target', '{}')",
  ).run(key)
  bootstrapScope(port, { scope, epoch: 'second', previousEpoch: 'first' })
  lease('current', 'second')
  lease('open', 'second', 'active')
  db.prepare("INSERT INTO gc_member VALUES (?, 'open', 'definition', 'second')").run(key)
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

it('drops every lease of an earlier epoch with its member rows and keeps the open epoch', () => {
  const { db, remaining } = setup()
  expect(remaining()).toEqual(['current', 'open'])
  expect(db.prepare('SELECT registration_id id, epoch FROM gc_member').all()).toEqual([
    { id: 'open', epoch: 'second' },
  ])
  expect(db.prepare('SELECT count(*) n FROM gc_member_target').all()).toEqual([{ n: 0 }])
})

it('keeps a released lease of a closed epoch whose registering operation is still kept', () => {
  const { operation, remaining } = setup()
  operation('contribute', 'op-kept', {})
  expect(remaining()).toEqual(['current', 'kept', 'open'])
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
  expect(remaining()).toEqual(['current', 'kept', 'open'])
})
