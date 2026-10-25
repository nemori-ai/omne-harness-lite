import type * as M from '@omne-harness/model-contract'
import type {
  CompactionContext,
  CoveredEntry,
  Message,
  RecordEntryRef,
} from '@omne-harness/message'
import type { Adoption } from './refs.js'
import type { RetentionMeasurement } from './ports.js'
import type {
  AssemblyFailure,
  AssemblyUnknown,
  ProjectedHistory,
  ProjectedMessage,
  SelectedModel,
  SummaryMaterial,
} from './values.js'
import type { OperationContext } from './operation-context.js'
import { buildModelInput } from './model-input.js'
import { lineageFor } from './model-input.js'
import { measureCandidate } from './measurement.js'
import { decimalParts, measuredAmount } from './internal.js'

/** The projected messages of the window: the model view rows whose entry is in the window. */
export function projectWindow(view: ProjectedHistory, window: CompactionContext): ProjectedHistory {
  const refs = new Set([...window.covered, ...window.after].map(entry => entry.ref))
  return { ...view, messages: view.messages.filter(item => refs.has(item.entry)) }
}
export function projectedOf(
  projected: ProjectedHistory,
  entries: readonly RecordEntryRef[],
): readonly ProjectedMessage[] {
  const wanted = new Set(entries)
  return projected.messages.filter(item => wanted.has(item.entry))
}
/** The summary material: covered entries with their model-visible projection, or null. */
export function materialOf(
  projected: ProjectedHistory,
  covered: readonly CoveredEntry[],
  retained: readonly RecordEntryRef[],
): SummaryMaterial {
  const byEntry = new Map(projected.messages.map(item => [item.entry, item.message] as const))
  return {
    covered: covered.map(entry => ({ ref: entry.ref, message: byEntry.get(entry.ref) ?? null })),
    retained,
    trimmed: [],
  }
}

/** The retention budget of the policy, in tokens of the selected model window. */
export function retentionLimit(
  retain: import('./ports.js').RetainBudget,
  selection: SelectedModel,
): bigint {
  return retain.kind === 'tokens'
    ? BigInt(retain.retainTokens)
    : (BigInt(selection.profile.definition.context.window.provided) *
        decimalParts(retain.retainRatio).n) /
        decimalParts(retain.retainRatio).scale
}

export type CompactionCandidate = Readonly<{
  selection: SelectedModel
  representation: Adoption
  source: Adoption
}>
/** Measures one compaction candidate: empty system and tools, `auto`, its own lineage (RQ-05). */
export async function measureCompactionCandidate<P>(
  context: OperationContext<P>,
  candidate: CompactionCandidate,
  projected: readonly ProjectedMessage[],
  messages: readonly Message[],
): Promise<M.RequestBudget | AssemblyFailure | AssemblyUnknown> {
  const assembled = buildModelInput(candidate.selection, {
    system: [],
    messages,
    tools: [],
    toolChoice: 'auto',
    representation: candidate.representation,
    source: candidate.source,
  })
  const lineage = lineageFor(context.access, projected, messages, null)
  if ('kind' in lineage) return lineage
  return measureCandidate(
    { access: context.access, preparation: context.sources.preparation },
    candidate.selection,
    lineage,
    assembled,
  )
}

/** The callback a compaction policy receives: one complete measurement per retained set. */
export function retentionMeasure<P>(
  context: OperationContext<P>,
  candidate: CompactionCandidate,
  projected: ProjectedHistory,
): (entries: readonly RecordEntryRef[]) => Promise<RetentionMeasurement> {
  return async entries => {
    const items = projectedOf(projected, entries)
    const budget = await measureCompactionCandidate(
      context,
      candidate,
      items,
      items.map(item => item.message),
    )
    if (budget.kind !== 'complete' && budget.kind !== 'deferred-media') {
      if (budget.kind === 'unknown') return { kind: 'unknown', diagnostic: budget.diagnostic }
      return budget
    }
    const tokens = budget.checks
      .filter(check => check.metric === 'input-tokens')
      .map(measuredAmount)
      .reduce((a, b) => (a > b ? a : b), 0n)
    return { kind: 'measured', tokens: tokens.toString() }
  }
}
