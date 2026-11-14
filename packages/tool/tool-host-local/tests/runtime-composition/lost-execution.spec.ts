import { expect, it } from 'vitest'
import {
  createRecoveryAccess,
  type ManagedResource,
} from '@omne-harness/execution-environment-contract'
import {
  resolveToolInvocationRef,
  type DurableEvidence,
  type ToolInvocationRef,
} from '@omne-harness/tool-contract'
import { createEnvironmentResourceLedger } from '../../src/environment-resource-ledger.ts'
import { createEnvironmentStateStore } from '../../src/environment-state.ts'
import { accepted, fixture, unbox } from './fixture.ts'

type World = Awaited<ReturnType<typeof fixture>>
type Executor = Awaited<ReturnType<World['newExecutor']>>
type Overrides = NonNullable<Parameters<World['newExecutor']>[0]>

const proof = (instance: string): DurableEvidence => ({
  owner: 'lost-execution-spec',
  record: 'state-lock',
  revision: '1',
  digest: `instance:${instance}`,
})

const LOST_TERMINAL = { kind: 'failed', cause: 'runtime-lost' } as const
const LOST_EFFECT = { kind: 'unknown' } as const

function held() {
  const release = Promise.withResolvers<string>()
  return {
    author: (value: string) =>
      value.includes('hold') ? release.promise : Promise.resolve(`answer:${value}`),
    release: () => release.resolve('released'),
  }
}

const diagnostics = (executor: Pick<Executor, 'plugins'>) => {
  const read = executor.plugins.diagnostics().executor
  if (read === null) throw new Error('no executor')
  return read
}

const access = (world: World, reference: ToolInvocationRef) => ({
  tenant: world.tenantA,
  principal: 'alice',
  call: unbox(resolveToolInvocationRef(reference, world.tenantA)).call,
})

const recovery = async (world: World, reference: ToolInvocationRef) =>
  unbox(await world.root.toolCommands.loadRecovery(access(world, reference)))

async function running(world: World, value: string) {
  const reference = accepted(await world.api.invoke(world.invocation(value)))
  await expect.poll(() => world.launches()).toBe(1)
  await expect
    .poll(async () => (await recovery(world, reference)).state.phase, { timeout: 3_000 })
    .toBe('running')
  const state = (await recovery(world, reference)).state
  if (state.phase !== 'running') throw new Error('not running')
  return { reference, owner: state.instance }
}

async function plant(world: World, reference: ToolInvocationRef, key: string) {
  const preparation = (await recovery(world, reference)).preparations.at(-1)
  if (preparation === undefined) throw new Error('no preparation')
  const state = createEnvironmentStateStore({ store: world.store, mode: 'test' })
  const address = { ...access(world, reference), operation: preparation.operation }
  const ledger = await createEnvironmentResourceLedger({
    state,
    address,
    authorize: async () => 'authorized',
  })
  const resource: ManagedResource = {
    key,
    provider: 'frozen-execution',
    reference: { kind: 'null' },
  }
  expect(await ledger.plan(resource)).toBe('recorded')
  const original = unbox(await state.read(address))?.original
  if (original === undefined) throw new Error('no original acquisition')
  const stops = async () => {
    const read = unbox(await state.read(address))
    return read === null ? null : [...read.resources, ...read.reservations].map(item => item.stop)
  }
  return { resource, scope: original.scope, stops }
}

type Commit = World['store']['commit']

function patchCommit(world: World, refuse: (write: string) => boolean) {
  const store = world.store as { commit: Commit }
  const commit = store.commit
  let refused = 0
  store.commit = write => {
    const text = JSON.stringify(write, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    )
    if (!refuse(text)) return commit(write)
    refused += 1
    return Promise.resolve({ kind: 'unavailable', diagnostic: 'the store refuses this write' })
  }
  return {
    refused: () => refused,
    restore: () => {
      store.commit = commit
    },
  }
}

async function takeover(world: World, overrides: Overrides, receive = true) {
  const next = await world.newExecutor({ lostContact: proof, ...overrides })
  if (receive) await next.receive()
  return next
}

async function expectLost(world: World, reference: ToolInvocationRef, owner: string) {
  await expect
    .poll(async () => (await recovery(world, reference)).state.phase, { timeout: 3_000 })
    .toBe('settled')
  const state = (await recovery(world, reference)).state
  expect(state).toMatchObject({
    phase: 'settled',
    terminal: LOST_TERMINAL,
    effect: LOST_EFFECT,
    execution: { kind: 'lost', evidence: proof(owner) },
  })
}

it('a call another instance started is settled as lost by the executor that holds the proof: failed, runtime-lost, effect unknown, delivered once, never run again', async () => {
  const author = held()
  const world = await fixture(author.author)
  let next: Executor | null = null
  try {
    const { reference, owner } = await running(world, 'hold-function')
    await world.plugins.close()
    next = await takeover(world, {})
    const taken = next
    await expectLost(world, reference, owner)
    await expect.poll(() => taken.received.length, { timeout: 3_000 }).toBe(1)
    expect(taken.received[0]).toMatchObject({
      kind: 'result',
      terminal: LOST_TERMINAL,
      effect: LOST_EFFECT,
      actualTerminal: null,
    })
    await expect.poll(() => diagnostics(taken).knownCalls, { timeout: 3_000 }).toBe(0)
    expect(diagnostics(taken)).toMatchObject({ completed: 1, foreignExecutionRuns: 0 })
    await expect
      .poll(async () => (await recovery(world, reference)).state.queue.kind, { timeout: 3_000 })
      .toBe('released')
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(taken.received).toHaveLength(1)
    expect(world.launches()).toBe(1)
    expect(unbox(await taken.api.queries.contact(world.query(reference)))).toEqual({
      kind: 'settled',
    })
  } finally {
    author.release()
    await next?.close()
    await world.close()
  }
})

it('a call with a start record whose start was never recorded is treated as started: it is settled as lost and not started again', async () => {
  const world = await fixture()
  let next: Executor | null = null
  const permits = world.input.permitRequirements as { check: unknown }
  const check = permits.check
  try {
    permits.check = () => new Promise(() => {})
    const reference = accepted(await world.api.invoke(world.invocation('never-recorded')))
    await expect
      .poll(async () => (await recovery(world, reference)).state.execution.kind, {
        timeout: 3_000,
      })
      .toBe('starting')
    const owner = (await recovery(world, reference)).start?.execution.instance
    if (owner === undefined) throw new Error('no start record')
    await world.plugins.close()
    permits.check = check
    next = await takeover(world, {})
    const taken = next
    await expectLost(world, reference, owner)
    await expect.poll(() => taken.received.length, { timeout: 3_000 }).toBe(1)
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(world.launches()).toBe(0)
    expect(taken.received).toHaveLength(1)
  } finally {
    permits.check = check
    await next?.close()
    await world.close()
  }
})

it('the managed resources of the lost execution are stopped by their identity and confirmed before the execution is recorded lost; while they are unconfirmed the call stays held', async () => {
  const author = held()
  const world = await fixture(author.author)
  let next: Executor | null = null
  try {
    const { reference, owner } = await running(world, 'hold-command')
    const { resource, scope, stops } = await plant(world, reference, 'unit-1')
    await world.plugins.close()
    const recoveryAccess = createRecoveryAccess()
    const asked: { args: unknown[]; phase: string }[] = []
    let confirmed = false
    world.resourceRecovery.answer = async (...args) => {
      asked.push({ args, phase: (await recovery(world, reference)).state.phase })
      return {
        kind: 'recovered',
        scope: args[0],
        stopped: confirmed ? [...args[2]] : [],
        pending: confirmed ? [] : [...args[2]],
        unsupported: [],
      }
    }
    next = await takeover(world, { recoveryAccess })
    const taken = next
    await expect.poll(() => asked.length, { timeout: 3_000 }).toBeGreaterThanOrEqual(2)
    expect(asked[0]?.args).toEqual([scope, recoveryAccess, [resource]])
    expect((await recovery(world, reference)).state).toMatchObject({
      phase: 'running',
      execution: { kind: 'live' },
    })
    expect(diagnostics(taken)).toMatchObject({ knownCalls: 1, foreignExecutionRuns: 0 })
    expect(unbox(await taken.api.queries.contact(world.query(reference)))).toEqual({
      kind: 'holding',
    })
    expect(taken.received).toHaveLength(0)
    expect(await stops()).toEqual(['active'])
    confirmed = true
    await expectLost(world, reference, owner)
    expect(asked.every(ask => ask.phase === 'running')).toBe(true)
    expect(await stops()).toEqual(['confirmed'])
    await expect.poll(() => taken.received.length, { timeout: 3_000 }).toBe(1)
    expect(world.launches()).toBe(1)
  } finally {
    author.release()
    await next?.close()
    await world.close()
  }
})

it('a resource ledger that cannot take the confirmed stop does not hold the record back', async () => {
  const author = held()
  const world = await fixture(author.author)
  let next: Executor | null = null
  try {
    const { reference, owner } = await running(world, 'hold-ledger-of-resources-down')
    const { stops } = await plant(world, reference, 'unit-1')
    await world.plugins.close()
    const writes = patchCommit(world, write => write.includes('"key":"environment@'))
    world.resourceRecovery.answer = async (scope, _access, resources) => ({
      kind: 'recovered',
      scope,
      stopped: [...resources],
      pending: [],
      unsupported: [],
    })
    next = await takeover(world, { recoveryAccess: createRecoveryAccess() })
    const taken = next
    await expectLost(world, reference, owner)
    expect(writes.refused()).toBeGreaterThanOrEqual(1)
    expect(await stops()).toEqual(['active'])
    await expect.poll(() => taken.received.length, { timeout: 3_000 }).toBe(1)
  } finally {
    author.release()
    await next?.close()
    await world.close()
  }
})

it('a call whose final was saved before its instance was lost is settled by that final: completed, not lost, delivered once, never run again', async () => {
  const world = await fixture()
  let next: Executor | null = null
  try {
    const writes = patchCommit(world, write => write.includes('preserve-result'))
    const reference = accepted(await world.api.invoke(world.invocation('saved-final')))
    await expect
      .poll(async () => (await recovery(world, reference)).tasks.map(task => task.kind), {
        timeout: 3_000,
      })
      .toContain('settle')
    await expect.poll(() => writes.refused(), { timeout: 3_000 }).toBeGreaterThanOrEqual(1)
    expect((await recovery(world, reference)).state).toMatchObject({
      phase: 'running',
      execution: { kind: 'live' },
    })
    await world.plugins.close()
    writes.restore()
    next = await takeover(world, {})
    const taken = next
    await expect
      .poll(async () => (await recovery(world, reference)).state.phase, { timeout: 3_000 })
      .toBe('settled')
    expect((await recovery(world, reference)).state).toMatchObject({
      phase: 'settled',
      terminal: { kind: 'completed' },
      execution: { kind: 'ended' },
    })
    await expect.poll(() => taken.received.length, { timeout: 3_000 }).toBe(1)
    expect(taken.received[0]).toMatchObject({ kind: 'result', terminal: { kind: 'completed' } })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(taken.received).toHaveLength(1)
    expect(world.launches()).toBe(1)
  } finally {
    await next?.close()
    await world.close()
  }
})

it.each([
  ['no recovery access', {}],
  ['resources the provider does not support', { recoveryAccess: createRecoveryAccess() }],
] as const)(
  'with %s the resources stay unconfirmed: nothing is recorded, and the call stays held',
  async (_name, overrides) => {
    const author = held()
    const world = await fixture(author.author)
    let next: Executor | null = null
    try {
      const { reference } = await running(world, 'hold-unconfirmed')
      await plant(world, reference, 'unit-1')
      await world.plugins.close()
      world.resourceRecovery.answer = async (scope, _access, resources) => ({
        kind: 'recovered',
        scope,
        stopped: [],
        pending: [],
        unsupported: [...resources],
      })
      next = await takeover(world, overrides)
      const taken = next
      await expect.poll(() => diagnostics(taken).knownCalls, { timeout: 3_000 }).toBe(1)
      await new Promise(resolve => setTimeout(resolve, 100))
      expect((await recovery(world, reference)).state.phase).toBe('running')
      expect(diagnostics(taken)).toMatchObject({ knownCalls: 1, foreignExecutionRuns: 0 })
      expect(taken.received).toHaveLength(0)
    } finally {
      author.release()
      await next?.close()
      await world.close()
    }
  },
)

it('a ledger that cannot take the record leaves the call held and unsettled, and the record is written once the ledger answers', async () => {
  const author = held()
  const world = await fixture(author.author)
  let next: Executor | null = null
  try {
    const { reference, owner } = await running(world, 'hold-ledger-down')
    await world.plugins.close()
    let down = true
    let refused = 0
    next = await takeover(world, {
      store: {
        ...world.store,
        commit: write => {
          if (!down) return world.store.commit(write)
          refused += 1
          return Promise.resolve({ kind: 'unavailable', diagnostic: 'the store is down' })
        },
      },
    })
    const taken = next
    await expect.poll(() => refused, { timeout: 3_000 }).toBeGreaterThanOrEqual(2)
    expect((await recovery(world, reference)).state).toMatchObject({
      phase: 'running',
      execution: { kind: 'live' },
    })
    expect(diagnostics(taken)).toMatchObject({ knownCalls: 1, foreignExecutionRuns: 0 })
    expect(taken.received).toHaveLength(0)
    down = false
    await expectLost(world, reference, owner)
    await expect.poll(() => taken.received.length, { timeout: 3_000 }).toBe(1)
  } finally {
    author.release()
    await next?.close()
    await world.close()
  }
})

it('the settlement is re-entrant: interrupted after the resources were stopped, and again after the record was written, it yields one result', async () => {
  const author = held()
  const world = await fixture(author.author)
  const executors: Executor[] = []
  try {
    const { reference, owner } = await running(world, 'hold-reentrant')
    await plant(world, reference, 'unit-1')
    await world.plugins.close()
    const recoveryAccess = createRecoveryAccess()
    let stops = 0
    world.resourceRecovery.answer = async (scope, _access, resources) => {
      stops += 1
      return { kind: 'recovered', scope, stopped: [...resources], pending: [], unsupported: [] }
    }
    const afterStop = await takeover(
      world,
      {
        recoveryAccess,
        store: {
          ...world.store,
          commit: () => Promise.resolve({ kind: 'unavailable', diagnostic: 'interrupted' }),
        },
      },
      false,
    )
    executors.push(afterStop)
    await expect.poll(() => stops, { timeout: 3_000 }).toBeGreaterThanOrEqual(1)
    await afterStop.close()
    expect((await recovery(world, reference)).state.phase).toBe('running')
    const afterRecord = await takeover(world, { recoveryAccess }, false)
    executors.push(afterRecord)
    await expectLost(world, reference, owner)
    await afterRecord.close()
    const settledAt = (await recovery(world, reference)).state
    const last = await takeover(world, { recoveryAccess, lostContact: () => proof('another') })
    executors.push(last)
    await expect.poll(() => last.received.length, { timeout: 3_000 }).toBe(1)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(last.received).toHaveLength(1)
    const end = (await recovery(world, reference)).state
    expect(end).toMatchObject({
      phase: 'settled',
      result: settledAt.phase === 'settled' ? settledAt.result : null,
      terminal: LOST_TERMINAL,
      execution: { kind: 'lost', evidence: proof(owner) },
    })
    expect(world.launches()).toBe(1)
  } finally {
    author.release()
    for (const executor of executors) await executor.close()
    await world.close()
  }
})
