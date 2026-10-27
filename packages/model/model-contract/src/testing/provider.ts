import { succeed } from '@omne-harness/operation-result'
import type { Reply } from '../index.ts'
import type { ModelProvider } from '../provider/index.ts'
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
 * A provider that keeps calls in memory and lets tests script their outcomes. It implements
 * the contract's recognition and idempotence rules and holds all state in the closure.
 * Admission uses the public judgeAdmit function for closed request structure checks.
 * Evidence checks compare only against evidence registered by the script, when any is registered.
 * It does not verify external evidence or real supplier behavior, run a model, or store state durably.
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
