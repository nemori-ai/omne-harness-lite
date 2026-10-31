import { fail, succeed } from '@omne-harness/operation-result'
import {
  createLocalScheduledEnvironment,
  type ToolEnvironmentDiagnostic,
  type ToolEnvironmentDiagnosticStage,
} from '@omne-harness/tool-host-local'
import { expect, it } from 'vitest'
import { barrier, environmentBoundaryFixture } from './environment-boundary-fixture.ts'

it.each(['denied', 'unavailable', 'throw', 'adoption', 'adoption-getter'] as const)(
  'returns an unsent reservation after %s and sends the unchanged original at most once after requalification',
  async failure => {
    const f = environmentBoundaryFixture()
    const original = f.preparation('a')
    const events: ToolEnvironmentDiagnostic[] = []
    const cause = new Error('private qualification detail')
    let checks = 0
    let current = f.backing.adoption
    let getterFails = false
    const environment = createLocalScheduledEnvironment({
      ...f,
      environment: {
        ...f.provider,
        get adoption() {
          if (getterFails) throw cause
          return current
        },
      },
      diagnostics: {
        record: async event => {
          events.push(event)
          return { kind: 'recorded' }
        },
      },
      qualify: async () => {
        checks += 1
        if (checks !== 2) return succeed(undefined)
        if (failure === 'throw') throw cause
        if (failure === 'adoption-getter') {
          getterFails = true
          return succeed(undefined)
        }
        if (failure === 'adoption') {
          current = { ...current, name: 'replacement' }
          return succeed(undefined)
        }
        return failure === 'denied'
          ? fail({ kind: 'denied', action: 'prepare' })
          : fail({ kind: 'unavailable', dependency: 'qualification', diagnostic: 'unavailable' })
      },
    })
    expect(await environment.prepare(original)).toHaveProperty(
      'failure.kind',
      failure === 'denied' ? 'denied' : 'unavailable',
    )
    expect(f.calls).toEqual([])
    expect(f.backing.controls.allocations()).toBe(0)
    expect(f.releases).toEqual([])
    expect(events).toHaveLength(failure === 'throw' || failure === 'adoption-getter' ? 1 : 0)
    if (events.length) expect(events[0]?.cause).toBe(cause)
    getterFails = false
    current = f.backing.adoption
    expect(await environment.inspectPreparation(original)).toHaveProperty('ok.kind', 'unknown')
    expect(f.calls).toEqual([])
    const other = f.other()
    expect(await environment.prepare(other)).toHaveProperty('ok.kind', 'prepared')
    await environment.release(await f.release(other))
    const [left, right] = await Promise.all([
      environment.prepare(original),
      environment.prepare(original),
    ])
    expect(left).toHaveProperty('ok.kind', 'prepared')
    expect(right).toEqual(left)
    expect(f.calls).toEqual([other.preparation, original.preparation])
    expect(f.backing.controls.allocations()).toBe(2)
  },
)

it.each(['qualify', 'adoption'] as const)(
  'returns the unsent slot before the diagnostic receiver finishes after %s throws',
  async stage => {
    const f = environmentBoundaryFixture()
    const entered = barrier(),
      resume = barrier()
    let checks = 0
    const cause = Object.freeze({ secret: 'not-public' })
    const events: ToolEnvironmentDiagnostic[] = []
    const environment = createLocalScheduledEnvironment({
      ...f,
      environment: {
        ...f.provider,
        get adoption() {
          if (stage === 'adoption' && checks === 2) throw cause
          return f.backing.adoption
        },
      },
      diagnostics: {
        record: async event => {
          events.push(event)
          entered.open()
          await resume.wait
          return { kind: 'unavailable' }
        },
      },
      qualify: async () => {
        if (++checks === 2 && stage === 'qualify') throw cause
        return succeed(undefined)
      },
    })
    const original = f.preparation('a')
    const pending = environment.prepare(original)
    await entered.wait
    checks += 1
    try {
      expect(await environment.prepare(f.other())).toHaveProperty('ok.kind', 'prepared')
      expect(f.calls.map(record => record.call)).toEqual(['b'])
    } finally {
      resume.open()
    }
    expect(await pending).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'tool-environment-scheduler',
        diagnostic: 'environment operation failed; stage=qualify; diagnostic=unavailable',
      },
    })
    expect(events).toEqual([
      {
        cause,
        stage: 'qualify',
        tenant: original.tenant,
        call: original.call,
        operation: original.preparation.operation,
      },
    ])
    expect(events[0]?.cause).toBe(cause)
  },
)

const stages = [
  'qualify',
  'prepare',
  'retry',
  'inspect-preparation',
  'release-policy',
  'release',
  'inspect-release',
] as const satisfies readonly ToolEnvironmentDiagnosticStage[]
it.each(
  stages.flatMap(stage =>
    ['recorded', 'unavailable', 'throw'].map(receiver => ({ stage, receiver })),
  ),
)(
  '$stage preserves the original cause and resource responsibility when diagnostics is $receiver',
  async ({ stage, receiver }) => {
    const f = environmentBoundaryFixture()
    const original = f.preparation('a')
    const cause = Object.freeze({ message: 'private-value', capability: () => 'secret' })
    const events: ToolEnvironmentDiagnostic[] = []
    let failing = false
    const provider = {
      ...f.provider,
      prepare: async (input: Parameters<typeof f.provider.prepare>[0]) => {
        const result = await f.provider.prepare(input)
        if (failing && stage === 'prepare') throw cause
        return result
      },
      inspectPreparation: async (input: Parameters<typeof f.provider.inspectPreparation>[0]) => {
        if (failing && stage === 'inspect-preparation') throw cause
        return f.provider.inspectPreparation(input)
      },
      release: async (input: Parameters<typeof f.provider.release>[0]) => {
        if (failing && stage === 'release') throw cause
        return f.provider.release(input)
      },
      inspectRelease: async (input: Parameters<typeof f.provider.inspectRelease>[0]) => {
        if (failing && stage === 'inspect-release') throw cause
        return f.provider.inspectRelease(input)
      },
    }
    const environment = createLocalScheduledEnvironment({
      environment: provider,
      policy: {
        ...f.policy,
        retry: async () => {
          if (failing && stage === 'retry') throw cause
          return 'recognize'
        },
        release: async () => {
          if (failing && stage === 'release-policy') throw cause
          return 'release'
        },
      },
      qualify: async () => {
        if (failing && stage === 'qualify') throw cause
        return succeed(undefined)
      },
      diagnostics: {
        record: async event => {
          events.push(event)
          if (receiver === 'throw') throw new Error('private diagnostic error')
          return { kind: receiver === 'recorded' ? 'recorded' : 'unavailable' }
        },
      },
    })
    if (stage !== 'prepare') await environment.prepare(original)
    failing = true
    const releasing =
      stage === 'qualify' || stage.startsWith('release') || stage === 'inspect-release'
    const release = releasing ? await f.release(original) : null
    const result =
      release !== null
        ? await environment[stage === 'inspect-release' ? 'inspectRelease' : 'release'](release)
        : stage === 'inspect-preparation'
          ? await environment.inspectPreparation(original)
          : await environment.prepare(original)
    const diagnostic = `environment operation failed; stage=${stage}; diagnostic=${receiver === 'recorded' ? 'recorded' : 'unavailable'}`
    expect(result).toEqual(
      stage === 'qualify'
        ? { failure: { kind: 'unavailable', dependency: 'tool-environment-scheduler', diagnostic } }
        : { ok: { kind: 'unknown', diagnostic } },
    )
    expect(events).toEqual([
      {
        stage,
        cause,
        tenant: original.tenant,
        call: original.call,
        operation: release?.release.operation ?? original.preparation.operation,
      },
    ])
    expect(events[0]?.cause).toBe(cause)
    expect(JSON.stringify(result)).not.toContain('private')
    failing = false
    const other = f.other()
    const waiting = environment.prepare(other)
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(f.calls).toEqual([original.preparation])
    expect(f.releases).toEqual([])
    expect(await environment.inspectPreparation(other)).toHaveProperty('ok.kind', 'pending')
    expect(await environment.release(await f.release(original))).toHaveProperty(
      'ok.kind',
      'released',
    )
    expect(await waiting).toHaveProperty('ok.kind', 'prepared')
    expect(f.calls).toEqual([original.preparation, other.preparation])
  },
)

const adoptionReads = [
  { verb: 'prepare', reads: [1, 2, 3, 4, 5] },
  { verb: 'inspectPreparation', reads: [1, 2] },
  { verb: 'release', reads: [1, 2, 3, 4] },
  { verb: 'inspectRelease', reads: [1, 2, 3, 4] },
] as const
it.each(adoptionReads.flatMap(({ verb, reads }) => reads.map(read => ({ verb, read }))))(
  '$verb keeps sent responsibility and correlates adoption read $read failure',
  async ({ verb, read }) => {
    const f = environmentBoundaryFixture()
    const original = f.preparation('a')
    const cause = Object.create(null)
    const events: ToolEnvironmentDiagnostic[] = []
    let reads = 0,
      failAt = 0
    const environment = createLocalScheduledEnvironment({
      ...f,
      environment: {
        ...f.provider,
        get adoption() {
          if (++reads === failAt) throw cause
          return f.backing.adoption
        },
      },
      diagnostics: {
        record: async event => {
          events.push(event)
          return { kind: 'recorded' }
        },
      },
    })
    await environment.prepare(original)
    const release = await f.release(original)
    reads = 0
    failAt = read
    const result =
      verb === 'prepare' || verb === 'inspectPreparation'
        ? await environment[verb](original)
        : await environment[verb](release)
    expect(result).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'tool-environment-scheduler',
        diagnostic: 'environment operation failed; stage=qualify; diagnostic=recorded',
      },
    })
    expect(events).toEqual([
      {
        stage: 'qualify',
        cause,
        tenant: original.tenant,
        call: original.call,
        operation:
          verb === 'release' || verb === 'inspectRelease'
            ? release.release.operation
            : original.preparation.operation,
      },
    ])
    expect(events[0]?.cause).toBe(cause)
    failAt = 0
    const waiting = environment.prepare(f.other())
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(f.calls).toEqual([original.preparation])
    expect(f.releases).toEqual([])
    await environment.release(release)
    expect(await waiting).toHaveProperty('ok.kind', 'prepared')
  },
)

it.each(['call', 'operation', 'purpose', 'inputDigest', 'request'] as const)(
  'rejects malformed preparation %s without occupying a slot',
  async field => {
    const f = environmentBoundaryFixture()
    const original = f.preparation('a')
    const malformed = { ...original, preparation: { ...original.preparation } }
    if (field === 'call') Reflect.set(malformed, field, '')
    else Reflect.set(malformed.preparation, field, field === 'request' ? {} : '')
    const events: ToolEnvironmentDiagnostic[] = []
    const environment = createLocalScheduledEnvironment({
      ...f,
      environment: f.provider,
      diagnostics: {
        record: async event => {
          events.push(event)
          return { kind: 'recorded' }
        },
      },
    })
    expect(await environment.prepare(malformed)).toHaveProperty('failure.kind', 'invalid')
    expect(await environment.inspectPreparation(malformed)).toHaveProperty(
      'failure.kind',
      'invalid',
    )
    expect(f.calls).toEqual([])
    expect(events).toEqual([])
    expect(await environment.prepare(f.other())).toHaveProperty('ok.kind', 'prepared')
  },
)

it('rejects excess queued work and releases exactly one occupied slot after duplicate confirmations', async () => {
  const f = environmentBoundaryFixture()
  const environment = createLocalScheduledEnvironment({
    ...f,
    environment: f.provider,
    policy: { ...f.policy, capacity: 1 },
    diagnostics: { record: async () => ({ kind: 'unavailable' }) },
  })
  const active = f.preparation('a'),
    queued = f.other(),
    excess = f.preparation('excess')
  await environment.prepare(active)
  const waiting = environment.prepare(queued)
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(await environment.prepare(excess)).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'tool-environment-scheduler',
      diagnostic: 'preparation queue capacity reached',
    },
  })
  const release = await f.release(active)
  await Promise.all([environment.release(release), environment.release(release)])
  expect(await waiting).toHaveProperty('ok.kind', 'prepared')
  const after = environment.prepare(excess)
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(f.calls).toEqual([active.preparation, queued.preparation])
  await environment.release(await f.release(queued))
  expect(await after).toHaveProperty('ok.kind', 'prepared')
  expect(f.calls).toEqual([active.preparation, queued.preparation, excess.preparation])
})

it.each(['release', 'inspectRelease', 'retry'] as const)(
  'does not yield between the final adoption check and the %s resource call',
  async verb => {
    const f = environmentBoundaryFixture()
    let current = f.backing.adoption
    let reads = 0,
      replaceAt = 0
    const seen: (typeof current)[] = []
    const environment = createLocalScheduledEnvironment({
      ...f,
      environment: {
        ...f.provider,
        get adoption() {
          if (++reads === replaceAt)
            queueMicrotask(() => {
              current = { ...current, name: 'replacement' }
            })
          return current
        },
        release: input => {
          seen.push(current)
          return f.provider.release(input)
        },
        inspectRelease: input => {
          seen.push(current)
          return f.provider.inspectRelease(input)
        },
        inspectPreparation: input => {
          seen.push(current)
          return f.provider.inspectPreparation(input)
        },
      },
      diagnostics: { record: async () => ({ kind: 'unavailable' }) },
    })
    const original = f.preparation('a')
    await environment.prepare(original)
    const release = await f.release(original)
    reads = 0
    replaceAt = verb === 'retry' ? 3 : 4
    if (verb === 'retry') await environment.prepare(original)
    else await environment[verb](release)
    expect(seen).toEqual([f.backing.adoption])
    expect(current.name).toBe('replacement')
  },
)

it('returns the new reservation when requalification fails after a confirmed exclusion', async () => {
  const f = environmentBoundaryFixture()
  let failDispatch = false,
    checks = 0
  const environment = createLocalScheduledEnvironment({
    ...f,
    environment: f.provider,
    diagnostics: { record: async () => ({ kind: 'unavailable' }) },
    qualify: async () =>
      failDispatch && ++checks === 2
        ? fail({ kind: 'denied', action: 'prepare' })
        : succeed(undefined),
  })
  const original = f.preparation('a')
  f.backing.controls.hold()
  expect(await environment.prepare(original)).toHaveProperty('ok.kind', 'pending')
  await f.backing.controls.excludeDeferred(original.preparation)
  expect(await environment.inspectPreparation(original)).toHaveProperty('ok.kind', 'excluded')
  failDispatch = true
  expect(await environment.prepare(original)).toEqual({
    failure: { kind: 'denied', action: 'prepare' },
  })
  expect(f.calls).toEqual([original.preparation])
  failDispatch = false
  const other = f.other()
  expect(await environment.prepare(other)).toHaveProperty('ok.kind', 'prepared')
  await environment.release(await f.release(other))
  expect(await environment.prepare(original)).toHaveProperty('ok.kind', 'prepared')
  expect(f.calls).toEqual([original.preparation, other.preparation, original.preparation])
  expect(f.backing.controls.allocations()).toBe(2)
})

// The counterexamples of the #675 round-2 QA (`additionalPrepares=1`, `invalidForwards=1`): the
// last adoption read of `check` queues a microtask that replaces the current adoption; the outer
// `await check` resumes after it ran. Each path must then refuse instead of forwarding the stale
// original to the adapter.
function forwardRace(f: ReturnType<typeof environmentBoundaryFixture>) {
  const original = f.backing.adoption
  let current = original
  let reads = 0
  let replaceAt = Number.POSITIVE_INFINITY
  const invalidForwards: string[] = []
  const environment = createLocalScheduledEnvironment({
    ...f,
    environment: {
      ...f.provider,
      get adoption() {
        if (++reads === replaceAt)
          queueMicrotask(() => {
            current = { ...current, name: 'replacement' }
          })
        return current
      },
      prepare: input => {
        if (current !== original) invalidForwards.push('prepare')
        return f.provider.prepare(input)
      },
      inspectPreparation: input => {
        if (current !== original) invalidForwards.push('inspectPreparation')
        return f.provider.inspectPreparation(input)
      },
    },
    diagnostics: { record: async () => ({ kind: 'unavailable' }) },
  })
  return {
    environment,
    invalidForwards,
    arm: (at: number) => {
      reads = 0
      replaceAt = at
    },
    restore: () => {
      replaceAt = Number.POSITIVE_INFINITY
      current = original
    },
    replaced: () => current !== original,
  }
}

it('refuses the first send when the adoption changed after the dispatch check resumed, and returns the unsent reservation', async () => {
  const f = environmentBoundaryFixture()
  const race = forwardRace(f)
  const original = f.preparation('a')
  race.arm(4)
  const refused = await race.environment.prepare(original)
  expect(race.replaced()).toBe(true)
  expect(race.invalidForwards).toEqual([])
  expect(f.calls).toEqual([])
  expect(refused).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'tool-environment-scheduler',
      diagnostic: 'the original environment adapter is unavailable',
    },
  })
  expect(f.backing.controls.allocations()).toBe(0)
  // The reservation went back: once the adapter is back, another tenant takes the single slot at once.
  race.restore()
  const other = f.other()
  expect(await race.environment.prepare(other)).toHaveProperty('ok.kind', 'prepared')
  await race.environment.release(await f.release(other))
  // The original binding is retained; the same original is sent on the next explicit request.
  expect(await race.environment.prepare(original)).toHaveProperty('ok.kind', 'prepared')
  expect(f.calls).toEqual([other.preparation, original.preparation])
})

it('refuses the recognizing prepare when the adoption changed after the recheck resumed, and keeps the original allocation', async () => {
  const f = environmentBoundaryFixture()
  const race = forwardRace(f)
  const original = f.preparation('a')
  f.backing.controls.allocateBeforeAdoption()
  expect(await race.environment.prepare(original)).toHaveProperty('ok.kind', 'unknown')
  expect(f.backing.controls.allocations()).toBe(1)
  expect(f.backing.controls.leases()).toBe(0)
  race.arm(5)
  const refused = await race.environment.prepare(original)
  expect(race.replaced()).toBe(true)
  expect(race.invalidForwards).toEqual([])
  expect(f.calls).toEqual([original.preparation])
  expect(refused).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'tool-environment-scheduler',
      diagnostic: 'the original environment adapter is unavailable',
    },
  })
  expect(f.backing.controls.allocations()).toBe(1)
  expect(f.backing.controls.leases()).toBe(0)
  // The sent original keeps its slot and its query responsibility; it is recognized once the adapter is back.
  race.restore()
  expect(await race.environment.prepare(original)).toHaveProperty('ok.kind', 'prepared')
  expect(f.calls).toEqual([original.preparation, original.preparation])
  expect(f.backing.controls.allocations()).toBe(1)
  expect(f.backing.controls.leases()).toBe(1)
})

it('refuses a direct inspectPreparation when the adoption changed after its check resumed', async () => {
  const f = environmentBoundaryFixture()
  const race = forwardRace(f)
  const original = f.preparation('a')
  expect(await race.environment.prepare(original)).toHaveProperty('ok.kind', 'prepared')
  race.arm(2)
  const refused = await race.environment.inspectPreparation(original)
  expect(race.replaced()).toBe(true)
  expect(race.invalidForwards).toEqual([])
  expect(refused).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'tool-environment-scheduler',
      diagnostic: 'the original environment adapter is unavailable',
    },
  })
  race.restore()
  expect(await race.environment.inspectPreparation(original)).toHaveProperty('ok.kind', 'prepared')
  expect(f.calls).toEqual([original.preparation])
})

it.each(['first-send', 'recognize', 'inspect'] as const)(
  'returns the slot before the diagnostic receiver finishes when the adoption getter throws at the final %s check',
  async path => {
    const f = environmentBoundaryFixture()
    const original = f.backing.adoption
    let reads = 0
    let throwAt = Number.POSITIVE_INFINITY
    const cause = new Error('adapter getter failed')
    const events: ToolEnvironmentDiagnostic[] = []
    const gate = barrier()
    const environment = createLocalScheduledEnvironment({
      ...f,
      environment: {
        ...f.provider,
        get adoption() {
          if (++reads === throwAt) throw cause
          return original
        },
      },
      diagnostics: {
        record: async event => {
          events.push(event)
          await gate.wait
          return { kind: 'recorded' }
        },
      },
    })
    const input = f.preparation('a')
    if (path === 'recognize') {
      f.backing.controls.allocateBeforeAdoption()
      expect(await environment.prepare(input)).toHaveProperty('ok.kind', 'unknown')
    }
    if (path === 'inspect')
      expect(await environment.prepare(input)).toHaveProperty('ok.kind', 'prepared')
    reads = 0
    throwAt = path === 'first-send' ? 5 : path === 'recognize' ? 6 : 3
    const refused =
      path === 'inspect' ? environment.inspectPreparation(input) : environment.prepare(input)
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      stage: 'qualify',
      tenant: input.tenant,
      call: input.call,
      operation: input.preparation.operation,
      cause,
    })
    if (path === 'first-send') {
      // The unsent reservation is already back while the receiver still waits.
      throwAt = Number.POSITIVE_INFINITY
      const other = f.other()
      expect(await environment.prepare(other)).toHaveProperty('ok.kind', 'prepared')
    }
    gate.open()
    expect(await refused).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'tool-environment-scheduler',
        diagnostic: 'environment operation failed; stage=qualify; diagnostic=recorded',
      },
    })
    // Nothing was forwarded for the refused path; the first-send case only sent the other tenant.
    expect(f.calls.map(record => record.operation)).toEqual(
      path === 'first-send' ? [f.other().preparation.operation] : [input.preparation.operation],
    )
  },
)
