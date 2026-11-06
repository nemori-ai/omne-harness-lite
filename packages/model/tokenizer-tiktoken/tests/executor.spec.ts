import { expect, it } from 'vitest'
import { createTiktokenExecutor } from '../src/index.ts'
import { executorOf, limits } from './support/executor.ts'
import { syntheticResources } from './support/resources.ts'

it('initializes real workers, counts asynchronously, and closes the physical pool', async () => {
  const resources = syntheticResources()
  const executor = await executorOf([resources])
  expect(Object.keys(executor).sort()).toEqual(['acquire', 'close', 'snapshot'])
  const acquired = executor.acquire(resources.definition, new AbortController().signal)
  if ('failure' in acquired) throw new Error(JSON.stringify(acquired.failure))
  const counted = acquired.ok.tokenizer.count([
    { kind: 'text', text: 'ab' },
    { kind: 'text', text: 'cd' },
  ])
  expect(counted).toBeInstanceOf(Promise)
  expect(await counted).toEqual({ ok: { tokens: '1' } })
  expect(executor.snapshot()).toMatchObject({
    workers: 1,
    leases: 1,
    runningJobs: 0,
    completedJobs: 1,
  })
  const released = acquired.ok.release()
  expect(acquired.ok.release()).toBe(released)
  expect(await released).toEqual({ ok: undefined })
  expect(await acquired.ok.tokenizer.count([])).toMatchObject({ failure: { kind: 'unavailable' } })
  const closed = executor.close()
  expect(executor.close()).toBe(closed)
  expect(await closed).toEqual({ ok: undefined })
  expect(executor.snapshot()).toMatchObject({
    workers: 0,
    leases: 0,
    queuedJobs: 0,
    runningJobs: 0,
    cacheBytes: 0,
  })
}, 15000)

it('requires a complete exact definition and snapshots caller-owned configuration', async () => {
  const resources = syntheticResources()
  const copied = structuredClone(resources)
  const inputLimits = { ...limits }
  const creating = createTiktokenExecutor({ resources: [copied], limits: inputLimits })
  Reflect.set(copied.definition.adoption, 'name', 'mutated')
  Reflect.set(inputLimits, 'maxLeases', 0)
  const created = await creating
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  try {
    expect(created.ok.acquire(copied.definition, new AbortController().signal)).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(created.ok.acquire(resources.definition, new AbortController().signal)).toHaveProperty(
      'ok',
    )
  } finally {
    await created.ok.close()
  }
}, 15000)

it('reuses exact regex pieces only inside the same lease and clears them before release completes', async () => {
  const resources = syntheticResources()
  const executor = await executorOf([resources])
  const first = executor.acquire(resources.definition, new AbortController().signal)
  const second = executor.acquire(resources.definition, new AbortController().signal)
  if ('failure' in first || 'failure' in second) throw new Error('acquire failed')
  const input = [{ kind: 'text', text: 'abcde' }] as const
  await first.ok.tokenizer.count(input)
  const initial = executor.snapshot()
  await first.ok.tokenizer.count(input)
  expect(executor.snapshot().pieceHits).toBeGreaterThan(initial.pieceHits)
  const repeated = executor.snapshot()
  await second.ok.tokenizer.count(input)
  expect(executor.snapshot().pieceMisses).toBeGreaterThan(repeated.pieceMisses)
  await first.ok.release()
  expect(executor.snapshot().cacheEntries).toBeGreaterThan(0)
  await second.ok.release()
  expect(executor.snapshot()).toMatchObject({ cacheBytes: 0, cacheEntries: 0, leases: 0 })
}, 15000)

it('rejects input, per-lease queue, global queue and live-lease excess without synchronous fallback', async () => {
  const resources = syntheticResources()
  const executor = await executorOf([resources], {
    maxLeases: 1,
    maxInputBytes: 256,
    maxLeaseQueuedJobs: 1,
    maxQueuedJobs: 1,
  })
  const lease = executor.acquire(resources.definition, new AbortController().signal)
  if ('failure' in lease) throw new Error('acquire failed')
  expect(executor.acquire(resources.definition, new AbortController().signal)).toHaveProperty(
    'failure',
  )
  expect(await lease.ok.tokenizer.count([{ kind: 'text', text: 'a'.repeat(256) }])).toHaveProperty(
    'failure',
  )
  const one = lease.ok.tokenizer.count([{ kind: 'text', text: 'abcd' }])
  const two = lease.ok.tokenizer.count([{ kind: 'text', text: 'ab' }])
  expect(await lease.ok.tokenizer.count([])).toHaveProperty('failure')
  expect(await one).toEqual({ ok: { tokens: '1' } })
  expect(await two).toEqual({ ok: { tokens: '1' } })
}, 15000)

it('cancels queued and running counts, then waits for physical settlement on release', async () => {
  const resources = syntheticResources()
  const executor = await executorOf([resources])
  const controller = new AbortController()
  const lease = executor.acquire(resources.definition, controller.signal)
  if ('failure' in lease) throw new Error('acquire failed')
  const running = lease.ok.tokenizer.count([{ kind: 'text', text: 'a'.repeat(131072) }])
  const queued = lease.ok.tokenizer.count([{ kind: 'text', text: 'ab' }])
  controller.abort()
  expect(await running).toHaveProperty('failure')
  expect(await queued).toHaveProperty('failure')
  expect(await lease.ok.release()).toEqual({ ok: undefined })
  expect(executor.snapshot()).toMatchObject({
    leases: 0,
    queuedJobs: 0,
    queuedBytes: 0,
    runningJobs: 0,
    cacheEntries: 0,
  })
}, 15000)

it('bounds total and per-lease cache entries and retained UTF16 bytes across two workers', async () => {
  const resources = syntheticResources()
  const executor = await executorOf([resources], {
    workers: 2,
    maxCacheBytes: 640,
    maxCacheEntries: 4,
    maxLeaseCacheBytes: 320,
    maxLeaseCacheEntries: 2,
  })
  const leases = Array.from({ length: 4 }, () =>
    executor.acquire(resources.definition, new AbortController().signal),
  )
  for (const lease of leases) {
    if ('failure' in lease) throw new Error('acquire failed')
    for (const text of ['ab', 'abc', 'abcd', 'abcde'])
      await lease.ok.tokenizer.count([{ kind: 'text', text }])
    expect(executor.snapshot().cacheEntries).toBeLessThanOrEqual(4)
    expect(executor.snapshot().cacheBytes).toBeLessThanOrEqual(640)
  }
  await Promise.all(leases.map(lease => ('ok' in lease ? lease.ok.release() : undefined)))
  expect(executor.snapshot().cacheEntries).toBe(0)
}, 15000)

it('terminates a worker stuck inside one regex match while the main event loop remains responsive', async () => {
  const { resourcesOf, ranksOf } = await import('./support/differential.ts')
  const resources = resourcesOf(ranksOf({ a: 0 }, '(a+)+$'))
  const executor = await executorOf([resources], { maxReplacementsPerMinute: 0 })
  const controller = new AbortController()
  const lease = executor.acquire(resources.definition, controller.signal)
  if ('failure' in lease) throw new Error('acquire failed')
  let completed = false
  const count = lease.ok.tokenizer
    .count([{ kind: 'text', text: `${'a'.repeat(32)}!` }])
    .then(result => {
      completed = true
      return result
    })
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(completed).toBe(false)
  controller.abort()
  expect(await count).toHaveProperty('failure')
  expect(await lease.ok.release()).toEqual({ ok: undefined })
  expect(executor.snapshot()).toMatchObject({ workers: 0, leases: 0, runningJobs: 0 })
}, 15000)

it('snapshots queued segments before the caller changes the input array or text fields', async () => {
  const resources = syntheticResources()
  const executor = await executorOf([resources])
  const acquired = executor.acquire(resources.definition, new AbortController().signal)
  if ('failure' in acquired) throw new Error('acquire failed')
  const first = acquired.ok.tokenizer.count([{ kind: 'text', text: 'a'.repeat(131072) }])
  const segment = { kind: 'text', text: 'abcde' } as const
  const segments = [segment]
  const second = acquired.ok.tokenizer.count(segments)
  Reflect.set(segment, 'text', 'abcd')
  segments.length = 0
  expect(await first).toEqual({ ok: { tokens: '131072' } })
  expect(await second).toEqual({ ok: { tokens: '2' } })
}, 15000)

it('rejects invalid explicit limits and duplicate definitions before starting workers', async () => {
  const resources = syntheticResources()
  for (const override of [
    { workers: 0 },
    { maxLeases: 0 },
    { maxQueuedBytes: -1 },
    { maxCacheEntries: 0.5 },
    { jobTimeoutMs: 2147483648 },
  ]) {
    expect(
      await createTiktokenExecutor({ resources: [resources], limits: { ...limits, ...override } }),
    ).toHaveProperty('failure')
  }
  expect(await createTiktokenExecutor({ resources: [], limits })).toHaveProperty('failure')
  expect(
    await createTiktokenExecutor({ resources: [resources, resources], limits }),
  ).toHaveProperty('failure')
}, 5000)
