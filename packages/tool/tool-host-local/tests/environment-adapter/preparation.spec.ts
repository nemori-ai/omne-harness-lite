import { expect, it, vi } from 'vitest'
import {
  acquisitionRef,
  originRef,
  type EnvironmentFacilities,
  type EnvironmentLease,
  type ExecutionEnvironment,
  type OriginalAcquisition,
  type Placement,
  type ResourceLedger,
} from '@omne-harness/execution-environment-contract'
import { succeed } from '@omne-harness/operation-result'
import type { ToolLedgerStore } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'

import type { PreparationRecord, ReleaseRecord } from '@omne-harness/tool-contract/provider'
import { toolEnvironmentConformance } from '@omne-harness/tool-contract/testing'
import {
  createMemoryFileSystem,
  createScriptedCommandFacility,
} from '@omne-harness/execution-environment-contract/testing'
import type { FileObjectNaming, ToolEnvironmentValue } from '../../src/author-environment.ts'
import { createLocalExecutionEnvironment } from '../../src/execution-environment.ts'
import { createEnvironmentStateStore } from '../../src/environment-state.ts'
import { createEnvironmentResourceLedger } from '../../src/environment-resource-ledger.ts'
import {
  adoption,
  callId,
  evidence,
  operationId,
  principalA,
  request,
  tenantA,
  type Principal,
} from '../coordinator-values.ts'

/** `wrap` puts a store double between the adapter and the memory store. */
function fixture(wrap: (memory: ToolLedgerStore) => ToolLedgerStore = memory => memory) {
  const store = createMemoryToolLedgerStore()
  const ledgerStore = wrap(store)
  const state = createEnvironmentStateStore({ store: ledgerStore, mode: 'test' })
  const preparation: PreparationRecord = {
    tenant: tenantA,
    call: callId('call-1'),
    operation: operationId('prepare-1'),
    adoption: adoption('environment'),
    inputDigest: 'input-1',
    purpose: 'initial',
    request: request(),
  }
  const access = { tenant: tenantA, principal: principalA, call: preparation.call }
  const prepare = { ...access, preparation }
  const placement: Placement = {
    kind: 'placement',
    binding: { kind: 'host_machine' },
    provider: { name: 'fixture', version: '1', generation: '1' },
    quotaDomain: 'fixture',
    continuity: { kind: 'not_guaranteed' },
    requirement: {
      allowedBindings: [{ kind: 'host_machine' }],
      facilities: ['files', 'command'],
      isolation: [],
    },
  }
  const original: OriginalAcquisition = {
    tenant: tenantA,
    acquisition: acquisitionRef('original'),
    origin: originRef('caller'),
    scope: preparation.request.requesterScope,
    placement,
  }
  const releaseLease = vi.fn<EnvironmentLease['release']>(async () => ({ kind: 'released' }))
  const start = vi.fn<EnvironmentFacilities['command']['start']>(async input => ({
    kind: 'rejected',
    requestId: input.requestId,
    reason: 'unsupported',
  }))
  const facilities: Partial<EnvironmentFacilities> = { command: { start } }
  const lease: EnvironmentLease = {
    placement,
    instance: { id: 'instance', generation: '1' },
    continuity: placement.continuity,
    facility: key => facilities[key],
    release: releaseLease,
    invalidated: new Promise(() => {}),
  }
  let allocated = false
  let lose = false
  let held: Promise<void> | null = null
  let ledger: ResourceLedger
  const acquire = vi.fn<ExecutionEnvironment<Principal>['acquire']>(async (_access, input) => {
    const saved = await state.read(preparation)
    expect(saved).toMatchObject({ ok: { original: { acquisition: 'original' } } })
    allocated = true
    if (held) await held
    if (lose) {
      lose = false
      return { kind: 'unknown', phase: 'allocation', acquisition: input.acquisition }
    }
    return {
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
    }
  })
  const inspectAcquisition = vi.fn<ExecutionEnvironment<Principal>['inspectAcquisition']>(
    async (_access, query) => {
      if (query.kind !== 'original') return { kind: 'unrecorded' }
      return allocated
        ? { kind: 'original', status: 'allocated', original: query.original, adoption: null }
        : { kind: 'original', status: 'notAllocated', original: query.original }
    },
  )
  const execution: ExecutionEnvironment<Principal> = {
    acquire,
    inspectAcquisition,
    resolvePlacement: async () => placement,
    inspectRecoveryAcquisition: async () => ({ kind: 'queryUnavailable', cause: 'provider' }),
    describe: async () => [],
    observeRetained: async () => [],
    recoverOwned: async () => ({ kind: 'unknown', cause: 'provider' }),
    releaseScope: vi.fn<ExecutionEnvironment<Principal>['releaseScope']>(async () => ({
      kind: 'unknown',
      cause: 'provider',
    })),
  }
  const build = () =>
    createLocalExecutionEnvironment({
      adoption: preparation.adoption,
      execution,
      store: ledgerStore,
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
              placement: original.placement,
              guard,
              ledger,
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
      naming,
      cleanup: {
        settle: async () =>
          succeed({ kind: 'pending', diagnostic: 'exact original cleanup unavailable' }),
      },
    })
  const guard = { authorize: async () => 'authorized' as const }
  const naming: FileObjectNaming<Principal> = {
    name: async () => succeed({ token: 'authorized' }),
  }
  const release = async () => {
    const saved = await state.read(preparation)
    if (!('ok' in saved) || !saved.ok) throw new Error('missing preparation')
    const record: ReleaseRecord = {
      tenant: tenantA,
      call: preparation.call,
      operation: operationId('release'),
      adoption: preparation.adoption,
      inputDigest: 'release-input',
      preparation: preparation.operation,
      resource: saved.ok.evidence,
      custody: evidence('custody'),
    }
    return { ...access, release: record }
  }
  return {
    naming,
    facilities,
    store,
    state,
    preparation,
    prepare,
    build,
    acquire,
    inspectAcquisition,
    releaseLease,
    start,
    execution,
    release,
    lose: () => {
      lose = true
    },
    hold: (wait: Promise<void>) => {
      held = wait
    },
  }
}

it('confirms the original acquisition before acquire and exposes a bound command', async () => {
  const f = fixture()
  const env = f.build()
  const result = await env.prepare(f.prepare)
  expect(result).toMatchObject({ ok: { kind: 'prepared' } })
  if ('failure' in result || result.ok.kind !== 'prepared') throw new Error('not prepared')
  await result.ok.environment.value.command.start({
    executable: 'fixture',
    args: [],
    cwd: '/fixture',
    env: {},
    outputMode: 'separate',
  })
  expect(f.start).toHaveBeenCalledWith(
    expect.objectContaining({
      origin: 'caller',
      access: { principal: principalA, tenant: tenantA },
    }),
  )
  expect(await env.release(await f.release())).toMatchObject({ ok: { kind: 'released' } })
  expect(f.releaseLease).toHaveBeenCalledTimes(1)
})

it('writes and reads exact bytes through the adapter and the published file facility double', async () => {
  const f = fixture()
  const filesystem = createMemoryFileSystem()
  f.facilities.files = filesystem.facility
  f.naming.name = async input => {
    const path = input.role === 'object' ? input.path : ''
    const token = filesystem.objectToken(path)
    if (!token) throw new Error('fixture object binding missing')
    return succeed(token)
  }
  const env = f.build()
  const result = await env.prepare(f.prepare)
  if ('failure' in result || result.ok.kind !== 'prepared') throw new Error('not prepared')
  const files = result.ok.environment.value.files
  const bytes = new TextEncoder().encode('中文\r\nlast')
  expect(await files.write({ path: 'new.txt', mode: 'create', bytes })).toMatchObject({
    kind: 'done',
  })
  const read = await files.read({ path: 'new.txt' })
  expect(read).toMatchObject({ kind: 'done', value: { bytes, eof: true } })
  if (read.kind === 'done') await files.close({ path: 'new.txt', handle: read.value.handle })
  expect(await env.release(await f.release())).toMatchObject({ ok: { kind: 'released' } })
  filesystem.close()
})

it('drains command bytes and final status through the adapter and the published command double', async () => {
  const f = fixture()
  const command = createScriptedCommandFacility(() => ({
    kind: 'started',
    output: [{ stream: 'stdout', data: 'command-result' }],
  }))
  f.facilities.command = command.facility
  const env = f.build()
  const result = await env.prepare(f.prepare)
  if ('failure' in result || result.ok.kind !== 'prepared') throw new Error('not prepared')
  const started = await result.ok.environment.value.command.start({
    executable: 'fixture',
    args: [],
    cwd: '/fixture',
    env: {},
    outputMode: 'separate',
  })
  if (started.kind !== 'done') throw new Error('command did not start')
  const chunks: string[] = []
  for await (const chunk of started.value.output) chunks.push(new TextDecoder().decode(chunk.data))
  expect(chunks.join('')).toBe('command-result')
  expect(await started.value.result).toMatchObject({
    kind: 'completed',
    exit: { kind: 'code', code: 0 },
  })
  expect(command.calls).toHaveLength(1)
  expect(await env.release(await f.release())).toMatchObject({ ok: { kind: 'released' } })
  command.close()
})

it.each(['unavailable', 'unknown-dropped'] as const)(
  'never acquires after %s original commit',
  async fault => {
    const f = fixture()
    f.store.injectCommit(fault)
    expect(await f.build().prepare(f.prepare)).toHaveProperty('failure')
    expect(f.acquire).not.toHaveBeenCalled()
  },
)

it('answers an original commit the store rejects as a definite failure and never acquires', async () => {
  let commits = 0
  const f = fixture(memory => ({
    ...memory,
    commit: async () => {
      commits += 1
      return { kind: 'rejected', reason: 'command_limit' }
    },
  }))
  expect(await f.build().prepare(f.prepare)).toEqual({
    failure: { kind: 'invalid', field: 'storage', reason: 'command_limit' },
  })
  expect(commits).toBe(1)
  expect(f.acquire).not.toHaveBeenCalled()
})

it('recognizes a committed original whose receipt was lost', async () => {
  const f = fixture()
  f.store.injectCommit('unknown-applied')
  expect(await f.build().prepare(f.prepare)).toMatchObject({ ok: { kind: 'prepared' } })
  expect(f.acquire).toHaveBeenCalledTimes(1)
})

it('keeps cold inspection and cold prepare lease-free and cold release pending', async () => {
  const f = fixture()
  await f.build().prepare(f.prepare)
  const cold = f.build()
  expect(await cold.inspectPreparation(f.prepare)).toMatchObject({ ok: { kind: 'unknown' } })
  expect(await cold.prepare(f.prepare)).toMatchObject({ ok: { kind: 'unknown' } })
  expect(f.acquire).toHaveBeenCalledTimes(1)
  expect(await cold.release(await f.release())).toMatchObject({ ok: { kind: 'pending' } })
  expect(f.execution.releaseScope).not.toHaveBeenCalled()
})

it('rejects changed preparation input without allocating again', async () => {
  const f = fixture()
  const env = f.build()
  await env.prepare(f.prepare)
  expect(
    await env.prepare({ ...f.prepare, preparation: { ...f.preparation, inputDigest: 'changed' } }),
  ).toMatchObject({ failure: { kind: 'conflict' } })
  expect(f.acquire).toHaveBeenCalledTimes(1)
})

it('queries an unknown original and permits explicit first adoption only in its live process', async () => {
  const f = fixture()
  const env = f.build()
  f.lose()
  expect(await env.prepare(f.prepare)).toMatchObject({ ok: { kind: 'unknown' } })
  expect(await env.inspectPreparation(f.prepare)).toMatchObject({ ok: { kind: 'allocated' } })
  expect(f.acquire).toHaveBeenCalledTimes(1)
  expect(await env.prepare(f.prepare)).toMatchObject({ ok: { kind: 'prepared' } })
  expect(f.acquire.mock.calls[1]?.[1]).toBe(f.acquire.mock.calls[0]?.[1])
})

it('does not turn notAllocated into a retryable exclusion or revive it from a later query', async () => {
  const f = fixture()
  const env = f.build()
  f.lose()
  await env.prepare(f.prepare)
  const saved = await f.state.read(f.preparation)
  if ('failure' in saved || !saved.ok) throw new Error('original unavailable')
  f.inspectAcquisition.mockResolvedValueOnce({
    kind: 'original',
    status: 'notAllocated',
    original: saved.ok.original,
  })
  expect(await env.inspectPreparation(f.prepare)).toMatchObject({ ok: { kind: 'unknown' } })
  expect(await env.prepare(f.prepare)).toMatchObject({ ok: { kind: 'unknown' } })
  expect(f.acquire).toHaveBeenCalledTimes(1)
})

it('does not revive an acquisition when its reply arrives after durable closure', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  f.hold(gate.promise)
  const env = f.build()
  const waiting = env.prepare(f.prepare)
  await vi.waitFor(() => expect(f.acquire).toHaveBeenCalledTimes(1))
  expect(await env.release(await f.release())).toMatchObject({ ok: { kind: 'pending' } })
  gate.resolve()
  expect(await waiting).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(f.releaseLease).toHaveBeenCalledTimes(1)
  expect(await env.prepare(f.prepare)).toHaveProperty('failure')
})

it('keeps an authoritative notAllocated terminal ahead of a late acquisition answer', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  f.hold(gate.promise)
  const env = f.build()
  const waiting = env.prepare(f.prepare)
  await vi.waitFor(() => expect(f.acquire).toHaveBeenCalledTimes(1))
  const saved = await f.state.read(f.preparation)
  if ('failure' in saved || !saved.ok) throw new Error('missing original')
  f.inspectAcquisition.mockResolvedValueOnce({
    kind: 'original',
    status: 'notAllocated',
    original: saved.ok.original,
  })
  expect(await env.inspectPreparation(f.prepare)).toMatchObject({ ok: { kind: 'unknown' } })
  gate.resolve()
  expect(await waiting).toHaveProperty('failure')
  expect(f.releaseLease).toHaveBeenCalledTimes(1)
})

const applicable = new Set([
  'a preparation resent by its operation returns the original resource',
  'a resent preparation allocates nothing new',
  'inspectPreparation recalls the original allocation',
  'inspectPreparation claims nothing for an operation never prepared',
  'a release resent by its operation returns the original evidence',
  'inspectRelease recalls the release',
  'inspectRelease of a release never submitted is not released',
  'a preparation operation reused with another input is a conflict that changes nothing',
  'a release operation reused with another input is a conflict that changes nothing',
])
for (const test of toolEnvironmentConformance<Principal, ToolEnvironmentValue>().filter(test =>
  applicable.has(test.name),
)) {
  it(`ToolEnvironment conformance: ${test.name}`, async () => {
    const f = fixture()
    await test.run({
      environment: f.build(),
      access: { tenant: tenantA, principal: principalA },
      request: f.preparation.request,
      allocations: () => f.acquire.mock.calls.length,
    })
  })
}

it('prepares an acquisition without any complete read of an environment domain', async () => {
  const f = fixture()
  const read = f.store.read.bind(f.store)
  vi.spyOn(f.store, 'read').mockImplementation(domain =>
    domain.kind === 'host' &&
    (domain.key.startsWith('environment@') || domain.key.startsWith('retention@'))
      ? Promise.resolve({ kind: 'unavailable', diagnostic: 'complete domain reads are not used' })
      : read(domain),
  )
  expect(await f.build().prepare(f.prepare)).toMatchObject({ ok: { kind: 'prepared' } })
  expect(f.acquire).toHaveBeenCalledTimes(1)
  expect(await f.state.read(f.preparation)).toMatchObject({
    ok: { allocation: { kind: 'allocated' } },
  })
})
