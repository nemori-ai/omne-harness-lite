import type * as M from '@omne-harness/model-contract'
import type {
  AssemblyInput,
  AssemblyFailure,
  AssemblyUnknown,
  RequestLayers,
  FitVerdict,
} from './values.js'
import type { StablePreparation } from './preparation.js'
import type { RepresentationResult } from './representation.js'
import type { OperationContext } from './operation-context.js'
import { measureCandidate } from './measurement.js'
import { judgeBudget } from './budget.js'
import { lineageFor, type ContinuationFacts } from './model-input.js'
type Measured = M.RequestBudget | AssemblyFailure | AssemblyUnknown
function failed(value: Measured): value is AssemblyFailure | AssemblyUnknown {
  return value.kind !== 'complete' && value.kind !== 'deferred-media'
}
/** Measures the whole request and its fixed part, each as its own complete candidate (RQ-05). */
export async function measureLayers<P>(
  input: AssemblyInput<P>,
  context: OperationContext<P>,
  prepared: StablePreparation,
  layers: RequestLayers,
  represented: Extract<RepresentationResult, { kind: 'chosen' }>,
  assembled: M.AssembledModelInput,
  facts: ContinuationFacts,
): Promise<
  | Readonly<{ kind: 'measured'; whole: M.RequestBudget; verdict: FitVerdict }>
  | AssemblyFailure
  | AssemblyUnknown
> {
  const measure = { access: context.access, preparation: context.sources.preparation }
  const lineage = lineageFor(context.access, prepared.view.messages, assembled.messages, {
    adopted: input.adopted,
    facts,
  })
  if ('kind' in lineage) return lineage
  const whole = await measureCandidate(measure, input.selection, lineage, assembled)
  if (failed(whole)) return whole
  const fixedIds = new Set(input.inputs.entries)
  const fixedMessages = [
    ...(layers.snapshotReminder.message === null ? [] : [layers.snapshotReminder.message]),
    ...prepared.view.messages.filter(r => fixedIds.has(r.entry)).map(r => r.message),
    ...(layers.tailFacts.message === null ? [] : [layers.tailFacts.message]),
  ]
  const representedIds = new Set(fixedMessages.map(m => m.id))
  const fixedInput = {
    ...assembled,
    messages: represented.messages.filter(m => representedIds.has(m.id)),
  }
  const fixedLineage = lineageFor(context.access, prepared.view.messages, fixedInput.messages, null)
  if ('kind' in fixedLineage) return fixedLineage
  const fixed = await measureCandidate(measure, input.selection, fixedLineage, fixedInput)
  if (failed(fixed)) return fixed
  const verdict = judgeBudget({
    whole,
    fixedPart: fixed,
    context: input.selection.profile.definition.context,
    limits: input.selection.profile.definition.limits,
    policy: context.policies.compaction.config,
  })
  return { kind: 'measured', whole, verdict }
}
