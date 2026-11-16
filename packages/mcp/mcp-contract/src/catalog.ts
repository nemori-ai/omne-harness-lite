import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  isCatalogRevision,
  type ActionName,
  type CatalogRevision,
  type DefinitionDigest,
  type Generation,
  type ProtocolVersion,
} from './brands.ts'
import { assertComplete, type CompleteListing } from './listing.ts'
import { compareCodeUnits } from './order.ts'
import type { ActionDefinition } from './values.ts'

export type UnavailableReason =
  | 'no-longer-offered'
  | 'connection-unavailable'
  | 'authorization-required'
  | 'credential-unavailable'
  | 'landing-unavailable'

export type Availability =
  | Readonly<{ kind: 'available' }>
  | Readonly<{ kind: 'unavailable'; reason: UnavailableReason }>

export type KnownAction = Readonly<{
  name: ActionName
  lastLawful: ActionDefinition
  definitionDigest: DefinitionDigest
  availability: Availability
}>

export type AdoptionBasis = Readonly<{
  generation: Generation
  protocolVersion: ProtocolVersion
  capabilities: JsonValue
}>

export type Freshness = Readonly<{
  acquiredAt: string
  ttlMs?: number
  changedNotified: boolean
}>

export type ActionCatalogRecord = Readonly<{
  revision: CatalogRevision
  basis: AdoptionBasis
  freshness: Freshness
  actions: readonly KnownAction[]
}>

export type CatalogState =
  | Readonly<{ kind: 'not-acquired' }>
  | Readonly<{ kind: 'acquired'; record: ActionCatalogRecord }>

export type ExpectedRevision = CatalogRevision | 'absent'

export type MergeRefusal = 'stale-revision'

function nextRevision(previous: CatalogRevision | undefined): CatalogRevision {
  const next = (previous ?? 0) + 1
  if (!isCatalogRevision(next)) throw new RangeError('the catalog revision is exhausted')
  return next
}

function byName(left: KnownAction, right: KnownAction): number {
  return compareCodeUnits(left.name, right.name)
}

export function mergeListing(
  current: CatalogState,
  listing: CompleteListing,
): Outcome<ActionCatalogRecord, MergeRefusal> {
  assertComplete(listing)
  const previous = current.kind === 'acquired' ? current.record : undefined
  if ((previous?.revision ?? 'absent') !== listing.basedOn) return fail('stale-revision')
  const offered: KnownAction[] = listing.actions.map(({ definition, digest }) => ({
    name: definition.name,
    lastLawful: definition,
    definitionDigest: digest,
    availability: { kind: 'available' },
  }))
  const kept: KnownAction[] = (previous?.actions ?? [])
    .filter(known => !offered.some(action => action.name === known.name))
    .map(known => ({
      ...known,
      availability: { kind: 'unavailable', reason: 'no-longer-offered' },
    }))
  return succeed({
    revision: nextRevision(previous?.revision),
    basis: listing.basis,
    freshness: listing.freshness,
    actions: [...offered, ...kept].sort(byName),
  })
}

export function markUnavailable(
  record: ActionCatalogRecord,
  reason: Exclude<UnavailableReason, 'no-longer-offered'>,
): ActionCatalogRecord {
  return {
    ...record,
    revision: nextRevision(record.revision),
    actions: record.actions.map(known =>
      known.availability.kind === 'unavailable' && known.availability.reason === 'no-longer-offered'
        ? known
        : { ...known, availability: { kind: 'unavailable', reason } },
    ),
  }
}

export function actionPermissionItems(state: CatalogState): readonly string[] | 'not-acquired' {
  if (state.kind === 'not-acquired') return 'not-acquired'
  return state.record.actions.map(known => `execute:${known.name}`)
}
