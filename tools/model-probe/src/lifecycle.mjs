import assert from 'node:assert/strict'

// Feasibility experiment only. Not a production registry or a lifecycle contract.
// Context is supplied from the exact adopted Cordis installation by the caller.
export async function probeLifecycle(Context) {
  const observations = []
  const context = new Context()
  let calls = 0
  const early = await context.plugin({
    name: 'probe-early-effect-release',
    apply(ctx) {
      const release = ctx.effect(() => () => {
        calls++
      })
      release()
      release()
    },
  })
  assert.equal(calls, 1)
  await early.dispose()
  assert.equal(calls, 1)
  observations.push({ scenario: 'effect_early_release', calls, result: 'pass' })

  const versions = new Map()
  let adopted = 'v1'
  const acquire = version => {
    const entry = versions.get(version)
    if (!entry || entry.retiring) throw new Error('version_unavailable')
    const signal = new AbortController()
    entry.users.add(signal)
    let released = false
    return {
      version,
      signal: signal.signal,
      release() {
        if (released) return
        released = true
        entry.users.delete(signal)
        if (!entry.users.size) entry.drained?.()
      },
    }
  }
  async function register(version) {
    const entry = { users: new Set(), retiring: false, disposed: false, drained: undefined }
    const fiber = await context.plugin({
      name: `probe-model-${version}`,
      apply(ctx) {
        versions.set(version, entry)
        ctx.effect(() => async () => {
          entry.retiring = true
          if (entry.users.size)
            await new Promise(resolve => {
              entry.drained = resolve
            })
          entry.disposed = true
          versions.delete(version)
        })
      },
    })
    return { fiber, entry }
  }
  const first = await register('v1')
  // A prior idle interval must not authorize disposing a later live invocation.
  const earlier = acquire('v1')
  earlier.release()
  const runtime = acquire(adopted)
  const direct = acquire('v1')
  const second = await register('v2')
  adopted = 'v2'
  const newCall = acquire(adopted)
  assert.equal(runtime.version, 'v1')
  assert.equal(direct.version, 'v1')
  assert.equal(newCall.version, 'v2')
  const disposal = first.fiber.dispose()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(first.entry.retiring, true)
  assert.equal(first.entry.disposed, false)
  assert.throws(() => acquire('v1'), /unavailable/)
  runtime.release()
  await Promise.resolve()
  assert.equal(first.entry.disposed, false)
  direct.release()
  await disposal
  assert.equal(first.entry.disposed, true)
  observations.push({
    scenario: 'runtime_and_direct_lease_drain',
    oldVersion: runtime.version,
    newVersion: newCall.version,
    result: 'pass',
  })

  // Cancelling alone does not release resources. A consumer must acknowledge stop.
  newCall.signal.addEventListener('abort', () =>
    observations.push({ scenario: 'force_cancel_requested' }),
  )
  second.entry.retiring = true
  for (const controller of second.entry.users) controller.abort()
  assert.equal(newCall.signal.aborted, true)
  assert.equal(second.entry.disposed, false)
  const forced = second.fiber.dispose()
  await Promise.resolve()
  assert.equal(second.entry.disposed, false)
  newCall.release()
  await forced
  assert.equal(second.entry.disposed, true)
  observations.push({ scenario: 'cancel_then_actual_stop', result: 'pass' })
  return {
    adoptedCordis: '4.0.4',
    observations,
    scope:
      'Real Cordis disposal with simulated invocation owners. No HTTP, persistence, timeout policy, distributed protocol or production registry verified.',
  }
}
