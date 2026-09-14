// Finite Cordis 4.0.2 mechanism measurements, not OMNE admission/HD/LE tests.
// No fake coordinator, authorization outcome or product state machine is installed.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const entry = process.argv[2]
if (!entry) throw new Error('Pass the pinned Cordis 4.0.2 lib/index.js path')
const entrySha256 = createHash('sha256').update(await readFile(entry)).digest('hex')
assert.equal(entrySha256, '1729cdbf8ee40b17c8839e06bf96491490548559e11ef7e411271e0754e751c5')
const { Context, symbols } = await import(pathToFileURL(entry))
const canonical = value => value?.[symbols.original] || value
// Public TS const enum values, pinned fiber.ts; no product enum is simulated.
const state = { PENDING: 0, ACTIVE: 2, UNLOADING: 5 }
const results = []

// An earlier lifecycle observer can call a captured method before a later host
// observer updates its local stamp. Fiber.state is already synchronously visible.
{
  const ctx = new Context()
  let provider
  let providerFiber
  let facade
  let observerClosed = false
  let revision = 0
  let disposed = false
  let early
  ctx.on('internal/status', f => {
    if (canonical(f) === providerFiber && f.state === state.UNLOADING) {
      early = facade.snapshot()
    }
  })
  ctx.on('internal/status', f => {
    if (canonical(f) === providerFiber && f.state !== state.ACTIVE) {
      observerClosed = true
      revision++
    }
  })
  provider = ctx.plugin({ name: 'operation-mount', apply(c) {
    const fiber = canonical(c.fiber)
    providerFiber = fiber
    facade = { snapshot: () => ({ state: fiber.state, observerClosed, revision, disposed }) }
    c.provide('probeOperation', facade)
    c.effect(() => () => { disposed = true })
  } })
  await provider.await()
  const captured = facade
  const prepared = captured.snapshot()
  // ctx.plugin returns Object.create(fiber), not the event's raw Fiber.
  // Capture identity at trusted apply(c), not from this PromiseLike control shell.
  assert.notEqual(provider, providerFiber)
  assert.equal(Object.getPrototypeOf(provider), providerFiber)
  const completion = provider.dispose()
  const sameStack = captured.snapshot()
  assert.equal(prepared.state, state.ACTIVE)
  assert.deepEqual(early, { state: state.UNLOADING, observerClosed: false, revision: 0, disposed: false })
  assert.deepEqual(sameStack, { state: state.UNLOADING, observerClosed: true, revision: 1, disposed: false })
  await completion
  assert.equal(disposed, true)
  results.push({ name: 'dispose-same-stack-and-before-observer', prepared, early, sameStack })
  await ctx.fiber.dispose()
}

// Required provider loss/reappearance changes the actual consumer lifecycle.
// The retained closure still executes and keeps the old generation/value;
// returning to ACTIVE on the same consumer Fiber cannot validate that closure.
{
  const ctx = new Context()
  const mounts = []
  const providers = new Map()
  let generation = 0
  let consumerDisposers = 0
  let lostProvider = null
  let atProviderStatus
  ctx.on('internal/status', f => {
    if (canonical(f) === lostProvider && f.state === state.UNLOADING) {
      atProviderStatus = mounts[0].snapshot()
    }
  })
  const consumer = ctx.plugin({ name: 'required-link', inject: ['probeDependency'], apply(c) {
    const dependency = c.probeDependency
    const ownFiber = canonical(c.fiber)
    const capturedGeneration = ++generation
    mounts.push({ snapshot: () => ({
      capturedGeneration,
      latestGeneration: generation,
      ownState: ownFiber.state,
      dependencyState: dependency.fiber.state,
      dependencyValue: dependency.value,
      consumerDisposers,
    }) })
    c.effect(() => () => { consumerDisposers++ })
  } })
  const mount = value => ctx.plugin({ name: `dependency-${value}`, apply(c) {
    providers.set(value, canonical(c.fiber))
    c.provide('probeDependency', { value, fiber: canonical(c.fiber) })
  } })
  const a = mount('a')
  await a.await()
  await consumer.await()
  const old = mounts[0]
  lostProvider = providers.get('a')
  const loss = a.dispose()
  const sameStack = old.snapshot()
  assert.equal(atProviderStatus.dependencyState, state.UNLOADING)
  assert.equal(atProviderStatus.consumerDisposers, 0)
  assert.equal(sameStack.dependencyState, state.UNLOADING)
  assert.equal(sameStack.consumerDisposers, 0)
  await loss
  await consumer.await()
  const absent = old.snapshot()
  assert.equal(absent.ownState, state.PENDING)
  const b = mount('b')
  await b.await()
  await consumer.await()
  const staleAfterReplacement = old.snapshot()
  const fresh = mounts[1].snapshot()
  assert.equal(staleAfterReplacement.ownState, state.ACTIVE)
  assert.equal(staleAfterReplacement.capturedGeneration, 1)
  assert.equal(staleAfterReplacement.latestGeneration, 2)
  assert.equal(staleAfterReplacement.dependencyValue, 'a')
  assert.equal(fresh.dependencyValue, 'b')
  assert.equal(fresh.capturedGeneration, 2)
  results.push({ name: 'required-dependency-loss-reappearance-old-closure', atProviderStatus, sameStack, absent, staleAfterReplacement, fresh })
  await ctx.fiber.dispose()
}

console.log(JSON.stringify({
  node: process.version,
  cordis: '4.0.2',
  entry,
  entrySha256,
  results,
  scope: 'Actual native lifecycle/closure observations only; no product admission, claim, permission, execution or durable recovery was tested.',
}, null, 2))
