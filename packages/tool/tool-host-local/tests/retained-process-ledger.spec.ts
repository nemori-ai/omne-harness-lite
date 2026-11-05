// The handover commit of a retained process (#1137): the retention scope's ledger view `adopt`s a
// key, and the same durable commit ends the acquisition ledger's duty for that key. The two ledgers
// share one domain, so the commit is one conditional write of both records. Also the plan
// passthrough of `processes` to `ExecutionEnvironment.acquire`, and its live-plan conflict rule.
import { describe, expect, it, vi } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  acquisitionRef,
  originRef,
  type EnvironmentLease,
  type ExecutionEnvironment,
  type ManagedResource,
  type OriginalAcquisition,
  type Placement,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import { succeed } from '@omne-harness/operation-result'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import { canonicalDigest, type CallRecord } from '@omne-harness/tool'
import {
  decodeToolResultVersion,
  decodeToolRevision,
  type PreparationRecord,
} from '@omne-harness/tool-contract/provider'
import {
  createEnvironmentResourceLedger,
  createRetainedTerminalLedger,
} from '../src/environment-resource-ledger.ts'
import {
  createEnvironmentStateStore,
  environmentDomain,
  preparationKey,
  type EnvironmentGuardedHostCommit,
} from '../src/environment-state.ts'
import {
  createLocalExecutionEnvironment,
  type EnvironmentRetention,
} from '../src/execution-environment.ts'
import {
  adoption,
  callId,
  evidence,
  operationId,
  principalA,
  request,
  tenantA,
  type Principal,
} from './coordinator-values.ts'

function revision(text: string) {
  const parsed = decodeToolRevision(text)
  if ('failure' in parsed) throw new Error('invalid fixture revision')
  return parsed.ok
}

const preparation: PreparationRecord = {
  tenant: tenantA,
  call: callId('call'),
  operation: operationId('prepare'),
  adoption: adoption('environment'),
  inputDigest: 'input',
  purpose: 'initial',
  request: request(),
}
const placement: Placement = {
  kind: 'placement',
  binding: { kind: 'host_machine' },
  requirement: {
    allowedBindings: [{ kind: 'host_machine' }],
    facilities: ['command'],
    isolation: [],
  },
  provider: { name: 'fixture', version: '1', generation: '1' },
  quotaDomain: 'fixture',
  continuity: { kind: 'not_guaranteed' },
}
const original: OriginalAcquisition = {
  tenant: tenantA,
  acquisition: acquisitionRef('original'),
  origin: originRef('caller'),
  scope: preparation.request.requesterScope,
  placement,
}
const resource: ManagedResource = {
  key: 'domain',
  provider: 'fixture',
  reference: { kind: 'string', value: 'domain-generation-1' },
}

/** One original call, its acquisition record bound to a retention scope, and both ledger views. */
async function fixture() {
  const store = createMemoryToolLedgerStore<ContentBlock>()
  const callDomain = { kind: 'call' as const, tenant: tenantA, call: preparation.call }
  const call: CallRecord = {
    tenant: tenantA,
    call: preparation.call,
    admission: operationId('admission'),
    request: preparation.request,
    initiator: { owner: 'fixture', subject: 'alice', revision: '1' },
    preparations: [preparation],
    environment: null,
    start: null,
    startRejection: null,
    execution: null,
    state: {
      call: preparation.call,
      revision: revision('1'),
      source: evidence('state'),
      foreground: null,
      effect: { kind: 'not-started' },
      execution: { kind: 'not-started' },
      timing: { kind: 'closed', accumulatedMs: '0' },
      queue: { kind: 'none' },
      controls: [],
      delivery: null,
      supplements: [],
      phase: 'preparing',
      relation: 'foreground',
      wait: { kind: 'none' },
    },
  }
  await store.commit({
    domain: callDomain,
    expected: revision('0'),
    revision: revision('1'),
    writes: [{ kind: 'put', record: { kind: 'call', call } }],
  })
  const ordinary: EnvironmentGuardedHostCommit['commit'] = async input => {
    const current = await store.read(input.call)
    if (current.kind !== 'complete' || current.revision !== input.callExpected)
      return { kind: 'call-changed' }
    return store.commit(input.hostCommit)
  }
  const guarded = { commit: vi.fn<EnvironmentGuardedHostCommit['commit']>(ordinary) }
  const state = createEnvironmentStateStore({ store, guarded, mode: 'test' })
  await state.update(preparation, () =>
    succeed({
      preparation,
      original: { ...original, retentionScope: preparation.request.requesterScope },
      digest: canonicalDigest(preparation),
      allocation: { kind: 'sent' },
      closed: false,
      evidence: evidence('original'),
      release: null,
      resources: [],
    }),
  )
  const authorize = async () => 'authorized' as const
  const acquisition = await createEnvironmentResourceLedger({
    state,
    address: preparation,
    authorize,
  })
  const retained = () =>
    createRetainedTerminalLedger({
      state: createEnvironmentStateStore({ store, guarded, mode: 'test' }),
      address: preparation,
      scope: preparation.request.requesterScope,
      authorize,
    })
  const processes = await retained()

  /** The environment domain in one read: its revision and the two records' envelopes. */
  async function domain() {
    const read = await store.read(environmentDomain(tenantA))
    if (read.kind !== 'complete') throw new Error('fixture domain unavailable')
    const host = (key: (text: string) => boolean) => {
      const found = read.records.find(item => item.kind === 'host' && key(item.host.key))
      return found?.kind === 'host'
        ? (found.host.value as {
            mutation: string
            state: { resources: { resource: { key: string }; [field: string]: unknown }[] }
          })
        : undefined
    }
    const acquired = host(key => key === preparationKey(preparation))
    const retention = host(key => key.startsWith('retention:'))
    const fact = (envelope: typeof acquired) =>
      envelope?.state.resources.find(item => item.resource.key === resource.key)
    return {
      revision: read.revision,
      acquired,
      retention,
      acquisitionFact: fact(acquired),
      retainedFact: fact(retention),
    }
  }
  async function finish() {
    const result = decodeToolResultVersion('1')
    if ('failure' in result) throw new Error('invalid result version')
    const current = await store.read(callDomain)
    if (current.kind !== 'complete') throw new Error('fixture call unavailable')
    const found = current.records.find(item => item.kind === 'call')
    if (!found || found.kind !== 'call') throw new Error('fixture call missing')
    await store.commit({
      domain: callDomain,
      expected: current.revision,
      revision: revision((BigInt(current.revision) + 1n).toString()),
      writes: [
        {
          kind: 'put',
          record: {
            kind: 'call',
            call: {
              ...found.call,
              state: {
                ...found.call.state,
                phase: 'settled',
                result: result.ok,
                relation: 'foreground',
                terminal: { kind: 'completed' },
                wait: { kind: 'none' },
              },
            },
          },
        },
      ],
    })
  }
  /** The acquisition planned and permitted the domain; the retention scope reserved it. */
  async function reserved() {
    expect(await acquisition.plan(resource)).toBe('recorded')
    expect(await acquisition.permit(resource.key)).toBe('confirmed')
    expect(await processes.plan(resource)).toBe('recorded')
  }
  return {
    store,
    guarded,
    ordinary,
    acquisition,
    processes,
    retained,
    domain,
    finish,
    reserved,
  }
}

describe('adopt commits the handover once, in one durable commit', () => {
  it('hands the key over: both records change at the same new revision', async () => {
    const f = await fixture()
    await f.reserved()
    const before = await f.domain()
    expect(await f.processes.adopt(resource.key)).toBe('confirmed')
    const after = await f.domain()
    expect(BigInt(after.revision)).toBe(BigInt(before.revision) + 1n)
    expect(after.acquisitionFact).toMatchObject({ stop: 'handedOver' })
    expect(after.retainedFact).toMatchObject({ adopted: true, permitted: true, stop: 'active' })
    expect(after.acquired?.mutation).toBe(after.retention?.mutation)
    expect(f.guarded.commit).toHaveBeenCalledTimes(
      // plan and permit of the acquisition do one guarded commit (permit); adopt does one more.
      1 + 1,
    )
  })

  it('never leaves one record changed when a later commit would fail', async () => {
    const f = await fixture()
    await f.reserved()
    let calls = 0
    f.guarded.commit.mockImplementation(async input => {
      calls += 1
      return calls === 2 ? { kind: 'unavailable', diagnostic: 'injected' } : f.ordinary(input)
    })
    const before = await f.domain()
    const answer = await f.processes.adopt(resource.key)
    const after = await f.domain()
    expect(answer).toBe('confirmed')
    expect(after.acquisitionFact).toMatchObject({ stop: 'handedOver' })
    expect(after.retainedFact).toMatchObject({ adopted: true })
    expect(BigInt(after.revision)).toBe(BigInt(before.revision) + 1n)
  })

  it.each(['unavailable', 'unknown-dropped'] as const)(
    'a commit answered %s leaves both records as they were and answers unavailable',
    async fault => {
      const f = await fixture()
      await f.reserved()
      const before = await f.domain()
      f.store.injectCommit(fault)
      expect(await f.processes.adopt(resource.key)).toBe('unavailable')
      expect(await f.domain()).toEqual(before)
    },
  )

  it('recognizes its own commit when the answer was lost but the writes landed', async () => {
    const f = await fixture()
    await f.reserved()
    f.store.injectCommit('unknown-applied')
    expect(await f.processes.adopt(resource.key)).toBe('confirmed')
    const after = await f.domain()
    expect(after.acquisitionFact).toMatchObject({ stop: 'handedOver' })
    expect(after.retainedFact).toMatchObject({ adopted: true })
  })

  it('answers a repeated adopt with the committed outcome and writes nothing', async () => {
    const f = await fixture()
    await f.reserved()
    expect(await f.processes.adopt(resource.key)).toBe('confirmed')
    const before = await f.domain()
    const commits = f.store.commits
    const guardedCalls = f.guarded.commit.mock.calls.length
    expect(await f.processes.adopt(resource.key)).toBe('confirmed')
    expect(await (await f.retained()).adopt(resource.key)).toBe('confirmed')
    expect(f.store.commits).toBe(commits)
    expect(f.guarded.commit).toHaveBeenCalledTimes(guardedCalls)
    expect(await f.domain()).toEqual(before)
  })

  it('answers a lost answer by a repeated adopt once the delayed commit lands', async () => {
    const f = await fixture()
    await f.reserved()
    f.store.injectCommit('unknown-delayed')
    expect(await f.processes.adopt(resource.key)).toBe('unavailable')
    expect(f.store.landDelayed()).toEqual([{ kind: 'committed' }])
    expect(await f.processes.adopt(resource.key)).toBe('confirmed')
    expect((await f.domain()).acquisitionFact).toMatchObject({ stop: 'handedOver' })
  })
})

describe('adopt checks the scope, the original call and the reservation', () => {
  it('answers closed on a closed retention scope and changes neither record', async () => {
    const f = await fixture()
    await f.reserved()
    expect(await (await f.retained()).close()).toBe('confirmed')
    const before = await f.domain()
    expect(await f.processes.adopt(resource.key)).toBe('closed')
    expect(await f.domain()).toEqual(before)
    expect(before.acquisitionFact).toMatchObject({ stop: 'active' })
  })

  it('answers closed after the original call is durably settled', async () => {
    const f = await fixture()
    await f.reserved()
    await f.finish()
    const before = await f.domain()
    const guardedCalls = f.guarded.commit.mock.calls.length
    expect(await f.processes.adopt(resource.key)).toBe('closed')
    expect(f.guarded.commit).toHaveBeenCalledTimes(guardedCalls)
    expect(await f.domain()).toEqual(before)
  })

  it('answers closed when the call settles between the check and the guarded commit', async () => {
    const f = await fixture()
    await f.reserved()
    const before = await f.domain()
    f.guarded.commit.mockImplementationOnce(async () => {
      await f.finish()
      return { kind: 'call-changed' }
    })
    expect(await f.processes.adopt(resource.key)).toBe('closed')
    expect(await f.domain()).toEqual(before)
  })

  it('answers closed after the acquisition closed and changes neither record', async () => {
    const f = await fixture()
    await f.reserved()
    expect(await f.acquisition.close()).toBe('confirmed')
    const before = await f.domain()
    expect(await f.processes.adopt(resource.key)).toBe('closed')
    expect(await f.domain()).toEqual(before)
  })

  it('answers unavailable without a reservation of this call in the retention scope', async () => {
    const f = await fixture()
    expect(await f.acquisition.plan(resource)).toBe('recorded')
    expect(await f.acquisition.permit(resource.key)).toBe('confirmed')
    const before = await f.domain()
    expect(await f.processes.adopt(resource.key)).toBe('unavailable')
    expect(await f.domain()).toEqual(before)
    // The scope's record exists and reserves another key only.
    expect(await f.processes.plan({ ...resource, key: 'another' })).toBe('recorded')
    const reservedOther = await f.domain()
    expect(await f.processes.adopt(resource.key)).toBe('unavailable')
    expect(await f.domain()).toEqual(reservedOther)
  })

  it('answers unavailable when the acquisition record has no fact for the key', async () => {
    const f = await fixture()
    expect(await f.processes.plan(resource)).toBe('recorded')
    const before = await f.domain()
    expect(await f.processes.adopt(resource.key)).toBe('unavailable')
    expect(await f.domain()).toEqual(before)
  })
})

describe('the acquisition ledger keeps a handed-over key handed over', () => {
  it('stop facts do not overwrite handedOver, and permit and adopt find no active plan', async () => {
    const f = await fixture()
    await f.reserved()
    expect(await f.processes.adopt(resource.key)).toBe('confirmed')
    expect(await f.acquisition.stopped(resource.key, 'unconfirmed')).toBe('recorded')
    expect(await f.acquisition.stopped(resource.key, 'confirmed')).toBe('recorded')
    expect(await f.acquisition.inspect()).toMatchObject([{ stop: 'handedOver' }])
    expect(await f.acquisition.permit(resource.key)).toBe('unavailable')
    expect(await f.acquisition.adopt(resource.key)).toBe('unavailable')
    expect((await f.domain()).acquisitionFact).toMatchObject({ stop: 'handedOver' })
  })

  it('a rebuilt view decodes handedOver next to the older stop values', async () => {
    const f = await fixture()
    await f.reserved()
    const other: ManagedResource = { ...resource, key: 'other' }
    expect(await f.acquisition.plan(other)).toBe('recorded')
    expect(await f.acquisition.stopped(other.key, 'unconfirmed')).toBe('recorded')
    expect(await f.processes.adopt(resource.key)).toBe('confirmed')
    const rebuilt = await createEnvironmentResourceLedger({
      state: createEnvironmentStateStore({ store: f.store, mode: 'test' }),
      address: preparation,
      authorize: async () => 'authorized',
    })
    expect(await rebuilt.inspect()).toMatchObject([
      { resource: { key: resource.key }, stop: 'handedOver' },
      { resource: { key: other.key }, stop: 'unconfirmed' },
    ])
  })
})

describe('the environment plan hands processes to acquire', () => {
  function environment(retentions: () => EnvironmentRetention) {
    const store = createMemoryToolLedgerStore<ContentBlock>()
    const state = createEnvironmentStateStore({ store, mode: 'test' })
    const lease: EnvironmentLease = {
      placement,
      instance: { id: 'instance', generation: '1' },
      continuity: placement.continuity,
      facility: () => undefined,
      release: async () => ({ kind: 'released' }),
      invalidated: new Promise(() => {}),
    }
    const acquire = vi.fn<ExecutionEnvironment<Principal>['acquire']>(async (_access, input) => ({
      kind: 'acquired',
      lease,
      adoption: {
        acquisition: input.acquisition,
        origin: input.origin,
        placement,
        provider: placement.provider,
        instance: lease.instance,
        continuity: lease.continuity,
        evidence: { kind: 'null' },
      },
    }))
    const execution: ExecutionEnvironment<Principal> = {
      acquire,
      inspectAcquisition: async () => ({ kind: 'unrecorded' }),
      resolvePlacement: async () => placement,
      inspectRecoveryAcquisition: async () => ({ kind: 'queryUnavailable', cause: 'provider' }),
      describe: async () => [],
      recoverOwned: async () => ({ kind: 'unknown', cause: 'provider' }),
      releaseScope: async () => ({ kind: 'unknown', cause: 'provider' }),
    }
    let ledger: ResourceLedger | undefined
    const guard = { authorize: async () => 'authorized' as const }
    const env = createLocalExecutionEnvironment({
      adoption: preparation.adoption,
      execution,
      store,
      storage: { mode: 'test' },
      plans: {
        resolve: async () => {
          ledger ??= await createEnvironmentResourceLedger({
            state,
            address: preparation,
            authorize: async () => 'authorized',
          })
          return succeed({
            acquire: {
              acquisition: original.acquisition,
              origin: original.origin,
              scope: original.scope,
              placement,
              guard,
              ledger,
              retention: retentions(),
            },
            facts: {
              system: 'fixture',
              release: '1',
              architecture: 'fixture',
              facilities: placement.requirement.facilities,
            },
          })
        },
      },
      naming: { name: async () => succeed({ token: 'authorized' }) },
      cleanup: { settle: async () => succeed({ kind: 'pending', diagnostic: 'fixture' }) },
    })
    const prepare = {
      tenant: tenantA,
      principal: principalA,
      call: preparation.call,
      preparation,
    }
    return { env, acquire, prepare }
  }
  const view = () => {
    const ledger = {
      closed: new AbortController().signal,
      plan: async () => 'recorded' as const,
      permit: async () => 'confirmed' as const,
      adopt: async () => 'confirmed' as const,
      stopped: async () => 'recorded' as const,
    }
    return ledger
  }

  it('passes the processes view to acquire and keeps it on the same live plan', async () => {
    const ledger = view()
    const processes = view()
    const f = environment(() => ({ scope: original.scope, ledger, processes }))
    expect(await f.env.prepare(f.prepare)).toMatchObject({ ok: { kind: 'prepared' } })
    expect(f.acquire.mock.calls[0]?.[1].retention?.processes).toBe(processes)
    expect(await f.env.prepare(f.prepare)).toMatchObject({ ok: { kind: 'prepared' } })
    expect(f.acquire).toHaveBeenCalledTimes(1)
  })

  it('refuses the same preparation with another processes object, as with another ledger', async () => {
    const ledger = view()
    let processes = view()
    const f = environment(() => ({ scope: original.scope, ledger, processes }))
    expect(await f.env.prepare(f.prepare)).toMatchObject({ ok: { kind: 'prepared' } })
    processes = view()
    expect(await f.env.prepare(f.prepare)).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'original live acquisition inputs changed' },
    })
    expect(f.acquire).toHaveBeenCalledTimes(1)
  })
})
