import { afterEach, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import type { CommitResultV2 } from '@omne-harness/sql-contract'
import { allocation, openIntentWorld } from './intent-world.ts'
import { canonical, digest } from '../src/encoding.ts'
import { intentCommandDigest } from '../src/intent-records.ts'
import { sourceKey } from '../src/source-retention-records.ts'
import type { IntentSettlement } from '../src/intent-settlement.ts'

const worlds: Awaited<ReturnType<typeof openIntentWorld>>[] = []
async function open(root?: string) {
  const world = await openIntentWorld(root)
  worlds.push(world)
  return world
}
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
function binding(input = allocation()) {
  return {
    identity: input.identity,
    attemptId: input.attemptId,
    commandKind: input.intent.kind,
    commandDigest: intentCommandDigest(input.intent),
  }
}
function response(result: CommitResultV2) {
  if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
  return result.responses[0]?.reply.response
}
function seal(input = allocation()): IntentSettlement {
  return { event: { kind: 'seal', binding: binding(input) }, source: { kind: 'none' } }
}
function commit(input = allocation()): IntentSettlement {
  return {
    event: {
      kind: 'commit',
      binding: binding(input),
      result: {
        kind: 'committed',
        operationId: input.identity.operation.operationId,
        revision: 1,
        changed: true,
      },
    },
    source: { kind: 'none' },
  }
}
async function prepared() {
  const world = await open()
  const input = allocation()
  await world.write(input)
  await world.close()
  const db = new DatabaseSync(
    join(world.root, 'domains', `${Buffer.from('intent-test').toString('hex')}.sqlite`),
  )
  try {
    db.prepare(
      "UPDATE st_governance_attempt SET state = 'prepared', basis_json = ?, basis_digest = ?",
    ).run(canonical(input.plan), digest(input.plan))
  } finally {
    db.close()
  }
  return open(world.root)
}
it('seals only the exact ordinary attempt and leaves its successor unchanged', async () => {
  const w = await open()
  const input = allocation()
  await w.write(input)
  expect(response(await w.settle(seal()))).toMatchObject({
    status: { state: 'open' },
    attempt: null,
  })
  const successor = { ...input, attemptId: 'successor' }
  await w.write(successor)
  const before = await w.read(input.identity)
  for (const event of [
    seal(),
    commit(),
    { event: { kind: 'abort', binding: binding(), reason: 'forbidden' }, source: { kind: 'none' } },
  ] satisfies IntentSettlement[])
    expect(response(await w.settle(event))).toEqual({ kind: 'sealed' })
  expect(await w.read(input.identity)).toMatchObject({
    output: { attempt: { attemptId: 'successor', status: { state: 'preparing' } } },
  })
  const after = await w.read(input.identity)
  if (before.kind !== 'read' || after.kind !== 'read') throw new Error('read failed')
  expect(after.output).toEqual(before.output)
})
it('cannot commit preparing, misbound commands or another operation result', async () => {
  const w = await open()
  await w.write(allocation())
  expect(response(await w.settle(commit()))).toEqual({
    kind: 'rejected',
    reason: 'operation_conflict',
  })
  for (const changed of [
    { ...binding(), commandDigest: 'c'.repeat(64) },
    { ...binding(), commandKind: 'rebase' as const },
  ])
    expect(
      response(
        await w.settle({ event: { kind: 'seal', binding: changed }, source: { kind: 'none' } }),
      ),
    ).toEqual({ kind: 'rejected', reason: 'operation_conflict' })
  const p = await prepared()
  const event = commit().event
  if (event.kind !== 'commit') throw new Error('wrong fixture')
  expect(
    response(
      await p.settle({
        event: { ...event, result: { ...event.result, operationId: 'other' } },
        source: { kind: 'none' },
      }),
    ),
  ).toEqual({ kind: 'rejected', reason: 'operation_conflict' })
  expect(await p.read(allocation().identity)).toMatchObject({
    output: { status: { state: 'open' }, attempt: { status: { state: 'prepared' } } },
  })
})
it.each(['commit-first', 'cancel-first'] as const)(
  'preserves the first terminal through %s and reopen',
  async order => {
    const w = await prepared()
    const cancellation: IntentSettlement = {
      event: { kind: 'cancel', identity: allocation().identity },
      source: { kind: 'none' },
    }
    const [first, second] =
      order === 'commit-first' ? [commit(), cancellation] : [cancellation, commit()]
    const result = response(await w.settle(first))
    expect(result).toMatchObject({
      status: { state: order === 'commit-first' ? 'committed' : 'aborted' },
      attempt: null,
    })
    expect(response(await w.settle(second))).toEqual(result)
    await w.close()
    const reopened = await open(w.root)
    expect(response(await reopened.settle(second))).toEqual(result)
    expect(
      response(await reopened.write({ ...allocation(), attemptId: 'forbidden-revival' })),
    ).toEqual(result)
  },
)
it('cancels a root without a live attempt and persists final business failure', async () => {
  const w = await open()
  await w.write(allocation())
  await w.settle(seal())
  expect(
    response(
      await w.settle({
        event: { kind: 'cancel', identity: allocation().identity },
        source: { kind: 'none' },
      }),
    ),
  ).toMatchObject({ status: { state: 'aborted', reason: 'cancelled' }, attempt: null })
  const failed = await open()
  await failed.write(allocation())
  expect(
    response(
      await failed.settle({
        event: { kind: 'abort', binding: binding(), reason: 'forbidden' },
        source: { kind: 'none' },
      }),
    ),
  ).toMatchObject({ status: { state: 'aborted', reason: 'forbidden' }, attempt: null })
})
it('requires the matching source-owner result before closing a source-update root', async () => {
  const w = await open()
  const input = allocation()
  const source = { domain: input.identity.domain, target: input.identity.operation.target }
  input.purpose = { kind: 'source-update', sourceKey: sourceKey(source) }
  await w.write(input)
  expect(response(await w.settle(seal(input)))).toEqual({
    kind: 'rejected',
    reason: 'operation_conflict',
  })
  const finished = {
    kind: 'finished' as const,
    update: { source, identity: input.identity, commandDigest: intentCommandDigest(input.intent) },
    outcome: 'aborted' as const,
  }
  expect(
    response(await w.settle({ ...seal(input), source: { ...finished, outcome: 'committed' } })),
  ).toEqual({ kind: 'rejected', reason: 'operation_conflict' })
  expect(
    response(
      await w.settle({
        ...seal(input),
        source: { ...finished, update: { ...finished.update, commandDigest: 'f'.repeat(64) } },
      }),
    ),
  ).toEqual({ kind: 'rejected', reason: 'operation_conflict' })
  expect(response(await w.settle({ ...seal(input), source: finished }))).toMatchObject({
    status: { state: 'aborted', reason: 'sealed' },
    attempt: null,
  })
})
it('rolls back both root and attempt, then permits one finalization', async () => {
  const w = await prepared()
  expect((await w.settle(commit(), true)).kind).toBe('rolled_back')
  expect(await w.read(allocation().identity)).toMatchObject({
    output: { status: { state: 'open' }, attempt: { status: { state: 'prepared' } } },
  })
  expect(response(await w.settle(commit()))).toMatchObject({
    status: { state: 'committed' },
    attempt: null,
  })
})
it('serializes competing cancellation and commit without reviving either terminal', async () => {
  const w = await prepared()
  const results = await Promise.all([
    w.settle(commit()),
    w.settle({
      event: { kind: 'cancel', identity: allocation().identity },
      source: { kind: 'none' },
    }),
  ])
  expect(response(results[0]!)).toEqual(response(results[1]!))
  expect(response(results[0]!)).toMatchObject({ attempt: null })
})
