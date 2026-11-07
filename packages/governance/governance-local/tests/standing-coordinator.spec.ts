import { afterEach, expect, it } from 'vitest'
import {
  standingReservationId,
  type StandingReservation,
  type StandingReservations,
} from '@omne-harness/identity'
import type { SqlStorage } from '@omne-harness/sql-contract'
import {
  GovernanceStandingCoordinator,
  GovernanceStandingDestination,
} from '../src/standing-coordinator.ts'
import { SqlOperationCoordinator } from '../src/sql-coordinator.ts'
import { controlRequestSchema } from '../src/activation-schema.ts'
import { persistStageSchema } from '../src/sql-stage-schema.ts'
import { standingCustodySchema } from '../src/standing-schema.ts'
import { command, binding } from './operation-world.ts'
import { openActivation } from './activation-world.ts'
import { openStandingWorld } from './standing-world.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close()
})
function sqlFor(w: Awaited<ReturnType<typeof openActivation>>, storage = w.storage) {
  const { combinationVersion, manifestDigest } = w.combination('metadata')
  return new SqlOperationCoordinator({
    storage,
    domain: w.domain,
    metadata: { combinationVersion, manifestDigest },
  })
}
async function setup() {
  let activation: Awaited<ReturnType<typeof openActivation>> | undefined
  let activationOptions: Parameters<typeof openActivation>[1]
  const base = await openStandingWorld({
    async openWorld(options) {
      activationOptions = options
      const a = await openActivation(undefined, options)
      activation = a
      return { ...a, call: raw => a.control(controlRequestSchema.parse(raw)) }
    },
    resolver() {
      if (activation === undefined) throw new Error('activation not opened')
      return new GovernanceStandingDestination(sqlFor(activation), {
        destination: 'governance-contributions',
        transactionDomain: activation.domain.transactionDomain,
      })
    },
  })
  if (activation === undefined) throw new Error('activation not opened')
  let a = activation
  let identity = base.identity
  let sql = sqlFor(a)
  let driver = new GovernanceStandingCoordinator(sql, identity.reservations)
  cleanups.push(async () => {
    identity.stop()
    await a.close(false)
    await base.close()
  })
  async function accepted(id = 'one') {
    const input = command(id)
    input.principalRef = base.principalRef
    if (input.request.owner !== 'contribute') throw new Error('contribute fixture')
    input.request.command.scope = base.scope
    expect(await sql.accept(input)).toMatchObject({ kind: 'found', record: { state: 'accepted' } })
    return { operation: binding(input), destination: base.destination, required: [] }
  }
  async function planned(id = 'one') {
    const plan = await accepted(id)
    const result = await sql.executeControl(plan.operation, {
      kind: 'standing-prepare',
      input: plan,
    })
    if (result.kind !== 'applied') throw new Error(JSON.stringify(result))
    const custody = standingCustodySchema.parse(result.response)
    return { plan, request: custody.request }
  }
  async function submitted(plan: Awaited<ReturnType<typeof accepted>>) {
    expect(await driver.reserve(plan, base.principal)).toMatchObject({ kind: 'held' })
    const request = { binding: plan.operation, execution: a.execution('mutation') }
    expect(await sql.executeControl(plan.operation, { kind: 'submit', ...request })).toMatchObject({
      kind: 'applied',
    })
    expect(
      await sql.save(
        persistStageSchema.parse({
          binding: plan.operation,
          stage: 'apply',
          envelope: a.envelope('mutation', request),
        }),
      ),
    ).toMatchObject({ kind: 'stored' })
    return request
  }
  return {
    ...base,
    accepted,
    planned,
    submitted,
    get sql() {
      return sql
    },
    get driver() {
      return driver
    },
    get identity() {
      return identity
    },
    get activation() {
      return a
    },
    async reopen() {
      identity.stop()
      await a.close(false)
      a = await openActivation(a.root, activationOptions)
      sql = sqlFor(a)
      const destination = new GovernanceStandingDestination(sql, {
        destination: base.destination,
        transactionDomain: a.domain.transactionDomain,
      })
      identity = base.reassemble(a.storage, destination)
      driver = new GovernanceStandingCoordinator(sql, identity.reservations)
    },
  }
}
function overridden(
  source: StandingReservations,
  overrides: Partial<StandingReservations>,
): StandingReservations {
  return {
    reserve: input => source.reserve(input),
    settle: input => source.settle(input),
    recover: input => source.recover(input),
    ...overrides,
  }
}

it('uses real Identity and production Governance planners for held, business commit and settlement', async () => {
  const w = await setup(),
    plan = await w.accepted()
  await w.submitted(plan)
  expect(await w.sql.send(plan.operation, 'apply')).toMatchObject({
    kind: 'applied',
    response: { record: { state: 'committed' } },
  })
  expect(await w.driver.settle(plan.operation)).toMatchObject({
    kind: 'settled',
    outcome: 'committed',
  })
  expect(await w.sql.observe(plan.operation)).toMatchObject({
    kind: 'found',
    record: { state: 'committed' },
    standing: { kind: 'settled' },
  })
})

it('recovers a durable never-sent request after Worker reopen without issuing a principal', async () => {
  const w = await setup(),
    prepared = await w.planned()
  await w.reopen()
  expect(await w.driver.settle(prepared.plan.operation)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
  expect(
    await w.identity.reservations.reserve({ principal: w.principal, ...prepared.request }),
  ).toMatchObject({ kind: 'terminal', outcome: 'aborted' })
  expect(await w.sql.observe(prepared.plan.operation)).toMatchObject({
    record: { state: 'aborted' },
    standing: { kind: 'settled' },
  })
})

it('recovers a real held reservation whose reply was lost before destination custody', async () => {
  const w = await setup(),
    plan = await w.accepted()
  const driver = new GovernanceStandingCoordinator(
    w.sql,
    overridden(w.identity.reservations, {
      async reserve(input) {
        await w.identity.reservations.reserve(input)
        throw new Error('reply lost')
      },
    }),
  )
  expect(await driver.reserve(plan, w.principal)).toEqual({
    kind: 'unavailable',
    owner: 'identity-standing',
  })
  expect(await w.sql.observe(plan.operation)).toMatchObject({ standing: { kind: 'requested' } })
  await w.reopen()
  expect(await w.driver.settle(plan.operation)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
})

it('does not downgrade settled custody when an earlier held response arrives late', async () => {
  const w = await setup(),
    plan = await w.accepted()
  const entered = Promise.withResolvers<void>(),
    resume = Promise.withResolvers<void>()
  const driver = new GovernanceStandingCoordinator(
    w.sql,
    overridden(w.identity.reservations, {
      async reserve(input) {
        const result = await w.identity.reservations.reserve(input)
        entered.resolve()
        await resume.promise
        return result
      },
    }),
  )
  const pending = driver.reserve(plan, w.principal)
  await entered.promise
  expect(await w.driver.settle(plan.operation)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
  resume.resolve()
  expect(await pending).toMatchObject({ kind: 'settled', outcome: 'aborted' })
})

it('lets revocation seal the original before business and prevents late apply', async () => {
  const w = await setup(),
    plan = await w.accepted()
  await w.submitted(plan)
  expect(await w.remove()).toMatchObject({ kind: 'succeeded' })
  expect(await w.sql.send(plan.operation, 'apply')).toMatchObject({
    kind: 'applied',
    response: { record: { state: 'aborted' } },
  })
  expect(await w.driver.settle(plan.operation)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
})

it('retains the request while its real destination is unavailable, then resumes', async () => {
  const w = await setup(),
    plan = await w.accepted()
  expect(await w.driver.reserve(plan, w.principal)).toMatchObject({ kind: 'held' })
  w.setAvailable(false)
  expect(await w.driver.settle(plan.operation)).toEqual({
    kind: 'unavailable',
    owner: 'identity-standing',
  })
  expect(await w.sql.observe(plan.operation)).toMatchObject({
    record: { state: 'accepted' },
    standing: { kind: 'held' },
  })
  w.setAvailable(true)
  expect(await w.driver.settle(plan.operation)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
})

it('rejects changed qualifiers or a copied principal and preserves recoverable requests', async () => {
  const w = await setup(),
    plan = await w.accepted()
  expect(await w.driver.reserve(plan, structuredClone(w.principal))).toEqual({
    kind: 'rejected',
    reason: 'denied',
  })
  expect(
    await w.driver.reserve({ ...plan, required: ['organization-settings-manage'] }, w.principal),
  ).toEqual({ kind: 'conflict', reason: 'operation' })
  expect(await w.driver.settle(plan.operation)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
})

it('does not store an otherwise valid Identity receipt for a different request', async () => {
  const w = await setup(),
    plan = await w.accepted()
  const driver = new GovernanceStandingCoordinator(
    w.sql,
    overridden(w.identity.reservations, {
      async reserve(input) {
        const binding = { ...input.binding, inputDigest: 'other' }
        return {
          kind: 'held',
          reservation: {
            binding,
            required: input.required,
            id: standingReservationId(binding, input.required),
          },
        }
      },
    }),
  )
  expect(await driver.reserve(plan, w.principal)).toEqual({
    kind: 'unavailable',
    owner: 'identity-standing',
  })
  expect(await w.sql.observe(plan.operation)).toMatchObject({ standing: { kind: 'requested' } })
})

it('rejects wrongly bound recovery routes before calling storage', async () => {
  const w = await setup(),
    prepared = await w.planned()
  let calls = 0
  const storage: SqlStorage = {
    ...w.activation.storage,
    async read(input, options) {
      calls += 1
      return w.activation.storage.read(input, options)
    },
  }
  const destination = new GovernanceStandingDestination(sqlFor(w.activation, storage), {
    destination: w.destination,
    transactionDomain: w.domain.transactionDomain,
  })
  for (const change of [
    { owner: 'other' },
    { destination: 'other' },
    { scopeRef: 'other' },
    { principalRef: 'other' },
    { inputDigest: 'other' },
    { targetRef: '{}' },
  ]) {
    const binding = { ...prepared.request.binding, ...change }
    const reservation: StandingReservation = {
      binding,
      required: [],
      id: standingReservationId(binding, []),
    }
    expect((await destination.seal(reservation)).kind).toBe('unavailable')
  }
  expect(calls).toBe(0)
})

it('recovers after a held metadata response is lost without replacing its fixed stage', async () => {
  const w = await setup(),
    plan = await w.accepted()
  const storage: SqlStorage = {
    ...w.activation.storage,
    async commit(request, options) {
      const result = await w.activation.storage.commit(request, options)
      return request.identity.operation === 'governance.meta.standing-held'
        ? { kind: 'unknown', identity: request.identity, diagnostic: 'lost' }
        : result
    },
    query: identity =>
      identity.operation === 'governance.meta.standing-held'
        ? Promise.resolve({ kind: 'unknown', identity, diagnostic: 'lost' })
        : w.activation.storage.query(identity),
  }
  const driver = new GovernanceStandingCoordinator(
    sqlFor(w.activation, storage),
    w.identity.reservations,
  )
  expect(await driver.reserve(plan, w.principal)).toEqual({
    kind: 'unavailable',
    owner: 'sql-coordination',
  })
  expect(await w.sql.observe(plan.operation)).toMatchObject({ standing: { kind: 'held' } })
  expect(await w.driver.settle(plan.operation)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
})

it('keeps an already committed business result when real member revocation drains its hold', async () => {
  const w = await setup(),
    plan = await w.accepted()
  await w.submitted(plan)
  expect(await w.sql.send(plan.operation, 'apply')).toMatchObject({
    kind: 'applied',
    response: { record: { state: 'committed' } },
  })
  expect(await w.remove()).toMatchObject({ kind: 'succeeded' })
  expect(await w.driver.settle(plan.operation)).toMatchObject({
    kind: 'settled',
    outcome: 'committed',
  })
})

it('serializes competing business and revocation through one original terminal', async () => {
  const w = await setup(),
    plan = await w.accepted()
  await w.submitted(plan)
  const [business, revoked] = await Promise.all([w.sql.send(plan.operation, 'apply'), w.remove()])
  expect(business.kind).toBe('applied')
  expect(revoked.kind).toBe('succeeded')
  const settled = await w.driver.settle(plan.operation)
  expect(settled.kind).toBe('settled')
  if (settled.kind !== 'settled') throw new Error('settled fixture')
  expect(await w.sql.observe(plan.operation)).toMatchObject({
    record: { state: settled.outcome },
    standing: { kind: 'settled', outcome: settled.outcome },
  })
  expect(await w.identity.reservations.recover()).toMatchObject({ kind: 'recovered', examined: 0 })
})

it('keeps the hold after a lost destination seal response and retries the saved phase', async () => {
  const w = await setup(),
    plan = await w.accepted()
  expect(await w.driver.reserve(plan, w.principal)).toMatchObject({ kind: 'held' })
  let lose = true
  const storage: SqlStorage = {
    ...w.activation.storage,
    async commit(request, options) {
      const result = await w.activation.storage.commit(request, options)
      return lose && request.identity.operation === 'governance.meta.standing-seal'
        ? { kind: 'unknown', identity: request.identity, diagnostic: 'lost' }
        : result
    },
    query: identity =>
      lose && identity.operation === 'governance.meta.standing-seal'
        ? Promise.resolve({ kind: 'unknown', identity, diagnostic: 'lost' })
        : w.activation.storage.query(identity),
  }
  const source = w.reassemble(
    w.activation.storage,
    new GovernanceStandingDestination(sqlFor(w.activation, storage), {
      destination: w.destination,
      transactionDomain: w.domain.transactionDomain,
    }),
  )
  cleanups.push(async () => source.stop())
  const driver = new GovernanceStandingCoordinator(w.sql, source.reservations)
  expect(await driver.settle(plan.operation)).toEqual({
    kind: 'unavailable',
    owner: 'identity-standing',
  })
  expect(await w.sql.observe(plan.operation)).toMatchObject({
    record: { state: 'aborted' },
    standing: { kind: 'held' },
  })
  lose = false
  expect(await driver.settle(plan.operation)).toMatchObject({ kind: 'settled', outcome: 'aborted' })
})

it('rejects a mismatched terminal receipt and retains the original held custody', async () => {
  const w = await setup(),
    plan = await w.accepted()
  const held = await w.driver.reserve(plan, w.principal)
  if (held.kind !== 'held') throw new Error('held fixture')
  const driver = new GovernanceStandingCoordinator(
    w.sql,
    overridden(w.identity.reservations, {
      async settle() {
        const binding = { ...held.request.binding, inputDigest: 'other' }
        return {
          kind: 'terminal',
          outcome: 'aborted',
          reservation: { binding, required: [], id: standingReservationId(binding, []) },
        }
      },
    }),
  )
  expect(await driver.settle(plan.operation)).toEqual({
    kind: 'unavailable',
    owner: 'identity-standing',
  })
  expect(await w.sql.observe(plan.operation)).toMatchObject({
    record: { state: 'accepted' },
    standing: { kind: 'held' },
  })
})

it('rejects wrong qualifications without poisoning the fixed recovery phase', async () => {
  const w = await setup(),
    prepared = await w.planned()
  const destination = new GovernanceStandingDestination(w.sql, {
    destination: w.destination,
    transactionDomain: w.domain.transactionDomain,
  })
  const required = ['organization-settings-manage'] as const
  const wrong = {
    binding: prepared.request.binding,
    required,
    id: standingReservationId(prepared.request.binding, required),
  }
  expect((await destination.seal(wrong)).kind).toBe('unavailable')
  expect(await w.sql.readStage(prepared.plan.operation, 'standing-seal')).toEqual({
    kind: 'unplanned',
  })
  expect(await w.driver.settle(prepared.plan.operation)).toMatchObject({
    kind: 'settled',
    outcome: 'aborted',
  })
})
