import { succeed } from '@omne-harness/operation-result'
import type { ModelProvider, Reply } from '../index.ts'
import type { Access, ModelInstanceId } from '../root.ts'
import { createCalls } from './calls.ts'
import { createConsumption } from './consumption.ts'
import { createController, type ScriptController } from './controller.ts'
import { createCore, denied, scopeOf } from './core.ts'
import { createDirectory } from './directory.ts'

export type ScriptedModelProviderOptions<P> = Readonly<{
  /** The instance that serves every call at first. */
  instance: ModelInstanceId
  /** Tells whether two principals are the same one; `Object.is` when it is left out. */
  samePrincipal?: (left: P, right: P) => boolean
}>

export type ScriptedModelProvider<P> = Readonly<{
  provider: ModelProvider<P>
  controller: ScriptController<P>
}>

/**
 * A provider that keeps its calls in memory and lets the test script what happens to them. It
 * implements the ordinary call surface with the recognition and idempotence rules of the
 * contract, and holds no state outside the closure. It does not run a model, store anything
 * durably, or check evidence or request content.
 */
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

    async recover(input: Access<P>): Reply<Readonly<{ scheduled: string }>> {
      const scope = scopeOf(input.tenant)
      if (scope === null) return denied('recover')
      const unsettled = [...core.records.values()].filter(
        record => record.scope === scope && record.lifecycle.phase !== 'settled',
      )
      return succeed({ scheduled: String(unsettled.length) })
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
