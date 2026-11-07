import { afterEach, expect, it, vi } from 'vitest'
import type { CommitRequestV2, SqlStorage } from '@omne-harness/sql-contract'
import { GovernanceContributionCleanup } from '../src/contribution-cleanup.ts'
import {
  GovernanceContributionLifetime,
  type RegisterContributionCleanup,
} from '../src/contribution-lifetime.ts'
import { openRegistrarWorld } from './registrar-world.ts'
import { equal } from '../src/encoding.ts'

type World = Awaited<ReturnType<typeof openRegistrarWorld>>
const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close()
})
async function setup() {
  const w = await openRegistrarWorld()
  cleanups.push(w.close)
  return w
}
function controller(
  w: World,
  options: Parameters<World['services']>[0] = {},
  closeTimeoutMs = 1000,
) {
  const services = w.services(options)
  const lifetime = new GovernanceContributionLifetime({
    registrar: () => w.services(options).registrar,
    invoke: call => call(),
    cleanup: new GovernanceContributionCleanup(services.sql, services.standing),
    closeTimeoutMs,
    retryDelayMs: 5,
    retryBatchSize: 2,
  })
  cleanups.push(() => lifetime.close())
  return { lifetime, ...services }
}
function caller() {
  let release: Parameters<RegisterContributionCleanup>[0] | undefined
  return {
    register: (dispose => {
      release = dispose
    }) satisfies RegisterContributionCleanup,
    dispose: () => {
      if (!release) throw new Error('Caller effect was not registered before the first await')
      return release()
    },
  }
}

it('releases the caller contribution after revocation without affecting another caller', async () => {
  const w = await setup()
  const { lifetime, sql } = controller(w)
  const a = caller(),
    b = caller()
  const first = await lifetime.contribute(a.register, w.context, w.command('first'))
  const sibling = await lifetime.contribute(b.register, w.context, w.command('sibling'))
  if (first.kind !== 'registered' || sibling.kind !== 'registered')
    throw new Error('Expected registrations')
  await w.remove()
  expect(await a.dispose()).toEqual({ kind: 'closed' })
  expect(await sql.contribution(first.contribution, w.principalRef)).toMatchObject({
    state: 'released',
  })
  expect(await sql.contribution(sibling.contribution, w.principalRef)).toMatchObject({
    state: 'active',
  })
  expect(await sql.observe(w.binding('first'))).toMatchObject({ record: { result: first } })
  expect(await b.dispose()).toEqual({ kind: 'closed' })
  expect(lifetime.pending).toBe(0)
})

it('shares exact original cleanup across callers without reference counting', async () => {
  const w = await setup()
  const { lifetime, sql } = controller(w)
  const a = caller(),
    b = caller()
  const first = await lifetime.contribute(a.register, w.context, w.command('shared'))
  expect(await lifetime.contribute(b.register, w.context, w.command('shared'))).toEqual(first)
  expect(await b.dispose()).toEqual({ kind: 'closed' })
  expect(lifetime.pending).toBe(0)
  if (first.kind !== 'registered') throw new Error('Expected registration')
  expect(await sql.contribution(first.contribution, w.principalRef)).toMatchObject({
    state: 'released',
  })
  expect(await a.dispose()).toEqual({ kind: 'closed' })
})

it('cannot attach a different digest to the original caller lifetime', async () => {
  const w = await setup()
  const { lifetime, sql } = controller(w)
  const a = caller(),
    b = caller()
  const first = await lifetime.contribute(a.register, w.context, w.command('shared'))
  const changed = { ...w.command('shared'), generation: 'other' }
  expect(await lifetime.contribute(b.register, w.context, changed)).toEqual({
    kind: 'conflict',
    reason: 'operation',
  })
  expect(await b.dispose()).toEqual({ kind: 'closed' })
  if (first.kind !== 'registered') throw new Error('Expected registration')
  expect(await sql.contribution(first.contribution, w.principalRef)).toMatchObject({
    state: 'active',
  })
  expect(lifetime.pending).toBe(1)
})

it('stops a disposed invocation before acceptance while a suspended source does not block siblings', async () => {
  const w = await setup()
  const entered = Promise.withResolvers<void>(),
    proceed = Promise.withResolvers<void>()
  let firstRead = true
  const { lifetime, sql } = controller(
    w,
    {
      source: {
        async resolve() {
          if (firstRead) {
            firstRead = false
            entered.resolve()
            await proceed.promise
          }
          return { kind: 'definition', declaration: w.command('source').declaration }
        },
      },
    },
    0,
  )
  const a = caller(),
    b = caller()
  const original = lifetime.contribute(a.register, w.context, w.command('suspended'))
  try {
    await entered.promise
    expect(await a.dispose()).toEqual({ kind: 'pending' })
    expect(await lifetime.contribute(b.register, w.context, w.command('sibling'))).toMatchObject({
      kind: 'registered',
    })
    await b.dispose()
    await vi.waitFor(() => expect(lifetime.pending).toBe(1))
  } finally {
    proceed.resolve()
  }
  expect(await original).toMatchObject({ kind: 'unavailable' })
  await vi.waitFor(() => expect(lifetime.pending).toBe(0))
  expect(await sql.observe(w.binding('suspended'))).toEqual({ kind: 'absent' })
})

it('registers the effect before admission and remembers disposal while admission is pending', async () => {
  const w = await setup()
  const { lifetime, sql } = controller(w, {}, 0)
  const a = caller()
  const result = lifetime.contribute(a.register, w.context, w.command('immediate'))
  await a.dispose()
  expect(await result).toMatchObject({ kind: 'unavailable' })
  await vi.waitFor(() => expect(lifetime.pending).toBe(0))
  expect(await sql.observe(w.binding('immediate'))).toEqual({ kind: 'absent' })
})

it('retains cleanup after an unavailable attempt and retries without a new caller request', async () => {
  const w = await setup()
  let offline = false
  let failures = 0
  const storage: SqlStorage = {
    ...w.activation.storage,
    async read(request) {
      if (offline) {
        failures++
        throw new Error('SQL temporarily unavailable')
      }
      return w.activation.storage.read(request)
    },
  }
  const { lifetime, sql } = controller(w, { storage }, 0)
  const a = caller()
  const first = await lifetime.contribute(a.register, w.context, w.command('retry'))
  if (first.kind !== 'registered') throw new Error('Expected registration')
  offline = true
  expect(await a.dispose()).toEqual({ kind: 'pending' })
  await vi.waitFor(() => expect(failures).toBeGreaterThan(0))
  expect(lifetime.pending).toBe(1)
  offline = false
  await vi.waitFor(() => expect(lifetime.pending).toBe(0))
  expect(await sql.contribution(first.contribution, w.principalRef)).toMatchObject({
    state: 'released',
  })
})

it('does not confuse absent business apply with a queued original acceptance', async () => {
  const w = await setup()
  let queued: CommitRequestV2 | undefined
  const storage: SqlStorage = {
    ...w.activation.storage,
    async commit(request, options) {
      if (request.identity.operation === 'governance.meta.accept') {
        queued = request
        return { kind: 'unknown', identity: request.identity, diagnostic: 'transport-lost' }
      }
      return w.activation.storage.commit(request, options)
    },
    async query(identity) {
      return queued && identity.operation === 'governance.meta.accept'
        ? { kind: 'unknown', identity, diagnostic: 'operation_pending' }
        : w.activation.storage.query(identity)
    },
  }
  const { lifetime, sql } = controller(w, { storage }, 0)
  const a = caller()
  expect(await lifetime.contribute(a.register, w.context, w.command('delayed'))).toMatchObject({
    kind: 'unknown',
  })
  expect(await a.dispose()).toEqual({ kind: 'pending' })
  expect(await sql.uncommitted(w.binding('delayed').ref)).toMatchObject({ kind: 'not-committed' })
  expect(await sql.uncommittedAcceptance(w.binding('delayed').ref)).toMatchObject({
    kind: 'unavailable',
  })
  await vi.waitFor(() => expect(lifetime.pending).toBe(1))
  if (!queued) throw new Error('Expected queued original acceptance')
  await w.activation.storage.commit(queued)
  queued = undefined
  await vi.waitFor(() => expect(lifetime.pending).toBe(0))
  expect(await sql.observe(w.binding('delayed'))).toMatchObject({ record: { state: 'aborted' } })
})

it('does not let an unadmitted caller close an existing original operation', async () => {
  const w = await setup()
  const { lifetime, sql } = controller(w)
  const a = caller(),
    denied = caller()
  const first = await lifetime.contribute(a.register, w.context, w.command('shared'))
  if (first.kind !== 'registered') throw new Error('Expected registration')
  await w.remove()
  expect(await lifetime.contribute(denied.register, w.context, w.command('shared'))).toEqual({
    kind: 'denied',
  })
  expect(await denied.dispose()).toEqual({ kind: 'closed' })
  expect(await sql.contribution(first.contribution, w.principalRef)).toMatchObject({
    state: 'active',
  })
  expect(lifetime.pending).toBe(1)
})

it('drains multiple retry batches while one original observation remains unresolved', async () => {
  const w = await setup()
  const entered = Promise.withResolvers<void>(),
    proceed = Promise.withResolvers<void>()
  let delay = false
  let hungReads = 0
  const storage: SqlStorage = {
    ...w.activation.storage,
    async read(request) {
      if (
        delay &&
        request.handler === 'governance.operation' &&
        equal(request.input, w.binding('hung'))
      ) {
        hungReads++
        entered.resolve()
        await proceed.promise
      }
      return w.activation.storage.read(request)
    },
  }
  const { lifetime, sql } = controller(w, { storage }, 0)
  const a = caller()
  const siblings = []
  await lifetime.contribute(a.register, w.context, w.command('hung'))
  for (let index = 0; index < 5; index++) {
    const owner = caller()
    const result = await lifetime.contribute(owner.register, w.context, w.command('free-' + index))
    if (result.kind !== 'registered') throw new Error('Expected registration')
    siblings.push({ owner, result })
  }
  delay = true
  try {
    await a.dispose()
    await entered.promise
    await Promise.all(siblings.map(sibling => sibling.owner.dispose()))
    await vi.waitFor(() => expect(lifetime.pending).toBe(1))
    expect(hungReads).toBe(1)
    for (const sibling of siblings) {
      expect(await sql.contribution(sibling.result.contribution, w.principalRef)).toMatchObject({
        state: 'released',
      })
    }
  } finally {
    delay = false
    proceed.resolve()
  }
  await vi.waitFor(() => expect(lifetime.pending).toBe(0))
})

it('does not start an operation when the caller cannot register its cleanup effect', async () => {
  const w = await setup()
  const { lifetime, sql } = controller(w)
  await expect(
    lifetime.contribute(
      () => {
        throw new Error('inactive caller')
      },
      w.context,
      w.command('inactive'),
    ),
  ).rejects.toThrow('inactive caller')
  expect(lifetime.pending).toBe(0)
  expect(await sql.observe(w.binding('inactive'))).toEqual({ kind: 'absent' })
})

it('retains a retired contribution until its original held Standing custody can settle', async () => {
  const w = await setup()
  let offline = true
  let settlementFailures = 0
  const reservations = {
    ...w.identity.reservations,
    async settle(request: Parameters<typeof w.identity.reservations.settle>[0]) {
      if (offline) {
        settlementFailures++
        return { kind: 'unavailable' as const, diagnostic: 'identity-offline' }
      }
      return w.identity.reservations.settle(request)
    },
  }
  const { lifetime, sql } = controller(w, { reservations }, 0)
  const a = caller()
  const registered = await lifetime.contribute(a.register, w.context, w.command('held'))
  if (registered.kind !== 'registered') throw new Error('Expected registration')
  expect(await sql.observe(w.binding('held'))).toMatchObject({ standing: { kind: 'held' } })
  expect(await a.dispose()).toEqual({ kind: 'pending' })
  await vi.waitFor(async () =>
    expect(await sql.contribution(registered.contribution, w.principalRef)).toMatchObject({
      state: 'released',
    }),
  )
  expect(lifetime.pending).toBe(1)
  expect(settlementFailures).toBeGreaterThan(0)
  offline = false
  await vi.waitFor(() => expect(lifetime.pending).toBe(0))
  expect(await sql.observe(w.binding('held'))).toMatchObject({
    standing: { kind: 'settled', outcome: 'committed' },
  })
})

it('rechecks membership when a duplicate attaches during original cleanup', async () => {
  const w = await setup()
  const retiring = Promise.withResolvers<void>(),
    retire = Promise.withResolvers<void>()
  const reading = Promise.withResolvers<void>(),
    read = Promise.withResolvers<void>()
  let holdResult = false
  const storage: SqlStorage = {
    ...w.activation.storage,
    async commit(request, options) {
      if (request.identity.operation === 'governance.meta.retire-contribution') {
        retiring.resolve()
        await retire.promise
      }
      return w.activation.storage.commit(request, options)
    },
    async read(request) {
      if (holdResult && request.handler === 'governance.contribution-state') {
        reading.resolve()
        await read.promise
      }
      return w.activation.storage.read(request)
    },
  }
  const { lifetime } = controller(w, { storage }, 0)
  const a = caller(),
    b = caller()
  const first = await lifetime.contribute(a.register, w.context, w.command('joined'))
  if (first.kind !== 'registered') throw new Error('Expected registration')
  await a.dispose()
  await retiring.promise
  holdResult = true
  const duplicate = lifetime.contribute(b.register, w.context, w.command('joined'))
  try {
    await reading.promise
    retire.resolve()
    await vi.waitFor(async () =>
      expect(await w.services().sql.contribution(first.contribution, w.principalRef)).toMatchObject(
        { state: 'released' },
      ),
    )
    expect(lifetime.pending).toBe(2)
    expect(await a.dispose()).toEqual({ kind: 'pending' })
  } finally {
    holdResult = false
    retire.resolve()
    read.resolve()
  }
  expect(await duplicate).toMatchObject({ kind: 'registered', state: 'released' })
  await vi.waitFor(() => expect(lifetime.pending).toBe(0))
})
