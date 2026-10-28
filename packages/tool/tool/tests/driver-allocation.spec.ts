import { fail, succeed } from '@omne-harness/operation-result'
import type {
  PreparationProgress,
  PreparationRecord,
  ToolEnvironment,
} from '@omne-harness/tool-contract/provider'
import { createMemoryToolEnvironment } from '@omne-harness/tool-contract/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { admission, callId, operationId, tenantB, ok, type Principal } from './runtime-values.ts'
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
      return 'failure' in answer ? answer : succeed(transform(convert(answer.ok)))
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
      await f.h.runOnce('allocated')
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
