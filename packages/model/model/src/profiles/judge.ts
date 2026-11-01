// The pure verdicts of one profile snapshot: which same-name profile wins, what the requirement
// allows, and what a list offers. The judges read the snapshot only: no environment, no I/O, no
// secret, and no throw. A snapshot that cannot prove its own composition is refused whole, so no
// caller acts on half a directory.
import { organizationEquals, tenantEquals } from '@omne-harness/legal-identity'
import type {
  ModalityRequirement,
  ModelFailure,
  ProfileResolution,
  ProfileScope,
} from '@omne-harness/model-contract'
import type { ModelChoices, ModelProfileSnapshot } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'

type Candidate = ModelProfileSnapshot['candidates'][number]
type Absent = Extract<ProfileResolution, { kind: 'absent' }>
type Reason = Extract<ProfileResolution, { kind: 'resolved' }>['reasons'][number]

const PROFILES = 'model-profiles'

function unavailable(diagnostic: string): ModelFailure {
  return { kind: 'unavailable', dependency: PROFILES, diagnostic }
}

/** Two scopes of one layer and identity compare; a copied identity does not. */
function sameScope(left: ProfileScope, right: ProfileScope): boolean {
  switch (left.kind) {
    case 'factory':
      return right.kind === 'factory'
    case 'organization':
      return (
        right.kind === 'organization' && organizationEquals(left.organization, right.organization)
      )
    case 'tenant':
      return right.kind === 'tenant' && tenantEquals(left.tenant, right.tenant)
    default: {
      const _exhaustive: never = left
      return _exhaustive
    }
  }
}

/**
 * The position of a scope in the layer order; -1 when the snapshot does not list it. The array
 * reads like a scope chain, outermost first, so a later position is the more specific layer.
 */
function layerOf(precedence: readonly ProfileScope[], scope: ProfileScope): number {
  return precedence.findIndex(layer => sameScope(layer, scope))
}

/**
 * Refuses a snapshot that claims what it cannot prove: a candidate outside the layer order, or two
 * candidates of one identity. Both mean the source did not give the current composition.
 */
function checkSnapshot(snapshot: ModelProfileSnapshot): ModelFailure | null {
  const seen: { scope: ProfileScope; route: string }[] = []
  for (const { profile } of snapshot.candidates) {
    const { identity } = profile
    if (layerOf(snapshot.precedence, identity.scope) < 0)
      return unavailable('profile-scope-outside-precedence')
    if (seen.some(item => item.route === identity.route && sameScope(item.scope, identity.scope)))
      return unavailable('duplicate-profile-identity')
    seen.push({ scope: identity.scope, route: identity.route })
  }
  return null
}

/**
 * True when the profile accepts every modality the requirement names. A requirement may name a
 * modality no profile can declare, such as `video`; the comparison is over the modality names.
 */
function covers(candidate: Candidate, required: ModalityRequirement): boolean {
  const input: readonly string[] = candidate.profile.definition.input
  return required.modalities.every(modality => input.includes(modality))
}

/**
 * What one route may win: withdrawn candidates go first, then the excluded ones. A chain with
 * nothing left names why it offers nothing, and an unknown route is never sold as withdrawn.
 */
function alive(
  snapshot: ModelProfileSnapshot,
  route: string,
):
  | Readonly<{ kind: 'eligible'; candidates: readonly Candidate[] }>
  | Readonly<{ kind: 'absent'; absent: Absent }> {
  const same = snapshot.candidates.filter(candidate => candidate.profile.identity.route === route)
  if (same.length === 0)
    return { kind: 'absent', absent: { kind: 'absent', reason: 'unknown-name' } }
  const registered = same.filter(candidate => candidate.profile.availability === 'active')
  if (registered.length === 0)
    return { kind: 'absent', absent: { kind: 'absent', reason: 'withdrawn' } }
  const eligible = registered.filter(candidate => !candidate.excluded)
  if (eligible.length === 0)
    return { kind: 'absent', absent: { kind: 'absent', reason: 'excluded' } }
  return { kind: 'eligible', candidates: eligible }
}

/** The most specific candidate of an eligible list. */
function mostSpecific(
  precedence: readonly ProfileScope[],
  candidates: readonly Candidate[],
): Candidate {
  return candidates.reduce((best, candidate) =>
    layerOf(precedence, candidate.profile.identity.scope) >
    layerOf(precedence, best.profile.identity.scope)
      ? candidate
      : best,
  )
}

function reasonsOf(winner: Candidate, required: ModalityRequirement): readonly Reason[] {
  const reasons: Reason[] = []
  if (!covers(winner, required)) reasons.push('modality')
  if (winner.locked) reasons.push('locked')
  return reasons
}

/** The lower layers of the same route that the winner hides, in layer order. */
function shadowedOf(
  winner: Candidate,
  candidates: readonly Candidate[],
  precedence: readonly ProfileScope[],
): readonly Candidate['profile']['adoption'][] {
  return candidates
    .filter(candidate => candidate !== winner)
    .toSorted(
      (left, right) =>
        layerOf(precedence, left.profile.identity.scope) -
        layerOf(precedence, right.profile.identity.scope),
    )
    .map(candidate => candidate.profile.adoption)
}

/** Resolve one route of an already checked snapshot. */
function resolveChecked(
  snapshot: ModelProfileSnapshot,
  route: string,
  required: ModalityRequirement,
): ProfileResolution {
  const judged = alive(snapshot, route)
  if (judged.kind === 'absent') return judged.absent
  const winner = mostSpecific(snapshot.precedence, judged.candidates)
  const reasons = reasonsOf(winner, required)
  return {
    kind: 'resolved',
    profile: winner.profile,
    source: snapshot.source,
    selectable: reasons.length === 0,
    reasons,
    credential: winner.credential,
    shadowed: shadowedOf(winner, judged.candidates, snapshot.precedence),
  }
}

/** The resolution of one route against one requirement, or the snapshot defect that stops it. */
export function judgeProfileResolution(
  snapshot: ModelProfileSnapshot,
  route: string,
  required: ModalityRequirement,
): Outcome<ProfileResolution, ModelFailure> {
  const defect = checkSnapshot(snapshot)
  if (defect !== null) return { failure: defect }
  return { ok: resolveChecked(snapshot, route, required) }
}

/**
 * The list of one snapshot: the selectable routes in the order they first appear, and the asked
 * selection explained even when the snapshot cannot offer it. The selection is not recorded.
 */
export function judgeProfileChoices(
  snapshot: ModelProfileSnapshot,
  selected: string | null,
  required: ModalityRequirement,
): Outcome<ModelChoices, ModelFailure> {
  const defect = checkSnapshot(snapshot)
  if (defect !== null) return { failure: defect }
  const choices: ProfileResolution[] = []
  const routes = new Set<string>()
  for (const { profile } of snapshot.candidates) {
    const { route } = profile.identity
    if (routes.has(route)) continue
    routes.add(route)
    const resolution = resolveChecked(snapshot, route, required)
    if (resolution.kind === 'resolved' && resolution.selectable) choices.push(resolution)
  }
  const selection =
    selected === null
      ? null
      : { route: selected, resolution: resolveChecked(snapshot, selected, required) }
  return { ok: { choices, selected: selection, source: snapshot.source } }
}
