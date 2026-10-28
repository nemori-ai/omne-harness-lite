import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type {
  PreparationProgress,
  PreparationRecord,
  ToolEnvironment,
} from '@omne-harness/tool-contract/provider'
import {
  createMemoryToolEnvironment,
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

function fixture(decision: 'recognize' | 'inspect' | 'wait' = 'recognize') {
  const backing = createMemoryToolEnvironment<Principal>()
  const calls: PreparationRecord[] = []
  let queries = 0
  let allowed = true
  let current = backing.adoption
  let afterQuery = async () => {}
  let transform = (progress: PreparationProgress<MemoryEnvironment>) => progress
  const provider: ToolEnvironment<Principal, MemoryEnvironment> = {
    ...backing,
    get adoption() {
      return current
    },
    prepare: async input => {
      calls.push(input.preparation)
      return backing.prepare(input)
    },
    inspectPreparation: async input => {
      queries += 1
      const answer = await backing.inspectPreparation(input)
      await afterQuery()
      return 'failure' in answer ? answer : succeed(transform(answer.ok))
    },
  }
  const policy: ToolEnvironmentSchedulingPolicy<Principal> = {
    quantum: 1,
    capacity: 16,
    inFlight: 1,
    tenant: () => ({ weight: 1, inFlight: 1 }),
    retry: async () => decision,
    release: async () => 'release',
  }
  const environment = createLocalScheduledEnvironment({
    environment: provider,
    policy,
    qualify: async () =>
      allowed ? succeed(undefined) : fail({ kind: 'denied', action: 'prepare' }),
  })
  const input = (id = 'original') => {
    const fixed = request()
    const preparation: PreparationRecord = {
      tenant: tenantA,
      call: callId(id),
      operation: operationId(id),
      adoption: backing.adoption,
      inputDigest: canonicalDigest(fixed),
      purpose: 'initial',
      request: fixed,
    }
    return { principal: principalA, tenant: tenantA, call: preparation.call, preparation }
  }
  return {
    backing,
    environment,
    calls,
    input,
    queries: () => queries,
    revoke: () => {
      allowed = false
    },
    replace: () => {
      current = { ...current, revision: 'replacement' }
    },
    afterQuery: (hook: typeof afterQuery) => {
      afterQuery = hook
    },
    transform: (change: typeof transform) => {
      transform = change
    },
  }
}

async function allocated(f: ReturnType<typeof fixture>) {
  f.backing.controls.allocateBeforeAdoption()
  const input = f.input()
  expect(await f.environment.prepare(input)).toMatchObject({ ok: { kind: 'unknown' } })
  expect(f.backing.controls.allocations()).toBe(1)
  expect(f.backing.controls.leases()).toBe(0)
  return input
}

describe('scheduled original first adoption', () => {
  it('inspects without adopting, then recognizes the original allocation without another queue cost', async () => {
    const f = fixture()
    const input = await allocated(f)
    const before = [...f.calls]
    const fact = await f.environment.inspectPreparation(input)
    expect(fact).toMatchObject({ ok: { kind: 'allocated', preparation: input.preparation } })
    expect(f.calls).toEqual(before)
    expect(f.backing.controls.leases()).toBe(0)
    expect(await f.environment.prepare(input)).toMatchObject({ ok: { kind: 'prepared' } })
    expect(f.calls).toEqual([input.preparation, input.preparation])
    expect(f.backing.controls.allocations()).toBe(1)
    expect(f.backing.controls.leases()).toBe(1)
    expect(f.queries()).toBe(2)
  })

  it('shares the original transfer while its first prepare is still returning', async () => {
    const backing = createMemoryToolEnvironment<Principal>()
    backing.controls.allocateBeforeAdoption()
    const entered = barrier(),
      resume = barrier()
    let calls = 0
    const provider = {
      ...backing,
      prepare: async (input: Parameters<typeof backing.prepare>[0]) => {
        calls += 1
        const answer = await backing.prepare(input)
        if (calls !== 1) return answer
        entered.open()
        await resume.wait
        return backing.prepare(input)
      },
    }
    const environment = createLocalScheduledEnvironment({
      environment: provider,
      qualify: async () => succeed(undefined),
      policy: {
        quantum: 1,
        capacity: 2,
        inFlight: 1,
        tenant: () => ({ weight: 1, inFlight: 1 }),
        retry: async () => 'recognize',
        release: async () => 'release',
      },
    })
    const input = fixture().input()
    const original = environment.prepare(input)
    await entered.wait
    expect(await environment.inspectPreparation(input)).toMatchObject({ ok: { kind: 'allocated' } })
    expect(backing.controls.leases()).toBe(0)
    const repeated = environment.prepare(input)
    resume.open()
    const prepared = await original
    expect(prepared).toMatchObject({ ok: { kind: 'prepared' } })
    expect(await repeated).toEqual(prepared)
    expect(calls).toBe(1)
    expect(backing.controls.allocations()).toBe(1)
    expect(backing.controls.leases()).toBe(1)
  })

  it('preserves cleanup when the scope ends after allocation was inspected', async () => {
    const f = fixture()
    const input = await allocated(f)
    f.afterQuery(async () => {
      f.backing.controls.failAdoption(input.preparation, 'scope ended')
    })
    expect(await f.environment.prepare(input)).toMatchObject({
      ok: { kind: 'rejected', reason: 'scope ended' },
    })
    expect(await f.environment.prepare(input)).toMatchObject({
      ok: { kind: 'rejected', reason: 'scope ended' },
    })
    expect(f.backing.controls.leases()).toBe(0)
    expect(f.backing.controls.outstanding()).toBe(1)
  })

  it.each(['wait', 'inspect'] as const)('%s policy never adopts', async decision => {
    const f = fixture(decision)
    const input = await allocated(f)
    expect(await f.environment.prepare(input)).toMatchObject({
      ok: { kind: decision === 'wait' ? 'pending' : 'allocated' },
    })
    expect(f.calls).toHaveLength(1)
    expect(f.backing.controls.leases()).toBe(0)
    expect(f.queries()).toBe(decision === 'wait' ? 0 : 1)
  })

  it('shares a concurrent recognition and retains the original in-flight slot', async () => {
    const f = fixture()
    const input = await allocated(f)
    const entered = barrier(),
      resume = barrier()
    f.afterQuery(async () => {
      entered.open()
      await resume.wait
    })
    const left = f.environment.prepare(input)
    await entered.wait
    const right = f.environment.prepare(input)
    let nextDone = false
    void f.environment.prepare(f.input('next')).then(() => {
      nextDone = true
    })
    await Promise.resolve()
    expect(nextDone).toBe(false)
    resume.open()
    expect(await left).toEqual(await right)
    expect(f.calls).toHaveLength(2)
    expect(f.backing.controls.allocations()).toBe(1)
    expect(f.backing.controls.leases()).toBe(1)
  })

  it.each(['revoke', 'replace'] as const)(
    'rechecks %s after the allocation query',
    async change => {
      const f = fixture()
      const input = await allocated(f)
      f.afterQuery(async () => {
        f[change]()
      })
      expect(await f.environment.prepare(input)).toHaveProperty('failure')
      expect(f.calls).toHaveLength(1)
      expect(f.backing.controls.leases()).toBe(0)
    },
  )

  const changes: Readonly<Record<string, (original: PreparationRecord) => PreparationRecord>> = {
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
  it.each(Object.entries(changes))(
    'rejects a fact with a different %s for both inspection and recognition',
    async (_name, change) => {
      const f = fixture()
      const input = await allocated(f)
      f.transform(progress =>
        progress.kind === 'allocated'
          ? { ...progress, preparation: change(progress.preparation) }
          : progress,
      )
      expect(await f.environment.inspectPreparation(input)).toMatchObject({
        failure: { kind: 'invalid' },
      })
      expect(await f.environment.prepare(input)).toMatchObject({ failure: { kind: 'invalid' } })
      expect(f.calls).toHaveLength(1)
      expect(f.backing.controls.leases()).toBe(0)
    },
  )

  it.each(['owner', 'record', 'revision', 'digest'])(
    'rejects malformed allocation evidence %s',
    async field => {
      const f = fixture()
      const input = await allocated(f)
      f.transform(progress => {
        if (progress.kind !== 'allocated') return progress
        const evidence = { ...progress.evidence }
        Reflect.set(evidence, field, '')
        return { ...progress, evidence }
      })
      expect(await f.environment.prepare(input)).toMatchObject({ failure: { kind: 'invalid' } })
      expect(f.calls).toHaveLength(1)
      expect(f.backing.controls.leases()).toBe(0)
    },
  )

  it('retains a terminal adoption failure and its outstanding cleanup', async () => {
    const state = 'scope-ended; cleanup unknown'
    const f = fixture()
    const input = await allocated(f)
    f.backing.controls.failAdoption(input.preparation, state)
    expect(await f.environment.prepare(input)).toMatchObject({
      ok: { kind: 'rejected', reason: state },
    })
    expect(await f.environment.prepare(input)).toMatchObject({
      ok: { kind: 'rejected', reason: state },
    })
    expect(f.calls).toHaveLength(1)
    expect(f.backing.controls.leases()).toBe(0)
  })

  it('rejects a cold original-query allocation without a local preparation binding', async () => {
    const f = fixture()
    const input = await allocated(f)
    f.transform(progress => {
      if (progress.kind !== 'allocated') return progress
      const cold = { ...progress }
      Reflect.deleteProperty(cold, 'preparation')
      Reflect.set(cold, 'adoption', null)
      return cold
    })
    expect(await f.environment.prepare(input)).toMatchObject({ failure: { kind: 'invalid' } })
    expect(f.calls).toHaveLength(1)
    expect(f.backing.controls.leases()).toBe(0)
  })

  it('cannot revive a released entry with an allocation fact already in flight', async () => {
    const f = fixture()
    const input = await allocated(f)
    const entered = barrier(),
      resume = barrier()
    f.afterQuery(async () => {
      entered.open()
      await resume.wait
    })
    const recalling = f.environment.prepare(input)
    await entered.wait
    const adopted = await f.backing.prepare(input)
    if ('failure' in adopted || adopted.ok.kind !== 'prepared')
      throw new Error('missing prepared resource')
    const release = {
      ...input.preparation,
      operation: operationId('release'),
      preparation: input.preparation.operation,
      resource: adopted.ok.environment.evidence,
      custody: evidence('independent-output-custody'),
    }
    expect(await f.environment.release({ ...input, release })).toMatchObject({
      ok: { kind: 'released' },
    })
    resume.open()
    expect(await recalling).toHaveProperty('failure')
    expect(await f.environment.prepare(input)).toHaveProperty('failure')
    expect(await f.environment.prepare(f.input('next'))).toMatchObject({ ok: { kind: 'prepared' } })
    expect(f.calls.map(record => record.operation)).toEqual(['original', 'next'])
  })
})
