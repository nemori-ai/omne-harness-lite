import { afterEach, expect, it } from 'vitest'
import { z } from 'zod'
import { standingReservationId, type StandingReservation } from '@omne-harness/identity'
import { standingCustodySchema } from '../src/standing-schema.ts'
import { command, binding, execution } from './operation-world.ts'
import { openStandingWorld } from './standing-world.ts'

const worlds: Awaited<ReturnType<typeof openStandingWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
async function open() {
  const world = await openStandingWorld()
  worlds.push(world)
  return world
}
async function prepare(w: Awaited<ReturnType<typeof openStandingWorld>>, id = 'one') {
  const input = command(id)
  input.principalRef = w.principalRef
  if (input.request.owner !== 'contribute') throw new Error('fixture request')
  input.request.command.scope = w.scope
  await w.call({ kind: 'accept', input })
  const operation = binding(input)
  const custody = standingCustodySchema.parse(
    await w.call({
      kind: 'standing-prepare',
      input: { operation, destination: w.destination, required: [] },
    }),
  )
  return { operation, request: custody.request }
}
async function reserve(w: Awaited<ReturnType<typeof openStandingWorld>>, id = 'one') {
  const planned = await prepare(w, id)
  const outcome = await w.identity.reservations.reserve({
    principal: w.principal,
    ...planned.request,
  })
  if (outcome.kind !== 'held') throw new Error(JSON.stringify(outcome))
  return { ...planned, reservation: outcome.reservation }
}
async function submit(
  w: Awaited<ReturnType<typeof openStandingWorld>>,
  held: Awaited<ReturnType<typeof reserve>>,
) {
  await w.call({ kind: 'standing-held', binding: held.operation, reservation: held.reservation })
  await w.call({ kind: 'submit', binding: held.operation, execution })
}

it('requires the durable held receipt even when Identity already holds the reservation', async () => {
  const w = await open(),
    held = await reserve(w)
  await w.call({ kind: 'submit', binding: held.operation, execution })
  expect(await w.call({ kind: 'standing-apply', binding: held.operation, execution })).toEqual({
    kind: 'unavailable',
    owner: 'identity-standing',
  })
  expect(await w.call({ kind: 'read', ref: held.operation.ref })).toMatchObject({
    record: { state: 'submitted' },
  })
  await w.call({ kind: 'standing-held', binding: held.operation, reservation: held.reservation })
  const committed = await w.call({ kind: 'standing-apply', binding: held.operation, execution })
  expect(committed).toMatchObject({
    record: { state: 'committed', result: { kind: 'registered', declarationRevision: 1 } },
  })
  expect(await w.identity.reservations.settle(held.reservation)).toMatchObject({
    kind: 'terminal',
    outcome: 'committed',
  })
  expect(
    await w.call({
      kind: 'standing-settled',
      binding: held.operation,
      reservation: held.reservation,
      outcome: 'committed',
    }),
  ).toMatchObject({ kind: 'settled', outcome: 'committed' })
  expect(await w.call({ kind: 'standing-apply', binding: held.operation, execution })).toEqual(
    committed,
  )
})

it('seals a requested original before releasing Identity without letting a late held reply revive it', async () => {
  const w = await open(),
    held = await reserve(w)
  expect(await w.identity.reservations.settle(held.reservation)).toMatchObject({
    kind: 'terminal',
    outcome: 'aborted',
  })
  await submit(w, held)
  expect(
    await w.call({ kind: 'standing-apply', binding: held.operation, execution }),
  ).toMatchObject({ record: { state: 'aborted' } })
  expect(
    await w.call({
      kind: 'standing-settled',
      binding: held.operation,
      reservation: held.reservation,
      outcome: 'aborted',
    }),
  ).toMatchObject({ kind: 'settled' })
  expect(
    await w.call({ kind: 'standing-held', binding: held.operation, reservation: held.reservation }),
  ).toMatchObject({ kind: 'settled' })
  expect(
    await w.identity.reservations.reserve({ principal: w.principal, ...held.request }),
  ).toMatchObject({ kind: 'terminal', outcome: 'aborted' })
})

it('rejects early settlement, a different outcome and replacement of the original request', async () => {
  const w = await open(),
    held = await reserve(w)
  const conflict = { kind: 'conflict', reason: 'operation' }
  expect(
    await w.call({
      kind: 'standing-settled',
      binding: held.operation,
      reservation: held.reservation,
      outcome: 'aborted',
    }),
  ).toEqual(conflict)
  for (const change of [{ destination: 'other' }, { required: ['organization-settings-manage'] }]) {
    expect(
      await w.call({
        kind: 'standing-prepare',
        input: { operation: held.operation, destination: w.destination, required: [], ...change },
      }),
    ).toEqual(conflict)
  }
  await w.identity.reservations.settle(held.reservation)
  expect(
    await w.call({
      kind: 'standing-settled',
      binding: held.operation,
      reservation: held.reservation,
      outcome: 'committed',
    }),
  ).toEqual(conflict)
})

it('rejects validly encoded receipts bound to another request or recovery route', async () => {
  const w = await open(),
    held = await reserve(w)
  const route = { destination: w.destination, transactionDomain: w.domain.transactionDomain }
  const changedBindings = [
    { ...held.reservation.binding, principalRef: 'other' },
    { ...held.reservation.binding, inputDigest: 'b'.repeat(64) },
    { ...held.reservation.binding, destination: 'other' },
    { ...held.reservation.binding, targetRef: '{}' },
    { ...held.reservation.binding, operationId: 'other' },
  ]
  const receipts: StandingReservation[] = changedBindings.map(binding => ({
    binding,
    required: [],
    id: standingReservationId(binding, []),
  }))
  const required = ['organization-settings-manage'] as const
  receipts.push({
    binding: held.reservation.binding,
    required,
    id: standingReservationId(held.reservation.binding, required),
  })
  for (const reservation of receipts) {
    expect(await w.call({ kind: 'standing-held', binding: held.operation, reservation })).toEqual({
      kind: 'conflict',
      reason: 'operation',
    })
    expect(await w.call({ kind: 'standing-seal', reservation, route })).toMatchObject({
      kind: 'unavailable',
    })
  }
  for (const wrong of [
    { ...route, destination: 'other' },
    { ...route, transactionDomain: 'other' },
  ]) {
    expect(
      await w.call({ kind: 'standing-seal', reservation: held.reservation, route: wrong }),
    ).toMatchObject({ kind: 'unavailable' })
  }
  expect(await w.call({ kind: 'read', ref: held.operation.ref })).toMatchObject({
    record: { state: 'accepted' },
  })
})

it('drains a real membership reservation before removing the member and fences late business', async () => {
  const w = await open(),
    held = await reserve(w)
  await submit(w, held)
  expect(await w.remove()).toEqual({ kind: 'succeeded' })
  expect(
    await w.call({ kind: 'standing-apply', binding: held.operation, execution }),
  ).toMatchObject({ record: { state: 'aborted' } })
  const next = await prepare(w, 'after-removal')
  expect(
    await w.identity.reservations.reserve({ principal: w.principal, ...next.request }),
  ).toEqual({ kind: 'denied' })
})

it('keeps revocation pending while the destination is offline and resumes the original operation', async () => {
  const w = await open(),
    held = await reserve(w)
  await submit(w, held)
  w.setAvailable(false)
  const failure = await w.remove().then(
    () => undefined,
    (error: unknown) => error,
  )
  const { operation } = z
    .object({ operation: z.object({ operationId: z.string() }) })
    .parse(failure)
  expect(await w.resume(operation)).toEqual({ kind: 'pending', operation })
  const next = await prepare(w, 'during-drain')
  expect(
    await w.identity.reservations.reserve({ principal: w.principal, ...next.request }),
  ).toEqual({ kind: 'blocked' })
  w.setAvailable(true)
  expect(await w.resume(operation)).toEqual({
    kind: 'finished',
    operation,
    outcome: { kind: 'succeeded' },
  })
  expect(
    await w.call({ kind: 'standing-apply', binding: held.operation, execution }),
  ).toMatchObject({ record: { state: 'aborted' } })
  expect(await w.identity.reservations.settle(held.reservation)).toMatchObject({
    kind: 'terminal',
    outcome: 'aborted',
  })
})

it('serializes a real Identity settlement against the business transaction into one terminal', async () => {
  const w = await open(),
    held = await reserve(w)
  await submit(w, held)
  const [business, settlement] = await Promise.all([
    w.call({ kind: 'standing-apply', binding: held.operation, execution }),
    w.identity.reservations.settle(held.reservation),
  ])
  const state = z
    .object({ record: z.object({ state: z.enum(['committed', 'aborted']) }) })
    .parse(business).record.state
  expect(settlement).toMatchObject({ kind: 'terminal', outcome: state })
  expect(await w.call({ kind: 'standing-apply', binding: held.operation, execution })).toEqual(
    business,
  )
})
