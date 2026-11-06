import { afterEach, expect, it } from 'vitest'
import { z } from 'zod'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { tenant, tenantCodec } from '@omne-harness/legal-identity'
import { randomIdentifiers } from '@omne-harness/identity-sql'
import {
  isStandingBinding,
  standingReservationId,
  type StandingBinding,
} from '@omne-harness/identity'
import type { CommitResultV2 } from '@omne-harness/sql-contract'
import { allocation, openIntentWorld } from './intent-world.ts'
import { source, sourceSnapshot } from './source-retention-world.ts'
import { sourceRequestSchema } from '../src/source-retention-schema.ts'
import { sourceReservationKey } from '../src/source-retention-records.ts'
import { intentCommandDigest } from '../src/intent-records.ts'
import type { ReadySettingsIntent } from '../src/intent-ready.ts'
const worlds: Awaited<ReturnType<typeof openIntentWorld>>[] = []
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.close()
})
function response(r: CommitResultV2) {
  if (r.kind !== 'committed') throw new Error(JSON.stringify(r))
  return r.responses[0]?.reply.response
}
async function setup() {
  const ids = randomIdentifiers()
  const encoded = tenantCodec.encode(tenant(ids.organization(), ids.account()))
  if (!encoded.ok) throw new Error('fixture tenant')
  const input = allocation()
  input.identity.domain.scope = { kind: 'tenant', tenant: encoded.value }
  input.intent.command.target.scopeRef = encoded.value
  input.identity.operation.target = input.intent.command.target
  input.plan.target = input.intent.command.target
  const w = await openIntentWorld(undefined, input.identity.domain)
  worlds.push(w)
  await w.write(input)
  const binding = {
    identity: input.identity,
    attemptId: input.attemptId,
    commandKind: input.intent.kind,
    commandDigest: intentCommandDigest(input.intent),
  }
  const ready: ReadySettingsIntent = {
    binding,
    basis: input.plan,
    terminal: { kind: 'open', binding },
    standing: {
      kind: 'identity',
      destination: 'settings.ready',
      scopeRef: encoded.value,
      required: [],
    },
    sources: { route: 'settings.destination', sources: [] },
  }
  const ref = { identity: input.identity, attemptId: input.attemptId }
  async function identityHeld() {
    if (ready.standing.kind !== 'identity') throw new Error('fixture standing')
    const { kind: _kind, ...standing } = ready.standing
    const planned = response(await w.standing({ kind: 'plan', input: { ...ref, ...standing } }))
    const request = z
      .object({
        request: z.object({
          binding: z.custom<StandingBinding>(isStandingBinding),
          required: z.array(z.never()),
        }),
      })
      .parse(planned).request
    const reservation = { ...request, id: standingReservationId(request.binding, request.required) }
    await w.standing({ kind: 'request', input: ref })
    await w.standing({ kind: 'held', input: { ...ref, reservation } })
  }
  async function planSources() {
    return response(await w.source({ kind: 'plan', input: { ...ref, ...ready.sources } }))
  }
  async function hold(index: number, settled = false) {
    const selected = ready.sources.sources[index]
    if (!selected) throw new Error('fixture source')
    const requested = response(
      await w.source({ kind: 'request', input: { ...ref, source: selected } }),
    )
    const request = z.object({ request: sourceRequestSchema }).parse(requested).request
    const snapshot = sourceSnapshot()
    snapshot.source = request.source
    snapshot.projection.target = request.source.target
    const receipt = settled
      ? {
          kind: 'settled' as const,
          request,
          reservationId: sourceReservationKey(request),
          outcome: 'aborted' as const,
        }
      : { kind: 'held' as const, request, reservationId: sourceReservationKey(request), snapshot }
    await w.source({ kind: 'record', input: { ...ref, receipt } })
  }
  return { w, input, ref, ready, identityHeld, planSources, hold }
}
it('requires held Identity and an explicit empty source manifest before publishing', async () => {
  const s = await setup()
  expect(response(await s.w.ready(s.ready))).toEqual({ kind: 'pending', dependency: 'identity' })
  await s.identityHeld()
  expect(response(await s.w.ready(s.ready))).toEqual({ kind: 'pending', dependency: 'sources' })
  await s.planSources()
  expect(response(await s.w.ready(s.ready))).toMatchObject({
    status: { state: 'open' },
    attempt: { status: { state: 'prepared', basis: s.ready.basis } },
  })
  expect(response(await s.w.ready(s.ready))).toMatchObject({
    attempt: { status: { state: 'prepared' } },
  })
  expect(
    response(await s.w.ready({ ...s.ready, sources: { ...s.ready.sources, route: 'different' } })),
  ).toMatchObject({ attempt: { status: { state: 'prepared' } } })
  await s.w.close()
  const sql = new DatabaseSync(
    join(s.w.root, 'domains', `${Buffer.from('intent-test').toString('hex')}.sqlite`),
    { readOnly: true },
  )
  try {
    for (const table of ['st_operations', 'st_states', 'st_changes'])
      expect(sql.prepare(`SELECT count(*) AS count FROM ${table}`).get()?.count).toBe(0)
  } finally {
    sql.close()
  }
})
it('requires every immutable source member held and refuses changed membership', async () => {
  const s = await setup()
  await s.identityHeld()
  s.ready.sources.sources = [
    source,
    { ...source, target: { ...source.target, targetRef: 'second' } },
  ]
  await s.planSources()
  await s.hold(0)
  expect(response(await s.w.ready(s.ready))).toEqual({ kind: 'pending', dependency: 'sources' })
  await s.hold(1)
  expect(
    response(await s.w.ready({ ...s.ready, sources: { ...s.ready.sources, route: 'changed' } })),
  ).toEqual({ kind: 'rejected', reason: 'operation_conflict' })
  expect(
    response(await s.w.ready({ ...s.ready, sources: { ...s.ready.sources, sources: [source] } })),
  ).toEqual({ kind: 'rejected', reason: 'operation_conflict' })
  expect(response(await s.w.ready(s.ready))).toMatchObject({
    attempt: { status: { state: 'prepared' } },
  })
})
it('does not treat a settled source as held', async () => {
  const s = await setup()
  await s.identityHeld()
  s.ready.sources.sources = [source]
  await s.planSources()
  await s.hold(0, true)
  expect(response(await s.w.ready(s.ready))).toEqual({ kind: 'pending', dependency: 'sources' })
})
it('rejects changed command, terminal binding or current basis without publishing', async () => {
  const s = await setup()
  await s.identityHeld()
  await s.planSources()
  for (const input of [
    { ...s.ready, binding: { ...s.ready.binding, commandDigest: 'e'.repeat(64) } },
    {
      ...s.ready,
      terminal: { ...s.ready.terminal, binding: { ...s.ready.binding, attemptId: 'wrong' } },
    },
    { ...s.ready, basis: { ...s.ready.basis, valueRevision: 1 } },
  ])
    expect(response(await s.w.ready(input))).toMatchObject({ kind: 'rejected' })
  expect(await s.w.read(s.input.identity)).toMatchObject({
    output: { attempt: { status: { state: 'preparing', basis: null } } },
  })
})
it('rolls readiness back and recognizes the same preparation after reopen', async () => {
  const s = await setup()
  await s.identityHeld()
  await s.planSources()
  expect((await s.w.ready(s.ready, true)).kind).toBe('rolled_back')
  await s.w.close()
  const w = await openIntentWorld(s.w.root, s.input.identity.domain)
  worlds.push(w)
  expect(await w.read(s.input.identity)).toMatchObject({
    output: { attempt: { status: { state: 'preparing', basis: null } } },
  })
  expect(response(await w.ready(s.ready))).toMatchObject({
    attempt: { status: { state: 'prepared', basis: s.ready.basis } },
  })
})
it('cannot publish a sealed attempt or use maintenance instead of change standing', async () => {
  const s = await setup()
  await s.planSources()
  expect(
    response(
      await s.w.ready({
        ...s.ready,
        standing: { kind: 'maintenance', authority: s.ready.basis.declaration },
      }),
    ),
  ).toEqual({ kind: 'pending', dependency: 'identity' })
  await s.identityHeld()
  await s.w.settle({ event: { kind: 'seal', binding: s.ready.binding }, source: { kind: 'none' } })
  expect(response(await s.w.ready(s.ready))).toMatchObject({
    kind: 'rejected',
    reason: 'basis_changed',
  })
})
it('bounds the expanded immutable request vector, not just the compact source list', async () => {
  const s = await setup()
  s.ready.sources = {
    route: 'r'.repeat(1000),
    sources: Array.from({ length: 1024 }, (_, i) => ({
      ...source,
      target: { ...source.target, targetRef: `source-${i}` },
    })),
  }
  expect(await s.planSources()).toEqual({ kind: 'rejected', reason: 'limit_exceeded' })
})
