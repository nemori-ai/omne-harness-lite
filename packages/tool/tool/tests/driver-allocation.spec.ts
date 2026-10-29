import { fail, succeed } from '@omne-harness/operation-result'
import type {
  PreparationProgress,
  PreparationRecord,
  ToolEnvironment,
} from '@omne-harness/tool-contract/provider'
import { createMemoryToolEnvironment } from '@omne-harness/tool-contract/testing'
import { afterEach, describe, expect, it } from 'vitest'
import {
  admission,
  callId,
  operationId,
  principalA,
  tenantA,
  tenantB,
  ok,
  type Principal,
} from './runtime-values.ts'
import {
  admitCall,
  auditQueues,
  startHarness,
  writeContext,
  type TestEnvironment,
} from './start-values.ts'

afterEach(auditQueues)

function fixture() {
  const backing = createMemoryToolEnvironment<Principal>()
  backing.controls.allocateBeforeAdoption()
  const requests: PreparationRecord[] = []
  let current = backing.adoption
  let allocationReply = false
  let queries = 0
  let transform = (progress: PreparationProgress<TestEnvironment>) => progress
  let waitAdoption = false
  let retryOutcome: 'pending' | 'unknown' | 'unavailable' | null = null
  const convert = (
    progress: PreparationProgress<{ resource: string }>,
  ): PreparationProgress<TestEnvironment> =>
    progress.kind === 'prepared'
      ? {
          kind: 'prepared',
          environment: {
            ...progress.environment,
            value: { preparedFor: progress.environment.preparation.call },
          },
        }
      : progress
  const provider: ToolEnvironment<Principal, TestEnvironment> = {
    ...backing,
    get adoption() {
      return current
    },
    prepare: async input => {
      requests.push(input.preparation)
      if (requests.length > 1 && retryOutcome !== null)
        return retryOutcome === 'unavailable'
          ? fail({
              kind: 'unavailable',
              dependency: 'test-adapter',
              diagnostic: 'adoption unavailable',
            })
          : succeed({ kind: retryOutcome, diagnostic: 'adoption incomplete' })
      const answer = await (waitAdoption && requests.length > 1
        ? backing.inspectPreparation(input)
        : backing.prepare(input))
      const reply =
        allocationReply && 'ok' in answer && answer.ok.kind === 'unknown'
          ? await backing.inspectPreparation(input)
          : answer
      return 'failure' in reply ? reply : succeed(transform(convert(reply.ok)))
    },
    inspectPreparation: async input => {
      queries += 1
      const answer = await backing.inspectPreparation(input)
      return 'failure' in answer ? answer : succeed(transform(convert(answer.ok)))
    },
  }
  const h = startHarness({ environmentsPort: () => provider })
  return {
    h,
    backing,
    replace: (field: 'owner' | 'name' | 'revision' | 'digest') => {
      current = { ...current, [field]: 'foreign' }
    },
    allocationReply: () => {
      allocationReply = true
    },
    requests,
    queries: () => queries,
    transform: (change: typeof transform) => {
      transform = change
    },
    retryOutcome: (value: typeof retryOutcome) => {
      retryOutcome = value
    },
    waitAdoption: () => {
      waitAdoption = true
    },
  }
}

async function pending(f: ReturnType<typeof fixture>) {
  await admitCall(f.h, 'allocated')
  await f.h.runOnce('allocated')
  expect(f.h.binding.executions).toEqual([])
  expect(f.backing.controls.allocations()).toBe(1)
  expect(f.backing.controls.leases()).toBe(0)
}

async function retained(f: ReturnType<typeof fixture>) {
  const recovery = ok(await f.h.commands.loadRecovery(admission('allocated', 'op-allocated')))
  expect(recovery.tasks.some(task => task.kind === 'prepare')).toBe(true)
  expect(f.h.binding.executions).toEqual([])
  expect(f.backing.controls.leases()).toBe(0)
}

describe('driver first adoption from an original allocation fact', () => {
  it('queries after a lost allocation reply, then adopts with exactly the original input', async () => {
    const f = fixture()
    await pending(f)
    await f.h.drive('allocated')
    expect(f.queries()).toBe(1)
    expect(f.requests).toHaveLength(2)
    expect(f.requests[1]).toEqual(f.requests[0])
    expect(f.backing.controls.allocations()).toBe(1)
    expect(f.backing.controls.leases()).toBe(1)
    expect(f.h.binding.executions).toEqual(['allocated'])
  })

  it('adds at most one prepare per step when adoption continues to report allocated', async () => {
    const f = fixture()
    await pending(f)
    f.waitAdoption()
    await f.h.runOnce('allocated')
    expect(f.requests).toHaveLength(2)
    expect(f.queries()).toBe(1)
    await f.h.runOnce('allocated')
    expect(f.requests).toHaveLength(3)
    expect(f.queries()).toBe(2)
    await retained(f)
  })

  it.each(['pending', 'unknown', 'unavailable'] as const)(
    'keeps querying the original task after adoption is %s',
    async kind => {
      const f = fixture()
      await pending(f)
      f.retryOutcome(kind)
      await f.h.runOnce('allocated')
      expect(f.requests).toHaveLength(2)
      await retained(f)
      await f.h.runOnce('allocated')
      expect(f.queries()).toBe(2)
      expect(f.requests).toHaveLength(3)
      await retained(f)
    },
  )

  it('refuses a mismatched prepared answer after adoption and retains the original cleanup', async () => {
    const f = fixture()
    await pending(f)
    f.transform(progress =>
      progress.kind === 'prepared'
        ? {
            ...progress,
            environment: {
              ...progress.environment,
              preparation: { ...progress.environment.preparation, inputDigest: 'foreign' },
            },
          }
        : progress,
    )
    await f.h.runOnce('allocated')
    expect(f.h.binding.executions).toEqual([])
    expect(f.backing.controls.leases()).toBe(1)
    expect(f.backing.controls.outstanding()).toBe(1)
    const recovery = ok(await f.h.commands.loadRecovery(admission('allocated', 'op-allocated')))
    expect(recovery.tasks.some(task => task.kind === 'prepare')).toBe(true)
  })

  const mismatches: Readonly<Record<string, (original: PreparationRecord) => PreparationRecord>> = {
    tenant: original => ({ ...original, tenant: tenantB }),
    call: original => ({ ...original, call: callId('foreign') }),
    operation: original => ({ ...original, operation: operationId('foreign') }),
    adoption: original => ({ ...original, adoption: { ...original.adoption, revision: 'other' } }),
    inputDigest: original => ({ ...original, inputDigest: 'other' }),
    purpose: original => ({ ...original, purpose: 'resume' }),
    fixedInput: original => ({
      ...original,
      request: { ...original.request, settings: { ...original.request.settings, digest: 'other' } },
    }),
  }
  it.each(Object.entries(mismatches))(
    'rejects an allocated fact with a different %s',
    async (_name, change) => {
      const f = fixture()
      await pending(f)
      f.transform(progress =>
        progress.kind === 'allocated'
          ? { ...progress, preparation: change(progress.preparation) }
          : progress,
      )
      expect(await advance(f, 'allocated')).toEqual({
        kind: 'failed',
        failure: {
          kind: 'invalid',
          field: 'preparation',
          reason: 'original-mismatch',
        },
      })
      expect(f.requests).toHaveLength(1)
      await retained(f)
    },
  )

  it.each(['owner', 'record', 'revision', 'digest'])(
    'rejects malformed %s in allocation evidence',
    async field => {
      const f = fixture()
      await pending(f)
      f.transform(progress => {
        if (progress.kind !== 'allocated') return progress
        const evidence = { ...progress.evidence }
        Reflect.deleteProperty(evidence, field)
        return { ...progress, evidence }
      })
      await f.h.runOnce('allocated')
      expect(f.requests).toHaveLength(1)
      await retained(f)
    },
  )

  it('does not claim a lease after the adapter loses its local registration', async () => {
    const f = fixture()
    await pending(f)
    const [original] = f.requests
    if (original === undefined) throw new Error('missing original registration')
    f.backing.controls.forgetRegistration(original)
    await f.h.runOnce('allocated')
    expect(f.requests).toHaveLength(1)
    await retained(f)
  })

  it('rejects a cold original-query allocation with no local registration and adoption null', async () => {
    const f = fixture()
    await pending(f)
    f.transform(progress => {
      if (progress.kind !== 'allocated') return progress
      const cold = { ...progress }
      Reflect.deleteProperty(cold, 'preparation')
      Reflect.set(cold, 'adoption', null)
      return cold
    })
    await f.h.runOnce('allocated')
    expect(f.requests).toHaveLength(1)
    await retained(f)
  })

  it('does not adopt a late allocation after coordination was aborted during inspection', async () => {
    const f = fixture()
    await pending(f)
    const controller = new AbortController()
    f.transform(progress => {
      if (progress.kind === 'allocated') controller.abort()
      return progress
    })
    await f.h.runOnce('allocated', controller.signal)
    expect(f.requests).toHaveLength(1)
    expect(f.backing.controls.outstanding()).toBe(1)
    await retained(f)
  })

  it('never uses allocated to reconnect an already recorded preparation', async () => {
    const f = fixture()
    await pending(f)
    const [original] = f.requests
    if (original === undefined) throw new Error('missing original registration')
    const fact = ok(
      await f.backing.inspectPreparation({
        ...admission('allocated', 'op-allocated'),
        preparation: original,
      }),
    )
    if (fact.kind !== 'allocated') throw new Error('missing allocation')
    const prepared = ok(
      await f.backing.prepare({ ...admission('allocated', 'op-allocated'), preparation: original }),
    )
    if (prepared.kind !== 'prepared') throw new Error('missing lease')
    ok(
      await f.h.commands.prepared({
        ...(await writeContext(f.h, 'allocated', 'record-prepared')),
        preparation: original,
        resources: prepared.environment.evidence,
      }),
    )
    f.transform(() => fact)
    f.h.rebuildRuntime()
    await f.h.runOnce('allocated')
    expect(f.requests).toHaveLength(1)
    expect(f.h.binding.executions).toEqual([])
    expect(f.backing.controls.leases()).toBe(1)
  })
})

async function advance(f: ReturnType<typeof fixture>, name: string) {
  const driver = f.h.host.driver()
  if (!('advance' in driver) || typeof driver.advance !== 'function')
    throw new Error('missing driver result')
  const stopped: unknown = await driver.advance({
    principal: principalA,
    tenant: tenantA,
    call: callId(name),
    instance: await f.h.host.instanceOf(callId(name)),
    signal: new AbortController().signal,
  })
  return stopped
}

it.each(['owner', 'name', 'revision', 'digest'] as const)(
  'refuses replacement environment %s before querying the old operation',
  async field => {
    const f = fixture()
    await pending(f)
    const original = [...f.requests]
    f.replace(field)
    expect(await advance(f, 'allocated')).toEqual({
      kind: 'failed',
      failure: {
        kind: 'unavailable',
        dependency: 'tool-environment',
        diagnostic: 'the original environment adapter is unavailable',
      },
    })
    expect(f.requests).toEqual(original)
    expect(f.queries()).toBe(0)
    await retained(f)
  },
)

it.each(['prepare', 'inspect'] as const)(
  'returns the complete allocated stop after %s and bounds each later step',
  async first => {
    const f = fixture()
    if (first === 'prepare') {
      f.allocationReply()
      await admitCall(f.h, 'allocated')
    } else await pending(f)
    f.waitAdoption()
    const before = f.requests.length
    const stop = {
      kind: 'failed',
      failure: {
        kind: 'unavailable',
        dependency: 'tool-environment',
        diagnostic: 'the original allocation awaits first adoption',
      },
    }
    expect(await advance(f, 'allocated')).toEqual(stop)
    expect(f.requests).toHaveLength(before + (first === 'prepare' ? 2 : 1))
    const original = f.requests[0]
    for (let step = 0; step < 2; step += 1) {
      const count = f.requests.length
      expect(await advance(f, 'allocated')).toEqual(stop)
      expect(f.requests).toHaveLength(count + 1)
    }
    expect(f.requests.every(request => JSON.stringify(request) === JSON.stringify(original))).toBe(
      true,
    )
    await retained(f)
  },
)

it('keeps each call and preparation operation independent while querying original allocations', async () => {
  const f = fixture()
  await pending(f)
  f.backing.controls.allocateBeforeAdoption()
  await admitCall(f.h, 'other')
  await f.h.runOnce('other')
  expect(f.requests.map(request => request.call)).toEqual(['allocated', 'other'])
  const [left, right] = f.requests
  expect(left?.operation).not.toEqual(right?.operation)
  f.waitAdoption()
  await Promise.all([advance(f, 'allocated'), advance(f, 'other')])
  expect(f.requests.filter(request => request.call === 'allocated')).toEqual([left, left])
  expect(f.requests.filter(request => request.call === 'other')).toEqual([right, right])
  expect(f.backing.controls.allocations()).toBe(2)
  expect(f.backing.controls.leases()).toBe(0)
  expect(f.h.binding.executions).toEqual([])
})

it.each(['owner', 'name', 'revision', 'digest'] as const)(
  'rechecks current environment %s after inspection and before first adoption',
  async field => {
    const f = fixture()
    await pending(f)
    f.transform(progress => {
      if (progress.kind === 'allocated') f.replace(field)
      return progress
    })
    expect(await advance(f, 'allocated')).toEqual({
      kind: 'failed',
      failure: {
        kind: 'unavailable',
        dependency: 'tool-environment',
        diagnostic: 'the original environment adapter is unavailable',
      },
    })
    expect(f.queries()).toBe(1)
    expect(f.requests).toHaveLength(1)
    await retained(f)
  },
)
