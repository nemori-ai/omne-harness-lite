import { expect, it, vi } from 'vitest'

import {
  acquisitionRef,
  originRef,
  type ManagedResource,
  type OriginalAcquisition,
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
} from '../../src/environment-resource-ledger.ts'
import {
  createEnvironmentStateStore,
  type EnvironmentGuardedHostCommit,
} from '../../src/environment-state.ts'
import { adoption, callId, evidence, operationId, request, tenantA } from '../coordinator-values.ts'

function revision(text: string) {
  const parsed = decodeToolRevision(text)
  if ('failure' in parsed) throw new Error('invalid fixture revision')
  return parsed.ok
}

async function fixture(retained = false) {
  const store = createMemoryToolLedgerStore()
  const preparation: PreparationRecord = {
    tenant: tenantA,
    call: callId('call'),
    operation: operationId('prepare'),
    adoption: adoption('environment'),
    inputDigest: 'input',
    purpose: 'initial',
    request: request(),
  }
  const original: OriginalAcquisition = {
    tenant: tenantA,
    acquisition: acquisitionRef('original'),
    origin: originRef('caller'),
    scope: preparation.request.requesterScope,
    placement: {
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
    },
  }
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
  const guarded = {
    commit: vi.fn<EnvironmentGuardedHostCommit['commit']>(async input => {
      const current = await store.read(input.call)
      if (current.kind !== 'complete' || current.revision !== input.callExpected)
        return { kind: 'call-changed' }
      return store.commit(input.hostCommit)
    }),
  }
  const state = createEnvironmentStateStore({ store, guarded, mode: 'test' })
  await state.update(preparation, () =>
    succeed({
      preparation,
      original: retained
        ? { ...original, retentionScope: preparation.request.requesterScope }
        : original,
      digest: canonicalDigest(preparation),
      allocation: { kind: 'sent' },
      closed: false,
      evidence: evidence('original'),
      release: null,
      resources: [],
    }),
  )
  let allowed = true
  const build = () =>
    createEnvironmentResourceLedger({
      state: createEnvironmentStateStore({ store, guarded, mode: 'test' }),
      address: preparation,
      authorize: async () => (allowed ? 'authorized' : 'notAuthorized'),
    })
  const ledger = await build()
  const resource: ManagedResource = {
    key: 'process',
    provider: 'fixture',
    reference: { kind: 'string', value: 'generation-1' },
  }
  async function setCall(change: (record: CallRecord) => CallRecord) {
    const current = await store.read(callDomain)
    if (current.kind !== 'complete') throw new Error('fixture call unavailable')
    const found = current.records.find(item => item.kind === 'call')
    if (!found || found.kind !== 'call') throw new Error('fixture call missing')
    await store.commit({
      domain: callDomain,
      expected: current.revision,
      revision: revision((BigInt(current.revision) + 1n).toString()),
      writes: [{ kind: 'put', record: { kind: 'call', call: change(found.call) } }],
    })
  }
  async function finish() {
    const result = decodeToolResultVersion('1')
    if ('failure' in result) throw new Error('invalid result version')
    await setCall(record => ({
      ...record,
      state: {
        ...record.state,
        phase: 'settled',
        result: result.ok,
        relation: 'foreground',
        terminal: { kind: 'completed' },
        wait: { kind: 'none' },
      },
    }))
  }
  const retention = () =>
    createRetainedTerminalLedger({
      state,
      address: preparation,
      scope: preparation.request.requesterScope,
      authorize: async () => (allowed ? 'authorized' : 'notAuthorized'),
    })
  return {
    guarded,
    finish,
    setCall,
    retention,
    store,
    state,
    preparation,
    ledger,
    resource,
    build,
    revoke: () => {
      allowed = false
    },
  }
}

it('cannot permit a resource that has no original acquisition record', async () => {
  const ledger = await createEnvironmentResourceLedger({
    state: createEnvironmentStateStore({
      store: createMemoryToolLedgerStore(),
      mode: 'test',
    }),
    address: { tenant: tenantA, call: callId('call'), operation: operationId('prepare') },
    authorize: async () => 'authorized',
  })
  expect(await ledger.permit('missing')).toBe('unavailable')
})

it('requires a confirmed durable plan and preserves input conflicts', async () => {
  const f = await fixture()
  expect(await f.ledger.permit(f.resource.key)).toBe('unavailable')
  f.store.injectCommit('unknown-dropped')
  expect(await f.ledger.plan(f.resource)).toBe('unavailable')
  expect(await f.ledger.permit(f.resource.key)).toBe('unavailable')
  expect(await f.ledger.plan(f.resource)).toBe('recorded')
  expect(await f.ledger.plan({ ...f.resource, provider: 'other' })).toBe('conflict')
  expect(await f.ledger.permit(f.resource.key)).toBe('confirmed')
})

it('does not confirm a lost permit and recognizes a committed receipt', async () => {
  const f = await fixture()
  await f.ledger.plan(f.resource)
  f.store.injectCommit('unknown-dropped')
  expect(await f.ledger.permit(f.resource.key)).toBe('unavailable')
  expect(await f.ledger.inspect()).toMatchObject([{ permitted: false }])
  f.store.injectCommit('unknown-applied')
  expect(await f.ledger.permit(f.resource.key)).toBe('confirmed')
  expect(await f.ledger.inspect()).toMatchObject([{ permitted: true }])
})

it('keeps unconfirmed stop responsibilities across reconstruction', async () => {
  const f = await fixture()
  await f.ledger.plan(f.resource)
  await f.ledger.permit(f.resource.key)
  expect(await f.ledger.stopped(f.resource.key, 'unconfirmed')).toBe('recorded')
  const rebuilt = await f.build()
  expect(await rebuilt.inspect()).toMatchObject([{ resource: f.resource, stop: 'unconfirmed' }])
  f.store.injectCommit('unknown-dropped')
  expect(await rebuilt.stopped(f.resource.key, 'confirmed')).toBe('unavailable')
  expect(await rebuilt.inspect()).toMatchObject([{ stop: 'unconfirmed' }])
})

it('reads durable closure on every permit and aborts all local views after close', async () => {
  const f = await fixture()
  const other = await f.build()
  await f.ledger.plan(f.resource)
  expect(await other.close()).toBe('confirmed')
  expect(f.ledger.closed.aborted).toBe(true)
  expect(await f.ledger.permit(f.resource.key)).toBe('closed')
  const cold = await f.build()
  expect(cold.closed.aborted).toBe(true)
  expect(await cold.plan({ ...f.resource, key: 'new' })).toBe('closed')
  expect(await cold.stopped(f.resource.key, 'confirmed')).toBe('recorded')
})

it('checks current authorization before adopting an existing resource', async () => {
  const f = await fixture()
  await f.ledger.plan(f.resource)
  f.revoke()
  expect(await f.ledger.adopt(f.resource.key)).toBe('unavailable')
  expect(await f.ledger.inspect()).toMatchObject([{ adopted: false }])
})

it('fails closed without the atomic call and host commit port', async () => {
  const f = await fixture()
  await f.ledger.plan(f.resource)
  const ledger = await createEnvironmentResourceLedger({
    state: createEnvironmentStateStore({ store: f.store, mode: 'test' }),
    address: f.preparation,
    authorize: async () => 'authorized',
  })
  const commits = f.store.commits
  expect(await ledger.permit(f.resource.key)).toBe('unavailable')
  expect(f.store.commits).toBe(commits)
})

it('rejects a permit after the original call is durably settled', async () => {
  const f = await fixture()
  await f.ledger.plan(f.resource)
  await f.finish()
  expect(await f.ledger.permit(f.resource.key)).toBe('closed')
  expect(f.guarded.commit).not.toHaveBeenCalled()
  expect(await f.ledger.inspect()).toMatchObject([{ permitted: false }])
})

it('rereads terminality when the call changes between qualification and host commit', async () => {
  const f = await fixture()
  await f.ledger.plan(f.resource)
  f.guarded.commit.mockImplementationOnce(async () => {
    await f.finish()
    return { kind: 'call-changed' }
  })
  expect(await f.ledger.permit(f.resource.key)).toBe('closed')
  expect(f.guarded.commit).toHaveBeenCalledTimes(1)
  expect(await f.ledger.inspect()).toMatchObject([{ permitted: false }])
})

it('rechecks original preparation binding after a host conflict', async () => {
  const f = await fixture()
  await f.ledger.plan(f.resource)
  f.guarded.commit.mockImplementationOnce(async input => {
    await f.setCall(call => ({ ...call, preparations: [] }))
    return { kind: 'conflict', current: input.hostCommit.expected }
  })
  expect(await f.ledger.permit(f.resource.key)).toBe('unavailable')
  expect(f.guarded.commit).toHaveBeenCalledTimes(1)
})

it('retries a live call revision conflict with a fresh call condition', async () => {
  const f = await fixture()
  await f.ledger.plan(f.resource)
  f.guarded.commit.mockImplementationOnce(async () => {
    await f.setCall(call => call)
    return { kind: 'call-changed' }
  })
  expect(await f.ledger.permit(f.resource.key)).toBe('confirmed')
  expect(f.guarded.commit.mock.calls.map(([input]) => input.callExpected)).toEqual(['1', '2'])
})

it('keeps retained ownership after acquisition closure and permits stop facts after call terminality', async () => {
  const f = await fixture(true)
  const retained = await f.retention()
  expect(await retained.plan(f.resource)).toBe('recorded')
  expect(await retained.permit(f.resource.key)).toBe('confirmed')
  expect(await f.ledger.close()).toBe('confirmed')
  expect(retained.closed.aborted).toBe(false)
  expect(await retained.permit(f.resource.key)).toBe('closed')
  await f.finish()
  expect(await retained.stopped(f.resource.key, 'unconfirmed')).toBe('recorded')
  expect(await (await f.retention()).inspect()).toMatchObject([
    { creator: { call: f.preparation.call }, stop: 'unconfirmed', permitted: true },
  ])
  expect(await retained.stopped(f.resource.key, 'confirmed')).toBe('recorded')
})

it('orders retained permit against the original call and independently closes the retention scope', async () => {
  const f = await fixture(true)
  const retained = await f.retention()
  const another = await f.retention()
  await retained.plan(f.resource)
  f.guarded.commit.mockImplementationOnce(async () => {
    await f.finish()
    return { kind: 'call-changed' }
  })
  expect(await retained.permit(f.resource.key)).toBe('closed')
  expect(retained.closed.aborted).toBe(false)
  expect(await another.close()).toBe('confirmed')
  expect(retained.closed.aborted).toBe(true)
  expect(f.ledger.closed.aborted).toBe(false)
  expect((await f.retention()).closed.aborted).toBe(true)
})

it('does not substitute the ordinary acquisition scope for an absent retained binding', async () => {
  const f = await fixture()
  const retained = await f.retention()
  expect(await retained.plan(f.resource)).toBe('unavailable')
  expect(await retained.permit(f.resource.key)).toBe('unavailable')
})

it('refuses retained creation after durable scope closure while the creating call remains live', async () => {
  const f = await fixture(true)
  const retained = await f.retention()
  await retained.plan(f.resource)
  await retained.close()
  expect(await retained.permit(f.resource.key)).toBe('closed')
  expect(f.guarded.commit).not.toHaveBeenCalled()
  expect(await retained.inspect()).toMatchObject([{ permitted: false }])
})

it('recognizes retained permit receipts without losing unknown stop responsibility', async () => {
  const f = await fixture(true)
  const retained = await f.retention()
  await retained.plan(f.resource)
  f.store.injectCommit('unknown-dropped')
  expect(await retained.permit(f.resource.key)).toBe('unavailable')
  f.store.injectCommit('unknown-applied')
  expect(await retained.permit(f.resource.key)).toBe('confirmed')
  await retained.stopped(f.resource.key, 'unconfirmed')
  f.store.injectCommit('unknown-dropped')
  expect(await retained.stopped(f.resource.key, 'confirmed')).toBe('unavailable')
  expect(await (await f.retention()).inspect()).toMatchObject([
    { stop: 'unconfirmed', permitted: true },
  ])
})

it('maintains retained resources when unrelated environment history exceeds the full-read bound', async () => {
  const f = await fixture(true)
  const read = f.store.read.bind(f.store)
  vi.spyOn(f.store, 'read').mockImplementation(domain =>
    domain.kind === 'host' && domain.key === 'execution-environment/v1'
      ? Promise.resolve({ kind: 'unavailable', diagnostic: 'full domain exceeds read bound' })
      : read(domain),
  )
  const retained = await f.retention()
  expect(await retained.plan(f.resource)).toBe('recorded')
  expect(await retained.permit(f.resource.key)).toBe('confirmed')
  expect(await f.ledger.close()).toBe('confirmed')
  await f.finish()
  expect(await retained.stopped(f.resource.key, 'confirmed')).toBe('recorded')
  expect(await (await f.retention()).inspect()).toMatchObject([
    { creator: { call: f.preparation.call }, stop: 'confirmed' },
  ])
})
