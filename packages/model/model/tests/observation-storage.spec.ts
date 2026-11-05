import { expect, it } from 'vitest'
import { encodeModelInvocationRef } from '@omne-harness/model-contract'
import {
  createModelCommandsCore,
  createModelObservationStorage,
  modelCommands,
} from '../src/commands/index.ts'
import { MemoryState } from '../src/testing/state.ts'
import { callId, fixture, op, unbox } from './memory-fixture.ts'

// The cold read of the decorated storage and the confirmation of unknown writes: current reads the
// call under the facts qualification, refuses a reference whose admission the call does not hold,
// and an unknown write of the call refuses current until a later confirmation reads it again.

function observed() {
  const f = fixture()
  const memory = new MemoryState(f.options)
  const bridge = createModelObservationStorage({
    storage: memory,
    authority: f.options.authority,
    report: () => {},
    observation: {
      limits: {
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
      },
      timing: { nowMs: () => 0, waitUntil: () => new Promise(() => {}) },
    },
  })
  if (!bridge.observations) throw new Error('fixture observations')
  const commands = modelCommands(createModelCommandsCore(f.options, bridge.storage))
  const host = unbox(bridge.observations.openHost())
  const access = { tenant: f.tenant, principal: f.principal }
  const referenceOf = (call = f.admit.call, admission = f.admit.operation) =>
    unbox(encodeModelInvocationRef({ tenant: f.tenant, call, admission }))
  const current = (reference = referenceOf()) => host.references.current({ access, reference })
  return { f, memory, commands, current, referenceOf, close: () => bridge.observations?.close() }
}

it('answers current from a confirmed admit through the facts qualification alone', async () => {
  const t = observed()
  unbox(await t.commands.admit(t.f.admit))
  t.f.denied.add('observe')
  expect(unbox(await t.current()).state).toMatchObject({ call: t.f.admit.call, phase: 'accepted' })
  t.close()
})

it('answers a call that the storage does not hold as not found', async () => {
  const t = observed()
  expect(await t.current(t.referenceOf(callId('two')))).toEqual({
    failure: { kind: 'invalid', field: 'call', reason: 'not-found' },
  })
  t.close()
})

it('refuses a reference whose admission the stored call does not hold', async () => {
  const t = observed()
  unbox(await t.commands.admit(t.f.admit))
  expect(await t.current(t.referenceOf(t.f.admit.call, op('other')))).toEqual({
    failure: { kind: 'invalid', field: 'reference', reason: 'binding' },
  })
  t.close()
})

it('refuses current while a write of the call is unknown and recovers once the cold read confirms again', async () => {
  const t = observed()
  unbox(await t.commands.admit(t.f.admit))
  expect(await t.current()).toHaveProperty('ok')
  const control = { ...t.f.admit, operation: op('unknown-control') }
  t.memory.control.injectUnknown({ ...control, method: 'control', effect: 'not-applied' })
  expect(await t.commands.control(control)).toMatchObject({ failure: { kind: 'commit-unknown' } })
  expect(await t.current()).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'stream-references',
      diagnostic: 'confirmation-unavailable',
    },
  })
  t.memory.control.reveal({ ...control, result: 'rolled-back' })
  expect(unbox(await t.current()).state).toMatchObject({ phase: 'accepted' })
  t.close()
})
