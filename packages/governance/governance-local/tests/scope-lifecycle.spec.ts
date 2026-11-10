import { afterEach, expect, it } from 'vitest'
import { GovernanceProviderLifetime } from '../src/provider-lifetime.ts'
import { GovernanceScopeLifecycle } from '../src/scope-lifecycle.ts'
import { openRegistrarWorld } from './registrar-world.ts'
import { capture } from './permission-capture-world.ts'
import { binding } from './operation-world.ts'
const worlds: Awaited<ReturnType<typeof openRegistrarWorld>>[] = []
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.close()
})
async function setup() {
  const w = await openRegistrarWorld()
  worlds.push(w)
  const services = w.services()
  const lifecycle = new GovernanceScopeLifecycle({
    ...services,
    scope: w.scope,
    epoch: 'first',
    domain: w.activation.domain,
    storage: w.activation.storage,
    metadata: {
      combinationVersion: w.activation.combination('metadata').combinationVersion,
      manifestDigest: w.activation.combination('metadata').manifestDigest,
    },
  })
  return { w, ...services, lifecycle }
}
it('keeps recovery pending when Identity is clear but the source obligation remains', async () => {
  const { w, sql, lifecycle } = await setup()
  expect(await lifecycle.open(null)).toEqual({ kind: 'opened' })
  const input = { ...capture(w.scope), principalRef: w.principalRef }
  expect(await sql.accept(input)).toMatchObject({ kind: 'found' })
  expect(await lifecycle.isolate()).toEqual({ kind: 'isolated' })
  expect(await lifecycle.recoverPage()).toEqual({ kind: 'page', next: null, unsettled: 1 })
  expect(await sql.observe(binding(input))).toMatchObject({
    kind: 'found',
    record: { state: 'aborted' },
    source: { kind: 'requested' },
    standing: null,
  })
})
it('isolates the scope before draining real Identity reservations and never reopens a closed epoch', async () => {
  const { w, lifecycle, sql, standing } = await setup()
  expect(await lifecycle.open(null)).toEqual({ kind: 'opened' })
  await sql.accept({
    principalRef: w.principalRef,
    epoch: 'first',
    transactionDomain: w.activation.domain.transactionDomain,
    request: { owner: 'contribute', command: w.command('pending') },
  })
  expect(
    await standing.reserve(
      { operation: w.binding('pending'), destination: w.destination, required: [] },
      w.principal,
    ),
  ).toMatchObject({ kind: 'held' })
  expect(await lifecycle.isolate()).toEqual({ kind: 'isolated' })
  expect(await sql.observe(w.binding('pending'))).toMatchObject({
    record: { state: 'aborted' },
    standing: { kind: 'held' },
  })
  expect(await lifecycle.open(null)).toEqual({ kind: 'unavailable', owner: 'governance-lifecycle' })
  expect(await lifecycle.recoverPage()).toEqual({ kind: 'page', next: null, unsettled: 0 })
  expect(await sql.observe(w.binding('pending'))).toMatchObject({
    record: { state: 'aborted' },
    standing: { kind: 'settled', outcome: 'aborted' },
  })
  expect(await lifecycle.isolate()).toEqual({ kind: 'isolated' })
})
it('never seals successor operations while an old owner drains', async () => {
  const { w, lifecycle, sql } = await setup()
  await w.activation.control({
    kind: 'bootstrap',
    input: { scope: w.scope, epoch: 'second', previousEpoch: 'first' },
  })
  const pending = w.command('successor')
  await sql.accept({
    principalRef: w.principalRef,
    epoch: 'second',
    transactionDomain: w.activation.domain.transactionDomain,
    request: { owner: 'contribute', command: pending },
  })
  expect(await lifecycle.isolate()).toEqual({ kind: 'isolated' })
  expect(await lifecycle.recoverPage()).toEqual({ kind: 'page', next: null, unsettled: 0 })
  expect(await sql.observe(w.binding('successor'))).toMatchObject({
    record: { epoch: 'second', state: 'accepted' },
    standing: null,
  })
})

it('stops ingress synchronously and closes only after durable isolation and accepted calls settle', async () => {
  const { w, lifecycle, registrar, sql } = await setup()
  const lifetime = new GovernanceProviderLifetime({
    lifecycle,
    stopAccepting: () => registrar.stopAccepting(),
    recoveryPagesPerPass: 4,
  })
  const registered = await lifetime.invoke(() =>
    registrar.contribute(w.context, w.command('registered')),
  )
  expect(registered).toMatchObject({ kind: 'registered', state: 'active' })
  const { promise, resolve } = Promise.withResolvers<void>()
  const call = lifetime.invoke(() => promise)
  const closing = lifetime.close(0)
  let entered = false
  expect(
    await lifetime.invoke(async () => {
      entered = true
    }),
  ).toEqual({ kind: 'unavailable', owner: 'governance-provider' })
  expect(entered).toBe(false)
  expect(await closing).toMatchObject({ kind: 'pending', inFlight: 1 })
  resolve()
  await call
  expect(await lifetime.close(2000)).toEqual({ kind: 'closed' })
  expect(await lifecycle.open(null)).toMatchObject({ kind: 'unavailable' })
  expect(await sql.lookup(w.binding('registered').ref)).toMatchObject({
    kind: 'found',
    record: { state: 'committed' },
  })
  expect(await lifetime.close(2000)).toEqual({ kind: 'closed' })
})

it('recovers historical epochs without sealing current calls, then stops if replaced', async () => {
  const { w, sql, standing } = await setup()
  await sql.accept({
    principalRef: w.principalRef,
    epoch: 'first',
    transactionDomain: w.activation.domain.transactionDomain,
    request: { owner: 'contribute', command: w.command('historical') },
  })
  await standing.reserve(
    { operation: w.binding('historical'), destination: w.destination, required: [] },
    w.principal,
  )
  await w.activation.control({
    kind: 'bootstrap',
    input: { scope: w.scope, epoch: 'second', previousEpoch: 'first' },
  })
  await sql.accept({
    principalRef: w.principalRef,
    epoch: 'second',
    transactionDomain: w.activation.domain.transactionDomain,
    request: { owner: 'contribute', command: w.command('current') },
  })
  const { combinationVersion, manifestDigest } = w.activation.combination('metadata')
  const lifecycle = new GovernanceScopeLifecycle({
    ...w.services(),
    storage: w.activation.storage,
    domain: w.activation.domain,
    scope: w.scope,
    epoch: 'second',
    metadata: { combinationVersion, manifestDigest },
  })
  expect(await lifecycle.recoverHistoricalPage()).toEqual({
    kind: 'page',
    next: null,
    unsettled: 0,
  })
  expect(await sql.observe(w.binding('historical'))).toMatchObject({
    record: { state: 'aborted' },
    standing: { kind: 'settled' },
  })
  expect(await sql.observe(w.binding('current'))).toMatchObject({
    record: { state: 'accepted', epoch: 'second' },
  })
  await w.activation.control({
    kind: 'bootstrap',
    input: { scope: w.scope, epoch: 'third', previousEpoch: 'second' },
  })
  expect(await lifecycle.recoverHistoricalPage()).toEqual({
    kind: 'unavailable',
    owner: 'governance-lifecycle',
  })
  expect(await lifecycle.recoverPage()).toEqual({ kind: 'page', next: null, unsettled: 0 })
  expect(await sql.observe(w.binding('current'))).toMatchObject({
    record: { state: 'aborted', epoch: 'second' },
  })
})

it('does not let a successor operation enter an already captured historical recovery page', async () => {
  const { w, sql } = await setup()
  await sql.accept({
    principalRef: w.principalRef,
    epoch: 'first',
    transactionDomain: w.activation.domain.transactionDomain,
    request: { owner: 'contribute', command: w.command('old') },
  })
  await w.activation.control({
    kind: 'bootstrap',
    input: { scope: w.scope, epoch: 'second', previousEpoch: 'first' },
  })
  let changed = false
  const storage = {
    ...w.activation.storage,
    async read(input: Parameters<typeof w.activation.storage.read>[0]) {
      const page = await w.activation.storage.read(input)
      if (input.handler === 'governance.recovery' && !changed) {
        changed = true
        await w.activation.control({
          kind: 'bootstrap',
          input: { scope: w.scope, epoch: 'third', previousEpoch: 'second' },
        })
        await sql.accept({
          principalRef: w.principalRef,
          epoch: 'third',
          transactionDomain: w.activation.domain.transactionDomain,
          request: { owner: 'contribute', command: w.command('successor') },
        })
      }
      return page
    },
  }
  const { combinationVersion, manifestDigest } = w.activation.combination('metadata')
  const lifecycle = new GovernanceScopeLifecycle({
    ...w.services(),
    storage,
    domain: w.activation.domain,
    scope: w.scope,
    epoch: 'second',
    metadata: { combinationVersion, manifestDigest },
  })
  expect(await lifecycle.recoverHistoricalPage()).toEqual({
    kind: 'page',
    next: null,
    unsettled: 0,
  })
  expect(await sql.observe(w.binding('old'))).toMatchObject({
    record: { state: 'aborted', epoch: 'first' },
  })
  expect(await sql.observe(w.binding('successor'))).toMatchObject({
    record: { state: 'accepted', epoch: 'third' },
  })
  expect(await lifecycle.recoverHistoricalPage()).toMatchObject({ kind: 'unavailable' })
})
