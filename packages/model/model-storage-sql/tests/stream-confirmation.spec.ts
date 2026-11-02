import { afterEach, expect, it } from 'vitest'
import {
  createModelInitialRun,
  type ModelObservationLimits,
  type ModelObservationTiming,
} from '@omne-harness/model/commands'
import { createMemoryModelCommands } from '@omne-harness/model/testing'
import { decodeDispatchId, encodeModelInvocationRef } from '@omne-harness/model-contract'
import type { SqlStorage } from '@omne-harness/sql-contract'
import {
  createSqlModelCommands,
  COMMAND_RESERVE_BYTES,
  type SqlModelCommands,
} from '../src/index.ts'
import {
  callId,
  coreOptions,
  DIGEST,
  instanceId,
  lookup,
  MAX_CALL_BYTES,
  opId,
  sqliteStorage,
  tenantOf,
  textOf,
  unbox,
  type Principal,
} from './fixture.ts'

const limits: ModelObservationLimits = {
  maxSnapshotBytes: 100000,
  maxDeltaBytes: 100000,
  maxQueuedFrames: 16,
  maxQueuedBytes: 500000,
  maxObserversPerTenant: 4,
  maxObservers: 4,
  maxPendingSourceOperations: 4,
  maxRetainedCalls: 8,
  maxRetainedBytes: 1000000,
  maxTotalBytes: 5000000,
  maxQueueResidenceMs: 10000,
  checkIntervalMs: 1000,
}
const timing: ModelObservationTiming = {
  nowMs: () => 0,
  waitUntil: (_deadline, signal) =>
    new Promise(resolve => {
      if (signal.aborted) resolve('cancelled')
      else signal.addEventListener('abort', () => resolve('cancelled'), { once: true })
    }),
}
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const close of cleanups.splice(0)) close()
})

function scene(
  observationLimits = limits,
  wrap: (storage: SqlStorage) => SqlStorage = storage => storage,
) {
  const tenant = tenantOf('a')
  const core = coreOptions([tenant])
  const sqlite = sqliteStorage()
  const run = createModelInitialRun<Principal>({
    limits: { maxRecords: 8, maxBindings: 2, maxCallsPerBinding: 4 },
    checkOriginRead: () => ({ ok: undefined }),
  })
  let result: SqlModelCommands<Principal>
  result = createSqlModelCommands({
    ...core.options,
    evidence: core.options.evidence.map(e => ({
      ...e,
      continuity: input => {
        const initial = result.initial
        if (!initial) throw new Error('initial')
        return initial.continuity(input)
      },
    })),
    initialRun: run,
    observation: { limits: observationLimits, timing },
    storage: wrap(sqlite.storage),
    domains: lookup([textOf(tenant)], 'confirmation'),
    combination: { combinationVersion: 'v1', manifestDigest: DIGEST },
    maxCallBytes: MAX_CALL_BYTES,
    maxCommandBytes: MAX_CALL_BYTES + COMMAND_RESERVE_BYTES,
  })
  const { initial, observations } = result
  if (!initial || !observations) throw new Error('assembly')
  cleanups.push(() => observations.close())
  const host = unbox(observations.openHost())
  const channel = unbox(initial.openHost({ instance: instanceId() }))
  cleanups.push(() => channel.close())
  const admit = core.admitOf(tenant, callId('first'), opId('admit'))
  const reference = unbox(
    encodeModelInvocationRef({ tenant, call: admit.call, admission: admit.operation }),
  )
  const access = { tenant, principal: admit.principal }
  return {
    ...result,
    initial,
    observations,
    core,
    tenant,
    sqlite,
    host,
    channel,
    admit,
    reference,
    access,
  }
}

it('the SQL commit barrier hides acceptance until initial registration is ready', async () => {
  const entered = Promise.withResolvers<void>()
  const released = Promise.withResolvers<void>()
  const s = scene(limits, storage => ({
    ...storage,
    commit: async input => {
      entered.resolve()
      await released.promise
      return storage.commit(input)
    },
  }))
  const pending = s.commands.admit(s.admit)
  await entered.promise
  expect(
    await s.host.references.current({ access: s.access, reference: s.reference }),
  ).not.toHaveProperty('ok')
  released.resolve()
  unbox(await pending)
  expect(
    unbox(await s.host.references.current({ access: s.access, reference: s.reference })).state
      .phase,
  ).toBe('accepted')
  expect(await s.channel.prepare(s.admit)).toHaveProperty('ok')
})

it('a real SQL CAS retry publishes only the final state, never the first staged pass', async () => {
  const s = scene()
  unbox(await s.commands.admit(s.admit))
  const prepared = unbox(await s.channel.prepare(s.admit))
  const execution = unbox(await s.channel.commands.claim(prepared))
  const recovery = unbox(await s.commands.loadRecovery(s.admit))
  const dispatch = unbox(decodeDispatchId('mdisp_first'))
  const revision = unbox(
    await s.channel.commands.prepareDispatch({
      ...execution,
      operation: opId('dispatch'),
      expected: recovery.state.revision,
      dispatch,
      supplier: s.admit.request.suppliers[0],
      policyDecision: null,
    }),
  )
  s.host.attach({ execution, registration: 'same-host' })
  const current = unbox(
    await s.host.references.current({ access: s.access, reference: s.reference }),
  ).current
  if (!current) throw new Error('stream')
  const iterator = s.host.observation
    .observe({ access: s.access, ref: current.ref, signal: new AbortController().signal })
    [Symbol.asyncIterator]()
  expect(await iterator.next()).toMatchObject({ value: { kind: 'snapshot' } })
  s.sqlite.hooks.beforeCommit = () => {
    s.sqlite.seed(
      'confirmation',
      "UPDATE md_call SET row_version = row_version + 1, state = json_set(state, '$.revision', '8') WHERE tenant = ? AND call = ?",
      [textOf(s.tenant), s.admit.call],
    )
  }
  const commits = s.sqlite.commits()
  unbox(await s.commands.control({ ...s.admit, operation: opId('control') }))
  expect(s.sqlite.commits() - commits).toBe(2)
  expect(await iterator.next()).toMatchObject({
    value: {
      kind: 'delta',
      value: {
        from: { revision },
        state: { revision: '9', control: { kind: 'requested' } },
        blocks: [],
      },
    },
  })
  await iterator.return?.()
})

it('observation capacity cannot prevent a real SQL admission from becoming locally runnable', async () => {
  const s = scene({ ...limits, maxRetainedBytes: 1, maxTotalBytes: 1 })
  unbox(await s.commands.admit(s.admit))
  expect(await s.channel.prepare(s.admit)).toHaveProperty('ok')
  expect(
    await s.host.references.current({ access: s.access, reference: s.reference }),
  ).toMatchObject({ failure: { kind: 'unavailable' } })
})

it('an undecided SQL admit cannot publish staged accepted facts or mint a claim', async () => {
  const s = scene()
  s.sqlite.hooks.holdNext = true
  expect(await s.commands.admit(s.admit)).toMatchObject({ failure: { kind: 'commit-unknown' } })
  expect(await s.channel.prepare(s.admit)).toMatchObject({ failure: { kind: 'commit-unknown' } })
  expect(
    await s.host.references.current({ access: s.access, reference: s.reference }),
  ).toMatchObject({ failure: { kind: 'unavailable' } })
})

it('a real SQL unknown write ends the stream before any staged state can escape', async () => {
  const s = scene()
  unbox(await s.commands.admit(s.admit))
  const prepared = unbox(await s.channel.prepare(s.admit))
  const execution = unbox(await s.channel.commands.claim(prepared))
  const recovery = unbox(await s.commands.loadRecovery(s.admit))
  unbox(
    await s.channel.commands.prepareDispatch({
      ...execution,
      operation: opId('unknown-dispatch'),
      expected: recovery.state.revision,
      dispatch: unbox(decodeDispatchId('mdisp_unknown')),
      supplier: s.admit.request.suppliers[0],
      policyDecision: null,
    }),
  )
  s.host.attach({ execution, registration: 'unknown-host' })
  const current = unbox(
    await s.host.references.current({ access: s.access, reference: s.reference }),
  ).current
  if (!current) throw new Error('stream')
  const iterator = s.host.observation
    .observe({ access: s.access, ref: current.ref, signal: new AbortController().signal })
    [Symbol.asyncIterator]()
  expect(await iterator.next()).toMatchObject({ value: { kind: 'snapshot' } })
  s.sqlite.hooks.holdNext = true
  expect(
    await s.commands.control({ ...s.admit, operation: opId('unknown-control') }),
  ).toMatchObject({ failure: { kind: 'commit-unknown' } })
  expect(await iterator.next()).toMatchObject({ value: { kind: 'ended', reason: 'unavailable' } })
  expect(await iterator.next()).toEqual({ done: true, value: undefined })
})

it('memory and SQL expose the same confirmed origin, state and private channel boundaries', async () => {
  const sql = scene()
  const options = sql.core.options
  let memory: ReturnType<typeof createMemoryModelCommands<Principal>>
  memory = createMemoryModelCommands({
    ...options,
    evidence: options.evidence.map(e => ({
      ...e,
      continuity: input => {
        if (!memory.initial) throw new Error('initial')
        return memory.initial.continuity(input)
      },
    })),
    initialRun: createModelInitialRun<Principal>({
      limits: { maxRecords: 8, maxBindings: 2, maxCallsPerBinding: 4 },
      checkOriginRead: () => ({ ok: undefined }),
    }),
    observation: { limits, timing },
  })
  const initial = memory.initial
  const observations = memory.observations
  if (!initial || !observations) throw new Error('memory assembly')
  cleanups.push(() => observations.close())
  const channel = unbox(initial.openHost({ instance: instanceId() }))
  cleanups.push(() => channel.close())
  const host = unbox(observations.openHost())
  const admission = await sql.commands.admit(sql.admit)
  expect(await memory.commands.admit(sql.admit)).toEqual(admission)
  expect(await initial.readAcceptance(sql.admit)).toEqual(
    await sql.initial.readAcceptance(sql.admit),
  )
  expect(await host.references.current({ access: sql.access, reference: sql.reference })).toEqual(
    await sql.host.references.current({ access: sql.access, reference: sql.reference }),
  )
  const left = unbox(await channel.prepare(sql.admit))
  const right = unbox(await sql.channel.prepare(sql.admit))
  expect(await memory.commands.claim(left)).toEqual(await sql.commands.claim(right))
  expect(await channel.commands.claim(left)).toEqual(await sql.channel.commands.claim(right))
  const control = { ...sql.admit, operation: opId('parity-control') }
  expect(await memory.commands.control(control)).toEqual(await sql.commands.control(control))
  expect(await host.references.current({ access: sql.access, reference: sql.reference })).toEqual(
    await sql.host.references.current({ access: sql.access, reference: sql.reference }),
  )
  channel.close()
  sql.channel.close()
  expect(await channel.commands.claim(left)).toEqual(await sql.channel.commands.claim(right))
})

it('keeps separate private gates while two real SQL claims cross an await', async () => {
  const entered = Promise.withResolvers<void>()
  const released = Promise.withResolvers<void>()
  let pause = false
  let paused = false
  const s = scene(limits, storage => ({
    ...storage,
    commit: async request => {
      if (pause && !paused) {
        paused = true
        entered.resolve()
        await released.promise
      }
      return storage.commit(request)
    },
  }))
  const second = { ...s.admit, call: callId('second'), operation: opId('admit-second') }
  unbox(await s.commands.admit(s.admit))
  unbox(await s.commands.admit(second))
  const other = unbox(s.initial.openHost({ instance: instanceId('other') }))
  cleanups.push(() => other.close())
  const firstInput = unbox(await s.channel.prepare(s.admit))
  const secondInput = unbox(await other.prepare(second))
  pause = true
  const first = s.channel.commands.claim(firstInput)
  await entered.promise
  const right = unbox(await other.commands.claim(secondInput))
  released.resolve()
  const left = unbox(await first)
  expect(s.channel.qualifyExecution({ ...left })).toHaveProperty('ok')
  expect(other.qualifyExecution({ ...right })).toHaveProperty('ok')
  expect(s.channel.qualifyExecution(right)).toMatchObject({ failure: { kind: 'denied' } })
  expect(other.qualifyExecution(left)).toMatchObject({ failure: { kind: 'denied' } })
  expect(await s.channel.commands.claim(secondInput)).toMatchObject({ failure: { kind: 'denied' } })
})
