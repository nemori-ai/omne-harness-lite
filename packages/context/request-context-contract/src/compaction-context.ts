import type { CompactionContext } from '@omne-harness/message'
import type { AssemblyInput, PlanResult, AssemblyFailure, AssemblyUnknown } from './values.js'
import type { AssemblyPorts, AssemblyPolicies, CompactionContextResult } from './ports.js'
import type { readHistory } from './history-read.js'
import { invalid, summary } from './compaction-request.js'
import { measure } from './measurement.js'
import { measuredAmount, decimalParts } from './internal.js'
export async function readCompactionContext<P>(
  input: AssemblyInput<P>,
  ports: AssemblyPorts<P>,
  history: Extract<Awaited<ReturnType<typeof readHistory>>, { kind: 'history' }>,
): Promise<
  Extract<CompactionContextResult, { kind: 'context' }> | AssemblyFailure | AssemblyUnknown
> {
  const last = history.rows.at(-1)
  if (last === undefined) return invalid('unsupported-format')
  const context = await ports.history.compactionContext(
    history.evidence,
    input.identity.access,
    last.entry,
  )
  if (context.kind === 'epoch-changed')
    return {
      kind: 'unavailable',
      owner: 'history-source',
      diagnostic: 'Compaction epoch changed; retry with current evidence',
    }
  if (context.kind === 'denied')
    return { kind: 'denied', action: 'read-history', diagnostic: 'Compaction context refused' }
  if (context.kind === 'unknown')
    return { kind: 'unknown', source: 'read', diagnostic: 'Compaction context unknown' }
  if (context.kind === 'invalid') return invalid('unsupported-format')
  if (context.kind === 'unavailable')
    return { kind: 'unavailable', owner: 'history-source', diagnostic: context.diagnostic }
  if (context.epoch !== history.evidence.epoch) return invalid('plan-mismatch')
  return context
}
export function measureRetention<P>(
  input: AssemblyInput<P>,
  ports: AssemblyPorts<P>,
  policies: AssemblyPolicies,
  context: Readonly<{ value: CompactionContext }>,
):
  | Readonly<{
      kind: 'measured'
      measureEntries: (entries: readonly import('@omne-harness/message').RecordEntryRef[]) => string
      limit: bigint
    }>
  | AssemblyFailure
  | Extract<PlanResult, { kind: 'cannot-fit' }> {
  const measured = new Map<string, bigint>()
  for (const entry of context.value.covered) {
    const assembled = {
      ...summary({ covered: [], retained: [], trimmed: [] }, policies),
      system: [],
      messages: entry.message === null ? [] : [entry.message],
    }
    const budget = measure(input, ports, assembled, [])
    if (budget.kind !== 'complete' && budget.kind !== 'deferred-media') return budget
    const check = budget.checks.filter(c => c.metric === 'input-tokens').map(measuredAmount)
    measured.set(
      entry.ref,
      check.reduce((a, b) => (a > b ? a : b), 0n),
    )
  }
  const measureEntries = (entries: readonly import('@omne-harness/message').RecordEntryRef[]) =>
    entries.reduce((sum, ref) => sum + (measured.get(ref) ?? 0n), 0n).toString()
  // The holder's complete open-work floor applies before policy coverage is shortened.
  if (context.value.open.some(ref => !measured.has(ref))) return invalid('unsupported-format')
  const retain = policies.compaction.config.retainBudget
  const limit =
    retain.kind === 'tokens'
      ? BigInt(retain.retainTokens)
      : (BigInt(input.selection.profile.definition.context.window.provided) *
          decimalParts(retain.retainRatio).n) /
        decimalParts(retain.retainRatio).scale
  if (BigInt(measureEntries(context.value.open)) > limit)
    return {
      kind: 'cannot-fit',
      reason: 'floor-exceeds-budget',
      floor: context.value.open,
      budget: limit.toString(),
      diagnostic: 'Open-work floor exceeds retention budget',
    }
  return { kind: 'measured' as const, measureEntries, limit }
}
