import { expect, it } from 'vitest'
import {
  originRef,
  type CommandFacility,
  type FacilityGuard,
  type FacilityRequest,
  type ProviderAcquireInput,
  type RetainedProcessInformation,
  type RetainedProcessLedger,
} from '@omne-harness/execution-environment-contract'
import {
  accessA,
  accessB,
  acquireInput,
  host,
  ledger,
  placed,
  registryWith,
  requirement,
  scope,
  scriptedProvider,
} from './doubles.ts'

const processes: RetainedProcessLedger = {
  closed: new AbortController().signal,
  plan: async () => 'recorded',
  adopt: async () => 'confirmed',
  stopped: async () => 'recorded',
}

const listed: RetainedProcessInformation = {
  process: { id: 'retained-1', generation: 'g1' },
  origin: originRef('call-0'),
  handedOverAtMs: 1,
  state: 'running',
  processes: 2,
}

function command(withList: boolean, calls: FacilityRequest<unknown>[]): CommandFacility<unknown> {
  const start: CommandFacility<unknown>['start'] = async request => ({
    kind: 'rejected',
    requestId: request.requestId,
    reason: 'unsupported',
  })
  if (!withList) return { start }
  return {
    start,
    retention: {
      list: async request => {
        calls.push(request)
        return { kind: 'done', requestId: request.requestId, value: [listed] }
      },
    },
  }
}

const request = (requestId: string, access = accessA) => ({
  access,
  binding: host,
  origin: originRef('call-1'),
  requestId,
})

it('passes the retained-process ledger to the provider and fixes it on the original acquisition', async () => {
  let received: ProviderAcquireInput | undefined
  const raw = scriptedProvider()
  const provider = scriptedProvider({
    acquire: async input => {
      received = input
      return raw.acquire(input)
    },
  })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  const retention = { scope: scope('session'), ledger: { ...ledger }, processes }
  const acquired = await registry.acquire(accessA, { ...acquireInput(placement), retention })
  expect(acquired.kind).toBe('acquired')
  expect(received?.retention?.processes).toBe(processes)
  expect(received?.retention?.ledger).toBe(retention.ledger)
  const replaced = await registry.acquire(accessA, {
    ...acquireInput(placement),
    retention: { ...retention, processes: { ...processes } },
  })
  expect(replaced).toEqual({ kind: 'rejected', reason: 'acquisitionConflict' })
})

it('hands out command retention only with a retained-process ledger and a provider list', async () => {
  const cases = [
    { retention: 'processes', list: true, offered: true },
    { retention: 'terminal-only', list: true, offered: false },
    { retention: 'none', list: true, offered: false },
    { retention: 'processes', list: false, offered: false },
  ] as const
  for (const item of cases) {
    const provider = scriptedProvider({ facilities: { command: command(item.list, []) } })
    const registry = registryWith([provider])
    const placement = await placed(registry, requirement([host]))
    const retention =
      item.retention === 'none'
        ? {}
        : {
            retention: {
              scope: scope('session'),
              ledger,
              ...(item.retention === 'processes' ? { processes } : {}),
            },
          }
    const acquired = await registry.acquire(accessA, { ...acquireInput(placement), ...retention })
    if (acquired.kind !== 'acquired') throw new Error('expected acquired')
    const facility = acquired.lease.facility('command')
    expect({ case: item, offered: facility?.retention !== undefined }).toEqual({
      case: item,
      offered: item.offered,
    })
  }
})

it('lists retained processes through the gate and the current guard on every call', async () => {
  const calls: FacilityRequest<unknown>[] = []
  const decisions: Array<'authorized' | 'notAuthorized' | 'unavailable'> = [
    'authorized',
    'notAuthorized',
    'unavailable',
  ]
  const asked: Array<readonly [string, string]> = []
  const guard: FacilityGuard<string> = {
    authorize: async (facility, operation) => {
      asked.push([facility, operation])
      return decisions.shift() ?? 'authorized'
    },
  }
  const provider = scriptedProvider({ facilities: { command: command(true, calls) } })
  const registry = registryWith([provider])
  const placement = await placed(registry, requirement([host]))
  const acquired = await registry.acquire(accessA, {
    ...acquireInput(placement, 'acq-1', guard),
    retention: { scope: scope('session'), ledger, processes },
  })
  if (acquired.kind !== 'acquired') throw new Error('expected acquired')
  const retention = acquired.lease.facility('command')?.retention
  if (retention === undefined) throw new Error('expected command retention')

  expect(await retention.list(request('r1'))).toEqual({
    kind: 'done',
    requestId: 'r1',
    value: [listed],
  })
  expect(await retention.list(request('r2'))).toEqual({
    kind: 'rejected',
    requestId: 'r2',
    reason: 'notAuthorized',
  })
  expect(await retention.list(request('r3'))).toEqual({
    kind: 'rejected',
    requestId: 'r3',
    reason: 'unavailable',
  })
  expect(asked).toEqual([
    ['command', 'list'],
    ['command', 'list'],
    ['command', 'list'],
  ])
  expect(await retention.list(request('r4', accessB))).toEqual({
    kind: 'rejected',
    requestId: 'r4',
    reason: 'notAuthorized',
  })
  expect(calls.map(item => item.requestId)).toEqual(['r1'])

  await acquired.lease.release()
  expect(await retention.list(request('r5'))).toEqual({
    kind: 'rejected',
    requestId: 'r5',
    reason: 'closed',
  })
  expect(calls.map(item => item.requestId)).toEqual(['r1'])
})

it('hands out stop and output only when the provider has them, each through the gate and the guard', async () => {
  const asked: Array<readonly [string, string]> = []
  const reached: string[] = []
  let refuse = false
  const guard: FacilityGuard<string> = {
    authorize: async (facility, operation) => {
      asked.push([facility, operation])
      return refuse ? 'notAuthorized' : 'authorized'
    },
  }
  const start: CommandFacility<unknown>['start'] = async item => ({
    kind: 'rejected',
    requestId: item.requestId,
    reason: 'unsupported',
  })
  const full: CommandFacility<unknown> = {
    start,
    containment: 'sealed',
    retention: {
      list: async item => ({ kind: 'done', requestId: item.requestId, value: [] }),
      stop: async item => {
        reached.push(`stop:${item.mode}:${item.process.id}`)
        return { kind: 'done', requestId: item.requestId, value: { status: 'confirmed' } }
      },
      output: async item => {
        reached.push(`output:${item.process.id}`)
        return { kind: 'done', requestId: item.requestId, value: { kind: 'none' } }
      },
    },
  }
  const acquire = async (facility: CommandFacility<unknown>) => {
    const registry = registryWith([scriptedProvider({ facilities: { command: facility } })])
    const placement = await placed(registry, requirement([host]))
    const acquired = await registry.acquire(accessA, {
      ...acquireInput(placement, 'acq-1', guard),
      retention: { scope: scope('session'), ledger, processes },
    })
    if (acquired.kind !== 'acquired') throw new Error('expected acquired')
    const granted = acquired.lease.facility('command')
    if (granted === undefined) throw new Error('expected command')
    return granted
  }
  const granted = await acquire(full)
  expect(granted.containment).toBe('sealed')
  const retention = granted.retention
  if (retention?.stop === undefined || retention.output === undefined)
    throw new Error('expected stop and output')
  const process = listed.process
  expect(await retention.stop({ ...request('s1'), process, mode: 'graceful' })).toEqual({
    kind: 'done',
    requestId: 's1',
    value: { status: 'confirmed' },
  })
  expect(await retention.output({ ...request('o1'), process })).toEqual({
    kind: 'done',
    requestId: 'o1',
    value: { kind: 'none' },
  })
  refuse = true
  expect(await retention.stop({ ...request('s2'), process, mode: 'forced' })).toEqual({
    kind: 'rejected',
    requestId: 's2',
    reason: 'notAuthorized',
  })
  expect(await retention.output({ ...request('o2'), process })).toEqual({
    kind: 'rejected',
    requestId: 'o2',
    reason: 'notAuthorized',
  })
  refuse = false
  expect(await retention.stop({ ...request('s3', accessB), process, mode: 'forced' })).toEqual({
    kind: 'rejected',
    requestId: 's3',
    reason: 'notAuthorized',
  })
  expect(asked).toEqual([
    ['command', 'stop'],
    ['command', 'output'],
    ['command', 'stop'],
    ['command', 'output'],
  ])
  expect(reached).toEqual([`stop:graceful:${process.id}`, `output:${process.id}`])

  const listOnly = await acquire(command(true, []))
  expect(listOnly.containment).toBeUndefined()
  expect(listOnly.retention?.list).toBeTypeOf('function')
  expect(listOnly.retention?.stop).toBeUndefined()
  expect(listOnly.retention?.output).toBeUndefined()
})
