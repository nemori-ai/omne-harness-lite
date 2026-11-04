import { afterEach, expect, it } from 'vitest'
import {
  createModelInitialRun,
  type ModelObservationLimits,
  type ModelObservationTiming,
} from '@omne-harness/model/commands'
import {
  createSqlModelCommands,
  COMMAND_RESERVE_BYTES,
  type SqlModelCommands,
  type SqlModelCommandsOptions,
} from '../src/index.ts'
import {
  coreOptions,
  DIGEST,
  lookup,
  MAX_CALL_BYTES,
  sqliteStorage,
  tenantOf,
  textOf,
  callId,
  instanceId,
  opId,
  unbox,
  type Principal,
} from './fixture.ts'

// Which parts of the durable assembly exist is a function of the options alone: `observation` and
// `initialRun` bring the confirming observation layer, `send` brings the coordinator,.

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

function assemble(extra: Partial<SqlModelCommandsOptions<Principal>> = {}) {
  const tenant = tenantOf('a')
  const core = coreOptions([tenant])
  const result = createSqlModelCommands<Principal>({
    ...core.options,
    storage: sqliteStorage().storage,
    domains: lookup([textOf(tenant)], 'options'),
    combination: { combinationVersion: 'v1', manifestDigest: DIGEST },
    maxCallBytes: MAX_CALL_BYTES,
    maxCommandBytes: MAX_CALL_BYTES + COMMAND_RESERVE_BYTES,
    ...extra,
  })
  if (result.observations) cleanups.push(() => result.observations?.close())
  return { result, core, tenant }
}

function initialRun() {
  return createModelInitialRun<Principal>({
    limits: { maxRecords: 8, maxBindings: 2, maxCallsPerBinding: 4 },
    checkOriginRead: () => ({ ok: undefined }),
  })
}

it('builds only the commands when the options ask for nothing more', () => {
  const { result } = assemble()
  expect(result.coordinator).toBeNull()
  expect(result.initial).toBeNull()
  expect(result.observations).toBeNull()
})

it('builds the observation source for the observation option alone', () => {
  const { result } = assemble({ observation: { limits, timing } })
  expect(result.observations).not.toBeNull()
  expect(result.initial).toBeNull()
})

it('builds the initial execution without an observation source for the initial run alone', async () => {
  const tenant = tenantOf('a')
  const core = coreOptions([tenant])
  let result: SqlModelCommands<Principal>
  result = createSqlModelCommands<Principal>({
    ...core.options,
    evidence: core.options.evidence.map(e => ({
      ...e,
      continuity: input => {
        const initial = result.initial
        if (!initial) throw new Error('initial')
        return initial.continuity(input)
      },
    })),
    initialRun: initialRun(),
    storage: sqliteStorage().storage,
    domains: lookup([textOf(tenant)], 'options'),
    combination: { combinationVersion: 'v1', manifestDigest: DIGEST },
    maxCallBytes: MAX_CALL_BYTES,
    maxCommandBytes: MAX_CALL_BYTES + COMMAND_RESERVE_BYTES,
  })
  const { initial, observations } = result
  if (!initial) throw new Error('assembly')
  expect(observations).toBeNull()
  const channel = unbox(initial.openHost({ instance: instanceId() }))
  cleanups.push(() => channel.close())
  const admit = core.admitOf(tenant, callId('first'), opId('admit'))
  unbox(await result.commands.admit(admit))
  expect(await channel.prepare(admit)).toHaveProperty('ok')
})
