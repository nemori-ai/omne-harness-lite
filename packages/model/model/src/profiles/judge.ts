import { organizationEquals, tenantEquals } from '@omne-harness/legal-identity'
import {
  isProfileOf,
  meetsNeed,
  type ModelNeed,
  type ModelFailure,
  type ModelProfile,
  type ProfileKind,
  type ProfileResolution,
  type ProfileScope,
} from '@omne-harness/model-contract'
import type { ModelChoices, ModelProfileSnapshot } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'

type AnyCandidate = ModelProfileSnapshot['candidates'][number]
type Candidate<K extends ProfileKind> = Omit<AnyCandidate, 'profile'> &
  Readonly<{ profile: ModelProfile<K> }>
/** The candidates of one model kind: a route names a profile within its kind only. */
type Field<K extends ProfileKind> = Readonly<{
  precedence: ModelProfileSnapshot['precedence']
  candidates: readonly Candidate<K>[]
  source: ModelProfileSnapshot['source']
}>
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
  const seen: ModelProfile['identity'][] = []
  for (const { profile } of snapshot.candidates) {
    const { identity } = profile
    if (identity.kind !== profile.definition.kind) return unavailable('profile-kind-mismatch')
    if (layerOf(snapshot.precedence, identity.scope) < 0)
      return unavailable('profile-scope-outside-precedence')
    if (
      seen.some(
        item =>
          item.kind === identity.kind &&
          item.route === identity.route &&
          sameScope(item.scope, identity.scope),
      )
    )
      return unavailable('duplicate-profile-identity')
    seen.push(identity)
  }
  return null
}

function fieldOf<K extends ProfileKind>(snapshot: ModelProfileSnapshot, kind: K): Field<K> {
  const candidates: Candidate<K>[] = []
  for (const candidate of snapshot.candidates) {
    const { profile } = candidate
    if (isProfileOf(profile, kind)) candidates.push({ ...candidate, profile })
  }
  return { precedence: snapshot.precedence, candidates, source: snapshot.source }
}

function alive<K extends ProfileKind>(
  snapshot: Field<K>,
  route: string,
):
  | Readonly<{ kind: 'eligible'; candidates: readonly Candidate<K>[] }>
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

function mostSpecific<K extends ProfileKind>(
  precedence: readonly ProfileScope[],
  candidates: readonly Candidate<K>[],
): Candidate<K> {
  return candidates.reduce((best, candidate) =>
    layerOf(precedence, candidate.profile.identity.scope) >
    layerOf(precedence, best.profile.identity.scope)
      ? candidate
      : best,
  )
}

function reasonsOf(winner: Candidate<ProfileKind>, required: ModelNeed): readonly Reason[] {
  const reasons: Reason[] = []
  if (!meetsNeed(winner.profile.definition, required)) reasons.push('modality')
  if (winner.locked) reasons.push('locked')
  return reasons
}

function shadowedOf(
  winner: Candidate<ProfileKind>,
  candidates: readonly Candidate<ProfileKind>[],
  precedence: readonly ProfileScope[],
): readonly ModelProfile['adoption'][] {
  return candidates
    .filter(candidate => candidate !== winner)
    .toSorted(
      (left, right) =>
        layerOf(precedence, left.profile.identity.scope) -
        layerOf(precedence, right.profile.identity.scope),
    )
    .map(candidate => candidate.profile.adoption)
}

function resolveChecked<K extends ProfileKind>(
  snapshot: Field<K>,
  route: string,
  required: ModelNeed,
): ProfileResolution<K> {
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
function turnedOff<K extends ProfileKind>(
  snapshot: Field<K>,
  route: string,
  required: ModelNeed,
): ProfileResolution<K> {
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
    reasons: [...reasonsOf(winner, required), 'not-enabled'],
    credential: winner.credential,
    shadowed: [],
  }
}

export function judgeProfileResolution<K extends ProfileKind>(
  snapshot: ModelProfileSnapshot,
  route: string,
  required: ModelNeed<K>,
): Outcome<ProfileResolution<K>, ModelFailure> {
  const defect = checkSnapshot(snapshot)
  if (defect !== null) return { failure: defect }
  return { ok: resolveChecked(fieldOf(snapshot, required.kind), route, required) }
}

export function judgeProfileChoices<K extends ProfileKind>(
  snapshot: ModelProfileSnapshot,
  selected: string | null,
  required: ModelNeed<K>,
): Outcome<ModelChoices<K>, ModelFailure> {
  const defect = checkSnapshot(snapshot)
  if (defect !== null) return { failure: defect }
  const field = fieldOf(snapshot, required.kind)
  const choices: ProfileResolution<K>[] = []
  const routes = new Set<string>()
  for (const { profile } of field.candidates) {
    const { route } = profile.identity
    if (routes.has(route)) continue
    routes.add(route)
    const resolution = resolveChecked(field, route, required)
    if (resolution.kind === 'resolved') choices.push(resolution)
    else if (resolution.reason === 'excluded') choices.push(turnedOff(field, route, required))
  }
  const selection =
    selected === null
      ? null
      : { route: selected, resolution: resolveChecked(field, selected, required) }
  return { ok: { choices, selected: selection, source: snapshot.source } }
}
