import type {
  ModelDisplayAnnotation,
  ModelDisplayEntry,
  SelectionFailure,
  SelectionInvalidInput,
} from '@omne-harness-lite/model-request-runtime'
import type { Modality } from '@omne-harness-lite/content-blocks'
import { tenantIdEquals, type TenantId } from '@omne-harness-lite/identity-values'
import {
  judgeModelProfileDocument,
  refMatches,
  type ModelProfileRef,
  type ModelProfileRejection,
} from '@omne-harness-lite/model-profile'
import {
  winningRow,
  type CatalogScope,
  type ProfileRow,
} from '@omne-harness-lite/model-profile-directory'
import type {
  DisplayListResult,
  EffectiveModelResult,
  LegalTargetsResult,
  ModelLockFact,
  RowCredentialFact,
  SelectedRouteFact,
  SelectionAllowed,
  SelectionCompatibility,
  SelectionCompatibilityResult,
  SelectionFact,
  SelectionProjection,
  SelectionRows,
} from './selection-types.ts'
import { captureSelectionJson } from './selection-capture.ts'

function object(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function members(value: Readonly<Record<string, unknown>>, names: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === names.length && keys.every(key => names.includes(key))
}
function fact<T>(value: unknown, check: (value: unknown) => value is T): value is SelectionFact<T> {
  return (
    object(value) &&
    ((members(value, ['unknown']) && value.unknown === true) ||
      (members(value, ['known']) && check(value.known)))
  )
}
function route(value: unknown): value is string {
  return (
    'ok' in judgeModelProfileDocument('ModelProfileRef', { origin: 'official', routeName: value })
  )
}
function optionalRoute(value: unknown): value is string | null {
  return value === null || route(value)
}
function modality(value: unknown): value is Modality {
  return value === 'text' || value === 'image' || value === 'audio' || value === 'video'
}
function modalities(value: unknown): value is readonly Modality[] {
  return Array.isArray(value) && value.every(modality) && new Set(value).size === value.length
}
function allowed(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(route) && new Set(value).size === value.length
}
function row(value: unknown): value is ProfileRow {
  return (
    object(value) &&
    members(value, ['ref', 'profile']) &&
    'ok' in judgeModelProfileDocument('ModelProfileRef', value.ref) &&
    'ok' in judgeModelProfileDocument('ModelProfile', value.profile)
  )
}
function rows(value: unknown): value is readonly ProfileRow[] {
  return Array.isArray(value) && value.every(row)
}
function rowRejection(value: unknown): ModelProfileRejection | undefined {
  if (!object(value) || !object(value.rows) || !Array.isArray(value.rows.known)) return undefined
  for (const item of value.rows.known) {
    if (!object(item) || !members(item, ['ref', 'profile'])) return 'malformed'
    const ref = judgeModelProfileDocument('ModelProfileRef', item.ref)
    if ('rejected' in ref) return ref.rejected
    const profile = judgeModelProfileDocument('ModelProfile', item.profile)
    if ('rejected' in profile) return profile.rejected
  }
  return undefined
}
function invalid(reason: ModelProfileRejection = 'malformed'): SelectionInvalidInput {
  return Object.freeze({ invalidInput: Object.freeze({ reason }) })
}
function unavailable(): SelectionFailure {
  return Object.freeze({ unavailable: true } satisfies SelectionFailure)
}
function notFound(): { readonly profileNotFound: true } {
  return Object.freeze({ profileNotFound: true })
}
function sameRef(a: ModelProfileRef, b: ModelProfileRef): boolean {
  if (a.routeName !== b.routeName || a.origin !== b.origin) return false
  if (a.origin === 'official') return true
  if (b.origin !== 'custom' || a.scope.layer !== b.scope.layer) return false
  return a.scope.layer === 'organization' && b.scope.layer === 'organization'
    ? a.scope.organization === b.scope.organization
    : a.scope.layer === 'tenant' &&
        b.scope.layer === 'tenant' &&
        tenantIdEquals(a.scope.tenant, b.scope.tenant)
}
function sameScopeChain(tenant: TenantId | undefined, organization: string | undefined): boolean {
  return tenant === undefined || organization === undefined || tenant.organization === organization
}
/** The explicit rows are one S-17 chain, including across distinct route names. */
function chain(value: readonly ProfileRow[]): boolean {
  let organization: string | undefined
  let tenant: TenantId | undefined
  const seen: ModelProfileRef[] = []
  for (const item of value) {
    if (
      !refMatches(item.ref, item.profile, item.ref.origin === 'custom' ? item.ref.scope : undefined)
    )
      return false
    if (seen.some(ref => sameRef(ref, item.ref))) return false
    seen.push(item.ref)
    if (item.ref.origin === 'official') continue
    if (item.ref.scope.layer === 'organization') {
      const id = item.ref.scope.organization
      if (organization !== undefined && organization !== id) return false
      organization = id
    } else {
      const id = item.ref.scope.tenant
      if (tenant !== undefined && !tenantIdEquals(tenant, id)) return false
      tenant = id
    }
  }
  return sameScopeChain(tenant, organization)
}
function copy(value: unknown): unknown {
  try {
    return captureSelectionJson(value)
  } catch {
    // Ordinary not-JSON is a result above. Unexpected capture defects remain errors.
    throw new Error('model selection JSON capture failed')
  }
}
interface BasicFacts {
  readonly rows: SelectionRows
  readonly allowed: SelectionAllowed
}
function basic(value: unknown): value is BasicFacts {
  return (
    object(value) &&
    fact(value.rows, rows) &&
    fact(value.allowed, allowed) &&
    ('unknown' in value.rows || chain(value.rows.known))
  )
}
interface ProjectionFacts extends BasicFacts {
  readonly projection: SelectionProjection
}
function projected(value: unknown): value is ProjectionFacts {
  return basic(value) && object(value) && fact(value.projection, modalities)
}
function rank(item: ProfileRow): number {
  return item.ref.origin === 'official' ? 0 : item.ref.scope.layer === 'organization' ? 1 : 2
}
function mostSpecific(value: readonly ProfileRow[]): ProfileRow | undefined {
  return value.reduce<ProfileRow | undefined>(
    (best, item) => (best === undefined || rank(item) > rank(best) ? item : best),
    undefined,
  )
}
function landing(
  value: readonly ProfileRow[],
  name: string,
  names: readonly string[],
): ProfileRow | undefined {
  const winner = winningRow(value, name, names)
  if (winner !== undefined) return winner
  const candidates = value.filter(item => item.ref.routeName === name)
  // Asking the same public rule with this name allowed picks exactly C1.
  return winningRow(value, name, [name]) ?? mostSpecific(candidates)
}
function compatibilityShape(value: unknown): value is SelectionCompatibilityResult {
  if (!object(value)) return false
  if (members(value, ['ok'])) return value.ok === true
  if (members(value, ['blocked']))
    return modalities(value.blocked) && value.blocked.length > 0 && !value.blocked.includes('text')
  if (members(value, ['unavailable'])) return value.unavailable === true
  return (
    members(value, ['invalidInput']) &&
    object(value.invalidInput) &&
    members(value.invalidInput, ['reason']) &&
    typeof value.invalidInput.reason === 'string' &&
    [
      'malformed',
      'route_name_empty',
      'providers_empty',
      'modalities_empty',
      'input_text_missing',
      'modality_unknown',
      'registration_unknown',
      'parameter_out_of_range',
      'max_output_exceeds_profile',
      'constraint_unknown',
    ].includes(value.invalidInput.reason)
  )
}
function compatibility(
  item: ProfileRow,
  projection: readonly Modality[],
  decide: SelectionCompatibility,
): SelectionCompatibilityResult {
  let returned: unknown
  try {
    returned = decide(item.profile, projection)
  } catch {
    return unavailable()
  }
  const answer = copy(returned)
  if (!compatibilityShape(answer)) return invalid()
  if ('invalidInput' in answer || 'unavailable' in answer) return answer
  const blocked = projection.filter(value => !item.profile.inputModalities.includes(value))
  if ('ok' in answer) return blocked.length === 0 ? answer : invalid()
  return blocked.length === answer.blocked.length &&
    blocked.every(value => answer.blocked.includes(value))
    ? answer
    : invalid()
}
interface Decisions {
  readonly names: readonly string[]
  readonly answers: ReadonlyMap<string, SelectionCompatibilityResult>
}
function decideAll(
  value: readonly ProfileRow[],
  names: readonly string[],
  projection: readonly Modality[],
  decide: SelectionCompatibility,
): Decisions | SelectionFailure {
  const answers = new Map<string, SelectionCompatibilityResult>()
  const legal: string[] = []
  for (const name of [...new Set(value.map(item => item.ref.routeName))].sort()) {
    const winner = winningRow(value, name, names)
    if (winner === undefined) continue
    const answer = compatibility(winner, projection, decide)
    if ('invalidInput' in answer || 'unavailable' in answer) return answer
    answers.set(name, answer)
    if ('ok' in answer) legal.push(name)
  }
  return { names: legal, answers }
}

/** RT5 S-11/S-60: three conditions only; never reads credentials or authority. */
export function legalTargets(
  rowFacts: SelectionRows,
  allowedFacts: SelectionAllowed,
  projectionFacts: SelectionProjection,
  compatible: SelectionCompatibility,
): LegalTargetsResult {
  const input = copy({ rows: rowFacts, allowed: allowedFacts, projection: projectionFacts })
  const reason = rowRejection(input)
  if (reason !== undefined) return invalid(reason)
  if (!projected(input) || typeof compatible !== 'function') return invalid()
  if ('unknown' in input.rows || 'unknown' in input.allowed || 'unknown' in input.projection)
    return unavailable()
  const result = decideAll(
    input.rows.known,
    input.allowed.known,
    input.projection.known,
    compatible,
  )
  return 'names' in result ? Object.freeze({ ok: Object.freeze(result.names) }) : result
}
function credential(value: unknown): value is RowCredentialFact {
  return (
    object(value) &&
    members(value, ['ref', 'present']) &&
    'ok' in judgeModelProfileDocument('ModelProfileRef', value.ref) &&
    fact(value.present, (item): item is boolean => typeof item === 'boolean')
  )
}
function credentialRows(value: unknown): value is readonly RowCredentialFact[] {
  return (
    Array.isArray(value) &&
    value.every(credential) &&
    value.every((item, index) => !value.slice(0, index).some(old => sameRef(old.ref, item.ref)))
  )
}
function scope(item: ProfileRow): CatalogScope {
  return item.ref.origin === 'official' ? Object.freeze({ layer: 'factory' }) : item.ref.scope
}

interface DisplayFacts extends ProjectionFacts {
  readonly selected: SelectedRouteFact
  readonly credentials: SelectionFact<readonly RowCredentialFact[]>
}
function displayFacts(value: unknown): value is DisplayFacts {
  return (
    projected(value) &&
    object(value) &&
    fact(value.selected, optionalRoute) &&
    fact(value.credentials, credentialRows)
  )
}

function knownDisplayFacts(input: DisplayFacts): input is DisplayFacts & {
  readonly rows: { readonly known: readonly ProfileRow[] }
  readonly allowed: { readonly known: readonly string[] }
  readonly projection: { readonly known: readonly Modality[] }
  readonly selected: { readonly known: string }
} {
  return !(
    'unknown' in input.rows ||
    'unknown' in input.allowed ||
    'unknown' in input.projection ||
    'unknown' in input.selected ||
    input.selected.known === null
  )
}

function winnerAnnotations(
  annotations: ModelDisplayAnnotation[],
  winner: ProfileRow,
  answer: SelectionCompatibilityResult | undefined,
  credentials: SelectionFact<readonly RowCredentialFact[]>,
): SelectionFailure | undefined {
  if (answer === undefined || 'invalidInput' in answer || 'unavailable' in answer)
    throw new Error('selection decision has no compatibility result')
  annotations.push('ok' in answer ? 'legal' : 'modality_mismatch')
  if ('unknown' in credentials) return unavailable()
  const present = credentials.known.find(item => sameRef(item.ref, winner.ref))?.present
  if (present === undefined) return invalid()
  if ('unknown' in present) return unavailable()
  if (!present.known) annotations.push('credential_missing')
  return undefined
}

function coveredRows(
  covered: ModelDisplayEntry['covered'][number][],
  value: readonly ProfileRow[],
  name: string,
  names: readonly string[],
  winner: ProfileRow,
): void {
  for (const item of value
    .filter(row => row.ref.routeName === name && !sameRef(row.ref, winner.ref))
    .sort((a, b) => rank(b) - rank(a))) {
    const notes: ModelDisplayAnnotation[] = [
      Object.freeze({ overridden_by: Object.freeze({ scope: scope(winner) }) }),
    ]
    if (item.profile.registration === 'withdrawn') notes.push('withdrawn')
    if (!names.includes(name)) notes.push('scope_disallowed')
    covered.push(Object.freeze({ ref: item.ref, annotations: Object.freeze(notes) }))
  }
}

function appendDisplayEntry(
  entries: ModelDisplayEntry[],
  value: readonly ProfileRow[],
  name: string,
  names: readonly string[],
  selected: string,
  decisions: Decisions,
  credentials: SelectionFact<readonly RowCredentialFact[]>,
): SelectionFailure | undefined {
  const primary = landing(value, name, names)
  if (primary === undefined) throw new Error('selection decision has no landing')
  const winner = winningRow(value, name, names)
  const annotations: ModelDisplayAnnotation[] = []
  const covered: ModelDisplayEntry['covered'][number][] = []
  if (winner === undefined) {
    annotations.push(
      primary.profile.registration === 'withdrawn' ? 'withdrawn' : 'scope_disallowed',
    )
  } else {
    const failure = winnerAnnotations(annotations, winner, decisions.answers.get(name), credentials)
    if (failure !== undefined) return failure
    coveredRows(covered, value, name, names, winner)
  }
  entries.push(
    Object.freeze({
      routeName: name,
      ref: primary.ref,
      annotations: Object.freeze(annotations),
      covered: Object.freeze(covered),
      selected: name === selected,
    }),
  )
  return undefined
}

/** RT5 S-12/S-60: legal names plus selected name; covered rows are annotations. */
export function displayList(
  rowFacts: SelectionRows,
  allowedFacts: SelectionAllowed,
  projectionFacts: SelectionProjection,
  compatible: SelectionCompatibility,
  selectedFacts: SelectedRouteFact,
  credentials: SelectionFact<readonly RowCredentialFact[]>,
): DisplayListResult {
  const input = copy({
    rows: rowFacts,
    allowed: allowedFacts,
    projection: projectionFacts,
    selected: selectedFacts,
    credentials,
  })
  const reason = rowRejection(input)
  if (reason !== undefined) return invalid(reason)
  if (!displayFacts(input) || typeof compatible !== 'function') return invalid()
  if (!knownDisplayFacts(input)) return unavailable()
  const value = input.rows.known,
    names = input.allowed.known,
    selected = input.selected.known
  const decisions = decideAll(value, names, input.projection.known, compatible)
  if (!('names' in decisions)) return decisions
  if (landing(value, selected, names) === undefined) return notFound()
  const entries: ModelDisplayEntry[] = []
  for (const name of [...new Set([...decisions.names, selected])].sort()) {
    const failure = appendDisplayEntry(
      entries,
      value,
      name,
      names,
      selected,
      decisions,
      input.credentials,
    )
    if (failure !== undefined) return failure
  }
  return Object.freeze({ ok: Object.freeze(entries) })
}
interface EffectiveFacts extends BasicFacts {
  readonly selection: SelectedRouteFact
  readonly lock: ModelLockFact
}
function effectiveFacts(value: unknown): value is EffectiveFacts {
  return (
    basic(value) &&
    object(value) &&
    fact(value.selection, optionalRoute) &&
    fact(value.lock, optionalRoute)
  )
}
/** RT5 S-10/S-26/S-60: a lock keeps its source even when its name equals selection. */
export function effectiveModel(
  selection: SelectedRouteFact,
  lock: ModelLockFact,
  rowFacts: SelectionRows,
  allowedFacts: SelectionAllowed,
): EffectiveModelResult {
  const input = copy({ rows: rowFacts, allowed: allowedFacts, selection, lock })
  const reason = rowRejection(input)
  if (reason !== undefined) return invalid(reason)
  if (!effectiveFacts(input)) return invalid()
  if (
    'unknown' in input.selection ||
    input.selection.known === null ||
    'unknown' in input.lock ||
    'unknown' in input.rows ||
    'unknown' in input.allowed
  )
    return unavailable()
  const selected = input.selection.known,
    locked = input.lock.known
  const routeName = locked ?? selected
  const primary = landing(input.rows.known, routeName, input.allowed.known)
  return primary === undefined
    ? notFound()
    : Object.freeze({
        ok: Object.freeze({
          routeName,
          profile: primary.ref,
          selectedBy: locked === null ? 'session' : 'layer_lock',
          selected,
        }),
      })
}
