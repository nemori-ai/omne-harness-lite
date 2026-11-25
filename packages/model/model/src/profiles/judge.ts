import { organizationEquals, tenantEquals } from '@omne-harness/legal-identity'
import {
  profileCovers,
  type ModalityRequirement,
  type ModelFailure,
  type ProfileResolution,
  type ProfileScope,
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

function layerOf(precedence: readonly ProfileScope[], scope: ProfileScope): number {
  return precedence.findIndex(layer => sameScope(layer, scope))
}

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
  if (!profileCovers(winner.profile.definition, required)) reasons.push('modality')
  if (winner.locked) reasons.push('locked')
  return reasons
}

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
    ...(winner.defaultReasoningEffort === undefined
      ? {}
      : { defaultReasoningEffort: winner.defaultReasoningEffort }),
  }
}

/** A route every registered profile of which the tenant has turned off: listed, never selectable. */
function turnedOff(snapshot: ModelProfileSnapshot, route: string): ProfileResolution {
  const registered = snapshot.candidates.filter(
    candidate =>
      candidate.profile.identity.route === route && candidate.profile.availability === 'active',
  )
  const winner = mostSpecific(snapshot.precedence, registered)
  return {
    kind: 'resolved',
    profile: winner.profile,
    source: snapshot.source,
    selectable: false,
    reasons: ['not-enabled'],
    credential: winner.credential,
    shadowed: [],
  }
}

export function judgeProfileResolution(
  snapshot: ModelProfileSnapshot,
  route: string,
  required: ModalityRequirement,
): Outcome<ProfileResolution, ModelFailure> {
  const defect = checkSnapshot(snapshot)
  if (defect !== null) return { failure: defect }
  return { ok: resolveChecked(snapshot, route, required) }
}

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
    if (resolution.kind === 'resolved') choices.push(resolution)
    else if (resolution.reason === 'excluded') choices.push(turnedOff(snapshot, route))
  }
  const selection =
    selected === null
      ? null
      : { route: selected, resolution: resolveChecked(snapshot, selected, required) }
  return { ok: { choices, selected: selection, source: snapshot.source } }
}
