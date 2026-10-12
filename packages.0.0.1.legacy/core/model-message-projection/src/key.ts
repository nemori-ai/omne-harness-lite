import {
  copyJsonValue,
  isJsonNumber,
  writeJsonLossless,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { judgeMessage } from '@omne-harness-lite/messages'
import type { ProjectionRules, ProjectionFailure } from './types.ts'
const names = [
  'agentDefinition',
  'assembly',
  'systemPrompt',
  'contextGeneration',
  'modelProfile',
  'modalities',
  'tools',
  'parameters',
]
const invalid = { invalidInput: true, reason: 'shape' } as const
const missing = { unavailable: true, reason: 'requiredSource' } as const
function object(value: unknown): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
function externalKeys(value: ProjectionRules['external']): ProjectionFailure | undefined {
  if (value === null) return
  if (typeof value !== 'object') return invalid
  if (
    Object.keys(value).length !== names.length ||
    !names.every(name => Object.hasOwn(value, name))
  )
    return missing
  if (!Object.values(value).every(item => typeof item === 'string' && item.length > 0))
    return invalid
}
function systemMessage(value: unknown): boolean {
  const checked = judgeMessage(value)
  return !('rejected' in checked) && checked.ok.type === 'system'
}
function compactionRef(value: unknown): boolean {
  return (
    object(value) &&
    Object.keys(value).length === 2 &&
    typeof value.messageId === 'string' &&
    typeof value.blockId === 'string'
  )
}
function compactionInputs(data: ProjectionRules): ProjectionFailure | undefined {
  const refs = data.pendingCardBlocks,
    last = data.lastModelRequestPrefixLength
  if (refs !== null && (!Array.isArray(refs) || !refs.every(compactionRef))) return invalid
  if (last !== null && (!Number.isSafeInteger(last) || last < 0)) return invalid
}
function ruleInputs(data: ProjectionRules): ProjectionFailure | undefined {
  if (typeof data.version !== 'string' || data.version.length === 0) return invalid
  const failure = externalKeys(data.external)
  if (failure !== undefined) return failure
  if (!Array.isArray(data.system) || !data.system.every(systemMessage)) return invalid
  if (data.external === null && data.system.length !== 0) return missing
  return compactionInputs(data)
}
export function checkedRules(
  input: unknown,
): { readonly rules: ProjectionRules; readonly key: string } | ProjectionFailure {
  const copy = copyJsonValue(input)
  if ('failed' in copy || !object(copy.ok)) return invalid
  const data = copy.ok as unknown as ProjectionRules
  if (
    !Object.keys(data).every(name =>
      [
        'version',
        'external',
        'system',
        'pendingCardBlocks',
        'lastModelRequestPrefixLength',
      ].includes(name),
    )
  )
    return invalid
  if (data.version === undefined || data.external === undefined || data.system === undefined)
    return missing
  const failure = ruleInputs(data)
  if (failure !== undefined) return failure
  return { rules: data, key: writeJsonLossless(copy.ok) }
}
export function projectionKey(
  input: ProjectionRules,
): { readonly key: string } | ProjectionFailure {
  const checked = checkedRules(input)
  return 'key' in checked ? { key: checked.key } : checked
}
