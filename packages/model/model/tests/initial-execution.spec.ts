import { expect, it } from 'vitest'
import {
  createModelCommandsCore,
  createModelInitialExecution,
  createModelInitialRun,
  createModelObservationStorage,
  modelCommands,
} from '../src/commands/index.ts'
import { MemoryState } from '../src/testing/state.ts'
import { fixture, instance, op, unbox, callId } from './memory-fixture.ts'

function assembly(maxRecords = 8) {
  const f = fixture()
  const run = createModelInitialRun<typeof f.principal>({
    limits: { maxRecords, maxBindings: 2, maxCallsPerBinding: 2 },
    checkOriginRead: () => ({ ok: undefined }),
  })
  const memory = new MemoryState(f.options)
  const bridge = createModelObservationStorage({
    storage: memory,
    authority: f.options.authority,
    initialRun: run,
    report: () => {},
  })
  let initial: ReturnType<typeof createModelInitialExecution<typeof f.principal>>
  const core = createModelCommandsCore(
    {
      ...f.options,
      initialRun: run,
      evidence: f.options.evidence.map(e => ({
        ...e,
        continuity: input => initial.continuity(input),
      })),
    },
    bridge.storage,
  )
  initial = createModelInitialExecution({ run, core })
  return { f, run, memory, core, initial, commands: modelCommands(core) }
}

it('a confirmed new admit supplies a narrow origin and one stable private claim, even after body release', async () => {
  const { f, memory, core, initial, commands } = assembly()
  const channel = unbox(initial.openHost({ instance: instance() }))
  const access = { tenant: f.tenant, principal: f.principal, call: f.admit.call }
  expect(await channel.prepare(access)).toMatchObject({
    failure: { diagnostic: 'initial-record-missing' },
  })
  unbox(await commands.admit(f.admit))
  expect(unbox(await initial.readAcceptance(access))).toEqual({
    tenant: f.tenant,
    call: f.admit.call,
    initiator: { owner: 'identity', subject: 'trusted', revision: '1' },
    consumer: f.admit.consumer,
  })
  const prepared = unbox(await channel.prepare(access))
  expect(await commands.claim(prepared)).toEqual({
    failure: { kind: 'denied', action: 'execution-channel' },
  })
  const execution = unbox(await channel.commands.claim(prepared))
  expect(channel.qualifyExecution({ ...execution })).toHaveProperty('ok')
  const key = core.identity(access)
  if (typeof key !== 'string') throw new Error('tenant')
  const original = memory.documents(key).calls.get(access.call)
  if (!original) throw new Error('call')
  memory.publish(key, { ...original, request: null })
  expect(unbox(await channel.prepare(access))).toEqual(prepared)
  expect(await channel.commands.claim(prepared)).toEqual({ ok: execution })
  const other = unbox(initial.openHost({ instance: instance('other') }))
  expect(await other.prepare(access)).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(await other.commands.claim(prepared)).toEqual({
    failure: { kind: 'denied', action: 'execution-channel' },
  })
  channel.close()
  expect(channel.qualifyExecution(execution)).toEqual({
    failure: { kind: 'denied', action: 'execution-channel' },
  })
})

it('unknown admission is not first-run authority until the original operation really confirms', async () => {
  const { f, memory, initial, commands } = assembly()
  const channel = unbox(initial.openHost({ instance: instance() }))
  const access = { tenant: f.tenant, principal: f.principal, call: f.admit.call }
  memory.control.injectUnknown({ ...f.admit, method: 'admit', effect: 'applied' })
  expect(await commands.admit(f.admit)).toMatchObject({ failure: { kind: 'commit-unknown' } })
  expect(await channel.prepare(access)).toMatchObject({ failure: { kind: 'unavailable' } })
  memory.control.reveal({ ...f.admit, result: 'committed' })
  unbox(await commands.query({ ...access, operation: f.admit.operation }))
  expect(await channel.prepare(access)).toHaveProperty('ok')
})

it('capacity is reserved before commit and replay cannot manufacture a missing process record', async () => {
  const { f, memory, commands } = assembly(1)
  unbox(await commands.admit(f.admit))
  expect(
    await commands.admit({ ...f.admit, call: callId('two'), operation: op('two') }),
  ).toMatchObject({ failure: { diagnostic: 'record-capacity' } })
  const run = createModelInitialRun<typeof f.principal>({
    limits: { maxRecords: 2, maxBindings: 1, maxCallsPerBinding: 1 },
    checkOriginRead: () => ({ ok: undefined }),
  })
  const bridge = createModelObservationStorage({
    storage: memory,
    authority: f.options.authority,
    initialRun: run,
    report: () => {},
  })
  const core = createModelCommandsCore({ ...f.options, initialRun: run }, bridge.storage)
  const restarted = createModelInitialExecution({ run, core })
  unbox(await modelCommands(core).admit(f.admit))
  expect(await unbox(restarted.openHost({ instance: instance() })).prepare(f.admit)).toMatchObject({
    failure: { diagnostic: 'initial-record-missing' },
  })
})

it('parallel channels retain separate claim inputs and cloned gates never grant execution writes', async () => {
  const { f, core, initial, commands } = assembly()
  const a = unbox(initial.openHost({ instance: instance('a') }))
  const b = unbox(initial.openHost({ instance: instance('b') }))
  const second = { ...f.admit, call: callId('two'), operation: op('two') }
  await Promise.all([commands.admit(f.admit), commands.admit(second)])
  const [first, next] = await Promise.all([a.prepare(f.admit), b.prepare(second)])
  const [x, y] = await Promise.all([a.commands.claim(unbox(first)), b.commands.claim(unbox(next))])
  const left = unbox(x)
  const right = unbox(y)
  expect(a.qualifyExecution({ ...left })).toHaveProperty('ok')
  expect(a.qualifyExecution(right)).toMatchObject({ failure: { kind: 'denied' } })
  expect(b.qualifyExecution({ ...right })).toHaveProperty('ok')
  const forged = modelCommands(core, {
    claim: () => ({ ok: undefined }),
    execution: () => ({ ok: { owner: 'forged', subject: 'forged', revision: '1' } }),
  })
  expect(await forged.claim(unbox(first))).toMatchObject({
    failure: { action: 'execution-channel' },
  })
  expect(await forged.advanceCleanup({ ...left, operation: op('forged') })).toMatchObject({
    failure: { action: 'execution-channel' },
  })
  f.denied.add('recovery')
  expect(await a.prepare(f.admit)).toEqual({ failure: { kind: 'denied', action: 'recovery' } })
  expect(await a.commands.claim(unbox(first))).toEqual({
    failure: { kind: 'denied', action: 'recovery' },
  })
})

it('only the original run object and explicit positive limits are accepted', () => {
  const { f, run, memory } = assembly()
  expect(() =>
    createModelCommandsCore({ ...f.options, initialRun: structuredClone(run) }, memory),
  ).toThrow(TypeError)
  for (const maxRecords of [0, -1, Infinity, 1.5])
    expect(() =>
      createModelInitialRun({
        limits: { maxRecords, maxBindings: 1, maxCallsPerBinding: 1 },
        checkOriginRead: () => ({ ok: undefined }),
      }),
    ).toThrow(RangeError)
})
