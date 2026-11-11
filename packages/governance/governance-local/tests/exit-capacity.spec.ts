import { afterEach, expect, it } from 'vitest'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { GovernanceContributionRefSchema } from '@omne-harness/governance-contract'
import { z } from 'zod'
import { openDatabase, databasePort } from './database.ts'
import { scope, command, binding, execution } from './operation-world.ts'
import { acceptOperation, submitOperation } from '../src/operation.ts'
import { applyOperation } from '../src/apply-operation.ts'
import { bootstrapScope, readScope } from '../src/scope.ts'
import type { AcceptOperation } from '../src/operation-schema.ts'

const databases: ReturnType<typeof openDatabase>[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})
const maximum = Number.MAX_SAFE_INTEGER - 1
const threshold = maximum - 128
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
  function run(input: AcceptOperation) {
    acceptOperation(port, input)
    submitOperation(port, binding(input), execution)
    const result = applyOperation(port, binding(input), execution)
    if (result.kind !== 'found') throw new Error(JSON.stringify(result))
    return result.record.result
  }
  return { db, port, run }
}

it('reserves exit increments when a new registration or adoption reaches the admission threshold', () => {
  const { db, port, run } = setup()
  db.prepare('UPDATE gc_scope SET declaration_revision=?,adoption_revision=?').run(
    threshold - 1,
    threshold - 1,
  )
  expect(run(command('last'))).toMatchObject({ kind: 'registered', declarationRevision: threshold })
  expect(run(command('too-late'))).toEqual({ kind: 'limited', resource: 'revision' })
  const input: AcceptOperation = {
    ...command('adopt'),
    request: {
      owner: 'adopt',
      command: {
        scope,
        operationId: 'adopt',
        expectedDeclarationRevision: threshold,
        expectedAdoptionRevision: threshold - 1,
        collection: { scope, declarationRevision: threshold, digest: 'a'.repeat(64) },
        complete: [],
      },
    },
  }
  expect(run(input)).toEqual({ kind: 'limited', resource: 'revision' })
  expect(readScope(port, scope)).toMatchObject({
    declarationRevision: threshold,
    adoptionRevision: threshold - 1,
  })
})

it('retires all 128 active leases through the maximum and repeats an exit without consuming another revision', () => {
  const { db, port, run } = setup()
  const registration = z.object({
    kind: z.literal('registered'),
    contribution: GovernanceContributionRefSchema,
  })
  const refs = Array.from(
    { length: 128 },
    (_, i) => registration.parse(run(command('lease-' + i))).contribution,
  )
  db.prepare('UPDATE gc_scope SET declaration_revision=?,adoption_revision=?').run(
    threshold,
    threshold,
  )
  for (const [i, contribution] of refs.entries()) {
    const input: AcceptOperation = {
      ...command('release-' + i),
      request: { owner: 'withdraw', command: { operationId: 'release-' + i, contribution } },
    }
    expect(run(input)).toMatchObject({
      kind: 'released',
      contribution,
      adoptionRevision: threshold + i + 1,
    })
  }
  expect(readScope(port, scope)).toMatchObject({
    declarationRevision: maximum,
    adoptionRevision: maximum,
  })
  expect(
    db.prepare("SELECT COUNT(*) AS n FROM gc_contribution WHERE state='active'").get()?.n,
  ).toBe(0)
  const repeated: AcceptOperation = {
    ...command('repeat'),
    request: { owner: 'withdraw', command: { operationId: 'repeat', contribution: refs[0]! } },
  }
  expect(run(repeated)).toMatchObject({ kind: 'already-released', adoptionRevision: maximum })
  expect(readScope(port, scope)).toMatchObject({
    declarationRevision: maximum,
    adoptionRevision: maximum,
  })
})
