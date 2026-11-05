import type * as M from '@omne-harness/model-contract'
import type { FitVerdict, BudgetBreach } from './values.js'
import type { CompactionPolicy } from './ports.js'
import { nonEmpty } from './internal.js'
export type BudgetInput = Readonly<{
  whole: M.RequestBudget
  fixedPart: M.RequestBudget
  context: M.ContextLimits
  limits: readonly M.ModelLimit[]
  policy: CompactionPolicy
}>
/** Exact decimal arithmetic, including conservative rounding of estimates. */
function decimal(text: string): { n: bigint; scale: bigint } {
  const [whole = '0', fraction = ''] = text.split('.')
  return { n: BigInt(whole + fraction), scale: 10n ** BigInt(fraction.length) }
}
function amount(check: M.BudgetCheck): bigint {
  const v = decimal(check.measurement.amount)
  const m = decimal(check.measurement.kind === 'estimate' ? check.measurement.margin : '0')
  const n = v.n * m.scale + m.n * v.scale
  const d = v.scale * m.scale
  return (n + d - 1n) / d
}
function exceeds(c: M.BudgetCheck): boolean {
  return amount(c) > BigInt(c.limit)
}
/** The trigger line in input tokens: the smaller of the window percentage and the room left. */
function triggerOf(context: M.ContextLimits, policy: CompactionPolicy): bigint {
  const percent = decimal(policy.triggerPercent ?? context.compactionTriggerPercent)
  const threshold = (BigInt(context.window.provided) * percent.n) / (100n * percent.scale)
  const reserved = BigInt(context.output.provided) + BigInt(policy.headroomTokens ?? '0')
  const remaining = BigInt(context.window.provided) - reserved
  return remaining < threshold ? remaining : threshold
}
/**
 * The checks of one whole request that are over a hard limit or, for input tokens, over the
 * trigger line. The verdict of `judgeBudget` and the check after a summary share this rule, so
 * a compaction that passes the second does not fail the first (RQ-06).
 */
export function overTrigger(
  whole: M.RequestBudget,
  context: M.ContextLimits,
  policy: CompactionPolicy,
): readonly M.BudgetCheck[] {
  const trigger = triggerOf(context, policy)
  return whole.checks.filter(
    c => exceeds(c) || (c.metric === 'input-tokens' && amount(c) > trigger),
  )
}
export function judgeBudget(input: BudgetInput): FitVerdict {
  const fixed: BudgetBreach[] = input.fixedPart.checks
    .filter(exceeds)
    .map(check => ({ check, layer: 'whole' }))
  if (nonEmpty(fixed))
    return { kind: 'fixed-part-over-limit', report: input.whole, breaches: fixed }
  const breaches: BudgetBreach[] = overTrigger(input.whole, input.context, input.policy).map(
    check => ({ check, layer: 'whole' }),
  )
  if (nonEmpty(breaches)) return { kind: 'needs-compaction', report: input.whole, breaches }
  const unknown = input.whole.checks.filter(c => c.constraint.upstream.kind === 'unknown')
  if (nonEmpty(unknown)) return { kind: 'limit-unknown', report: input.whole, unknown }
  return { kind: 'fits', report: input.whole }
}
