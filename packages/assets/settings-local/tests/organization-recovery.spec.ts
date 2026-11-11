import { afterEach, expect, it } from 'vitest'
import {
  standingPrincipalRef,
  type StandingRequest,
  type StandingReservations,
} from '@omne-harness/identity'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { openOrganizationCurrentWorld } from './organization-current-world.ts'
import { connectOrganizationConsumers } from './organization-source-consumers.ts'
import { openRecoveryWorld } from './recovery-world.ts'
import { createOrganizationSettingsRecovery } from '../src/organization-recovery.ts'
import { createSettingsSourceReservations } from '../src/source-service.ts'
import { intentObservationSchema } from '../src/preparation-observation.ts'
const disposers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of disposers.splice(0).reverse()) await close()
})
type World = Awaited<ReturnType<typeof openOrganizationCurrentWorld>>
const page = { after: null, limit: 10 }
async function open(options: Parameters<typeof openOrganizationCurrentWorld>[0] = {}) {
  const w = await openOrganizationCurrentWorld(options)
  disposers.push(() => w.close())
  return w
}
function identityOf(w: World) {
  return {
    domain: w.domain,
    principalRef: standingPrincipalRef(w.principal),
    operation: { target: w.target, operationId: w.command.operationId },
  }
}
async function reopen(
  w: World,
  options: {
    wrapStorage?: (storage: SqlStorage) => SqlStorage
    standing?: Pick<StandingReservations, 'observe' | 'settle'>
  } = {},
) {
  await w.backend.control.close()
  await w.owner.close()
  await w.world.close()
  const world = await openRecoveryWorld(w.root, w.domain, true, w.configuration)
  disposers.push(() => world.close())
  expect(
    await world.storage.registerCombination({ ...w.domain, ...w.sourceRegistration }),
  ).toMatchObject({ kind: 'registered' })
  const source = createSettingsSourceReservations({
    storage: world.storage,
    domain: w.domain,
    registration: w.sourceRegistration,
    access: {
      async authorize() {
        return { kind: 'rejected', reason: 'forbidden' }
      },
    },
    destination: w.backend.control.sourceDestination,
  })
  disposers.push(() => source.control.close())
  const recovery = createOrganizationSettingsRecovery({
    storage: options.wrapStorage?.(world.storage) ?? world.storage,
    domain: w.domain,
    registrations: world.registrations,
    destination: w.configuration.destination,
    configuration: w.configuration,
    standing: options.standing ?? w.identity.identity.reservations,
    sources: source.control,
  })
  disposers.push(() => recovery.close())
  w.identity.setResolver(recovery.destination)
  return { world, source, recovery }
}
async function root(w: World, world: Awaited<ReturnType<typeof openRecoveryWorld>>) {
  const read = await world.observePreparation({ kind: 'root', identity: identityOf(w) })
  if (read.kind !== 'read') throw new Error(JSON.stringify(read))
  return intentObservationSchema.parse(read.output)
}
it('recovers a prepared organization update after reopening without issuing a new principal or attempt', async () => {
  const w = await open()
  const prepared = await w.backend.service.prepareChange(w.principal, w.command)
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
  const r = await reopen(w)
  expect(await r.recovery.recover(page)).toMatchObject({
    kind: 'recovered',
    items: [{ identity: identityOf(w), result: { kind: 'committed', revision: 1 } }],
    after: expect.any(String),
  })
  expect(await root(w, r.world)).toMatchObject({ status: { state: 'committed' }, nextAttempt: 2 })
  expect(await r.source.control.pendingUpdates(page)).toMatchObject({ kind: 'page', items: [] })
  expect(await r.recovery.recover(page)).toMatchObject({ kind: 'recovered', items: [] })
})
it('recovers requested custody after a lost real reservation reply and settles the same hold', async () => {
  let original: StandingRequest | undefined
  const w = await open({
    wrapReservations: actual => ({
      ...actual,
      async reserve(input) {
        const result = await actual.reserve(input)
        expect(result.kind).toBe('held')
        original = { binding: input.binding, required: input.required }
        return { kind: 'unavailable', diagnostic: 'lost-reserve-reply' }
      },
    }),
  })
  expect(await w.backend.service.prepareChange(w.principal, w.command)).toMatchObject({
    kind: 'unknown',
  })
  const before = await root(w, w.world)
  expect(before).toMatchObject({ attempt: { status: { state: 'preparing' } } })
  const remounted = await w.identity.remount()
  disposers.push(() => remounted.close())
  const r = await reopen(w, { standing: remounted.identity.reservations })
  expect(await r.recovery.recover(page)).toMatchObject({
    kind: 'recovered',
    items: [{ result: { kind: 'committed', revision: 1 } }],
  })
  expect(await root(w, r.world)).toMatchObject({ status: { state: 'committed' }, nextAttempt: 2 })
  if (!original) throw new Error('Missing actual reservation request')
  expect(await remounted.identity.reservations.observe(original)).toMatchObject({
    kind: 'terminal',
    outcome: 'committed',
  })
})
it('keeps a never accepted original reservation pending without inventing authority', async () => {
  const w = await open({
    wrapReservations: actual => ({
      ...actual,
      async reserve() {
        return { kind: 'unavailable', diagnostic: 'request-not-delivered' }
      },
    }),
  })
  expect(await w.backend.service.prepareChange(w.principal, w.command)).toMatchObject({
    kind: 'unknown',
  })
  const r = await reopen(w)
  expect(await r.recovery.recover(page)).toMatchObject({
    kind: 'recovered',
    items: [{ result: { kind: 'pending' } }],
  })
  expect(await root(w, r.world)).toMatchObject({ status: { state: 'open' }, nextAttempt: 2 })
  expect(await r.source.control.pendingUpdates(page)).toMatchObject({
    kind: 'page',
    items: [expect.any(Object)],
  })
})
it('does not submit while the original SQL outcome is unknown and later resumes the same identity', async () => {
  const w = await open()
  expect(await w.backend.service.prepareChange(w.principal, w.command)).toMatchObject({
    kind: 'prepared',
  })
  let unavailable = true
  const commits: string[] = []
  const r = await reopen(w, {
    wrapStorage: actual => ({
      ...actual,
      async query(identity) {
        if (unavailable)
          return { kind: 'unknown', identity, diagnostic: 'writer observation unavailable' }
        return actual.query(identity)
      },
      async commit(input) {
        if (input.identity.operation === 'settings.attempt.commit')
          commits.push(input.identity.operationKey)
        return actual.commit(input)
      },
    }),
  })
  const before = await root(w, r.world)
  expect(await r.recovery.recover(page)).toMatchObject({ items: [{ result: { kind: 'pending' } }] })
  expect(commits).toEqual([])
  expect(await root(w, r.world)).toEqual(before)
  unavailable = false
  expect(await r.recovery.recover(page)).toMatchObject({
    items: [{ result: { kind: 'committed' } }],
  })
  if (before.kind !== 'found' || !before.attempt) throw new Error('Missing original attempt')
  expect(commits).toEqual([before.attempt.sqlIdentity.operationKey])
})
it('does not revive an original operation when withdrawal seals it during recovery', async () => {
  const w = await open()
  expect(await w.backend.service.prepareChange(w.principal, w.command)).toMatchObject({
    kind: 'prepared',
  })
  const actual = w.identity.identity.reservations
  const r = await reopen(w, {
    standing: {
      ...actual,
      async observe(request) {
        const held = await actual.observe(request)
        expect(await w.identity.demoteAdministrator()).toMatchObject({ kind: 'succeeded' })
        return held
      },
    },
  })
  expect(await r.recovery.recover(page)).toMatchObject({ items: [{ result: { kind: 'aborted' } }] })
  expect(await root(w, r.world)).toMatchObject({ status: { state: 'aborted' } })
  expect(await r.source.control.pendingUpdates(page)).toMatchObject({ items: [] })
})
it('preserves a pending update when original standing observation is unavailable', async () => {
  const w = await open()
  expect(await w.backend.service.prepareChange(w.principal, w.command)).toMatchObject({
    kind: 'prepared',
  })
  const r = await reopen(w, {
    standing: {
      ...w.identity.identity.reservations,
      async observe() {
        return { kind: 'unavailable', diagnostic: 'identity-offline' }
      },
    },
  })
  expect(await r.recovery.recover(page)).toMatchObject({ items: [{ result: { kind: 'pending' } }] })
  expect(await root(w, r.world)).toMatchObject({ status: { state: 'open' }, nextAttempt: 2 })
})
it('rejects new recovery calls after close', async () => {
  const w = await open()
  const r = await reopen(w)
  await r.recovery.close()
  expect(await r.recovery.recover(page)).toEqual({ kind: 'rejected', reason: 'closing' })
})

it('recognizes a lost commit reply without writing the value twice', async () => {
  const w = await open()
  expect(await w.backend.service.prepareChange(w.principal, w.command)).toMatchObject({
    kind: 'prepared',
  })
  let commits = 0
  const r = await reopen(w, {
    wrapStorage: actual => ({
      ...actual,
      async commit(input) {
        const result = await actual.commit(input)
        if (input.identity.operation === 'settings.attempt.commit') {
          commits++
          expect(result.kind).toBe('committed')
          throw new Error('reply lost after durable commit')
        }
        return result
      },
    }),
  })
  expect(await r.recovery.recover(page)).toMatchObject({ items: [{ result: { kind: 'unknown' } }] })
  expect(await root(w, r.world)).toMatchObject({
    status: { state: 'committed', result: { revision: 1 } },
    nextAttempt: 2,
  })
  expect(await r.recovery.recover(page)).toMatchObject({ items: [] })
  expect(commits).toBe(1)
})
it('prevents a competing grant replacement from bypassing the pending source update', async () => {
  const w = await open()
  expect(await w.backend.service.prepareChange(w.principal, w.command)).toMatchObject({
    kind: 'prepared',
  })
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'remove-grants',
      expectedRevision: 1,
      record: { ...w.record, grants: [] },
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'basis_changed' })
  const r = await reopen(w)
  expect(await r.recovery.recover(page)).toMatchObject({
    items: [{ result: { kind: 'committed' } }],
  })
  expect(await root(w, r.world)).toMatchObject({ status: { state: 'committed' } })
})
it('drains admitted recovery before close completes', async () => {
  const w = await open()
  expect(await w.backend.service.prepareChange(w.principal, w.command)).toMatchObject({
    kind: 'prepared',
  })
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const r = await reopen(w, {
    wrapStorage: actual => ({
      ...actual,
      async query(identity) {
        entered.resolve()
        await release.promise
        return actual.query(identity)
      },
    }),
  })
  const pending = r.recovery.recover(page)
  await entered.promise
  let closed = false
  const closing = r.recovery.close().then(() => {
    closed = true
  })
  await Promise.resolve()
  expect(closed).toBe(false)
  expect(await r.recovery.recover(page)).toEqual({ kind: 'rejected', reason: 'closing' })
  release.resolve()
  expect(await pending).toMatchObject({ items: [{ result: { kind: 'committed' } }] })
  await closing
  expect(closed).toBe(true)
})

it('recognizes a durable rollback after the reply is lost and settles the original hold', async () => {
  let request: StandingRequest | undefined
  const w = await open({
    wrapReservations: actual => ({
      ...actual,
      async reserve(input) {
        request = { binding: input.binding, required: input.required }
        return actual.reserve(input)
      },
    }),
  })
  expect(await w.backend.service.prepareChange(w.principal, w.command)).toMatchObject({
    kind: 'prepared',
  })
  let submissions = 0
  const r = await reopen(w, {
    wrapStorage: actual => ({
      ...actual,
      async commit(input) {
        if (input.identity.operation !== 'settings.attempt.commit') return actual.commit(input)
        submissions++
        const rolled = await actual.commit({
          ...input,
          commands: [
            ...input.commands,
            { participant: 'fixture.recovery-rollback', facts: { rollback: true } },
          ],
        })
        expect(rolled.kind).toBe('rolled_back')
        throw new Error('rollback reply lost')
      },
    }),
  })
  expect(await r.recovery.recover(page)).toMatchObject({ items: [{ result: { kind: 'unknown' } }] })
  expect(await r.recovery.recover(page)).toMatchObject({ items: [{ result: { kind: 'aborted' } }] })
  expect(submissions).toBe(1)
  if (!request) throw new Error('Missing original request')
  expect(await w.identity.identity.reservations.observe(request)).toMatchObject({
    kind: 'terminal',
    outcome: 'aborted',
  })
})
it('concurrent recovery calls submit only the original attempt and preserve a single value revision', async () => {
  const w = await open()
  expect(await w.backend.service.prepareChange(w.principal, w.command)).toMatchObject({
    kind: 'prepared',
  })
  const r = await reopen(w)
  await Promise.all([r.recovery.recover(page), r.recovery.recover(page)])
  expect(await root(w, r.world)).toMatchObject({
    status: { state: 'committed', result: { revision: 1 } },
    nextAttempt: 2,
  })
  expect(await r.source.control.pendingUpdates(page)).toMatchObject({ items: [] })
})

it('drains real tenant destinations before completing their organization source update', async () => {
  const w = await open()
  const linked = await connectOrganizationConsumers(w)
  disposers.push(() => linked.close())
  const preparedConsumers = []
  for (const consumer of linked.consumers) {
    const prepared = await consumer.backend.service.prepareChange(
      consumer.principal,
      consumer.target.command,
    )
    if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
    preparedConsumers.push({ consumer, preparation: prepared.preparation })
  }
  expect(await w.backend.service.prepareChange(w.principal, w.command)).toMatchObject({
    kind: 'prepared',
  })
  const recovery = createOrganizationSettingsRecovery({
    storage: w.world.storage,
    domain: w.domain,
    registrations: w.world.registrations,
    destination: w.configuration.destination,
    configuration: w.configuration,
    standing: w.identity.identity.reservations,
    sources: linked.sources.control,
  })
  disposers.push(() => recovery.close())
  expect(await recovery.recover(page)).toMatchObject({
    items: [{ result: { kind: 'committed', revision: 1 } }],
  })
  for (const { consumer, preparation } of preparedConsumers) {
    expect(
      await consumer.backend.service.commitChange(consumer.principal, {
        requestId: 'stale-after-drain',
        preparation,
      }),
    ).toEqual({ kind: 'rejected', reason: 'basis_changed' })
    expect(
      await consumer.backend.service.getOperation(consumer.principal, {
        target: consumer.target.command.target,
        operationId: consumer.target.command.operationId,
      }),
    ).toMatchObject({ kind: 'pending', attempt: null })
  }
})
it('continues a bounded page of pending source updates without skipping a second target', async () => {
  const w = await open()
  const second = { ...w.target, targetRef: 'second-preferences' }
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'provision-second',
      expectedRevision: null,
      record: { ...w.record, target: second },
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(await w.backend.service.prepareChange(w.principal, w.command)).toMatchObject({
    kind: 'prepared',
  })
  expect(
    await w.backend.service.prepareChange(w.principal, {
      ...w.command,
      target: second,
      operationId: 'second-update',
    }),
  ).toMatchObject({ kind: 'prepared' })
  const r = await reopen(w)
  const first = await r.recovery.recover({ after: null, limit: 1 })
  if (first.kind !== 'recovered') throw new Error(JSON.stringify(first))
  expect(first.items).toHaveLength(1)
  expect(first.items[0]?.result.kind).toBe('committed')
  const next = await r.recovery.recover({ after: first.after, limit: 1 })
  if (next.kind !== 'recovered') throw new Error(JSON.stringify(next))
  expect(next.items).toHaveLength(1)
  expect(next.items[0]?.result.kind).toBe('committed')
  expect(next.items[0]?.identity).not.toEqual(first.items[0]?.identity)
  expect(await r.source.control.pendingUpdates(page)).toMatchObject({ items: [] })
})
it('seals a preparing update after the target retires between capture and allocation', async () => {
  let beforeAllocate = async () => {}
  let intercepted = false
  const w = await open({
    wrapStorage: actual => ({
      ...actual,
      async commit(input) {
        if (!intercepted && input.identity.operation === 'settings.checkpoint') {
          intercepted = true
          await beforeAllocate()
        }
        return actual.commit(input)
      },
    }),
  })
  beforeAllocate = async () => {
    expect(
      await w.owner.mutate({
        kind: 'retire',
        operationId: 'retire-before-allocate',
        expectedRevision: 1,
        target: w.target,
      }),
    ).toMatchObject({ kind: 'committed' })
  }
  expect(await w.backend.service.prepareChange(w.principal, w.command)).toMatchObject({
    kind: 'unknown',
  })
  expect(await root(w, w.world)).toMatchObject({
    status: { state: 'open' },
    attempt: { status: { state: 'preparing' } },
  })
  const r = await reopen(w)
  expect(await r.recovery.recover(page)).toMatchObject({ items: [{ result: { kind: 'aborted' } }] })
  expect(await r.source.control.pendingUpdates(page)).toMatchObject({ items: [] })
})
it('does not treat a generic ready rollback as a native business refusal', async () => {
  const w = await open({
    wrapReservations: actual => ({
      ...actual,
      async reserve(input) {
        expect((await actual.reserve(input)).kind).toBe('held')
        return { kind: 'unavailable', diagnostic: 'lost-reserve-reply' }
      },
    }),
  })
  expect(await w.backend.service.prepareChange(w.principal, w.command)).toMatchObject({
    kind: 'unknown',
  })
  let failReady = true
  const r = await reopen(w, {
    wrapStorage: actual => ({
      ...actual,
      async commit(input) {
        if (failReady && input.identity.operation === 'settings.ready')
          return actual.commit({
            ...input,
            commands: [
              ...input.commands,
              { participant: 'fixture.recovery-rollback', facts: { rollback: true } },
            ],
          })
        return actual.commit(input)
      },
    }),
  })
  expect(await r.recovery.recover(page)).toMatchObject({ items: [{ result: { kind: 'unknown' } }] })
  expect(await root(w, r.world)).toMatchObject({ status: { state: 'open' }, nextAttempt: 2 })
  failReady = false
  expect(await r.recovery.recover(page)).toMatchObject({
    items: [{ result: { kind: 'committed' } }],
  })
})
