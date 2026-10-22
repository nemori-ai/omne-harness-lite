import type * as M from '@omne-harness/model-contract'
import type { StablePreparation } from './preparation.js'
import type { LayeredRequest } from './assembly-layers.js'
import type { RepresentationResult } from './representation.js'
import type { AssemblyInput, Coverage, PrefixBreakReason } from './values.js'
import { canonical, digest } from './internal.js'
export function prefix(
  coverage: Omit<Coverage, 'prefixBreak'>,
  previous: Coverage | null,
  input: AssemblyInput<unknown>,
): PrefixBreakReason {
  if (input.transition !== null) return 'compaction'
  if (input.alterations.some(a => a.touches === 'existing-layers')) return 'extension-altered'
  if (
    previous === null ||
    canonical(previous.snapshot.anchor) !== canonical(coverage.snapshot.anchor)
  )
    return 'new-full-read'
  if (previous.model.recipient !== coverage.model.recipient) return 'model-changed'
  if (previous.prompt.digest !== coverage.prompt.digest) return 'system-prompt-changed'
  if (previous.tools.digest !== coverage.tools.digest) return 'tool-set-changed'
  return 'unchanged'
}

export function assemblyCoverage(
  input: AssemblyInput<unknown>,
  prepared: StablePreparation,
  dynamic: LayeredRequest,
  represented: Extract<RepresentationResult, { kind: 'chosen' }>,
  whole: M.RequestBudget,
): Coverage {
  const snapshot = dynamic.layers.snapshotReminder
  const base: Omit<Coverage, 'prefixBreak'> = {
    history: {
      epoch: prepared.history.evidence.epoch,
      upper: prepared.history.evidence.upper,
      anchors: prepared.history.rows.length
        ? [
            {
              layer: 'history-head',
              seq: snapshot.anchor.seq,
              prefixDigest: snapshot.anchor.prefixDigest ?? '',
            },
            {
              layer: 'history-body',
              seq: prepared.history.rows.at(-1)?.seq ?? -1,
              prefixDigest: prepared.history.rows.at(-1)?.prefixDigest ?? '',
            },
          ]
        : [],
    },
    compactions: { record: prepared.view.compaction?.entry ?? null, derivation: null },
    inputs: { batch: input.inputs.batch, saved: input.inputs.saved },
    snapshot: {
      scope: snapshot.scope,
      eligibility: snapshot.eligibility,
      revision: snapshot.revision,
      anchor: snapshot.anchor,
      content: dynamic.anchorSource === 'adopted' ? 'incremental' : 'full',
    },
    prompt: {
      sections: prepared.prompt.sections,
      digest: prepared.prompt.digest,
      generation: input.promptContributions?.generation ?? null,
    },
    model: {
      profile: input.selection.profile.adoption,
      revision: String(input.selection.profile.revision),
      recipient: `${input.selection.recipient.route}/${input.selection.recipient.model}`,
      parametersDigest: digest(input.selection.parameters),
      replay: input.selection.replay,
    },
    tools: {
      direct: prepared.declarations.direct.map(t => t.name),
      programmatic: prepared.declarations.programmatic.map(t => t.name),
      digest: prepared.declarations.digest,
    },
    conditions: input.conditions,
    alterations: input.alterations,
    representations: represented.choices,
    budget: {
      inputDigest: whole.inputDigest,
      kind: whole.kind,
      deferred: represented.deferred,
      unknownLimits: whole.checks
        .filter(c => c.constraint.upstream.kind === 'unknown')
        .map(c => c.metric),
    },
  }
  const coverage: Coverage = { ...base, prefixBreak: prefix(base, input.adopted, input) }
  return coverage
}
