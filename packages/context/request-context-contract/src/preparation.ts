import { canonical } from './internal.js'
import { appendProjection, project, type ProjectedHistory } from './projection.js'
import { assembleSystemPrompt, type SystemPromptResult } from './prompt.js'
import { declareTools, type ToolDeclarationSet } from './declare-tools.js'
import type { PrincipalKey } from './refs.js'
import type { StableInputs } from './input-read.js'
import { contentControlOf, sameContentControl, type CachedAssemblyMaterial } from './reuse.js'
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

/** What a call may build on: the history read of this call and the material it continues. */
export type ReuseBasis = Readonly<{ historyRead: StableInputs<unknown>['historyRead'] }>

export type StablePreparation = Readonly<{
  kind: 'prepared'
  key: PreparedInputKey
  rows: readonly HistoryRow[]
  view: ProjectedHistory
  prompt: Extract<SystemPromptResult, { kind: 'rendered' }>
  declarations: ToolDeclarationSet
  /**
   * The cached material whose layered content this preparation may keep: same model, and no
   * alteration that touches the existing layers. Null: every layer is derived again.
   */
  layers: CachedAssemblyMaterial | null
  /** How `view` relates to the cached view: the same one, or that one plus appended rows. */
  viewFrom: 'same' | 'appended' | null
}>

/** Whether the stable layers of the cached material still describe this call (R7). */
function layerBasis<P>(
  input: AssemblyInput<P>,
  key: PreparedInputKey,
  cached: CachedAssemblyMaterial | null,
): CachedAssemblyMaterial | null {
  if (cached === null || cached.key.tokens.model !== key.tokens.model) return null
  const control = contentControlOf(input)
  const altered =
    !sameContentControl(control, cached.contentControl) &&
    input.alterations.some(a => a.touches === 'existing-layers')
  return altered ? null : cached
}

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

/** The view of the rows: the carried one, the cached one, the cached one plus the new rows, or all rows. */
function viewOf<P>(
  input: AssemblyInput<P>,
  rows: readonly HistoryRow[],
  reusable: RequestCandidate | null,
  read: ReuseBasis['historyRead'] | undefined,
): Readonly<{ view: ProjectedHistory; viewFrom: StablePreparation['viewFrom'] }> {
  if (reusable !== null) return { view: reusable.preparation.view, viewFrom: null }
  const cached = read?.cached ?? null
  if (cached !== null && read?.mode === 'same')
    return { view: cached.history.view, viewFrom: 'same' }
  if (cached !== null && read?.mode === 'tail') {
    const appended = appendProjection(cached.history.view, read.added, input.history.epoch)
    if (appended !== null) return { view: appended, viewFrom: 'appended' }
  }
  return { view: project(rows, input.history.epoch), viewFrom: null }
}
/** The system prompt: the carried one, the cached one under the same prompt token, or a new render. */
function promptOf<P>(
  input: AssemblyInput<P>,
  key: PreparedInputKey,
  reusable: RequestCandidate | null,
  layers: CachedAssemblyMaterial | null,
): SystemPromptResult {
  if (reusable !== null)
    return {
      kind: 'rendered',
      blocks: reusable.layers.systemPrompt,
      sections: reusable.coverage.prompt.sections,
      digest: reusable.coverage.prompt.digest,
    }
  if (layers !== null && layers.prompt.token === key.tokens.prompt) return layers.prompt.rendered
  return assembleSystemPrompt(
    input.promptContributions ?? { contributions: [], digest: '', generation: null },
    input.assembleContext,
  )
}
export function prepareStable<P>(
  input: AssemblyInput<P>,
  key: PreparedInputKey,
  rows: readonly HistoryRow[],
  basis?: ReuseBasis,
): StablePreparation | AssemblyFailure {
  const reusable = reusableCandidate(input, key)
  if (contradictoryPreparation(input, reusable))
    return { kind: 'invalid', field: 'previous.carried', reason: 'contradictory-retry' }
  const read = basis?.historyRead
  const layers = layerBasis(
    input,
    key,
    reusable === null && read !== undefined ? read.cached : null,
  )
  const { view, viewFrom } = viewOf(input, rows, reusable, read)
  const prompt = promptOf(input, key, reusable, layers)
  if (prompt.kind === 'invalid')
    return {
      kind: 'invalid',
      field: `prompt.${prompt.name}`,
      reason:
        prompt.reason === 'per-request-variable' ? 'per-request-variable' : 'unsupported-format',
    }
  const declarations =
    reusable?.layers.toolDeclarations ??
    (layers !== null && layers.tools.token === key.tokens.tools
      ? layers.tools.declarations
      : declareTools(input.tools))
  return {
    kind: 'prepared',
    key,
    rows: reusable?.preparation.rows ?? rows,
    view,
    prompt,
    declarations,
    layers,
    viewFrom,
  }
}
