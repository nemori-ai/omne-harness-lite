import { afterEach, expect, it, vi } from 'vitest'
import {
  createModelCommandsCore,
  createModelInitialExecution,
  createModelInitialRun,
  createModelObservationStorage,
  modelCommands,
  type ModelCommandStorage,
} from '../src/commands/index.ts'
import { initialRunPort } from '../src/commands/initial.ts'
import { MemoryState } from '../src/testing/state.ts'
import { fixture, instance, unbox } from './memory-fixture.ts'

afterEach(() => vi.restoreAllMocks())

it('initial confirmation and a throwing diagnostic cannot replace the committed outcome', async () => {
  const f = fixture()
  const run = createModelInitialRun<typeof f.principal>({
    limits: { maxRecords: 1, maxBindings: 1, maxCallsPerBinding: 1 },
    checkOriginRead: () => ({ ok: undefined }),
  })
  const original = new Error('private detail must not escape')
  vi.spyOn(initialRunPort(run), 'finishConfirmation').mockImplementation(() => {
    throw original
  })
  const diagnostics: unknown[] = []
  const memory = new MemoryState(f.options)
  const bridge = createModelObservationStorage({
    storage: memory,
    authority: f.options.authority,
    initialRun: run,
    report: event => {
      diagnostics.push(event)
      throw original
    },
  })
  const core = createModelCommandsCore({ ...f.options, initialRun: run }, bridge.storage)
  const initial = createModelInitialExecution({ core, run })
  const channel = unbox(initial.openHost({ instance: instance() }))
  expect(await modelCommands(core).admit(f.admit)).toHaveProperty('ok')
  expect(diagnostics).toEqual([{ kind: 'initial-confirmation-failed' }])
  expect(await channel.prepare(f.admit)).toMatchObject({
    failure: { diagnostic: 'confirmation-unavailable' },
  })
})

it('a storage throw after synchronous work clears confirmation and rethrows the same object', async () => {
  const f = fixture()
  const memory = new MemoryState(f.options)
  const original = new Error('original storage exception')
  let throwNext = true
  const storage: ModelCommandStorage = {
    run: async (work, scope) => {
      if (!throwNext) return memory.run(work, scope)
      throwNext = false
      work()
      throw original
    },
    documents: tenant => memory.documents(tenant),
    reserved: field => memory.reserved(field),
    commit: (tenant, write) => memory.commit(tenant, write),
    publish: (tenant, call) => memory.publish(tenant, call),
  }
  const run = createModelInitialRun<typeof f.principal>({
    limits: { maxRecords: 1, maxBindings: 1, maxCallsPerBinding: 1 },
    checkOriginRead: () => ({ ok: undefined }),
  })
  const bridge = createModelObservationStorage({
    storage,
    authority: f.options.authority,
    initialRun: run,
    report: () => {},
  })
  const core = createModelCommandsCore({ ...f.options, initialRun: run }, bridge.storage)
  await expect(modelCommands(core).admit(f.admit)).rejects.toBe(original)
  const initial = createModelInitialExecution({ core, run })
  const channel = unbox(initial.openHost({ instance: instance() }))
  expect(await channel.prepare(f.admit)).toMatchObject({
    failure: { diagnostic: 'confirmation-unavailable' },
  })
})
