import type * as M from '@omne-harness/model-contract'
import type { AssemblyInput, AssemblyFailure, RequestLayers, FitVerdict } from './values.js'
import type { AssemblyPorts, AssemblyPolicies } from './ports.js'
import type { StablePreparation } from './preparation.js'
import type { RepresentationResult } from './representation.js'
import { measure } from './measurement.js'
import { judgeBudget } from './budget.js'
export function measureLayers<P>(
  input: AssemblyInput<P>,
  ports: AssemblyPorts<P>,
  policies: AssemblyPolicies,
  prepared: StablePreparation,
  layers: RequestLayers,
  represented: Extract<RepresentationResult, { kind: 'chosen' }>,
  assembled: M.AssembledModelInput,
): Readonly<{ kind: 'measured'; whole: M.RequestBudget; verdict: FitVerdict }> | AssemblyFailure {
  const whole = measure(input, ports, assembled, represented.deferred)
  if ('kind' in whole && whole.kind !== 'complete' && whole.kind !== 'deferred-media') return whole
  const fixedIds = new Set(input.inputs.entries)
  const fixedMessages = [
    ...(layers.snapshotReminder.message === null ? [] : [layers.snapshotReminder.message]),
    ...prepared.view.messages.filter(r => fixedIds.has(r.entry)).map(r => r.message),
    ...(layers.tailFacts.message === null ? [] : [layers.tailFacts.message]),
  ]
  const representedIds = new Set(fixedMessages.map(m => m.id))
  const fixed = measure(
    input,
    ports,
    { ...assembled, messages: represented.messages.filter(m => representedIds.has(m.id)) },
    represented.deferred,
  )
  if (fixed.kind !== 'complete' && fixed.kind !== 'deferred-media') return fixed
  const verdict = judgeBudget({
    whole,
    fixedPart: fixed,
    context: input.selection.profile.definition.context,
    limits: input.selection.profile.definition.limits,
    policy: policies.compaction.config,
  })
  return { kind: 'measured', whole, verdict }
}
