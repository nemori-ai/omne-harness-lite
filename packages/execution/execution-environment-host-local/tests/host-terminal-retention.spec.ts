import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import {
  acquisitionRef,
  originRef,
  type FacilityResult,
  type ManagedResource,
  type ProcessHandle,
  type ProviderAcquireInput,
  type ResourceLedger,
  type TerminalInformation,
} from '@omne-harness/execution-environment-contract'
import { createMemoryResourceLedger } from '@omne-harness/execution-environment-contract/testing'
import {
  createRetainedTerminalIndex,
  type RetainedTerminalFactory,
} from '../src/host-retained-terminals.ts'
import { createHostTerminals, terminalSettings, type HostTerminals } from '../src/host-terminal.ts'
import * as hostProbe from '../src/host-probe.ts'
import * as hostScope from '../src/host-scope.ts'

function scope(ref: string) {
  const result = decodeScopeRef({ ref })
  if (!('ok' in result)) throw new Error('scope fixture')
  return result.ok
}
const tenant = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_0123456789abcdefghjkmnpqrs',
    account: 'acc_0123456789abcdefghjkmnpqrs',
  }),
)
if (!tenant.ok) throw new Error('tenant fixture')
const tenantId = tenant.value
const binding = { kind: 'host_machine' } as const
const request = {
  requestId: 'op',
  access: { principal: 'test', tenant: tenantId },
  binding,
  origin: originRef('a'),
}
function value<T>(result: FacilityResult<T>): T {
  if (result.kind !== 'done') throw new Error(JSON.stringify(result))
  return result.value
}
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>(yes => {
    resolve = yes
  })
  return { promise, resolve }
}
function input(ledger = createMemoryResourceLedger().ledger): ProviderAcquireInput {
  const retention = createMemoryResourceLedger().ledger
  return {
    tenant: tenantId,
    acquisition: acquisitionRef(randomUUID()),
    origin: request.origin,
    scope: scope('run'),
    ledger,
    retention: {
      scope: scope('session'),
      ledger: retention,
      released: new AbortController().signal,
    },
    placement: {
      kind: 'placement',
      binding,
      quotaDomain: 'host',
      provider: { name: 'host', generation: 'g', version: '1' },
      continuity: { kind: 'not_guaranteed' },
      requirement: { allowedBindings: [binding], facilities: ['terminal'], isolation: [] },
    },
  }
}
function fixture() {
  const index = createRetainedTerminalIndex()
  const started: ManagedResource[] = []
  const executed: string[] = []
  const stopped: string[] = []
  const results = new Map<string, ReturnType<typeof deferred<Awaited<ProcessHandle['result']>>>>()
  let stopStatus: 'confirmed' | 'unconfirmed' = 'confirmed'
  const startWait = { current: Promise.resolve() }
  const ordinary: HostTerminals = {
    facility: {
      async create(q) {
        return { kind: 'rejected', requestId: q.requestId, reason: 'unsupported' }
      },
      async execute(q) {
        return { kind: 'rejected', requestId: q.requestId, reason: 'notFound' }
      },
      async close(q) {
        return { kind: 'rejected', requestId: q.requestId, reason: 'notFound' }
      },
      async list(q) {
        return { kind: 'done', requestId: q.requestId, value: [] }
      },
    },
    seal() {},
    inFlight: () => 0,
    settled: async () => undefined,
    stopAll: async () => [],
    unconfirmed: () => [],
  }
  const reserve: RetainedTerminalFactory = reservation => {
    const terminal = { id: randomUUID(), generation: 't' }
    const resource: ManagedResource = {
      key: terminal.id,
      provider: 'host',
      reference: { kind: 'string', value: terminal.id },
    }
    let state: TerminalInformation['state'] = 'idle'
    return {
      terminal,
      resource,
      async start() {
        await startWait.current
        if (reservation.closed()) return { kind: 'rejected', requestId: 'op', reason: 'closed' }
        started.push(resource)
        return { kind: 'done', requestId: 'op', value: { terminal } }
      },
      async execute(q) {
        executed.push(q.script)
        state = 'running'
        const end = deferred<Awaited<ProcessHandle['result']>>()
        results.set(terminal.id, end)
        const handle: ProcessHandle = {
          process: { id: randomUUID(), generation: 'leg' },
          outputMode: 'terminal',
          output: { async *[Symbol.asyncIterator]() {} },
          outputPolicy: { maxBufferedBytes: 8, maxChunkBytes: 8, overflow: 'discard' },
          result: end.promise.then(outcome => {
            state = 'idle'
            return outcome
          }),
          async stop() {
            stopped.push(terminal.id)
            return stopStatus
          },
        }
        return { kind: 'done', requestId: q.requestId, value: handle }
      },
      information: () => ({ terminal, state, observedCwd: '/tmp' }),
      async stop() {
        stopped.push(terminal.id)
        if (stopStatus === 'confirmed') state = 'closed'
        return stopStatus
      },
    }
  }
  const facade = (acquisition = input(), capacity = 4, generation = 'g', instance = 'instance') =>
    index.facade({
      acquisition,
      generation,
      instance,
      capacity,
      ordinary,
      reserve,
    })
  const create = async (f: HostTerminals) =>
    value(await f.facility.create({ ...request, cwd: '/tmp', env: {}, retain: 'session' })).terminal
  const finish = (id: string) =>
    results.get(id)?.resolve({
      kind: 'completed',
      exit: { kind: 'code', code: 0 },
      durationMs: 1,
      output: { mode: 'terminal', terminal: { observedBytes: 0, discardedBytes: 0 } },
    })
  return {
    index,
    facade,
    create,
    started,
    executed,
    stopped,
    finish,
    startWait,
    setStop(status: typeof stopStatus) {
      stopStatus = status
    },
  }
}

it('does not turn a completed foreground leg into a confirmed platform stop', async () => {
  const f = fixture()
  const a = f.facade()
  const terminal = await f.create(a)
  const handle = value(await a.facility.execute({ ...request, terminal, script: 'done' }))
  f.finish(terminal.id)
  await handle.result
  f.setStop('unconfirmed')
  expect(await handle.stop('forced')).toBe('unconfirmed')
  expect(f.stopped).toEqual([terminal.id])
  expect(f.index.resources(scope('session'))).toHaveLength(1)
})

it('retains the shell after acquisition release and never revives the old facade', async () => {
  const f = fixture()
  const a = f.facade()
  const terminal = await f.create(a)
  a.seal()
  expect(await a.stopAll()).toEqual([])
  expect(f.stopped).toEqual([])
  const b = f.facade()
  expect(
    await b.facility.retention?.attach({ ...request, origin: originRef('b'), terminal }),
  ).toMatchObject({ kind: 'done' })
  expect(await a.facility.retention?.attach({ ...request, terminal })).toMatchObject({
    reason: 'closed',
  })
  expect(await a.facility.list(request)).toMatchObject({ reason: 'closed' })
  expect(f.index.resources(scope('session'))).toHaveLength(1)
})

it('checks retention scope, quota domain, provider generation, instance and terminal generation', async () => {
  const f = fixture()
  const a = f.facade()
  const terminal = await f.create(a)
  const normal = input()
  if (normal.retention === undefined) throw new Error('retention fixture')
  const otherScope = { ...normal, retention: { ...normal.retention, scope: scope('other') } }
  const otherQuota = { ...normal, placement: { ...normal.placement, quotaDomain: 'other' } }
  const otherProvider = {
    ...normal,
    placement: {
      ...normal.placement,
      provider: { ...normal.placement.provider, generation: 'g2' },
    },
  }
  const secondTenant = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_1123456789abcdefghjkmnpqrs',
    }),
  )
  if (!secondTenant.ok) throw new Error('second tenant fixture')
  for (const b of [
    f.facade({ ...normal, tenant: secondTenant.value }),
    f.facade(otherScope),
    f.facade(otherQuota),
    f.facade(otherProvider, 4, 'g2'),
    f.facade(normal, 4, 'g', 'other'),
  ])
    expect(await b.facility.retention?.attach({ ...request, terminal })).toMatchObject({
      reason: 'notFound',
    })
  expect(
    await a.facility.retention?.attach({
      ...request,
      terminal: { ...terminal, generation: 'old' },
    }),
  ).toMatchObject({ reason: 'notFound' })
})

it('reserves one execution before permit and detach never stops another acquisition leg', async () => {
  const f = fixture()
  const permission = deferred<'confirmed'>()
  const normal = input()
  const a = f.facade({ ...normal, ledger: { ...normal.ledger, permit: () => permission.promise } })
  const b = f.facade()
  const terminal = await f.create(a)
  await b.facility.retention?.attach({ ...request, terminal })
  const running = a.facility.execute({ ...request, terminal, script: 'a' })
  expect(await b.facility.execute({ ...request, terminal, script: 'b' })).toMatchObject({
    reason: 'busy',
  })
  expect(f.executed).toEqual([])
  permission.resolve('confirmed')
  const leg = value(await running)
  expect(await b.facility.retention?.detach({ ...request, terminal })).toMatchObject({
    value: { status: 'confirmed' },
  })
  expect(f.stopped).toEqual([])
  expect(await b.facility.retention?.attach({ ...request, terminal })).toMatchObject({
    reason: 'closed',
  })
  f.finish(terminal.id)
  await leg.result
  expect(await a.stopAll()).toEqual([])
})

it('seals a detached relation while its permit is pending', async () => {
  const f = fixture()
  const permission = deferred<'confirmed'>()
  const normal = input()
  const a = f.facade({ ...normal, ledger: { ...normal.ledger, permit: () => permission.promise } })
  const terminal = await f.create(a)
  const running = a.facility.execute({ ...request, terminal, script: 'must-not-run' })
  await Promise.resolve()
  expect(await a.facility.retention?.detach({ ...request, terminal })).toMatchObject({
    value: { status: 'unconfirmed' },
  })
  permission.resolve('confirmed')
  expect(await running).toMatchObject({ reason: 'closed' })
  expect(f.executed).toEqual([])
  expect(await a.facility.retention?.attach({ ...request, terminal })).toMatchObject({
    reason: 'closed',
  })
  expect(await a.stopAll()).toEqual([])
})

it('enumerates a starting shell and prevents its late start after scope closure', async () => {
  const f = fixture()
  const wait = deferred<void>()
  f.startWait.current = wait.promise
  const normal = input()
  const released = new AbortController()
  if (normal.retention === undefined) throw new Error('retention fixture')
  const a = f.facade({ ...normal, retention: { ...normal.retention, released: released.signal } })
  const creating = a.facility.create({ ...request, cwd: '/tmp', env: {}, retain: 'session' })
  expect(f.index.resources(scope('session'))).toHaveLength(1)
  released.abort()
  wait.resolve()
  expect(await creating).toMatchObject({ reason: 'closed' })
  expect(f.started).toEqual([])
})

it('keeps unconfirmed shells enumerable and occupying capacity after all acquisitions leave', async () => {
  const f = fixture()
  const a = f.facade(input(), 1)
  const terminal = await f.create(a)
  a.seal()
  await a.stopAll()
  f.setStop('unconfirmed')
  expect(await f.index.retire('g')).toHaveLength(1)
  expect(f.index.resources(scope('session'))).toHaveLength(1)
  expect(await a.facility.close({ ...request, terminal })).toMatchObject({ reason: 'closed' })
  f.setStop('confirmed')
  expect(await f.index.retire('g')).toEqual([])
  expect(f.index.resources(scope('session'))).toEqual([])
})

it('preserves current acquisition cleanup when stopped recording is unavailable', async () => {
  const f = fixture()
  const normal = input()
  let available = false
  const ledger: ResourceLedger = {
    ...normal.ledger,
    stopped: async () => (available ? 'recorded' : 'unavailable'),
  }
  const a = f.facade({ ...normal, ledger })
  const terminal = await f.create(a)
  const leg = value(await a.facility.execute({ ...request, terminal, script: 'true' }))
  f.finish(terminal.id)
  await leg.result
  a.seal()
  expect(await a.stopAll()).toHaveLength(1)
  available = true
  expect(await a.stopAll()).toEqual([])
})

it('requires a retention binding and counts unresolved reservations against explicit capacity', async () => {
  const f = fixture()
  const { retention: _retention, ...ordinaryInput } = input()
  expect(
    await f
      .facade(ordinaryInput)
      .facility.create({ ...request, cwd: '/tmp', env: {}, retain: 'session' }),
  ).toMatchObject({ reason: 'unsupported' })
  const a = f.facade(input(), 1)
  await f.create(a)
  expect(
    await a.facility.create({ ...request, cwd: '/tmp', env: {}, retain: 'session' }),
  ).toMatchObject({ reason: 'busy' })
})

it('rejects an execution before sending its script when the acquisition permit is refused', async () => {
  const f = fixture()
  const normal = input()
  const a = f.facade({ ...normal, ledger: { ...normal.ledger, permit: async () => 'closed' } })
  const terminal = await f.create(a)
  expect(await a.facility.execute({ ...request, terminal, script: 'forbidden' })).toMatchObject({
    reason: 'closed',
  })
  expect(f.executed).toEqual([])
  expect(await a.stopAll()).toEqual([])
  expect(f.stopped).toEqual([])
})

it.each(['plan', 'permit'] as const)(
  'keeps the retained shell when the acquisition %s reply is lost before execution',
  async phase => {
    const f = fixture()
    const normal = input()
    let canRecord = false
    const keys: string[] = []
    const failed = async () => {
      throw new Error('ledger reply lost')
    }
    const ledger: ResourceLedger = {
      ...normal.ledger,
      ...(phase === 'plan' ? { plan: failed } : { permit: failed }),
      async stopped(key) {
        keys.push(key)
        return canRecord ? 'recorded' : 'unavailable'
      },
    }
    const a = f.facade({ ...normal, ledger })
    const terminal = await f.create(a)
    expect(await a.facility.execute({ ...request, terminal, script: 'never sent' })).toMatchObject({
      kind: 'unknown',
    })
    expect(f.executed).toEqual([])
    a.seal()
    expect(await a.stopAll()).toHaveLength(1)
    expect(f.stopped).toEqual([])
    const b = f.facade()
    expect(await b.facility.retention?.attach({ ...request, terminal })).toMatchObject({
      kind: 'done',
    })
    const leg = value(await b.facility.execute({ ...request, terminal, script: 'survives' }))
    canRecord = true
    expect(await a.stopAll()).toEqual([])
    expect(f.stopped).toEqual([])
    expect(new Set(keys).size).toBe(1)
    f.finish(terminal.id)
    expect(await leg.result).toMatchObject({ kind: 'completed' })
    expect(f.started).toHaveLength(1)
  },
)

it.each(['throw', 'unavailable'] as const)(
  'keeps a Linux reservation after a durable plan returns %s until the original key is settled',
  async answer => {
    const prerequisite = vi.spyOn(hostProbe, 'probeTerminalPrerequisites').mockResolvedValue([])
    const launch = vi.spyOn(hostScope, 'launchScope').mockImplementation(() => {
      throw new Error('unexpected process start')
    })
    const memory = createMemoryResourceLedger()
    const key = randomUUID()
    const coordinate = { unit: `omne-host-${key}.scope`, bootId: 'test-boot' }
    const resource: ManagedResource = {
      key,
      provider: 'host',
      reference: hostScope.scopeReference(coordinate),
    }
    let canRecord = false
    const durable = new Map<string, ManagedResource>()
    const stoppedKeys: string[] = []
    const permit = vi.fn(async () => 'confirmed' as const)
    const ledger: ResourceLedger = {
      ...memory.ledger,
      async plan(planned) {
        durable.set(planned.key, planned)
        if (answer === 'throw') throw new Error('durable plan reply lost')
        return 'unavailable'
      },
      permit,
      async stopped(stoppedKey, status) {
        stoppedKeys.push(stoppedKey)
        expect(status).toBe('confirmed')
        if (!canRecord) return 'unavailable'
        durable.delete(stoppedKey)
        return 'recorded'
      },
    }
    const terminals = createHostTerminals({
      provider: 'host',
      ledger,
      scope: scope('session'),
      settings: terminalSettings(),
      reservation: { resource, coordinate, terminal: { id: key, generation: 'test' } },
      prerequisites: {
        facts: () => 'satisfied',
        ready: async () => ({
          kind: 'satisfied',
          tools: { systemctl: 'unused', systemdRun: 'unused', killWhom: '--kill-whom' },
        }),
      },
      unavailable() {
        throw new Error('unexpected prerequisite rejection')
      },
    })
    try {
      expect(
        await terminals.facility.create({ ...request, cwd: '/tmp', env: {}, retain: 'session' }),
      ).toMatchObject({ kind: 'unknown' })
      expect([...durable.values()]).toEqual([resource])
      terminals.seal()
      expect(await terminals.stopAll()).toEqual([resource])
      expect(terminals.unconfirmed()).toEqual([resource])
      expect(stoppedKeys).toEqual([key])
      expect(permit).not.toHaveBeenCalled()
      expect(launch).not.toHaveBeenCalled()
      canRecord = true
      expect(await terminals.stopAll()).toEqual([])
      expect([...durable.values()]).toEqual([])
      expect(stoppedKeys).toEqual([key, key])
    } finally {
      prerequisite.mockRestore()
      launch.mockRestore()
    }
  },
)

it('closes the whole terminal independently of attachment and reports a confirmed closed state', async () => {
  const f = fixture()
  const a = f.facade()
  const terminal = await f.create(a)
  const b = f.facade()
  expect(await b.facility.close({ ...request, terminal })).toMatchObject({
    value: { status: 'confirmed' },
  })
  expect(value(await a.facility.list(request))).toMatchObject([{ terminal, state: 'closed' }])
  expect(await a.facility.retention?.attach({ ...request, terminal })).toMatchObject({
    reason: 'closed',
  })
})
