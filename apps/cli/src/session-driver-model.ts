import type { SessionPresentationStore } from './session-presentation.ts'
import { tenantIdEquals, type TenantId } from '@omne-harness-lite/identity-values'
import type { SessionDriverModelFactory } from '@omne-harness-lite/session-runtime-local'
import {
  inspectModelLogEntry,
  readModelLogEnvelope,
  settlementGenerationCurrent,
  type ModelRuntimeHostInputs,
  type ModelRuntimeOperations,
  type SettlementLogBinding,
} from '@omne-harness-lite/model-request-runtime'
import type { SessionNativeModelPool } from './session-native-model.ts'
import type { LogEntry } from '@omne-harness-lite/session-log'

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
  const selected = await hasOriginalSelection(binding)
  if (selected === 'unavailable' || !settlementGenerationCurrent(binding)) return false
  if (selected) return true
  const result = await operations.selectModel({ session, routeName: options.initialRouteName })
  return 'selected' in result && result.selected === options.initialRouteName
}

async function hasOriginalSelection(binding: SettlementLogBinding) {
  const prefix = await binding.readPrefix?.()
  if (
    !prefix ||
    'failure' in prefix ||
    prefix.source.session !== binding.session ||
    !tenantIdEquals(prefix.source.tenant, binding.tenant)
  )
    return 'unavailable'
  let selected = false
  for (const entry of prefix.entries) {
    const result = selectionEntry(entry, binding)
    if (result === 'unavailable') return result
    selected ||= result
  }
  return selected
}

function selectionEntry(entry: LogEntry, binding: SettlementLogBinding) {
  const decoded = readModelLogEnvelope(entry.payload)
  if ('failure' in decoded) return 'unavailable'
  if (decoded.kind !== 'model' || decoded.envelope.category !== 'record') return false
  const inspected = inspectModelLogEntry({
    session: binding.session,
    tenant: binding.tenant,
    entry,
    purpose: { kind: 'record' },
    messagePrefix: null,
  })
  if ('invalidValue' in inspected) return 'unavailable'
  if (inspected.ok.captured.record?.kind !== 'model_selection_changed') return false
  return entry.run === undefined && entry.attempt === undefined ? true : 'unavailable'
}
