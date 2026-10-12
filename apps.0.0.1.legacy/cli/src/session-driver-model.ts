import type { SessionPresentationStore } from './session-presentation.ts'
import { tenantIdEquals, type TenantId } from '@omne-harness-lite/identity-values'
import {
  readSessionOriginalModelSelection,
  type SessionDriverModelFactory,
} from '@omne-harness-lite/session-runtime-local'
import {
  settlementGenerationCurrent,
  type ModelRuntimeHostInputs,
  type ModelRuntimeOperations,
} from '@omne-harness-lite/model-request-runtime'
import type { SessionNativeModelPool } from './session-native-model.ts'

export interface SessionDriverModelOptions {
  readonly presentation?: SessionPresentationStore
  readonly tenant: TenantId
  readonly initialRouteName: string
  readonly runtime: Pick<SessionNativeModelPool['runtime'], 'project'>
  readonly facts: SessionNativeModelPool['facts']
}

/** Only the driver initializes selection. User history reads never call this factory. */
export function createSessionDriverModelFactory(
  options: SessionDriverModelOptions,
): SessionDriverModelFactory {
  return Object.freeze<SessionDriverModelFactory>({
    async acquire(host) {
      const operations = options.runtime.project(host, options.facts)
      let initializing: Promise<boolean> | undefined
      let originalSession: string | undefined
      let released = false
      return Object.freeze({
        operations: Object.freeze<ModelRuntimeOperations>({
          ...operations,
          async openCall(input) {
            const result = await operations.openCall(input)
            if ('ref' in result && input.run !== undefined)
              options.presentation?.bindModel(
                { tenant: options.tenant, session: input.session },
                input.run,
                result.callId,
              )
            return result
          },
          async effectiveModel(input) {
            if (released || (originalSession !== undefined && input.session !== originalSession))
              return { unavailable: true }
            originalSession = input.session
            initializing ??= initializeSelection(options, host, operations, input.session)
            if (!(await initializing) || released) return { unavailable: true }
            return operations.effectiveModel(input)
          },
        }),
        async release() {
          released = true
          await initializing
        },
      })
    },
  })
}

async function initializeSelection(
  options: SessionDriverModelOptions,
  host: ModelRuntimeHostInputs,
  operations: ModelRuntimeOperations,
  session: Parameters<ModelRuntimeOperations['effectiveModel']>[0]['session'],
): Promise<boolean> {
  const bound = await host.sessions.bind(session)
  if ('failure' in bound) return false
  const binding = bound.binding.log
  if (
    binding.session !== session ||
    !tenantIdEquals(binding.tenant, options.tenant) ||
    !settlementGenerationCurrent(binding)
  )
    return false
  const selected = await readSessionOriginalModelSelection(binding)
  if ('unavailable' in selected || !settlementGenerationCurrent(binding)) return false
  if (selected.selected !== null) return true
  const result = await operations.selectModel({ session, routeName: options.initialRouteName })
  return 'selected' in result && result.selected === options.initialRouteName
}
