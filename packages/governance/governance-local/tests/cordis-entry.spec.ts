import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { governanceContributionsKey } from '@omne-harness/governance-contract/cordis'
import type { GovernanceContributionOutcome } from '@omne-harness/governance-contract'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { createGovernanceLocalPlugin } from '@omne-harness/governance-local/cordis'
import type { GovernanceProviderClose } from '../src/provider-lifetime.ts'
import { openProviderWorld } from './provider-world.ts'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close()
})

async function setup(storage?: (actual: SqlStorage) => SqlStorage) {
  const world = await openProviderWorld()
  cleanups.push(world.w.close)
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  const observed: GovernanceProviderClose[] = []
  const deps = await ctx.plugin({
    name: 'governance-test-dependencies',
    apply(inner: Context) {
      inner.provide('storage', storage?.(world.options.storage) ?? world.options.storage)
      inner.provide('principalVerifier', world.options.identity.verifier)
      inner.provide('tenantStanding', world.options.identity.standing)
      inner.provide('standingReservations', world.options.identity.reservations)
    },
  })
  const { identity: _identity, storage: _storage, ...config } = world.options
  return {
    ...world,
    ctx,
    deps,
    observed,
    config: {
      ...config,
      observeClose: (report: GovernanceProviderClose) => {
        observed.push(report)
      },
    },
  }
}

async function caller(ctx: Context, world: Awaited<ReturnType<typeof setup>>, id: string) {
  const result = Promise.withResolvers<GovernanceContributionOutcome>()
  let reference: Context['governanceContributions'] | undefined
  const fiber = await ctx.plugin({
    name: 'governance-contributor-' + id,
    inject: [governanceContributionsKey],
    apply(inner: Context) {
      reference = inner.governanceContributions
      result.resolve(reference.contribute(world.w.context, world.w.command(id)))
    },
  })
  return { fiber, result: result.promise, reference: () => reference }
}

it('binds contributions to actual caller fibers and preserves sibling and borrowed dependencies', async () => {
  const world = await setup()
  const provider = await world.ctx.plugin(createGovernanceLocalPlugin(), world.config)
  const first = await caller(world.ctx, world, 'first')
  const second = await caller(world.ctx, world, 'second')
  const a = await first.result,
    b = await second.result
  if (a.kind !== 'registered' || b.kind !== 'registered') throw new Error('Expected registrations')
  await first.fiber.dispose()
  expect(
    await world.w.services().sql.contribution(a.contribution, world.w.principalRef),
  ).toMatchObject({ state: 'released' })
  expect(
    await world.w.services().sql.contribution(b.contribution, world.w.principalRef),
  ).toMatchObject({ state: 'active' })
  expect(world.ctx.get(governanceContributionsKey)).toBeDefined()
  await second.fiber.dispose()
  await provider.dispose()
  expect(world.observed).toContainEqual({ kind: 'closed' })
  expect(world.ctx.get(governanceContributionsKey)).toBeUndefined()
  expect(await world.w.services().sql.observe(world.w.binding('first'))).toMatchObject({
    record: { state: 'committed' },
  })
})

it('stops old service references after a required dependency disappears and reassembles safely', async () => {
  const world = await setup()
  const plugin = createGovernanceLocalPlugin()
  const provider = await world.ctx.plugin(plugin, world.config)
  const consumer = await caller(world.ctx, world, 'old')
  const result = await consumer.result
  if (result.kind !== 'registered') throw new Error('Expected registration')
  const old = consumer.reference()
  if (!old) throw new Error('Missing service')
  await world.deps.dispose()
  await vi.waitFor(() => expect(world.observed).toContainEqual({ kind: 'closed' }))
  expect(world.ctx.get(governanceContributionsKey)).toBeUndefined()
  expect(await old.contribute(world.w.context, world.w.command('late'))).toMatchObject({
    kind: 'unavailable',
  })
  await provider.dispose()
  await consumer.fiber.dispose()
  const replacement = await world.ctx.plugin({
    name: 'replacement-dependencies',
    apply(inner: Context) {
      inner.provide('storage', world.options.storage)
      inner.provide('principalVerifier', world.options.identity.verifier)
      inner.provide('tenantStanding', world.options.identity.standing)
      inner.provide('standingReservations', world.options.identity.reservations)
    },
  })
  const next = await world.ctx.plugin(createGovernanceLocalPlugin(), world.config)
  const current = await caller(world.ctx, world, 'new')
  expect(await current.result).toMatchObject({ kind: 'registered', state: 'active' })
  await next.dispose()
  await replacement.dispose()
})

it('never publishes a late service when disposal occurs during startup', async () => {
  const entered = Promise.withResolvers<void>(),
    proceed = Promise.withResolvers<void>()
  let delay = true
  const world = await setup(actual => ({
    ...actual,
    async read(request) {
      if (delay && request.handler === 'governance.scope') {
        entered.resolve()
        await proceed.promise
      }
      return actual.read(request)
    },
  }))
  const provider = world.ctx.plugin(createGovernanceLocalPlugin(), world.config)
  try {
    await entered.promise
    expect(world.ctx.get(governanceContributionsKey)).toBeUndefined()
    const disposing = provider.dispose()
    delay = false
    proceed.resolve()
    await disposing
    expect(world.ctx.get(governanceContributionsKey)).toBeUndefined()
    expect(world.observed).toContainEqual({ kind: 'closed' })
  } finally {
    delay = false
    proceed.resolve()
    await provider.dispose()
  }
})

it('retains provider shutdown after dependency loss and retries without another request', async () => {
  let offline = false
  const world = await setup(actual => ({
    ...actual,
    async read(request) {
      if (offline) throw new Error('database offline')
      return actual.read(request)
    },
    async commit(request, options) {
      if (offline) throw new Error('database offline')
      return actual.commit(request, options)
    },
    async query(identity) {
      if (offline) return { kind: 'unknown', identity, diagnostic: 'database-offline' }
      return actual.query(identity)
    },
  }))
  const provider = await world.ctx.plugin(createGovernanceLocalPlugin(), {
    ...world.config,
    closeTimeoutMs: 0,
  })
  const consumer = await caller(world.ctx, world, 'pending')
  const registered = await consumer.result
  if (registered.kind !== 'registered') throw new Error('Expected registration')
  offline = true
  await provider.dispose()
  expect(world.observed).toContainEqual(expect.objectContaining({ kind: 'pending' }))
  offline = false
  await vi.waitFor(() => expect(world.observed).toContainEqual({ kind: 'closed' }))
  expect(
    await world.w.services().sql.contribution(registered.contribution, world.w.principalRef),
  ).toMatchObject({ state: 'released' })
})

it('returns unavailable for a disposed caller reference while the provider stays active', async () => {
  const world = await setup()
  await world.ctx.plugin(createGovernanceLocalPlugin(), world.config)
  const consumer = await caller(world.ctx, world, 'departed')
  expect(await consumer.result).toMatchObject({ kind: 'registered' })
  const old = consumer.reference()
  if (!old) throw new Error('Missing caller service reference')
  await consumer.fiber.dispose()
  expect(world.ctx.get(governanceContributionsKey)).toBeDefined()
  expect(
    await old.contribute(world.w.context, world.w.command('late-after-caller-dispose')),
  ).toMatchObject({ kind: 'unavailable' })
  expect(
    await world.w.services().sql.observe(world.w.binding('late-after-caller-dispose')),
  ).toEqual({ kind: 'absent' })
})

it('retains a caller disposed before acknowledgement while sibling fibers continue', async () => {
  const world = await setup()
  const entered = Promise.withResolvers<void>(),
    proceed = Promise.withResolvers<void>()
  let first = true
  await world.ctx.plugin(createGovernanceLocalPlugin(), {
    ...world.config,
    closeTimeoutMs: 0,
    definitions: {
      async resolve() {
        if (first) {
          first = false
          entered.resolve()
          await proceed.promise
        }
        return { kind: 'definition', declaration: world.definition }
      },
    },
  })
  const consumer = await caller(world.ctx, world, 'pending-caller')
  try {
    await entered.promise
    await consumer.fiber.dispose()
    const sibling = await caller(world.ctx, world, 'active-sibling')
    expect(await sibling.result).toMatchObject({ kind: 'registered' })
    await sibling.fiber.dispose()
  } finally {
    proceed.resolve()
  }
  expect(await consumer.result).toMatchObject({ kind: 'unavailable' })
  expect(await world.w.services().sql.observe(world.w.binding('pending-caller'))).toEqual({
    kind: 'absent',
  })
})

it('does not activate a service when dependencies disappear during startup', async () => {
  const entered = Promise.withResolvers<void>(),
    proceed = Promise.withResolvers<void>()
  let delay = true
  const world = await setup(actual => ({
    ...actual,
    async read(request) {
      if (delay && request.handler === 'governance.scope') {
        entered.resolve()
        await proceed.promise
      }
      return actual.read(request)
    },
  }))
  const provider = world.ctx.plugin(createGovernanceLocalPlugin(), world.config)
  try {
    await entered.promise
    const disposed = world.deps.dispose()
    expect(world.ctx.get(governanceContributionsKey)).toBeUndefined()
    delay = false
    proceed.resolve()
    await disposed
    await provider.await()
    expect(world.ctx.get(governanceContributionsKey)).toBeUndefined()
    expect(world.observed).toContainEqual({ kind: 'closed' })
  } finally {
    delay = false
    proceed.resolve()
    await provider.dispose()
  }
})
