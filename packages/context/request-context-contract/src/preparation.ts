import { canonical } from './internal.js'
import { appendProjection, project, type ProjectedHistory } from './projection.js'
import { assembleSystemPrompt, type SystemPromptResult } from './prompt.js'
import { declareTools, type ToolDeclarationSet } from './declare-tools.js'
import type { PrincipalKey } from './refs.js'
import type { StableInputs } from './input-read.js'
import { contentControlOf, sameContentControl, type CachedAssemblyMaterial } from './reuse.js'
import type { AssemblyPolicies, HistoryRow } from './ports.js'
import { callIdentity } from './values.js'
import type {
  AssemblyInput,
  PreparedInputKey,
  AssemblyFailure,
  RequestCandidate,
} from './values.js'

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
    identity: callIdentity(input.identity),
    tokens,
    rules: {
      compaction: policies.compaction.identity,
      configDigest: policies.compaction.configDigest(),
      representation: policies.representation.identity,
    },
  }
}

export type ReuseBasis = Readonly<{ historyRead: StableInputs<unknown>['historyRead'] }>

export type StablePreparation = Readonly<{
  kind: 'prepared'
  key: PreparedInputKey
  rows: readonly HistoryRow[]
  view: ProjectedHistory
  prompt: Extract<SystemPromptResult, { kind: 'rendered' }>
  declarations: ToolDeclarationSet
  layers: CachedAssemblyMaterial | null
  viewFrom: 'same' | 'appended' | null
}>

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
