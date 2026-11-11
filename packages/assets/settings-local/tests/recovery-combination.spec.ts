import { settingsRecoveryKey } from '../src/recovery-reference.ts'
import { afterEach, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { combinationManifest } from '@omne-harness/sql-contract'
import { allocation, openIntentWorld } from './intent-world.ts'
import { openRecoveryWorld, recoveryRequest } from './recovery-world.ts'
import { canonical, digest } from '../src/encoding.ts'
import { intentCommandDigest } from '../src/intent-records.ts'
import { sourceKey, sourceReservationKey } from '../src/source-retention-records.ts'
import { sourceRequest, sourceSnapshot } from './source-retention-world.ts'
import type { RecoveryRequest } from '../src/finalization-schema.ts'
const close: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const fn of close.splice(0)) await fn()
})
async function open(root: string) {
  const w = await openRecoveryWorld(root)
  close.push(() => w.close())
  return w
}
async function seed(source = false) {
  const input = allocation()
  if (source)
    input.purpose = {
      kind: 'source-update',
      sourceKey: sourceKey({
        domain: input.identity.domain,
        target: input.identity.operation.target,
      }),
    }
  const w = await openIntentWorld()
  await w.write(input)
  await w.close()
  return { root: w.root, input, request: recoveryRequest(input) }
}
function db(root: string) {
  return new DatabaseSync(
    join(root, 'domains', `${Buffer.from('intent-test').toString('hex')}.sqlite`),
  )
}
async function seedGate(root: string, input = allocation(), held = false) {
  const migration = await open(root)
  await migration.close()
  const sql = db(root)
  const source = { domain: input.identity.domain, target: input.identity.operation.target }
  const update = {
    source,
    identity: input.identity,
    commandDigest: intentCommandDigest(input.intent),
  }
  try {
    sql
      .prepare(
        'INSERT INTO st_source_gate (source_key, source_json, pending_key, pending_json) VALUES (?, ?, ?, ?)',
      )
      .run(sourceKey(source), canonical(source), digest(update.identity), canonical(update))
    if (held) {
      const request = { ...sourceRequest(), source }
      const snapshot = sourceSnapshot()
      snapshot.source = source
      snapshot.projection.target = source.target
      sql
        .prepare(
          "INSERT INTO st_source_reservation (reservation_key,source_key,request_json,snapshot_json,state,outcome) VALUES (?, ?, ?, ?, 'held', NULL)",
        )
        .run(
          sourceReservationKey(request),
          sourceKey(source),
          canonical(request),
          canonical(snapshot),
        )
    }
  } finally {
    sql.close()
  }
}
it('runs the actual acyclic owners in dependency order, seals once and recognizes after reopen', async () => {
  const s = await seed()
  const w = await open(s.root)
  expect((await w.run(s.request)).kind).toBe('committed')
  expect(await w.read(s.request)).toMatchObject({
    kind: 'read',
    output: {
      root: { status: { state: 'open' }, attempt: null },
      terminal: { state: 'aborted', binding: s.request.binding },
    },
  })
  await w.close()
  const reopened = await open(s.root)
  expect((await reopened.run(s.request)).kind).toBe('committed')
  expect(
    combinationManifest({
      catalog: reopened.materials,
      participants: [...reopened.participants, 'settings.source-snapshot'],
    }).kind,
  ).toBe('combination_invalid')
})
it('terminates a source root and its exact gate together without releasing outstanding holds', async () => {
  const s = await seed(true)
  await seedGate(s.root, s.input, true)
  const w = await open(s.root)
  expect((await w.run(s.request)).kind).toBe('committed')
  expect(await w.read(s.request)).toMatchObject({
    kind: 'read',
    output: {
      root: { status: { state: 'aborted', reason: 'sealed' }, attempt: null },
      terminal: { state: 'aborted' },
      gate: { pending: null, held: 1 },
    },
  })
})
it('rolls back terminal, source gate and root when a later participant fails', async () => {
  const s = await seed(true)
  await seedGate(s.root, s.input)
  const w = await open(s.root)
  expect((await w.run(s.request, true)).kind).toBe('rolled_back')
  expect(await w.read(s.request)).toMatchObject({
    kind: 'read',
    output: {
      root: { status: { state: 'open' }, attempt: { status: { state: 'preparing' } } },
      terminal: null,
      gate: { pending: { identity: s.input.identity } },
    },
  })
  expect((await w.run(s.request)).kind).toBe('committed')
})
it('recognizes an old sealed attempt without changing its successor', async () => {
  const s = await seed()
  const first = await open(s.root)
  await first.run(s.request)
  await first.close()
  const allocator = await openIntentWorld(s.root)
  await allocator.write({ ...s.input, attemptId: 'successor' })
  await allocator.close()
  const w = await open(s.root)
  expect((await w.run(s.request)).kind).toBe('committed')
  expect(await w.read(s.request)).toMatchObject({
    output: {
      root: {
        status: { state: 'open' },
        attempt: { attemptId: 'successor', status: { state: 'preparing' } },
      },
      terminal: { state: 'aborted' },
    },
  })
  expect((await w.run({ ...s.request, kind: 'cancel' })).kind).toBe('rolled_back')
  const cancel: RecoveryRequest = {
    kind: 'cancel',
    binding: { ...s.request.binding, attemptId: 'successor' },
  }
  expect((await w.run(cancel)).kind).toBe('committed')
  expect(await w.read(cancel)).toMatchObject({
    output: {
      root: { status: { state: 'aborted', reason: 'cancelled' }, attempt: null },
      terminal: { state: 'aborted' },
    },
  })
})
it('cancels a root with no live attempt and rejects a stale empty selection', async () => {
  const s = await seed()
  const w = await open(s.root)
  const cancel: RecoveryRequest = {
    kind: 'cancel',
    binding: { ...s.request.binding, attemptId: null },
  }
  expect((await w.run(cancel)).kind).toBe('rolled_back')
  await w.run(s.request)
  expect((await w.run(cancel)).kind).toBe('committed')
  expect(await w.read(cancel)).toMatchObject({
    output: {
      root: { status: { state: 'aborted', reason: 'cancelled' }, attempt: null },
      terminal: null,
    },
  })
})
it('rejects changed command or participant bindings without writing a terminal', async () => {
  const s = await seed()
  const w = await open(s.root)
  const changed: RecoveryRequest = {
    kind: 'seal',
    binding: { ...s.request.binding, commandDigest: 'f'.repeat(64) },
  }
  expect((await w.run(changed)).kind).toBe('rolled_back')
  for (const participant of [
    'settings.recovery-plan',
    'settings.terminal',
    'settings.source-finalization',
    'settings.source-retention',
    'settings.persistence',
  ])
    expect((await w.run(s.request, false, { participant, request: changed })).kind).toBe(
      'rolled_back',
    )
  expect(await w.read(s.request)).toMatchObject({
    output: { root: { status: { state: 'open' } }, terminal: null },
  })
})
it('does not clear a gate owned by a later source root', async () => {
  const s = await seed(true)
  await seedGate(s.root, s.input)
  const sql = db(s.root)
  try {
    const changed = {
      source: { domain: s.input.identity.domain, target: s.input.identity.operation.target },
      identity: {
        ...s.input.identity,
        operation: { ...s.input.identity.operation, operationId: 'later-root' },
      },
      commandDigest: 'f'.repeat(64),
    }
    sql
      .prepare('UPDATE st_source_gate SET pending_key = ?, pending_json = ?')
      .run(digest(changed.identity), canonical(changed))
  } finally {
    sql.close()
  }
  const w = await open(s.root)
  expect((await w.run(s.request)).kind).toBe('rolled_back')
  expect(await w.read(s.request)).toMatchObject({
    output: {
      root: { status: { state: 'open' } },
      terminal: null,
      gate: { pending: { identity: { operation: { operationId: 'later-root' } } } },
    },
  })
})

it('keeps capture keys and a late source seal separate from newer obligations', async () => {
  const s = await seed(true)
  await seedGate(s.root, s.input)
  const sql = db(s.root)
  try {
    const capture = settingsRecoveryKey({
      domain: s.input.identity.domain,
      principalRef: s.input.identity.principalRef,
      kind: 'capture',
      operationId: s.input.attemptId,
    })
    sql
      .prepare('INSERT INTO st_terminals (operation_key, record) VALUES (?, ?)')
      .run(capture, canonical({ kind: 'capture-fixture', sentinel: 'must-not-be-read-as-attempt' }))
  } finally {
    sql.close()
  }
  const first = await open(s.root)
  expect((await first.run(s.request)).kind).toBe('committed')
  await first.close()
  const source = { domain: s.input.identity.domain, target: s.input.identity.operation.target }
  const later = {
    source,
    identity: {
      ...s.input.identity,
      operation: { ...s.input.identity.operation, operationId: 'later-source-root' },
    },
    commandDigest: 'e'.repeat(64),
  }
  const changed = db(s.root)
  try {
    changed
      .prepare('UPDATE st_source_gate SET pending_key = ?, pending_json = ?')
      .run(digest(later.identity), canonical(later))
  } finally {
    changed.close()
  }
  const reopened = await open(s.root)
  expect((await reopened.run(s.request)).kind).toBe('committed')
  expect(await reopened.read(s.request)).toMatchObject({
    output: {
      root: { status: { state: 'aborted' } },
      terminal: { state: 'aborted' },
      gate: { pending: later },
    },
  })
})
