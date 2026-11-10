import type { ModelFailure } from '@omne-harness/model-contract'
import type { SendCoordinator, SendStart } from '../send.ts'
import {
  createModelCommandsCore,
  createModelInitialExecution,
  createModelObservationStorage,
  modelCommands,
} from '../commands/index.ts'
import type { BoundCommandAccess } from '../commands/initial.ts'
import { MemoryState } from './state.ts'
import type { MemoryModelCommandsOptions, MemorySendSource } from './types.ts'

export function createMemoryModelCommands<P>(options: MemoryModelCommandsOptions<P>) {
  const { commands, control, initial, observations } = memoryAssembly(options)
  return options.initialRun === undefined && options.observation === undefined
    ? { commands, control }
    : { commands, control, initial, observations }
}

export function memoryAssembly<P>(options: MemoryModelCommandsOptions<P>) {
  const store = new MemoryState(options)
  const bridge =
    options.initialRun === undefined && options.observation === undefined
      ? null
      : createModelObservationStorage({
          storage: store,
          authority: options.authority,
          ...(options.initialRun === undefined ? {} : { initialRun: options.initialRun }),
          ...(options.observation === undefined ? {} : { observation: options.observation }),
          report: options.reportConfirmation ?? (() => {}),
        })
  const core = bridge === null ? store.core : createModelCommandsCore(options, bridge.storage)
  const claims = new Set<string>()
  function sendCoordinator(
    sources: readonly MemorySendSource<P>[],
    bound?: BoundCommandAccess<P>,
  ): SendCoordinator<P> {
    if (bridge === null) return store.sendCoordinator(sources)
    const registered = sources.map(source => ({
      ...source,
      profile: structuredClone(source.profile),
      supplier: structuredClone(source.supplier),
    }))
    const refused = (failure: ModelFailure): SendStart => ({ kind: 'refused', failure })
    return {
      check: (input, stage) =>
        store.exclusive(() =>
          core.read(input, 'send', call => {
            const failure = core.sendBinding(input, call, stage, bound)
            return failure ? { failure } : { ok: undefined }
          }),
        ),
      withinCurrent: (input, receipt, window, start) =>
        store.exclusive(() => {
          const checked = core.read(input, 'send', call =>
            core.currentCredential(input, call, receipt, window, registered, bound),
          )
          if ('failure' in checked) return refused(checked.failure)
          const tenant = core.identity(input)
          if (typeof tenant !== 'string') return refused(tenant)
          const key = JSON.stringify([tenant, input.call, input.dispatch])
          if (claims.has(key)) return { kind: 'unknown', diagnostic: 'dispatch-already-claimed' }
          claims.add(key)
          try {
            return start(checked.ok)
          } catch {
            return { kind: 'unknown', diagnostic: 'transport-start-unknown' }
          }
        }),
    }
  }
  const initial =
    options.initialRun === undefined
      ? null
      : createModelInitialExecution({
          run: options.initialRun,
          core,
          coordinator: bound => sendCoordinator([], bound),
        })
  return {
    commands: modelCommands(core),
    control: store.control,
    store,
    core,
    initial,
    observations: bridge?.observations ?? null,
    sendCoordinator,
  }
}
