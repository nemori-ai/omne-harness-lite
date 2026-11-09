// The handover commit of a retained process (#1137): the retention scope's ledger view `adopt`s a
// key, and from that commit on the acquisition ledger shows the key as handed over. The scope's
// record lives in the scope's own `retention@<scope>` domain and the acquisition in the call's own
// domain. A reservation (`plan`) stays in its creator's acquisition record; the handover is one
// commit of the scope's record that asserts the acquisition and the original call unchanged, and
// the acquisition derives `handedOver` from the scope's entries. A confirmed stop of an adopted
// process keeps its end fact under its own key in the scope's domain (execution-environment
// contract, stop clause 7). Nothing is deleted: a closed scope keeps its record, its entries and
// its end facts. Also the plan passthrough of `processes` to `ExecutionEnvironment.acquire`, and
// its live-plan conflict rule.
import { describe, expect, it, vi } from 'vitest'
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
import { canonicalDigest, hostKey, type CallRecord, type LedgerDomain } from '@omne-harness/tool'
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
  acquisitionDomain,
  createEnvironmentStateStore,
  preparationKey,
  RETENTION_RECORD_KEY,
  retentionDomain,
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

/** The original call while it runs, with its environment preparation. */
function callRecord(): CallRecord {
  return {
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
}

/** One original call, its acquisition record bound to a retention scope, and both ledger views. */
async function fixture() {
  const store = createMemoryToolLedgerStore()
  const callDomain = { kind: 'call' as const, tenant: tenantA, call: preparation.call }
  await store.commit({
    domain: callDomain,
    expected: revision('0'),
    revision: revision('1'),
    writes: [{ kind: 'put', record: { kind: 'call', call: callRecord() } }],
  })
  const realCommit = store.commit.bind(store)
  const commit = vi.spyOn(store, 'commit')
  const state = createEnvironmentStateStore({ store, mode: 'test' })
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
      reservations: [],
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
      state: createEnvironmentStateStore({ store, mode: 'test' }),
      address: preparation,
      scope: preparation.request.requesterScope,
      authorize,
    })
  const processes = await retained()

  type Fact = { resource: { key: string }; [field: string]: unknown }
  type Envelope = {
    mutation: string
    state: { resources: Fact[]; reservations?: Fact[]; [field: string]: unknown }
  }
  /** One stored envelope and the revision of its domain, read without the state store. */
  async function stored(domain: LedgerDomain, key: string) {
    const read = await store.readRecord(domain, hostKey(key))
    if (read.kind !== 'complete') throw new Error('fixture domain unavailable')
    const envelope = read.record?.kind === 'host' ? (read.record.host.value as Envelope) : undefined
    return { revision: read.revision, envelope }
  }
  /** The two records as stored: the acquisition in the call's domain, the scope in the tenant's. */
  async function domain() {
    const acquired = await stored(acquisitionDomain(preparation), preparationKey(preparation))
    const retention = await stored(
      retentionDomain(tenantA, preparation.request.requesterScope),
      RETENTION_RECORD_KEY,
    )
    const find = (facts: Fact[] | undefined) =>
      facts?.find(item => item.resource.key === resource.key)
    return {
      acquisitionRevision: acquired.revision,
      retentionRevision: retention.revision,
      acquired: acquired.envelope,
      retention: retention.envelope,
      acquisitionFact: find(acquired.envelope?.state.resources),
      reservation: find(acquired.envelope?.state.reservations),
      retainedFact: find(retention.envelope?.state.resources),
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
  /** The acquisition planned and permitted the domain and reserved it for its retention scope. */
  async function reserved() {
    expect(await acquisition.plan(resource)).toBe('recorded')
    expect(await acquisition.permit(resource.key)).toBe('confirmed')
    expect(await processes.plan(resource)).toBe('recorded')
  }
  return {
    store,
    commit,
    realCommit,
    acquisition,
    processes,
    retained,
    domain,
    finish,
    reserved,
  }
}

describe('adopt commits the handover once, in one durable commit of the scope', () => {
  it('hands the key over: the scope adopts in one commit and the acquisition shows it without a write', async () => {
    const f = await fixture()
    await f.reserved()
    const before = await f.domain()
    const commits = f.store.commits
    expect(await f.processes.adopt(resource.key)).toBe('confirmed')
    const after = await f.domain()
    expect(f.store.commits).toBe(commits + 1)
    expect(BigInt(after.retentionRevision)).toBe(BigInt(before.retentionRevision) + 1n)
    expect(after.acquisitionRevision).toBe(before.acquisitionRevision)
    expect(after.retainedFact).toMatchObject({ taken: 'adopted', stop: 'active' })
    // The scope owns the handover; the acquisition's view applies it.
    expect(await f.acquisition.inspect()).toMatchObject([{ stop: 'handedOver' }])
    // The handover asserted the acquisition and the original call it decided on.
    const last = f.commit.mock.calls.at(-1)?.[0]
    expect(last?.asserts?.map(assertion => assertion.domain.kind).sort()).toEqual(['call', 'host'])
  })

  it('an acquisition that closes while the handover is in flight makes it a conflict, and the retry answers closed', async () => {
    const f = await fixture()
    await f.reserved()
    f.commit.mockImplementationOnce(async input => {
      expect(await f.acquisition.close()).toBe('confirmed')
      return f.realCommit(input)
    })
    expect(await f.processes.adopt(resource.key)).toBe('closed')
    // Nobody took the reservation over; the creator's close stopped it in the creator's record.
    expect(await f.domain()).toMatchObject({ reservation: { stop: 'confirmed' } })
    expect((await f.domain()).retainedFact).toBeUndefined()
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
    expect(await f.acquisition.inspect()).toMatchObject([{ stop: 'handedOver' }])
    expect(after.retainedFact).toMatchObject({ taken: 'adopted' })
  })

  it('answers a repeated adopt with the committed outcome and writes nothing', async () => {
    const f = await fixture()
    await f.reserved()
    expect(await f.processes.adopt(resource.key)).toBe('confirmed')
    const before = await f.domain()
    const commits = f.store.commits
    expect(await f.processes.adopt(resource.key)).toBe('confirmed')
    expect(await (await f.retained()).adopt(resource.key)).toBe('confirmed')
    expect(f.store.commits).toBe(commits)
    expect(await f.domain()).toEqual(before)
  })

  it('answers a lost answer by a repeated adopt once the delayed commit lands', async () => {
    const f = await fixture()
    await f.reserved()
    f.store.injectCommit('unknown-delayed')
    expect(await f.processes.adopt(resource.key)).toBe('unavailable')
    expect(f.store.landDelayed()).toEqual([{ kind: 'committed' }])
    expect(await f.processes.adopt(resource.key)).toBe('confirmed')
    expect(await f.acquisition.inspect()).toMatchObject([{ stop: 'handedOver' }])
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
    const commits = f.store.commits
    expect(await f.processes.adopt(resource.key)).toBe('closed')
    expect(f.store.commits).toBe(commits)
    expect(await f.domain()).toEqual(before)
  })

  it('answers closed when the call settles between the check and the asserted commit', async () => {
    const f = await fixture()
    await f.reserved()
    const before = await f.domain()
    // The call settles while the handover's commit is in flight: its call assertion fails for real.
    f.commit.mockImplementationOnce(async input => {
      await f.finish()
      return f.realCommit(input)
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
    // The acquisition reserves another key only.
    expect(await f.processes.plan({ ...resource, key: 'another' })).toBe('recorded')
    const reservedOther = await f.domain()
    expect(await f.processes.adopt(resource.key)).toBe('unavailable')
    expect(await f.domain()).toEqual(reservedOther)
  })

  it('writes the reservation into the creator acquisition record and never into the scope', async () => {
    const f = await fixture()
    const before = await f.domain()
    expect(await f.processes.plan(resource)).toBe('recorded')
    const after = await f.domain()
    expect(after.reservation).toMatchObject({ stop: 'active' })
    expect(after.retention).toBeUndefined()
    expect(after.retentionRevision).toBe(before.retentionRevision)
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

/** Another call's view of the same retention scope, as a provider has after a restart. */
async function otherCallView(f: Awaited<ReturnType<typeof fixture>>) {
  const other = { ...preparation, call: callId('call-b'), operation: operationId('prepare-b') }
  const state = createEnvironmentStateStore({ store: f.store, mode: 'test' })
  await state.update(other, () =>
    succeed({
      preparation: other,
      original: {
        ...original,
        acquisition: acquisitionRef('original-b'),
        retentionScope: preparation.request.requesterScope,
      },
      digest: canonicalDigest(other),
      allocation: { kind: 'sent' },
      closed: false,
      evidence: evidence('original-b'),
      release: null,
      resources: [],
      reservations: [],
    }),
  )
  return createRetainedTerminalLedger({
    state,
    address: other,
    scope: preparation.request.requesterScope,
    authorize: async () => 'authorized',
  })
}

/** The host keys of the scope's domain, read whole: the scope record and its end facts. */
async function scopeKeys(f: Awaited<ReturnType<typeof fixture>>) {
  const read = await f.store.read(retentionDomain(tenantA, preparation.request.requesterScope))
  if (read.kind !== 'complete') throw new Error('fixture scope unavailable')
  return read.records.flatMap(record => (record.kind === 'host' ? [record.host.key] : []))
}

describe("a stop of a handed-over key is the retention scope's to record", () => {
  it('another call of the scope records the stop of a key handed over by the first, which retires the entry', async () => {
    const f = await fixture()
    await f.reserved()
    expect(await f.processes.adopt(resource.key)).toBe('confirmed')
    const view = await otherCallView(f)
    expect(await view.stopped(resource.key, 'unconfirmed')).toBe('recorded')
    expect((await f.domain()).retainedFact).toMatchObject({ taken: 'adopted', stop: 'unconfirmed' })
    expect(await f.acquisition.inspect()).toMatchObject([{ stop: 'handedOver' }])
    expect(await view.stopped(resource.key, 'confirmed')).toBe('recorded')
    // The scope holds nothing of the key any more; the creator's own fact says the resource stopped.
    expect((await f.domain()).retainedFact).toBeUndefined()
    expect(await f.acquisition.inspect()).toMatchObject([{ stop: 'confirmed' }])
  })

  it('another call cannot record a stop of a reservation not handed over', async () => {
    const f = await fixture()
    await f.reserved()
    const view = await otherCallView(f)
    const before = await f.domain()
    expect(await view.stopped(resource.key, 'confirmed')).toBe('unavailable')
    expect(await f.domain()).toEqual(before)
    expect(before.reservation).toMatchObject({ stop: 'active' })
    expect(before.retainedFact).toBeUndefined()
  })

  it('keeps the end fact of a stopped process: ended answers confirmed, the scope record no longer holds it, and a closed scope keeps both', async () => {
    const f = await fixture()
    await f.reserved()
    expect(await f.processes.ended(resource.key)).toBe('none')
    expect(await f.processes.adopt(resource.key)).toBe('confirmed')
    const view = await otherCallView(f)
    expect(await view.stopped(resource.key, 'unconfirmed')).toBe('recorded')
    expect(await view.ended(resource.key)).toBe('none')
    expect(await view.stopped(resource.key, 'confirmed')).toBe('recorded')
    // Stop clause 7: the stopped process is no longer held, and its end fact answers a later stop.
    expect((await f.domain()).retainedFact).toBeUndefined()
    expect(await f.processes.inspect()).toEqual([])
    expect(await f.processes.ended(resource.key)).toBe('confirmed')
    expect(await view.ended(resource.key)).toBe('confirmed')
    expect(await view.ended('another-key')).toBe('none')
    // The close marks the scope closed and deletes nothing.
    expect(await view.close()).toBe('confirmed')
    expect(await f.processes.ended(resource.key)).toBe('confirmed')
    expect((await f.domain()).retention?.state).toMatchObject({ phase: 'closed', resources: [] })
    expect((await scopeKeys(f)).sort()).toEqual(
      [`ended/${resource.key}`, RETENTION_RECORD_KEY].sort(),
    )
  })

  it('a scope closed before its last entry stopped keeps every end fact', async () => {
    const f = await fixture()
    await f.reserved()
    const second: ManagedResource = { ...resource, key: 'domain-2' }
    expect(await f.acquisition.plan(second)).toBe('recorded')
    expect(await f.acquisition.permit(second.key)).toBe('confirmed')
    expect(await f.processes.plan(second)).toBe('recorded')
    for (const key of [resource.key, second.key])
      expect(await f.processes.adopt(key)).toBe('confirmed')
    expect(await f.processes.stopped(resource.key, 'confirmed')).toBe('recorded')
    expect(await f.processes.close()).toBe('confirmed')
    expect(await f.processes.stopped(second.key, 'confirmed')).toBe('recorded')
    for (const key of [resource.key, second.key])
      expect(await f.processes.ended(key)).toBe('confirmed')
    expect((await scopeKeys(f)).sort()).toEqual(
      [`ended/${resource.key}`, `ended/${second.key}`, RETENTION_RECORD_KEY].sort(),
    )
  })

  it('reads an end fact by its key: one record, never the whole scope', async () => {
    const f = await fixture()
    await f.reserved()
    expect(await f.processes.adopt(resource.key)).toBe('confirmed')
    expect(await f.processes.stopped(resource.key, 'confirmed')).toBe('recorded')
    const whole = vi.spyOn(f.store, 'read')
    const keyed = vi.spyOn(f.store, 'readRecord')
    expect(await f.processes.ended(resource.key)).toBe('confirmed')
    expect(whole).not.toHaveBeenCalled()
    expect(keyed).toHaveBeenCalledTimes(1)
    expect(keyed).toHaveBeenCalledWith(
      retentionDomain(tenantA, preparation.request.requesterScope),
      hostKey(`ended/${resource.key}`),
    )
  })

  it('keeps no end fact for a retained terminal: its confirmed stop only ends the hold', async () => {
    const f = await fixture()
    await f.reserved()
    expect(await f.processes.permit(resource.key)).toBe('confirmed')
    expect(await f.processes.stopped(resource.key, 'confirmed')).toBe('recorded')
    expect(await f.processes.ended(resource.key)).toBe('none')
    expect(await scopeKeys(f)).toEqual([RETENTION_RECORD_KEY])
  })

  it('answers unavailable, not none, when the retention state cannot be read', async () => {
    const f = await fixture()
    await f.reserved()
    expect(await f.processes.adopt(resource.key)).toBe('confirmed')
    expect(await f.processes.stopped(resource.key, 'confirmed')).toBe('recorded')
    const read = f.store.readRecord.bind(f.store)
    vi.spyOn(f.store, 'readRecord').mockImplementation(async (domain, key) =>
      domain.kind === 'host' ? { kind: 'unavailable', diagnostic: 'fixture' } : read(domain, key),
    )
    expect(await f.processes.ended(resource.key)).toBe('unavailable')
  })
})

describe('a retention scope is open or closed, and never open again', () => {
  /** The scope's record as stored: its encoded state, or undefined when there is none. */
  const scopeState = async (f: Awaited<ReturnType<typeof fixture>>) =>
    (await f.domain()).retention?.state as unknown

  it('a closed scope keeps its record: a view made after it, by a restart or a later acquisition, starts closed and its plan, permit and adopt answer closed', async () => {
    const f = await fixture()
    expect(await f.processes.plan(resource)).toBe('recorded')
    expect(await f.processes.permit(resource.key)).toBe('confirmed')
    expect(await f.processes.close()).toBe('confirmed')
    expect(await f.processes.stopped(resource.key, 'confirmed')).toBe('recorded')
    expect(await scopeState(f)).toMatchObject({ phase: 'closed', resources: [] })
    const before = await f.domain()
    for (const view of [await f.retained(), await otherCallView(f)]) {
      expect(view.closed.aborted).toBe(true)
      expect(await view.plan({ ...resource, key: 'fresh' })).toBe('closed')
      expect(await view.permit('fresh')).toBe('closed')
      expect(await view.adopt('fresh')).toBe('closed')
    }
    expect(await f.domain()).toEqual(before)
    expect(await scopeKeys(f)).toEqual([RETENTION_RECORD_KEY])
  })

  it('the creator records the stop of its own reservation after the scope closed', async () => {
    const f = await fixture()
    await f.reserved()
    expect(await f.processes.close()).toBe('confirmed')
    expect(await f.processes.stopped(resource.key, 'confirmed')).toBe('recorded')
  })

  it('a close of a scope with no record writes a closed record, so no later plan opens it', async () => {
    const f = await fixture()
    expect(await f.processes.close()).toBe('confirmed')
    const closed = await scopeState(f)
    expect(closed).toMatchObject({ phase: 'closed', resources: [] })
    expect(await (await f.retained()).plan(resource)).toBe('closed')
    expect(await scopeState(f)).toEqual(closed)
  })

  it('a closed scope keeps only what it took over and answers closed to plan, permit and adopt from every view', async () => {
    const f = await fixture()
    await f.reserved()
    const untaken: ManagedResource = { ...resource, key: 'domain-2' }
    expect(await f.acquisition.plan(untaken)).toBe('recorded')
    expect(await f.acquisition.permit(untaken.key)).toBe('confirmed')
    expect(await f.processes.plan(untaken)).toBe('recorded')
    expect(await f.processes.adopt(resource.key)).toBe('confirmed')
    expect(await f.processes.close()).toBe('confirmed')
    const closed = (await f.domain()).retention?.state
    expect(closed).toMatchObject({ phase: 'closed' })
    expect(closed?.resources.map(item => item.resource.key)).toEqual([resource.key])
    const before = await f.domain()
    for (const view of [f.processes, await f.retained(), await otherCallView(f)]) {
      expect(view.closed.aborted).toBe(true)
      expect(await view.plan({ ...resource, key: 'fresh' })).toBe('closed')
      expect(await view.permit(untaken.key)).toBe('closed')
      expect(await view.adopt(untaken.key)).toBe('closed')
    }
    expect(await f.domain()).toEqual(before)
  })
})

describe('the environment plan hands processes to acquire', () => {
  function environment(retentions: () => EnvironmentRetention) {
    const store = createMemoryToolLedgerStore()
    void store.commit({
      domain: { kind: 'call', tenant: tenantA, call: preparation.call },
      expected: revision('0'),
      revision: revision('1'),
      writes: [{ kind: 'put', record: { kind: 'call', call: callRecord() } }],
    })
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
      observeRetained: async () => [],
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
    return { env, acquire, prepare, state }
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

  it('a confirmed release keeps a handed-over fact handed over while the scope holds it, and confirms the rest', async () => {
    const f = environment(() => ({ scope: original.scope, ledger: view(), processes: view() }))
    const prepared = await f.env.prepare(f.prepare)
    if (!('ok' in prepared) || prepared.ok.kind !== 'prepared') throw new Error('not prepared')
    const other: ManagedResource = { ...resource, key: 'other' }
    const acquisition = await createEnvironmentResourceLedger({
      state: f.state,
      address: preparation,
      authorize: async () => 'authorized',
    })
    const processes = await createRetainedTerminalLedger({
      state: f.state,
      address: preparation,
      scope: original.scope,
      authorize: async () => 'authorized',
    })
    for (const item of [resource, other]) {
      expect(await acquisition.plan(item)).toBe('recorded')
      expect(await acquisition.permit(item.key)).toBe('confirmed')
    }
    expect(await processes.plan(resource)).toBe('recorded')
    expect(await processes.adopt(resource.key)).toBe('confirmed')
    const release = {
      ...preparation,
      operation: operationId('release'),
      preparation: preparation.operation,
      resource: prepared.ok.environment.evidence,
      custody: evidence('output-custody'),
    }
    expect(await f.env.release({ ...f.prepare, release })).toMatchObject({
      ok: { kind: 'released' },
    })
    const stops = async () => {
      const after = await f.state.read(preparation)
      if (!('ok' in after) || !after.ok) throw new Error('no acquisition record')
      return after.ok.resources.map(item => [item.resource.key, item.stop])
    }
    expect(await stops()).toEqual([
      [resource.key, 'handedOver'],
      [other.key, 'confirmed'],
    ])
    // The scope confirms the process ended: the released acquisition shows its own confirmed stop.
    expect(await processes.stopped(resource.key, 'confirmed')).toBe('recorded')
    expect(await stops()).toEqual([
      [resource.key, 'confirmed'],
      [other.key, 'confirmed'],
    ])
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
