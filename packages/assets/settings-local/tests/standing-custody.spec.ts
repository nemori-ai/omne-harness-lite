import { afterEach, expect, it } from 'vitest'
import { z } from 'zod'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import {
  standingReservationId,
  isStandingBinding,
  type StandingBinding,
  type StandingReservation,
} from '@omne-harness/identity'
import { randomIdentifiers } from '@omne-harness/identity-sql'
import { tenant, tenantCodec } from '@omne-harness/legal-identity'
import type { CommitResultV2 } from '@omne-harness/sql-contract'
import { allocation, openIntentWorld } from './intent-world.ts'
import { openIdentityWorld } from './identity-world.ts'

const worlds: Awaited<ReturnType<typeof openIntentWorld>>[] = []
const identities: Awaited<ReturnType<typeof openIdentityWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
  for (const identity of identities.splice(0)) await identity.close()
})
function response(result: CommitResultV2) {
  if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
  return result.responses[0].reply.response
}
async function setup(scope?: string, principalRef = 'alice') {
  const ids = randomIdentifiers()
  const encoded = tenantCodec.encode(tenant(ids.organization(), ids.account()))
  if (!encoded.ok) throw new Error('fixture tenant')
  const scopeRef = scope ?? encoded.value
  const input = allocation()
  input.identity.domain.scope = { kind: 'tenant', tenant: scopeRef }
  input.identity.principalRef = principalRef
  input.intent.command.target.scopeRef = scopeRef
  input.identity.operation.target = input.intent.command.target
  input.plan.target = input.intent.command.target
  input.plan.sources[0]!.scope.subjectRef = scopeRef
  const world = await openIntentWorld(undefined, input.identity.domain)
  worlds.push(world)
  expect((await world.write(input)).kind).toBe('committed')
  const ref = { identity: input.identity, attemptId: input.attemptId }
  const plan = { ...ref, scopeRef, destination: 'settings.preferences', required: [] }
  return { world, input, ref, plan }
}
function plannedRequest(result: CommitResultV2) {
  return z
    .object({
      request: z.object({
        binding: z.custom<StandingBinding>(isStandingBinding),
        required: z.array(z.never()),
      }),
    })
    .parse(response(result)).request
}

it('persists an exact request before real Identity reserve and recognizes a lost held reply after reopen', async () => {
  const identity = await openIdentityWorld()
  identities.push(identity)
  const { world, input, ref, plan } = await setup(
    identity.change.target.scopeRef,
    identity.binding.principalRef,
  )
  const request = plannedRequest(await world.standing({ kind: 'plan', input: plan }))
  expect(request.binding.operationId).toBe(input.attemptId)
  expect(JSON.parse(request.binding.targetRef)).toMatchObject({
    kind: 'attempt',
    rootOperationId: input.identity.operation.operationId,
    commandKind: 'change',
  })
  expect(response(await world.standing({ kind: 'request', input: ref }))).toMatchObject({
    kind: 'requested',
    request,
  })
  const first = await identity.identity.reservations.reserve({
    principal: identity.principal,
    ...request,
  })
  expect(first.kind).toBe('held')
  if (first.kind !== 'held') throw new Error(JSON.stringify(first))
  await world.close()
  const reopened = await openIntentWorld(world.root, input.identity.domain)
  worlds.push(reopened)
  expect(await reopened.readStanding(ref.identity, ref.attemptId)).toMatchObject({
    kind: 'read',
    output: { kind: 'requested', request },
  })
  const recognized = await identity.identity.reservations.reserve({
    principal: identity.principal,
    ...request,
  })
  expect(recognized).toEqual(first)
  expect(
    response(
      await reopened.standing({ kind: 'held', input: { ...ref, reservation: first.reservation } }),
    ),
  ).toMatchObject({ kind: 'held', reservation: first.reservation })
  expect(await reopened.read(ref.identity)).toMatchObject({
    kind: 'read',
    output: {
      status: { state: 'open' },
      attempt: { status: { state: 'preparing', basis: null } },
    },
  })
})

it('does not replace destination or qualifications under the same attempt', async () => {
  const { world, plan, ref } = await setup()
  const original = response(await world.standing({ kind: 'plan', input: plan }))
  expect(response(await world.standing({ kind: 'plan', input: plan }))).toEqual(original)
  for (const changed of [
    { ...plan, destination: 'other-destination' },
    { ...plan, required: ['organization-settings-manage' as const] },
  ])
    expect(response(await world.standing({ kind: 'plan', input: changed }))).toEqual({
      kind: 'rejected',
      reason: 'operation_conflict',
    })
  expect(await world.readStanding(ref.identity, ref.attemptId)).toMatchObject({
    kind: 'read',
    output: original,
  })
  expect(
    await world.readStanding({ ...ref.identity, principalRef: 'other' }, ref.attemptId),
  ).toMatchObject({ kind: 'read', output: { kind: 'not_found' } })
})

it('rejects receipts before request admission and receipts for another exact binding', async () => {
  const { world, plan, ref } = await setup()
  const request = plannedRequest(await world.standing({ kind: 'plan', input: plan }))
  const reservation: StandingReservation = {
    ...request,
    id: standingReservationId(request.binding, request.required),
  }
  expect(response(await world.standing({ kind: 'held', input: { ...ref, reservation } }))).toEqual({
    kind: 'rejected',
    reason: 'operation_conflict',
  })
  await world.standing({ kind: 'request', input: ref })
  const binding = { ...request.binding, operationId: 'other-attempt' }
  const wrong: StandingReservation = {
    binding,
    required: [],
    id: standingReservationId(binding, []),
  }
  expect(
    response(await world.standing({ kind: 'held', input: { ...ref, reservation: wrong } })),
  ).toEqual({ kind: 'rejected', reason: 'operation_conflict' })
  expect(await world.readStanding(ref.identity, ref.attemptId)).toMatchObject({
    kind: 'read',
    output: { kind: 'requested' },
  })
})

it('keeps a recorded terminal receipt after a late held reply and rejects a contradictory terminal', async () => {
  const { world, plan, ref } = await setup()
  const request = plannedRequest(await world.standing({ kind: 'plan', input: plan }))
  const reservation: StandingReservation = {
    ...request,
    id: standingReservationId(request.binding, []),
  }
  await world.standing({ kind: 'request', input: ref })
  const settled = response(
    await world.standing({ kind: 'settled', input: { ...ref, reservation, outcome: 'aborted' } }),
  )
  expect(settled).toMatchObject({ kind: 'settled', outcome: 'aborted' })
  expect(response(await world.standing({ kind: 'held', input: { ...ref, reservation } }))).toEqual(
    settled,
  )
  expect(
    response(
      await world.standing({
        kind: 'settled',
        input: { ...ref, reservation, outcome: 'committed' },
      }),
    ),
  ).toEqual({ kind: 'rejected', reason: 'operation_conflict' })
  expect(await world.readStanding(ref.identity, ref.attemptId)).toMatchObject({
    kind: 'read',
    output: settled,
  })
})

it('records a late receipt on the original sealed attempt without changing its successor', async () => {
  const { world, input, ref, plan } = await setup()
  const request = plannedRequest(await world.standing({ kind: 'plan', input: plan }))
  const reservation: StandingReservation = {
    ...request,
    id: standingReservationId(request.binding, []),
  }
  await world.standing({ kind: 'request', input: ref })
  await world.close()
  const db = new DatabaseSync(
    join(world.root, 'domains', `${Buffer.from('intent-test').toString('hex')}.sqlite`),
  )
  try {
    db.prepare("UPDATE st_governance_attempt SET state = 'aborted' WHERE attempt_id = ?").run(
      input.attemptId,
    )
  } finally {
    db.close()
  }
  const reopened = await openIntentWorld(world.root, input.identity.domain)
  worlds.push(reopened)
  const successor = { ...input, attemptId: 'successor-attempt' }
  expect((await reopened.write(successor)).kind).toBe('committed')
  const before = await reopened.read(ref.identity)
  expect(before).toMatchObject({
    kind: 'read',
    output: { attempt: { attemptId: successor.attemptId, status: { state: 'preparing' } } },
  })
  expect(
    response(await reopened.standing({ kind: 'held', input: { ...ref, reservation } })),
  ).toMatchObject({ kind: 'held', reservation })
  const after = await reopened.read(ref.identity)
  if (before.kind !== 'read' || after.kind !== 'read') throw new Error('fixture read failed')
  expect(after.output).toEqual(before.output)
  expect(await reopened.readStanding(ref.identity, successor.attemptId)).toMatchObject({
    kind: 'read',
    output: { kind: 'not_found' },
  })
  expect(response(await reopened.standing({ kind: 'request', input: ref }))).toEqual({
    kind: 'rejected',
    reason: 'operation_conflict',
  })
})
