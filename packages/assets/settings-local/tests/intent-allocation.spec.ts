import { afterEach, expect, it } from 'vitest'
import type { ReadResult } from '@omne-harness/sql-contract'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { allocation, openIntentWorld } from './intent-world.ts'
import { canonical, digest } from '../src/encoding.ts'
import { intentAttemptIdentity } from '../src/intent-records.ts'

const worlds: Awaited<ReturnType<typeof openIntentWorld>>[] = []
function output(result: ReadResult) {
  if (result.kind !== 'read') throw new Error(JSON.stringify(result))
  return result.output
}

async function open(root?: string) {
  const world = await openIntentWorld(root)
  worlds.push(world)
  return world
}
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})

it('concurrent allocation recognizes one durable preparing attempt and its original plan', async () => {
  const world = await open()
  const inputs = Array.from({ length: 8 }, (_, index) => {
    const input = allocation()
    input.attemptId = `attempt-${index}`
    input.intent.command.requestId = `transport-${index}`
    input.plan.ownerRevision = index + 1
    return input
  })
  const results = await Promise.all(inputs.map(input => world.write(input)))
  for (const result of results) expect(result.kind).toBe('committed')
  const read = await world.read(allocation().identity)
  expect(read, JSON.stringify(read)).toMatchObject({
    kind: 'read',
    output: {
      kind: 'found',
      nextAttempt: 2,
      status: { state: 'open' },
      attempt: { sequence: 1, status: { state: 'preparing', basis: null } },
    },
  })
  if (read.kind !== 'read') throw new Error(JSON.stringify(read))
  for (const result of results) {
    if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
    expect(result.responses[0].reply.response).toEqual(read.output)
  }
  expect(output(await world.read(allocation().identity))).toEqual(output(read))
})

it('does not replace the command or preparing plan on retries', async () => {
  const world = await open()
  const original = allocation()
  expect((await world.write(original)).kind).toBe('committed')
  const retry = allocation()
  retry.attemptId = 'candidate-that-must-not-be-allocated'
  retry.intent.command.requestId = 'new-transport'
  retry.plan.valueRevision = 99
  expect((await world.write(retry)).kind).toBe('committed')
  const changed = allocation()
  changed.intent.command.expectedRevision = 3
  const result = await world.write(changed)
  expect(result.kind).toBe('committed')
  if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
  expect(result.responses[0].reply.response).toEqual({
    kind: 'rejected',
    reason: 'operation_conflict',
  })
  expect(await world.read(original.identity)).toMatchObject({
    kind: 'read',
    output: {
      intent: original.intent,
      nextAttempt: 2,
      attempt: { attemptId: original.attemptId, plan: original.plan },
    },
  })
})

it('reopens the original attempt without writing a value or business result', async () => {
  const first = await open()
  const input = allocation()
  expect((await first.write(input)).kind).toBe('committed')
  const before = await first.read(input.identity)
  await first.close()
  const next = await open(first.root)
  expect(output(await next.read(input.identity))).toEqual(output(before))
  const retry = { ...input, attemptId: 'after-restart' }
  expect((await next.write(retry)).kind).toBe('committed')
  expect(output(await next.read(input.identity))).toEqual(output(before))
  await next.close()
  const db = new DatabaseSync(
    join(first.root, 'domains', `${Buffer.from('intent-test').toString('hex')}.sqlite`),
    { readOnly: true },
  )
  try {
    expect(db.prepare('SELECT state, next_attempt FROM st_governance_intent').all()).toEqual([
      { state: 'open', next_attempt: 2 },
    ])
    expect(db.prepare('SELECT state, basis_json FROM st_governance_attempt').all()).toEqual([
      { state: 'preparing', basis_json: null },
    ])
    for (const table of ['st_states', 'st_operations', 'st_changes'])
      expect(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()?.count).toBe(0)
  } finally {
    db.close()
  }
})

it('rolls back root, attempt and sequence together when the enclosing SQL operation fails', async () => {
  const world = await open()
  const input = allocation()
  expect((await world.write(input, 'forced-rollback', true)).kind).toBe('rolled_back')
  expect(await world.read(input.identity)).toMatchObject({
    kind: 'read',
    output: { kind: 'not_found' },
  })
  expect((await world.write(input)).kind).toBe('committed')
  expect(await world.read(input.identity)).toMatchObject({
    kind: 'read',
    output: { nextAttempt: 2, attempt: { sequence: 1 } },
  })
})

it('separates root owners while keeping exact attempt IDs unique', async () => {
  const world = await open()
  const alice = allocation()
  expect((await world.write(alice)).kind).toBe('committed')
  const bob = allocation()
  bob.identity.principalRef = 'bob'
  expect(await world.read(bob.identity)).toMatchObject({
    kind: 'read',
    output: { kind: 'not_found' },
  })
  expect((await world.write(bob)).kind).toBe('rolled_back')
  expect(await world.read(bob.identity)).toMatchObject({
    kind: 'read',
    output: { kind: 'not_found' },
  })
  bob.attemptId = 'bobs-attempt'
  expect((await world.write(bob)).kind).toBe('committed')
  expect(await world.read(bob.identity)).toMatchObject({
    kind: 'read',
    output: { identity: bob.identity, attempt: { attemptId: 'bobs-attempt' } },
  })
  expect(await world.read(alice.identity)).toMatchObject({
    kind: 'read',
    output: { identity: alice.identity, attempt: { attemptId: 'attempt-1' } },
  })
})

it.each(['aborted', 'committed'])(
  'recognizes a persisted %s root without allocating another attempt',
  async state => {
    const first = await open()
    const input = allocation()
    expect((await first.write(input)).kind).toBe('committed')
    await first.close()
    const db = new DatabaseSync(
      join(first.root, 'domains', `${Buffer.from('intent-test').toString('hex')}.sqlite`),
    )
    try {
      db.exec('BEGIN IMMEDIATE')
      if (state === 'aborted') {
        db.prepare("UPDATE st_governance_attempt SET state = 'aborted'").run()
        db.prepare(
          "UPDATE st_governance_intent SET state = 'aborted', abort_reason = 'cancelled'",
        ).run()
      } else {
        db.prepare(
          "UPDATE st_governance_attempt SET state = 'committed', basis_json = plan_json, basis_digest = ?",
        ).run(digest(input.plan))
        db.prepare("UPDATE st_governance_intent SET state = 'committed', result_json = ?").run(
          canonical({
            kind: 'committed',
            operationId: input.identity.operation.operationId,
            revision: 1,
            changed: true,
          }),
        )
      }
      db.exec('COMMIT')
    } finally {
      db.close()
    }
    const next = await open(first.root)
    expect((await next.write({ ...input, attemptId: 'must-not-revive' })).kind).toBe('committed')
    expect(await next.read(input.identity)).toMatchObject({
      kind: 'read',
      output: {
        nextAttempt: 2,
        status:
          state === 'aborted'
            ? { state, reason: 'cancelled' }
            : {
                state,
                result: {
                  kind: 'committed',
                  operationId: input.identity.operation.operationId,
                  revision: 1,
                  changed: true,
                },
              },
        attempt: null,
      },
    })
  },
)

it('allocates attempt 64, recognizes it while live, then preserves an exhausted pending root', async () => {
  const input = allocation()
  const first = await open()
  expect((await first.write(input)).kind).toBe('committed')
  await first.close()
  const file = join(first.root, 'domains', `${Buffer.from('intent-test').toString('hex')}.sqlite`)
  const seed = new DatabaseSync(file)
  try {
    seed.exec('BEGIN IMMEDIATE')
    seed.prepare("UPDATE st_governance_attempt SET state = 'aborted'").run()
    const insert = seed.prepare(`INSERT INTO st_governance_attempt
      (operation_key, attempt, attempt_id, plan_json, basis_digest, basis_json, sql_identity_json, state)
      SELECT operation_key, ?, ?, plan_json, NULL, NULL, ?, 'aborted'
      FROM st_governance_attempt WHERE attempt = 1`)
    for (let sequence = 2; sequence <= 63; sequence++) {
      const id = `historical-${sequence}`
      insert.run(sequence, id, canonical(intentAttemptIdentity(input.identity, id)))
    }
    seed.prepare('UPDATE st_governance_intent SET next_attempt = 64').run()
    seed.exec('COMMIT')
  } finally {
    seed.close()
  }
  const last = await open(first.root)
  expect((await last.write({ ...input, attemptId: 'last-allowed' })).kind).toBe('committed')
  expect((await last.write({ ...input, attemptId: 'live-retry' })).kind).toBe('committed')
  expect(await last.read(input.identity)).toMatchObject({
    kind: 'read',
    output: {
      nextAttempt: 65,
      attempt: { sequence: 64, attemptId: 'last-allowed' },
    },
  })
  await last.close()
  const seal = new DatabaseSync(file)
  try {
    seal.prepare("UPDATE st_governance_attempt SET state = 'aborted' WHERE attempt = 64").run()
  } finally {
    seal.close()
  }
  const exhausted = await open(first.root)
  const result = await exhausted.write({ ...input, attemptId: 'overflow' })
  expect(result.kind).toBe('committed')
  if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
  expect(result.responses[0].reply.response).toEqual({ kind: 'rejected', reason: 'limit_exceeded' })
  expect(await exhausted.read(input.identity)).toMatchObject({
    kind: 'read',
    output: {
      status: { state: 'open' },
      nextAttempt: 65,
      attempt: null,
    },
  })
})
