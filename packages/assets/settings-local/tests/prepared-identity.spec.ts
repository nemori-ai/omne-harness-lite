import { afterEach, expect, it } from 'vitest'
import { z } from 'zod'
import { standingPrincipalRef, type StandingReservation } from '@omne-harness/identity'
import { createIdentityQualifiedSettingsPreparation } from '../src/preparation.ts'
import { openPreparedServiceWorld } from './prepared-service-world.ts'
import { openIdentityWorld } from './identity-world.ts'
import { stored } from './business-world.ts'
const close: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const fn of close.splice(0).reverse()) await fn()
})
async function open(blockCommit = false, fixedGrant = false) {
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const identity = await openIdentityWorld()
  close.push(() => identity.close())
  const w = await openPreparedServiceWorld(undefined, {
    scopeRef: identity.scopeRef,
    principalRef: identity.principalRef,
  })
  close.push(() => w.close())
  const { standing: _, ...base } = w.options
  const reservations: StandingReservation[] = []
  const backend = createIdentityQualifiedSettingsPreparation({
    required: [],
    identity: {
      verifier: identity.authority.verifier,
      standing: identity.identity.standing,
      reservations: {
        ...identity.identity.reservations,
        async reserve(input) {
          const result = await identity.identity.reservations.reserve(input)
          if (result.kind === 'held') reservations.push(result.reservation)
          return result
        },
      },
    },
    backend: {
      ...base,
      storage: {
        ...base.storage,
        async commit(request) {
          if (blockCommit && request.identity.operation === 'settings.attempt.commit') {
            entered.resolve()
            await release.promise
          }
          return base.storage.commit(request)
        },
      },
      access: {
        authorize: (principal, request) =>
          base.access.authorize(
            {
              allowed: true,
              // `fixedGrant`: the access source names the first principal whoever calls.
              principalRef: standingPrincipalRef(fixedGrant ? identity.principal : principal),
            },
            request,
          ),
      },
      plan: (_principal, input) => base.plan(w.context, input),
      currentCommands: (_principal, input) => base.currentCommands(w.context, input),
      sources: {
        reserve: (_principal, request) => base.sources.reserve(w.context, request),
        settle: base.sources.settle,
      },
    },
  })
  close.push(() => backend.control.close())
  identity.setResolver(backend.control.destination)
  return { w, identity, backend, reservations, principal: identity.principal, entered, release }
}
it('real Identity removal seals a prepared attempt without reacquiring withdrawn qualification', async () => {
  const s = await open()
  const prepared = await s.backend.service.prepareChange(s.principal, s.w.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  expect(s.reservations).toHaveLength(1)
  expect(await s.identity.remove()).toEqual({ kind: 'succeeded' })
  expect(await s.backend.control.destination.seal(s.reservations[0]!)).toMatchObject({
    kind: 'terminal',
    outcome: 'aborted',
  })
  expect(
    await s.backend.service.commitChange(s.principal, {
      requestId: 'late',
      preparation: prepared.preparation,
    }),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
  await s.w.close()
  expect(stored(s.w.root)).toMatchObject({ operations: 0, changes: 0, terminals: 1 })
})
it('real Identity settlement preserves a committed result and later queries still reauthorize', async () => {
  const s = await open()
  const prepared = await s.backend.service.prepareChange(s.principal, s.w.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  expect(
    await s.backend.service.commitChange(s.principal, {
      requestId: 'commit',
      preparation: prepared.preparation,
    }),
  ).toMatchObject({ kind: 'committed', revision: 1 })
  expect(await s.identity.remove()).toEqual({ kind: 'succeeded' })
  expect(await s.backend.control.destination.seal(s.reservations[0]!)).toMatchObject({
    kind: 'terminal',
    outcome: 'committed',
  })
  expect(await s.backend.service.getOperation(s.principal, prepared.preparation.operation)).toEqual(
    { kind: 'rejected', reason: 'forbidden' },
  )
})
it('a reservation for a different destination cannot route to a matching literal attempt', async () => {
  const s = await open()
  const prepared = await s.backend.service.prepareChange(s.principal, s.w.command)
  expect(prepared.kind).toBe('prepared')
  const reservation = s.reservations[0]!
  expect(
    await s.backend.control.destination.seal({
      ...reservation,
      binding: { ...reservation.binding, destination: 'other' },
    }),
  ).toMatchObject({ kind: 'unavailable' })
  expect(
    await s.backend.service.getOperation(s.principal, {
      target: s.w.command.target,
      operationId: s.w.command.operationId,
    }),
  ).toMatchObject({ kind: 'pending', attempt: { state: 'prepared' } })
})

it('real revocation can finish while the protected commit is paused before SQL acceptance', async () => {
  const s = await open(true)
  const prepared = await s.backend.service.prepareChange(s.principal, s.w.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  const pending = s.backend.service.commitChange(s.principal, {
    requestId: 'delayed',
    preparation: prepared.preparation,
  })
  await s.entered.promise
  try {
    expect(await s.identity.remove()).toEqual({ kind: 'succeeded' })
    expect(await s.backend.control.destination.seal(s.reservations[0]!)).toMatchObject({
      kind: 'terminal',
      outcome: 'aborted',
    })
  } finally {
    s.release.resolve()
  }
  expect((await pending).kind).not.toBe('committed')
  await s.w.close()
  expect(stored(s.w.root)).toMatchObject({ operations: 0, changes: 0, terminals: 1 })
})

it('an unavailable destination keeps revocation pending and blocks new reservations until recovery', async () => {
  const s = await open(true)
  const prepared = await s.backend.service.prepareChange(s.principal, s.w.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  const pending = s.backend.service.commitChange(s.principal, {
    requestId: 'delayed',
    preparation: prepared.preparation,
  })
  await s.entered.promise
  try {
    s.identity.setAvailable(false)
    let failed: unknown
    try {
      await s.identity.remove()
    } catch (error) {
      failed = error
    }
    expect(failed).toBeInstanceOf(Error)
    const failure = z.object({ operation: z.object({ operationId: z.string() }) }).parse(failed)
    // The revocation is not finished: Identity gives no new reservation for this standing.
    expect(
      await s.backend.service.prepareChange(s.principal, {
        ...s.w.command,
        requestId: 'new-request',
        operationId: 'new-operation',
      }),
    ).toEqual({ kind: 'rejected', reason: 'basis_changed' })
    s.identity.setAvailable(true)
    expect(
      await s.identity.identity.governanceRecovery.resume({
        login: s.identity.administratorLogin,
        operation: failure.operation,
      }),
    ).toMatchObject({ kind: 'finished', outcome: { kind: 'succeeded' } })
  } finally {
    s.identity.setAvailable(true)
    s.release.resolve()
  }
  expect((await pending).kind).not.toBe('committed')
  await s.w.close()
  expect(stored(s.w.root)).toMatchObject({ operations: 0, changes: 0 })
})

it('refuses a read by another issued work principal when the access grant names the first one', async () => {
  const s = await open(false, true)
  const prepared = await s.backend.service.prepareChange(s.principal, s.w.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  expect(
    await s.backend.service.commitChange(s.principal, {
      requestId: 'commit',
      preparation: prepared.preparation,
    }),
  ).toMatchObject({ kind: 'committed' })
  const { issuer } = s.identity.authority
  const actor = issuer.issueSystem({ component: 'other-work' })
  if (!('ok' in actor)) throw new Error('actor')
  const issued = issuer.issueActingForTenant({
    actor: actor.ok,
    tenant: s.principal.tenant,
    work: { owner: 'settings', work: 'other' },
  })
  if (!('ok' in issued)) throw new Error('principal')
  expect(standingPrincipalRef(issued.ok)).not.toBe(standingPrincipalRef(s.principal))
  const { target, operationId } = s.w.command
  expect(await s.backend.service.getOperation(issued.ok, { target, operationId })).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
  expect(await s.backend.service.getOperation(s.principal, { target, operationId })).toMatchObject({
    kind: 'committed',
  })
})
