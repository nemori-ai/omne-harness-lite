import { afterEach, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { z } from 'zod'
import { tenant, tenantCodec } from '@omne-harness/legal-identity'
import { randomIdentifiers } from '@omne-harness/identity-sql'
import {
  isStandingBinding,
  standingReservationId,
  type StandingBinding,
} from '@omne-harness/identity'
import { allocation } from './intent-world.ts'
import { openRecoveryWorld, recoveryRequest } from './recovery-world.ts'
import { reply } from './preparation-world.ts'
import { sourceRoot, stored } from './business-world.ts'
import { definition } from './world.ts'
import { source, sourceSnapshot } from './source-retention-world.ts'
import { sourceRequestSchema } from '../src/source-retention-schema.ts'
import { sourceReservationKey } from '../src/source-retention-records.ts'
import { intentCommandDigest } from '../src/intent-records.ts'
import type { CheckpointRequest } from '../src/checkpoint-schema.ts'
import type { ReadySettingsIntent } from '../src/ready-schema.ts'
const close: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const fn of close.splice(0)) await fn()
})
async function setup(asSource = false) {
  const input = allocation()
  const ids = randomIdentifiers()
  const encoded = tenantCodec.encode(tenant(ids.organization(), ids.account()))
  if (!encoded.ok) throw new Error('Invalid fixture tenant')
  input.identity.domain.scope = { kind: 'tenant', tenant: encoded.value }
  input.intent.command.target.scopeRef = encoded.value
  if (asSource) sourceRoot(input)
  const parent = fileURLToPath(
    new URL('../../../../tmp/closures/settings-checkpoint/databases/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  const root = realpathSync(mkdtempSync(join(parent, 'case-')))
  const w = await openRecoveryWorld(root, input.identity.domain)
  close.push(() => w.close())
  const binding = recoveryRequest(input).binding
  const request: CheckpointRequest = {
    kind: 'checkpoint',
    binding,
    command: { kind: 'allocate', input },
  }
  const ref = { identity: input.identity, attemptId: input.attemptId }
  const run = (command: CheckpointRequest['command']) =>
    w.checkpoint({ kind: 'checkpoint', binding, command })
  const current: Omit<ReadySettingsIntent, 'terminal'> = {
    binding,
    basis: input.plan,
    standing: {
      kind: 'identity',
      destination: 'settings.ready',
      scopeRef: encoded.value,
      required: [],
    },
    sources: { route: 'settings.destination', sources: [] },
  }
  return { w, input, request, ref, binding, run, current, scopeRef: encoded.value }
}
async function standing(s: Awaited<ReturnType<typeof setup>>) {
  const plan = await s.run({
    kind: 'standing-plan',
    input: { ...s.ref, destination: 'settings.ready', scopeRef: s.scopeRef, required: [] },
  })
  const { result } = z
    .object({
      result: z.object({
        request: z.object({
          binding: z.custom<StandingBinding>(isStandingBinding),
          required: z.array(z.never()),
        }),
      }),
    })
    .parse(reply(plan))
  return {
    ...result.request,
    id: standingReservationId(result.request.binding, result.request.required),
  }
}
it('allocates and recognizes concurrent original work and survives reopen without fixtures writing owner tables', async () => {
  const s = await setup()
  const other = structuredClone(s.request)
  other.binding.attemptId = 'another-attempt'
  other.command.input.attemptId = 'another-attempt'
  const results = await Promise.all([s.w.checkpoint(s.request), s.w.checkpoint(other)])
  const attempts = results.map(
    r =>
      z
        .object({ result: z.object({ attempt: z.object({ attemptId: z.string() }) }) })
        .parse(reply(r)).result.attempt.attemptId,
  )
  expect(new Set(attempts).size).toBe(1)
  await s.w.close()
  const w = await openRecoveryWorld(s.w.root, s.input.identity.domain)
  close.push(() => w.close())
  expect(reply(await w.checkpoint(s.request))).toMatchObject({
    result: { attempt: { attemptId: attempts[0] } },
  })
  expect(await w.read(recoveryRequest(s.input))).toMatchObject({
    output: { terminal: null, gate: { pending: null }, root: { nextAttempt: 2 } },
  })
})
it('rolls back allocation and source gate together, then cancels both without reopening them on retry', async () => {
  const s = await setup(true)
  expect((await s.w.checkpoint(s.request, { rollback: true })).kind).toBe('rolled_back')
  expect(await s.w.read(recoveryRequest(s.input))).toMatchObject({
    output: { root: { kind: 'not_found' }, gate: { pending: null } },
  })
  expect(reply(await s.w.checkpoint(s.request))).toMatchObject({
    result: { status: { state: 'open' } },
  })
  expect(await s.w.read(recoveryRequest(s.input))).toMatchObject({
    output: { gate: { pending: { identity: s.input.identity } } },
  })
  expect((await s.w.run({ kind: 'cancel', binding: s.binding })).kind).toBe('committed')
  expect(reply(await s.w.checkpoint(s.request))).toMatchObject({
    result: { status: { state: 'aborted', reason: 'cancelled' } },
  })
  expect(await s.w.read(recoveryRequest(s.input))).toMatchObject({
    output: { gate: { pending: null }, terminal: { state: 'aborted' } },
  })
})
it('refuses competing source roots and changed commands without leaving a new intent', async () => {
  const s = await setup(true)
  await s.w.checkpoint(s.request)
  const other = structuredClone(s.request)
  if (other.command.kind !== 'allocate') throw new Error('allocation fixture')
  other.command.input.identity.operation.operationId = 'another-root'
  other.command.input.intent.command.operationId = 'another-root'
  other.command.input.attemptId = 'another-attempt'
  other.binding = recoveryRequest(other.command.input).binding
  expect((await s.w.checkpoint(other)).kind).toBe('rolled_back')
  expect(await s.w.read({ kind: 'seal', binding: other.binding })).toMatchObject({
    output: { root: { kind: 'not_found' } },
  })
  const changed = structuredClone(s.request)
  if (changed.command.kind !== 'allocate' || changed.command.input.intent.kind !== 'change')
    throw new Error('change fixture')
  changed.command.input.intent.command.action = { kind: 'set', value: false }
  changed.binding.commandDigest = intentCommandDigest(changed.command.input.intent)
  expect((await s.w.checkpoint(changed)).kind).toBe('rolled_back')
})
it('requires the exact trusted checkpoint and command binding before allocating', async () => {
  const s = await setup()
  expect((await s.w.checkpoint(s.request, { omitAdmission: true })).kind).toBe(
    'rejected_before_accept',
  )
  const other = structuredClone(s.request)
  other.binding.commandDigest = 'a'.repeat(64)
  expect((await s.w.checkpoint(s.request, { admitted: other })).kind).toBe('rolled_back')
  expect((await s.w.checkpoint(other)).kind).toBe('rolled_back')
  other.binding = { ...s.binding, attemptId: 'wrong-attempt' }
  expect((await s.w.checkpoint(other)).kind).toBe('rolled_back')
  expect(await s.w.read(recoveryRequest(s.input))).toMatchObject({
    output: { root: { kind: 'not_found' }, terminal: null },
  })
})
it('commits a value through allocation, custody, ready and business production combinations', async () => {
  const s = await setup()
  await s.w.checkpoint(s.request)
  const reservation = await standing(s)
  expect((await s.run({ kind: 'standing-held', input: { ...s.ref, reservation } })).kind).toBe(
    'rolled_back',
  )
  await s.run({ kind: 'standing-request', input: s.ref })
  await s.run({ kind: 'standing-held', input: { ...s.ref, reservation } })
  await s.run({ kind: 'sources-plan', input: { ...s.ref, ...s.current.sources } })
  expect(reply(await s.w.ready(s.current))).toMatchObject({
    result: { attempt: { status: { state: 'prepared' } } },
  })
  expect(
    reply(
      await s.w.commit({
        binding: s.binding,
        observation: {
          kind: 'available',
          material: {
            basis: s.current.basis,
            standing: s.current.standing,
            sources: s.current.sources,
            definition,
            grants: [{ sourceId: 'tenant', actions: ['set', 'clear', 'lock', 'unlock'] }],
          },
        },
      }),
    ),
  ).toMatchObject({ result: { status: { state: 'committed' } } })
  expect(
    reply(
      await s.run({
        kind: 'standing-settled',
        input: { ...s.ref, reservation, outcome: 'committed' },
      }),
    ),
  ).toMatchObject({ result: { kind: 'settled', outcome: 'committed' } })
  await s.w.close()
  expect(stored(s.w.root)).toMatchObject({
    operations: 1,
    changes: 1,
    terminals: 1,
    state: { state: { revision: 1 } },
  })
})
it('retains late standing receipts after cancellation and requires the exact terminal outcome', async () => {
  const s = await setup()
  await s.w.checkpoint(s.request)
  const reservation = await standing(s)
  await s.run({ kind: 'standing-request', input: s.ref })
  expect(
    (
      await s.run({
        kind: 'standing-settled',
        input: { ...s.ref, reservation, outcome: 'aborted' },
      })
    ).kind,
  ).toBe('rolled_back')
  await s.w.run({ kind: 'cancel', binding: s.binding })
  expect(
    reply(await s.run({ kind: 'standing-held', input: { ...s.ref, reservation } })),
  ).toMatchObject({ result: { kind: 'held' } })
  expect(
    (
      await s.run({
        kind: 'standing-settled',
        input: { ...s.ref, reservation, outcome: 'committed' },
      })
    ).kind,
  ).toBe('rolled_back')
  expect(
    reply(
      await s.run({
        kind: 'standing-settled',
        input: { ...s.ref, reservation, outcome: 'aborted' },
      }),
    ),
  ).toMatchObject({ result: { kind: 'settled', outcome: 'aborted' } })
  expect(
    reply(await s.run({ kind: 'standing-held', input: { ...s.ref, reservation } })),
  ).toMatchObject({ result: { kind: 'settled' } })
  expect(await s.w.read(recoveryRequest(s.input))).toMatchObject({
    output: { root: { status: { state: 'aborted' }, attempt: null } },
  })
})
it('freezes source requests before calls and records late receipts without reviving sealed attempts', async () => {
  const s = await setup()
  await s.w.checkpoint(s.request)
  const plan = { ...s.ref, route: 'settings.destination', sources: [source] }
  await s.run({ kind: 'sources-plan', input: plan })
  expect((await s.run({ kind: 'sources-plan', input: { ...plan, sources: [] } })).kind).toBe(
    'rolled_back',
  )
  const requested = reply(await s.run({ kind: 'source-request', input: { ...s.ref, source } }))
  const {
    result: { request },
  } = z.object({ result: z.object({ request: sourceRequestSchema }) }).parse(requested)
  const reservationId = sourceReservationKey(request)
  const receipt = { kind: 'held' as const, request, reservationId, snapshot: sourceSnapshot() }
  await s.w.run({ kind: 'seal', binding: s.binding })
  expect(reply(await s.run({ kind: 'source-record', input: { ...s.ref, receipt } }))).toMatchObject(
    { result: { kind: 'held' } },
  )
  const settled = { kind: 'settled' as const, request, reservationId, outcome: 'aborted' as const }
  expect(
    reply(await s.run({ kind: 'source-record', input: { ...s.ref, receipt: settled } })),
  ).toMatchObject({ result: settled })
  expect((await s.w.checkpoint(s.request)).kind).toBe('rolled_back')
  const next = structuredClone(s.request)
  next.binding.attemptId = 'successor'
  next.command.input.attemptId = 'successor'
  expect(reply(await s.w.checkpoint(next))).toMatchObject({
    result: { attempt: { attemptId: 'successor', status: { state: 'preparing' } } },
  })
  expect(reply(await s.run({ kind: 'source-record', input: { ...s.ref, receipt } }))).toMatchObject(
    { result: { kind: 'settled' } },
  )
  expect(await s.w.read(recoveryRequest(s.input))).toMatchObject({
    output: { root: { attempt: { attemptId: 'successor' } } },
  })
})

it('reads persisted preparation and custody without advancing or settling them', async () => {
  const s = await setup()
  await s.w.checkpoint(s.request)
  const reservation = await standing(s)
  const before = await s.w.observePreparation({ kind: 'root', identity: s.input.identity })
  expect(before).toMatchObject({
    output: { status: { state: 'open' }, attempt: { status: { state: 'preparing' } } },
  })
  expect(await s.w.observePreparation({ kind: 'attempt', input: s.ref })).toMatchObject({
    output: { attempt: { attemptId: s.ref.attemptId } },
  })
  expect(await s.w.observePreparation({ kind: 'standing', input: s.ref })).toMatchObject({
    output: { kind: 'planned', reservationId: reservation.id },
  })
  await s.run({
    kind: 'sources-plan',
    input: { ...s.ref, route: 'settings.destination', sources: [source] },
  })
  expect(
    await s.w.observePreparation({ kind: 'source', input: { ...s.ref, source } }),
  ).toMatchObject({ output: { kind: 'planned' } })
  const page = await s.w.observePreparation({
    kind: 'sources',
    input: { ...s.ref, after: null, limit: 1 },
  })
  const parsed = z
    .object({
      output: z.object({
        after: z.string(),
        items: z.array(z.object({ state: z.literal('planned') })).length(1),
      }),
    })
    .parse(page)
  expect(
    await s.w.observePreparation({
      kind: 'sources',
      input: { ...s.ref, after: parsed.output.after, limit: 1 },
    }),
  ).toMatchObject({ output: { items: [], after: null } })
  const after = await s.w.observePreparation({ kind: 'root', identity: s.input.identity })
  if (before.kind !== 'read' || after.kind !== 'read') throw new Error('Preparation read failed')
  expect(after.output).toEqual(before.output)
  expect(
    await s.w.observePreparation({
      kind: 'root',
      identity: { ...s.input.identity, principalRef: 'other' },
    }),
  ).toMatchObject({ output: { kind: 'not_found' } })
  expect(await s.w.read(recoveryRequest(s.input))).toMatchObject({ output: { terminal: null } })
})

it('rolls back custody checkpoints and rejects reclassification of the original root', async () => {
  const s = await setup()
  await s.w.checkpoint(s.request)
  const command: CheckpointRequest['command'] = {
    kind: 'sources-plan',
    input: { ...s.ref, route: 'settings.destination', sources: [source] },
  }
  expect(
    (await s.w.checkpoint({ kind: 'checkpoint', binding: s.binding, command }, { rollback: true }))
      .kind,
  ).toBe('rolled_back')
  expect(
    await s.w.observePreparation({ kind: 'sources', input: { ...s.ref, after: null, limit: 64 } }),
  ).toMatchObject({ output: { kind: 'not_found' } })
  const changed = structuredClone(s.request)
  if (changed.command.kind !== 'allocate') throw new Error('allocation fixture')
  sourceRoot(changed.command.input)
  expect((await s.w.checkpoint(changed)).kind).toBe('rolled_back')
  expect(await s.w.read(recoveryRequest(s.input))).toMatchObject({
    output: { gate: { pending: null }, root: { purpose: { kind: 'target-change' } } },
  })
})

it('does not leave a source gate behind when allocation fails after the source writer', async () => {
  const s = await setup()
  await s.w.checkpoint(s.request)
  const other = structuredClone(s.request)
  if (other.command.kind !== 'allocate') throw new Error('allocation fixture')
  other.command.input.identity.operation.operationId = 'colliding-attempt-root'
  other.command.input.intent.command.operationId = 'colliding-attempt-root'
  sourceRoot(other.command.input)
  other.binding = recoveryRequest(other.command.input).binding
  expect((await s.w.checkpoint(other)).kind).toBe('rolled_back')
  expect(await s.w.read({ kind: 'seal', binding: other.binding })).toMatchObject({
    output: { root: { kind: 'not_found' }, gate: { pending: null } },
  })
})
