import { succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type {
  PreparationRecord,
  ReleaseRecord,
  ToolEnvironment,
} from '@omne-harness/tool-contract/provider'
import {
  createMemoryToolEnvironment,
  testingTenant,
  type MemoryEnvironment,
} from '@omne-harness/tool-contract/testing'
import {
  createLocalScheduledEnvironment,
  type ToolEnvironmentSchedulingPolicy,
} from '@omne-harness/tool-host-local'
import { describe, expect, it } from 'vitest'
import {
  callId,
  evidence,
  operationId,
  principalA,
  principalB,
  request,
  tenantA,
  tenantB,
  type Principal,
} from './coordinator-values.ts'

function barrier() {
  let open = () => {}
  const wait = new Promise<void>(resolve => {
    open = resolve
  })
  return { wait, open }
}

function policy(
  overrides: Partial<ToolEnvironmentSchedulingPolicy<Principal>> = {},
): ToolEnvironmentSchedulingPolicy<Principal> {
  return {
    quantum: 1,
    capacity: 32,
    inFlight: 8,
    tenant: () => ({ weight: 1, inFlight: 1 }),
    retry: async () => 'recognize',
    release: async () => 'release',
    ...overrides,
  }
}

function fixture(changes: Partial<ToolEnvironmentSchedulingPolicy<Principal>> = {}) {
  const backing = createMemoryToolEnvironment<Principal>()
  const calls: string[] = []
  const inspected: string[] = []
  let before: (operation: string) => Promise<void> = async () => {}
  let throwAfter = false
  let rejectAfter = false
  let unsettledRelease: 'pending' | 'unknown' | null = null
  const provider: ToolEnvironment<Principal, MemoryEnvironment> = {
    ...backing,
    prepare: async input => {
      calls.push(input.preparation.operation)
      await before(input.preparation.operation)
      const result = await backing.prepare(input)
      if (throwAfter) {
        throwAfter = false
        throw new Error('lost reply')
      }
      if (rejectAfter)
        return succeed({
          kind: 'rejected',
          reason: 'adoption failed',
          evidence: evidence('adoption-failure'),
        })
      return result
    },
    inspectPreparation: input => {
      inspected.push(input.preparation.operation)
      return backing.inspectPreparation(input)
    },
    release: input =>
      unsettledRelease !== null
        ? Promise.resolve(succeed({ kind: unsettledRelease, diagnostic: 'cleanup pending' }))
        : backing.release(input),
  }
  const environment = createLocalScheduledEnvironment({
    environment: provider,
    policy: policy(changes),
    qualify: async () => succeed(undefined),
  })
  const preparation = (id: string, tenant = tenantA) => {
    const fixed = request()
    const record: PreparationRecord = {
      tenant,
      call: callId(id),
      operation: operationId(id),
      adoption: provider.adoption,
      inputDigest: canonicalDigest(fixed),
      purpose: 'initial',
      request: fixed,
    }
    return {
      principal: tenant === tenantA ? principalA : principalB,
      tenant,
      call: record.call,
      preparation: record,
    }
  }
  const release = async (input: ReturnType<typeof preparation>) => {
    const prepared = await backing.inspectPreparation(input)
    if ('failure' in prepared || prepared.ok.kind !== 'prepared')
      throw new Error('fixture allocation absent')
    const record: ReleaseRecord = {
      tenant: input.tenant,
      call: input.call,
      operation: operationId(`${input.call}/release`),
      adoption: provider.adoption,
      inputDigest: 'release',
      preparation: input.preparation.operation,
      resource: prepared.ok.environment.evidence,
      custody: evidence('custody'),
    }
    return { principal: input.principal, tenant: input.tenant, call: input.call, release: record }
  }
  return {
    environment,
    provider,
    preparation,
    release,
    backing,
    calls,
    inspected,
    before: (work: typeof before) => {
      before = work
    },
    loseReply: () => {
      throwAfter = true
    },
    rejectAfterAllocation: () => {
      rejectAfter = true
    },
    deferRelease: (kind: 'pending' | 'unknown') => {
      unsettledRelease = kind
    },
    releaseUnknown: (value: boolean) => {
      unsettledRelease = value ? 'unknown' : null
    },
  }
}

it('a slow tenant A prepare does not prevent B from completing', async () => {
  const f = fixture()
  const entered = barrier()
  const resume = barrier()
  f.before(async operation => {
    if (operation === 'a') {
      entered.open()
      await resume.wait
    }
  })
  const a = f.environment.prepare(f.preparation('a'))
  await entered.wait
  try {
    expect(await f.environment.prepare(f.preparation('b', tenantB))).toMatchObject({
      ok: { kind: 'prepared' },
    })
  } finally {
    resume.open()
  }
  expect(await a).toMatchObject({ ok: { kind: 'prepared' } })
})

it('a full tenant retains unknown slots while B advances; queries and original recognition allocate nothing new', async () => {
  const f = fixture()
  const a = f.preparation('a')
  f.backing.controls.hold()
  expect(await f.environment.prepare(a)).toMatchObject({ ok: { kind: 'pending' } })
  const a2 = f.preparation('a2')
  const queued = f.environment.prepare(a2)
  expect(await f.environment.prepare(a)).toMatchObject({ ok: { kind: 'pending' } })
  expect(f.calls).toEqual(['a'])
  expect(await f.environment.prepare(f.preparation('b', tenantB))).toMatchObject({
    ok: { kind: 'prepared' },
  })
  expect(f.calls).toEqual(['a', 'b'])
  await f.backing.controls.settle()
  expect(await f.environment.inspectPreparation(a)).toMatchObject({ ok: { kind: 'prepared' } })
  expect(await f.environment.prepare(a)).toMatchObject({ ok: { kind: 'prepared' } })
  expect(f.backing.controls.allocations()).toBe(2)
  expect(f.calls).toEqual(['a', 'b', 'a'])
  expect(await f.environment.release(await f.release(a))).toMatchObject({
    ok: { kind: 'released' },
  })
  expect(await queued).toMatchObject({ ok: { kind: 'prepared' } })
  expect(f.backing.controls.allocations()).toBe(3)
})

it('a lost prepare reply preserves the original operation, allocation and capacity until reliable release', async () => {
  const f = fixture()
  const a = f.preparation('a')
  f.loseReply()
  expect(await f.environment.prepare(a)).toMatchObject({ ok: { kind: 'unknown' } })
  const queued = f.environment.prepare(f.preparation('a2'))
  expect(await f.environment.prepare(a)).toMatchObject({ ok: { kind: 'prepared' } })
  expect(f.backing.controls.allocations()).toBe(1)
  expect(f.calls).toEqual(['a', 'a'])
  await f.environment.release(await f.release(a))
  expect(await queued).toMatchObject({ ok: { kind: 'prepared' } })
  expect(await f.environment.prepare(a)).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(f.backing.controls.allocations()).toBe(2)
})

it('replacement retry and cancellation timing policies are consumed by actual environment verbs', async () => {
  let retry: 'wait' | 'inspect' | 'recognize' = 'wait'
  let release: 'wait' | 'release' = 'wait'
  const f = fixture({ retry: async () => retry, release: async () => release })
  const a = f.preparation('a')
  await f.environment.prepare(a)
  const queued = f.environment.prepare(f.preparation('a2'))
  expect(await f.environment.prepare(a)).toMatchObject({ ok: { kind: 'pending' } })
  expect(f.inspected).toEqual([])
  retry = 'inspect'
  expect(await f.environment.prepare(a)).toMatchObject({ ok: { kind: 'prepared' } })
  expect(f.calls).toEqual(['a'])
  expect(f.inspected).toEqual(['a'])
  const releaseInput = await f.release(a)
  expect(await f.environment.release(releaseInput)).toMatchObject({ ok: { kind: 'pending' } })
  expect(f.calls).toEqual(['a'])
  release = 'release'
  expect(await f.environment.release(releaseInput)).toMatchObject({ ok: { kind: 'released' } })
  expect(await queued).toMatchObject({ ok: { kind: 'prepared' } })
})

it.each([1, 2])(
  'DRR uses quantum %s and tenant weights through prepare dispatch',
  async quantum => {
    const f = fixture({
      quantum,
      inFlight: 1,
      tenant: tenant => ({ weight: tenant === tenantA ? 2 : 1, inFlight: 8 }),
    })
    const inputs = ['a1', 'a2', 'a3', 'a4']
      .map(id => f.preparation(id))
      .concat(['b1', 'b2', 'b3', 'b4'].map(id => f.preparation(id, tenantB)))
    const warmup = f.preparation(
      'warmup',
      testingTenant('org_44444444444444444444444444', 'acc_55555555555555555555555555'),
    )
    await f.environment.prepare(warmup)
    const waiting = new Map(inputs.map(input => [input.call, f.environment.prepare(input)]))
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(f.calls).toEqual(['warmup'])
    await f.environment.release(await f.release(warmup))
    for (let index = 0; index < inputs.length; index += 1) {
      await new Promise<void>(resolve => setImmediate(resolve))
      const dispatched = inputs.find(input => input.call === f.calls[index + 1])
      if (!dispatched) throw new Error('queued preparation was not dispatched')
      expect(await waiting.get(dispatched.call)).toMatchObject({ ok: { kind: 'prepared' } })
      await f.environment.release(await f.release(dispatched))
    }
    expect(f.calls.slice(1)).toEqual(
      quantum === 1
        ? ['a1', 'a2', 'b1', 'a3', 'a4', 'b2', 'b3', 'b4']
        : ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4'],
    )
  },
)

it('rejection is terminal but cannot prove zero occupancy or release cleanup responsibility', async () => {
  const f = fixture()
  const a = f.preparation('a')
  f.backing.controls.rejectNext('quota')
  expect(await f.environment.prepare(a)).toMatchObject({ ok: { kind: 'rejected' } })
  expect(await f.environment.prepare(a)).toMatchObject({ ok: { kind: 'rejected' } })
  expect(f.calls).toEqual(['a'])
  const next = f.preparation('new-a')
  void f.environment.prepare(next)
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(await f.environment.inspectPreparation(next)).toMatchObject({ ok: { kind: 'pending' } })
  expect(f.calls).toEqual(['a'])
  expect(await f.environment.prepare(f.preparation('b', tenantB))).toMatchObject({
    ok: { kind: 'prepared' },
  })
})

it('an adoption failure retains its slot through unknown cleanup until release is confirmed', async () => {
  const f = fixture()
  const a = f.preparation('a')
  f.rejectAfterAllocation()
  expect(await f.environment.prepare(a)).toMatchObject({ ok: { kind: 'rejected' } })
  const next = f.environment.prepare(f.preparation('next'))
  const releasing = await f.release(a)
  f.releaseUnknown(true)
  expect(await f.environment.release(releasing)).toMatchObject({ ok: { kind: 'unknown' } })
  expect(f.calls).toEqual(['a'])
  f.releaseUnknown(false)
  expect(await f.environment.release(releasing)).toMatchObject({ ok: { kind: 'released' } })
  expect(await next).toMatchObject({ ok: { kind: 'rejected' } })
  expect(f.calls).toEqual(['a', 'next'])
})

it('reliable exclusion permits the original operation to make its first allocation', async () => {
  const f = fixture()
  const a = f.preparation('a')
  f.backing.controls.hold()
  await f.environment.prepare(a)
  await f.backing.controls.excludeDeferred(a.preparation)
  expect(await f.environment.inspectPreparation(a)).toMatchObject({ ok: { kind: 'excluded' } })
  expect(await f.environment.prepare(a)).toMatchObject({ ok: { kind: 'prepared' } })
  expect(f.backing.controls.allocations()).toBe(1)
  expect(f.calls).toEqual(['a', 'a'])
})

it('all four verbs refuse the old adoption after a provider proxy changes its target', async () => {
  const f = fixture()
  const a = f.preparation('a')
  let current = f.provider
  let calls = 0
  const proxy: ToolEnvironment<Principal, MemoryEnvironment> = {
    get adoption() {
      return current.adoption
    },
    prepare: input => {
      calls += 1
      return current.prepare(input)
    },
    inspectPreparation: input => {
      calls += 1
      return current.inspectPreparation(input)
    },
    release: input => {
      calls += 1
      return current.release(input)
    },
    inspectRelease: input => {
      calls += 1
      return current.inspectRelease(input)
    },
  }
  const wrapper = createLocalScheduledEnvironment({
    environment: proxy,
    policy: policy(),
    qualify: async () => succeed(undefined),
  })
  await wrapper.prepare(a)
  const release = await f.release(a)
  current = { ...f.provider, adoption: { ...f.provider.adoption, digest: 'new-provider' } }
  expect(wrapper.adoption.digest).toBe('new-provider')
  for (const result of [
    await wrapper.prepare(a),
    await wrapper.inspectPreparation(a),
    await wrapper.release(release),
    await wrapper.inspectRelease(release),
  ])
    expect.soft(result).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(calls).toBe(1)
})

it('does not coalesce altered input or an alternate tenant into an existing operation', async () => {
  const f = fixture()
  const a = f.preparation('a')
  await f.environment.prepare(a)
  expect(
    await f.environment.prepare({ ...a, preparation: { ...a.preparation, purpose: 'resume' } }),
  ).toMatchObject({ failure: { kind: 'conflict' } })
  expect(
    await f.environment.prepare({ ...a, tenant: tenantB, principal: principalB }),
  ).toMatchObject({ failure: { kind: 'denied' } })
  expect(f.calls).toEqual(['a'])
})

describe('scheduling configuration', () => {
  it.each([0, -1, NaN, Infinity])('rejects quantum %s without allocating', quantum => {
    expect(() => fixture({ quantum })).toThrow(TypeError)
  })
  it.each([-1, 1.2, NaN, Infinity])('rejects invalid capacity %s', capacity => {
    expect(() => fixture({ capacity })).toThrow(TypeError)
    expect(() => fixture({ inFlight: capacity })).toThrow(TypeError)
  })
  it('permits zero capacity as a disabled queue', async () => {
    const f = fixture({ capacity: 0 })
    expect(await f.environment.prepare(f.preparation('a'))).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(f.calls).toEqual([])
  })
  it('rejects invalid tenant limits before dispatch', async () => {
    for (const limits of [
      { weight: 0, inFlight: 1 },
      { weight: 1, inFlight: -1 },
    ]) {
      const f = fixture({ tenant: () => limits })
      await expect(f.environment.prepare(f.preparation('a'))).rejects.toThrow(TypeError)
      expect(f.calls).toEqual([])
    }
  })
})

it('retains allocated-but-not-adopted work when the four-verb progress cannot express adoption readiness', async () => {
  const f = fixture()
  let allocations = 0
  let leases = 0
  let prepares = 0
  let inspections = 0
  const provider: ToolEnvironment<Principal, MemoryEnvironment> = {
    ...f.provider,
    prepare: async () => {
      prepares += 1
      if (allocations === 0) allocations += 1
      else leases += 1
      return succeed({ kind: 'pending', diagnostic: 'original work incomplete' })
    },
    inspectPreparation: async () => {
      inspections += 1
      // The provider knows it allocated, but has no E until the separate adoption action.
      return succeed({ kind: 'pending', diagnostic: 'original work incomplete' })
    },
  }
  const wrapper = createLocalScheduledEnvironment({
    environment: provider,
    policy: policy(),
    qualify: async () => succeed(undefined),
  })
  const original = f.preparation('original')
  expect(await wrapper.prepare(original)).toMatchObject({ ok: { kind: 'pending' } })
  expect(await wrapper.inspectPreparation(original)).toMatchObject({ ok: { kind: 'pending' } })
  expect(await wrapper.prepare(original)).toMatchObject({ ok: { kind: 'pending' } })
  expect({ allocations, leases, prepares, inspections }).toEqual({
    allocations: 1,
    leases: 0,
    prepares: 1,
    inspections: 2,
  })
  // This is the counterexample, not a claim that first adoption completed.
})

it('keeps tenant FIFO through slow qualification and freezes each call settings before awaiting', async () => {
  const f = fixture()
  const entered = barrier()
  const resume = barrier()
  const seen: string[] = []
  const provider: ToolEnvironment<Principal, MemoryEnvironment> = {
    ...f.provider,
    prepare: input => {
      seen.push(input.preparation.request.settings.digest)
      return f.provider.prepare(input)
    },
  }
  const wrapper = createLocalScheduledEnvironment({
    environment: provider,
    policy: policy({ tenant: () => ({ weight: 1, inFlight: 4 }) }),
    qualify: async input => {
      if (input.call === 'first') {
        entered.open()
        await resume.wait
      }
      return succeed(undefined)
    },
  })
  const firstInput = f.preparation('first')
  const firstSettings = { ...firstInput.preparation.request.settings }
  const first = wrapper.prepare({
    ...firstInput,
    preparation: {
      ...firstInput.preparation,
      request: { ...firstInput.preparation.request, settings: firstSettings },
    },
  })
  await entered.wait
  firstSettings.digest = 'changed-after-entry'
  const secondInput = f.preparation('second')
  const second = wrapper.prepare({
    ...secondInput,
    preparation: {
      ...secondInput.preparation,
      request: {
        ...secondInput.preparation.request,
        settings: { ...secondInput.preparation.request.settings, digest: 'second-settings' },
      },
    },
  })
  const foreign = f.preparation('other', tenantB)
  expect(await wrapper.prepare(foreign)).toMatchObject({ ok: { kind: 'prepared' } })
  expect(f.calls).toEqual(['other'])
  resume.open()
  expect(await first).toMatchObject({ ok: { kind: 'prepared' } })
  expect(await second).toMatchObject({ ok: { kind: 'prepared' } })
  expect(f.calls).toEqual(['other', 'first', 'second'])
  expect(seen).toEqual([
    foreign.preparation.request.settings.digest,
    firstInput.preparation.request.settings.digest,
    'second-settings',
  ])
})

it.each(['release', 'inspectRelease'] as const)(
  '%s confirmation removes queued original work and settles its wait without consuming capacity',
  async verb => {
    const f = fixture({ capacity: 1, inFlight: 1 })
    const active = f.preparation('active')
    const cancelled = f.preparation('cancelled', tenantB)
    await f.environment.prepare(active)
    // An original allocation can predate this local scheduler, for example after reconstruction.
    await f.backing.prepare(cancelled)
    const waiting = f.environment.prepare(cancelled)
    let result: Awaited<typeof waiting> | undefined
    void waiting.then(value => {
      result = value
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    const release = await f.release(cancelled)
    if (verb === 'inspectRelease') await f.backing.release(release)
    const confirmed = await f.environment[verb](release)
    expect(confirmed).toMatchObject({ ok: { kind: 'released' } })
    expect(confirmed).toEqual(await f.backing.inspectRelease(release))
    await new Promise<void>(resolve => setImmediate(resolve))
    expect.soft(result).toMatchObject({ failure: { kind: 'unavailable' } })
    const next = f.preparation('next', tenantB)
    const following = f.environment.prepare(next)
    await f.environment.release(await f.release(active))
    expect(await following).toMatchObject({ ok: { kind: 'prepared' } })
    expect(f.calls).toEqual(['active', 'next'])
    expect(await f.environment.prepare(cancelled)).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(f.backing.controls.allocations()).toBe(3)
    await f.environment.release(await f.release(next))
  },
)

it.each(['pending', 'unknown'] as const)(
  '%s release keeps queued work until a release is confirmed',
  async kind => {
    const f = fixture({ inFlight: 1 })
    const active = f.preparation('active')
    const queued = f.preparation('queued', tenantB)
    await f.environment.prepare(active)
    await f.backing.prepare(queued)
    const waiting = f.environment.prepare(queued)
    await new Promise<void>(resolve => setImmediate(resolve))
    f.deferRelease(kind)
    expect(await f.environment.release(await f.release(queued))).toMatchObject({ ok: { kind } })
    expect(f.calls).toEqual(['active'])
    f.releaseUnknown(false)
    await f.environment.release(await f.release(active))
    expect(await waiting).toMatchObject({ ok: { kind: 'prepared' } })
    expect(f.calls).toEqual(['active', 'queued'])
    expect(f.backing.controls.allocations()).toBe(2)
    await f.environment.release(await f.release(queued))
  },
)

it.each([
  { verb: 'release', stage: 'qualify' },
  { verb: 'release', stage: 'policy' },
  { verb: 'inspectRelease', stage: 'qualify' },
] as const)('fixes $verb input before awaiting $stage', async ({ verb, stage }) => {
  const f = fixture()
  const entered = barrier()
  const resume = barrier()
  const received: Parameters<typeof f.provider.release>[0][] = []
  let releasing = false
  const provider: typeof f.provider = {
    ...f.provider,
    [verb]: (input: Parameters<typeof f.provider.release>[0]) => {
      received.push(input)
      return f.provider[verb](input)
    },
  }
  const wrapper = createLocalScheduledEnvironment({
    environment: provider,
    policy: policy({
      release: async () => {
        if (stage === 'policy') {
          entered.open()
          await resume.wait
        }
        return 'release'
      },
    }),
    qualify: async () => {
      if (releasing && stage === 'qualify') {
        entered.open()
        await resume.wait
      }
      return succeed(undefined)
    },
  })
  const original = f.preparation('original')
  await wrapper.prepare(original)
  const originalRelease = await f.release(original)
  if (verb === 'inspectRelease') await f.backing.release(originalRelease)
  const record = {
    ...originalRelease.release,
    adoption: { ...originalRelease.release.adoption },
    resource: { ...originalRelease.release.resource },
    custody: { ...originalRelease.release.custody },
  }
  const mutable = { ...originalRelease, release: record }
  releasing = true
  const waiting = wrapper[verb](mutable)
  await entered.wait
  record.adoption.digest = 'mutated-adoption'
  record.resource.record = 'mutated-resource'
  record.custody.record = 'mutated-custody'
  record.inputDigest = 'mutated-input'
  const other = f.preparation('other', tenantB)
  await f.backing.prepare(other)
  Object.assign(mutable, await f.release(other))
  resume.open()
  expect(await waiting).toMatchObject({ ok: { kind: 'released' } })
  expect(received).toEqual([originalRelease])
  expect(received[0]?.principal).toBe(originalRelease.principal)
  expect(await f.backing.inspectPreparation(other)).toMatchObject({ ok: { kind: 'prepared' } })
})

it.each(['retry', 'inspect'] as const)(
  'release confirmation during %s prevents subsequent original recognition',
  async stage => {
    const f = fixture()
    const entered = barrier()
    const resume = barrier()
    const pause = async () => {
      entered.open()
      await resume.wait
    }
    const provider: typeof f.provider = {
      ...f.provider,
      inspectPreparation: async input => {
        const result = await f.provider.inspectPreparation(input)
        if (stage === 'inspect') await pause()
        return result
      },
    }
    const wrapper = createLocalScheduledEnvironment({
      environment: provider,
      policy: policy({
        retry: async () => {
          if (stage === 'retry') await pause()
          return 'recognize'
        },
      }),
      qualify: async () => succeed(undefined),
    })
    const original = f.preparation('original')
    await wrapper.prepare(original)
    const recognition = wrapper.prepare(original)
    await entered.wait
    expect(await wrapper.release(await f.release(original))).toMatchObject({
      ok: { kind: 'released' },
    })
    resume.open()
    await recognition
    expect(f.calls).toEqual(['original'])
    expect(await wrapper.prepare(original)).toMatchObject({ failure: { kind: 'unavailable' } })
  },
)

it.each(['prepared', 'excluded'] as const)(
  'late %s after confirmed release cannot enqueue the original operation again',
  async kind => {
    const f = fixture()
    const entered = barrier()
    const resume = barrier()
    const original = f.preparation('original')
    f.backing.controls.hold()
    await f.backing.prepare(original)
    await f.backing.controls.excludeDeferred(original.preparation)
    const excluded = await f.backing.inspectPreparation(original)
    expect(excluded).toMatchObject({ ok: { kind: 'excluded' } })
    const prepared = await f.backing.prepare(original)
    const earlier = kind === 'prepared' ? prepared : excluded
    const provider: typeof f.provider = {
      ...f.provider,
      prepare: async input => {
        await f.provider.prepare(input)
        entered.open()
        await resume.wait
        // A stale provider reply cannot override a newer confirmed release.
        return earlier
      },
    }
    const wrapper = createLocalScheduledEnvironment({
      environment: provider,
      policy: policy(),
      qualify: async () => succeed(undefined),
    })
    const preparing = wrapper.prepare(original)
    await entered.wait
    expect(await wrapper.release(await f.release(original))).toMatchObject({
      ok: { kind: 'released' },
    })
    resume.open()
    expect(await preparing).toEqual(earlier)
    expect(await wrapper.prepare(original)).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(f.calls).toEqual(['original'])
  },
)

it('removes only the released middle entry and settles every original waiter', async () => {
  const f = fixture({ inFlight: 1 })
  const active = f.preparation('active')
  await f.environment.prepare(active)
  const first = f.preparation('first', tenantB)
  const middle = f.preparation('middle', tenantB)
  const last = f.preparation('last', tenantB)
  await f.backing.prepare(middle)
  const waitingFirst = f.environment.prepare(first)
  const waitingMiddle = f.environment.prepare(middle)
  const repeatedMiddle = f.environment.prepare(middle)
  const waitingLast = f.environment.prepare(last)
  await new Promise<void>(resolve => setImmediate(resolve))
  await f.environment.release(await f.release(middle))
  expect(await waitingMiddle).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(await repeatedMiddle).toEqual(await waitingMiddle)
  await f.environment.release(await f.release(active))
  expect(await waitingFirst).toMatchObject({ ok: { kind: 'prepared' } })
  expect(f.calls).toEqual(['active', 'first'])
  await f.environment.release(await f.release(first))
  expect(await waitingLast).toMatchObject({ ok: { kind: 'prepared' } })
  expect(f.calls).toEqual(['active', 'first', 'last'])
  await f.environment.release(await f.release(last))
})
