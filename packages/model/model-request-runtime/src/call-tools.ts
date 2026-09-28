import {
  ExactDecimal,
  judgeAccountValue,
  type AttemptId,
  type RunId,
} from '@omne-harness-lite/call-accounts'
import type { SessionRef } from '@omne-harness-lite/messages'
import type {
  AssetRegistryService,
  AvailabilityReport,
  Within,
} from '@omne-harness-lite/asset-registry'
import {
  isToolDefinition,
  modelEntry,
  modelName,
  type ModelToolEntry,
  type ModelToolName,
} from '@omne-harness-lite/tool-definition'

export interface CallToolRequest {
  readonly session: SessionRef
  readonly tools: readonly ModelToolName[]
  readonly run?: RunId
  readonly attempt?: AttemptId
  readonly report?: AvailabilityReport
}

export type CallToolResolution =
  | { readonly tools: readonly ModelToolEntry[] }
  | { readonly failure: 'invalidInput'; readonly reason?: 'unknownTool' }
  | { readonly failure: 'unavailable' }

function reportMatches(request: CallToolRequest): boolean {
  const hasRun = request.run !== undefined
  if (hasRun !== (request.attempt !== undefined) || hasRun !== (request.report !== undefined))
    return false
  if (!hasRun) return true
  const report = request.report
  if (
    request.run === undefined ||
    request.attempt === undefined ||
    report === undefined ||
    report === null ||
    typeof report !== 'object' ||
    report.session !== request.session ||
    report.runId !== request.run ||
    !('ok' in judgeAccountValue('AttemptId', request.attempt)) ||
    !('ok' in judgeAccountValue('AttemptId', report.attempt))
  )
    return false
  return ExactDecimal.from(report.attempt).compare(ExactDecimal.from(request.attempt)) === 0
}

/** RT5 S-28: resolve model-facing names at this call's registry scope. */
export async function resolveCallTools(
  request: CallToolRequest,
  registry: Pick<AssetRegistryService, 'lookup'>,
): Promise<CallToolResolution> {
  if (!reportMatches(request) || !Array.isArray(request.tools)) return { failure: 'invalidInput' }
  const seen = new Set<string>()
  for (const name of request.tools) {
    if (typeof name !== 'string' || name.length === 0 || seen.has(name))
      return { failure: 'invalidInput' }
    seen.add(name)
  }
  const within: Within =
    request.report === undefined ? { kind: 'session' } : { kind: 'run', report: request.report }
  const tools: ModelToolEntry[] = []
  for (const name of request.tools) {
    const result = await registry.lookup(request.session, 'tool', name, within)
    if ('none' in result) return { failure: 'invalidInput', reason: 'unknownTool' }
    if ('failure' in result) {
      if (result.failure === 'invalidInput') return { failure: 'invalidInput' }
      if (result.failure === 'unavailable' || result.failure === 'sessionNotFound')
        return { failure: 'unavailable' }
      throw new TypeError(`asset registry violated tool lookup: ${result.failure}`)
    }
    if (!('entry' in result))
      throw new TypeError('asset registry returned an invalid lookup result')
    const { entry } = result
    if (
      entry.capability.category !== 'tool' ||
      modelName(entry.capability.name) !== name ||
      entry.content.category !== 'tool' ||
      !isToolDefinition(entry.content.definition) ||
      entry.content.definition.name !== entry.capability.name
    )
      throw new TypeError('asset registry returned an invalid tool entry')
    tools.push(modelEntry(entry.content.definition))
  }
  return { tools: Object.freeze(tools) }
}
