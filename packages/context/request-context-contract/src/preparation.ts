import { canonical } from './internal.js'
import { project, type ProjectedHistory } from './projection.js'
import { assembleSystemPrompt, type SystemPromptResult } from './prompt.js'
import { declareTools, type ToolDeclarationSet } from './declare-tools.js'
import type { PrincipalKey } from './refs.js'
import type { AssemblyPolicies, HistoryRow } from './ports.js'
import type {
  AssemblyInput,
  PreparedInputKey,
  AssemblyFailure,
  RequestCandidate,
} from './values.js'

/** The reuse key: principal key, call identity, the six group tokens and the derivation rules. */
export function preparationKey<P>(
  input: AssemblyInput<P>,
  principal: PrincipalKey,
  tokens: PreparedInputKey['tokens'],
  policies: AssemblyPolicies,
  generation: PreparedInputKey['generation'] = null,
): PreparedInputKey {
  return {
    generation,
    principal,
    identity: {
      purpose: input.identity.purpose,
      position: input.identity.position,
      candidate: input.identity.candidate,
    },
    tokens,
    rules: {
      compaction: policies.compaction.identity,
      configDigest: policies.compaction.configDigest(),
      representation: policies.representation.identity,
    },
  }
}

export type StablePreparation = Readonly<{
  kind: 'prepared'
  key: PreparedInputKey
  rows: readonly HistoryRow[]
  view: ProjectedHistory
  prompt: Extract<SystemPromptResult, { kind: 'rendered' }>
  declarations: ToolDeclarationSet
}>

/** The carried candidate whose key equals this key, if any. */
export function reusableCandidate<P>(
  input: AssemblyInput<P>,
  key: PreparedInputKey,
): RequestCandidate | null {
  const carried = input.previous?.carried
  return carried !== undefined &&
    carried.candidate === input.identity.candidate &&
    canonical(carried.preparation.key) === canonical(key)
    ? carried
    : null
}
/** A fixed candidate retried with different groups: the other adoption cannot rewrite it. */
export function contradictoryPreparation<P>(
  input: AssemblyInput<P>,
  reusable: RequestCandidate | null,
): boolean {
  const carried = input.previous?.carried
  return (
    carried !== undefined &&
    carried.candidate === input.identity.candidate &&
    input.adopted !== null &&
    canonical(input.adopted.coverage) === canonical(carried.coverage) &&
    reusable === null
  )
}

export function prepareStable<P>(
  input: AssemblyInput<P>,
  key: PreparedInputKey,
  rows: readonly HistoryRow[],
): StablePreparation | AssemblyFailure {
  const reusable = reusableCandidate(input, key)
  if (contradictoryPreparation(input, reusable))
    return { kind: 'invalid', field: 'previous.carried', reason: 'contradictory-retry' }
  const view = reusable?.preparation.view ?? project(rows, input.history.epoch)
  const prompt =
    reusable === null
      ? assembleSystemPrompt(
          input.promptContributions ?? { contributions: [], digest: '', generation: null },
          input.assembleContext,
        )
      : {
          kind: 'rendered' as const,
          blocks: reusable.layers.systemPrompt,
          sections: reusable.coverage.prompt.sections,
          digest: reusable.coverage.prompt.digest,
        }
  if (prompt.kind === 'invalid')
    return {
      kind: 'invalid',
      field: `prompt.${prompt.name}`,
      reason:
        prompt.reason === 'per-request-variable' ? 'per-request-variable' : 'unsupported-format',
    }
  const declarations = reusable?.layers.toolDeclarations ?? declareTools(input.tools)
  return {
    kind: 'prepared',
    key,
    rows: reusable?.preparation.rows ?? rows,
    view,
    prompt,
    declarations,
  }
}
