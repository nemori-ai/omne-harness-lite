import { succeed } from '@omne-harness/operation-result'
import type { ModelProvider } from '../provider/index.ts'
import type { ModelInstanceId } from '../root.ts'
import { createCalls } from './calls.ts'
import { createConsumption } from './consumption.ts'
import { createController, type ScriptController } from './controller.ts'
import { createCore } from './core.ts'
import { createDirectory } from './directory.ts'

export type ScriptedModelProviderOptions<P> = Readonly<{
  instance: ModelInstanceId
  samePrincipal?: (left: P, right: P) => boolean
}>

export type ScriptedModelProvider<P> = Readonly<{
  provider: ModelProvider<P>
  controller: ScriptController<P>
}>

export function createScriptedModelProvider<P>(
  options: ScriptedModelProviderOptions<P>,
): ScriptedModelProvider<P> {
  const core = createCore<P>({
    instance: options.instance,
    samePrincipal: options.samePrincipal ?? Object.is,
  })

  const provider: ModelProvider<P> = {
    runtime: {
      calls: createCalls(core),
      consumption: createConsumption(core),
      instances: createDirectory(core),
    },

    async quiesce() {
      core.state.quiescing = true
      const phases = [...core.records.values()].map(record => record.lifecycle.phase)
      return succeed({
        pending: String(phases.filter(phase => phase === 'accepted').length),
        running: String(phases.filter(phase => phase === 'running').length),
      })
    },
  }

  return { provider, controller: createController(core) }
}
