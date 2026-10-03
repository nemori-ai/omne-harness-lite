import {
  ExactDecimal,
  judgeAccountValue,
  type AttemptId,
  type RunId,
} from '@omne-harness-lite/call-accounts'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { SessionRef } from '@omne-harness-lite/messages'
import type {
  AssetRegistryService,
  AvailabilityReport,
  RegistryEntry,
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
  return scopedReportMatches(request)
}

function scopedReportMatches(request: CallToolRequest): boolean {
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

function captureNames(tools: readonly ModelToolName[]): ModelToolName[] | undefined {
  const copiedTools = copyJsonValue(tools)
  if (!('ok' in copiedTools) || !Array.isArray(copiedTools.ok)) return undefined
  const names: ModelToolName[] = []
  const seen = new Set<string>()
  for (const value of copiedTools.ok) {
    if (typeof value !== 'string' || value.length === 0 || seen.has(value)) return undefined
    seen.add(value)
    names.push(value)
  }
  return names
}

function captureAttempt(attempt: AttemptId | undefined): { ok: AttemptId } | undefined | null {
  const copiedAttempt = attempt === undefined ? undefined : copyJsonValue(attempt)
  if (copiedAttempt !== undefined && !('ok' in copiedAttempt)) return null
  if (copiedAttempt !== undefined && !('ok' in judgeAccountValue('AttemptId', copiedAttempt.ok)))
    return null
  return copiedAttempt as { ok: AttemptId } | undefined
}

function validCallIdentity(session: SessionRef, run: RunId | undefined): boolean {
  return !(
    !('ok' in parseOpaqueIdentifier(session, 'SessionRef')) ||
    (run !== undefined && !('ok' in judgeAccountValue('RunId', run)))
  )
}

function capture(request: CallToolRequest): CallToolRequest | undefined {
  const { session, run, attempt, report, tools } = request
  if (!validCallIdentity(session, run)) return undefined
  const names = captureNames(tools)
  if (names === undefined) return undefined
  const copiedAttempt = captureAttempt(attempt)
  if (copiedAttempt === null) return undefined
  const copiedReport = report === undefined ? undefined : copyJsonValue(report)
  if (copiedReport !== undefined && !('ok' in copiedReport)) return undefined
  // The source is typed as AvailabilityReport. The public JSON copy owns its entire tree;
  // registry.lookup performs the provider's full report check when the scoped read occurs.
  const captured: CallToolRequest = {
    session,
    tools: Object.freeze(names),
    ...(run === undefined ? {} : { run }),
    ...(copiedAttempt === undefined ? {} : { attempt: copiedAttempt.ok }),
    ...(copiedReport === undefined
      ? {}
      : { report: copiedReport.ok as unknown as AvailabilityReport }),
  }
  return reportMatches(captured) ? Object.freeze(captured) : undefined
}

function validToolEntry(
  entry: RegistryEntry,
  name: ModelToolName,
): entry is RegistryEntry & {
  readonly content: {
    readonly category: 'tool'
    readonly definition: Parameters<typeof modelEntry>[0]
  }
} {
  return !(
    entry.capability.category !== 'tool' ||
    modelName(entry.capability.name) !== name ||
    entry.content.category !== 'tool' ||
    !isToolDefinition(entry.content.definition) ||
    entry.content.definition.name !== entry.capability.name
  )
}

/** RT5 S-28: resolve model-facing names at this call's registry scope. */
export async function resolveCallTools(
  request: CallToolRequest,
  registry: Pick<AssetRegistryService, 'lookup'>,
): Promise<CallToolResolution> {
  const captured = capture(request)
  if (captured === undefined) return { failure: 'invalidInput' }
  const within: Within = Object.freeze(
    captured.report === undefined ? { kind: 'session' } : { kind: 'run', report: captured.report },
  )
  const tools: ModelToolEntry[] = []
  for (const name of captured.tools) {
    const result = await registry.lookup(captured.session, 'tool', name, within)
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
    if (!validToolEntry(entry, name))
      throw new TypeError('asset registry returned an invalid tool entry')
    tools.push(modelEntry(entry.content.definition))
  }
  return { tools: Object.freeze(tools) }
}
