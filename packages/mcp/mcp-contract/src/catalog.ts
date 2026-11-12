// The MCP action catalog and its known actions. The catalog lives in the catalog store and is
// written whole under a revision condition, so it is an immutable record with pure transitions.
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

/** Why a known action is unavailable. The set is closed. */
export type UnavailableReason =
  | 'no-longer-offered'
  | 'connection-unavailable'
  | 'authorization-required'
  | 'credential-unavailable'
  | 'landing-unavailable'

export type Availability =
  | Readonly<{ kind: 'available' }>
  | Readonly<{ kind: 'unavailable'; reason: UnavailableReason }>

/** A known action. In its catalog the action name is its identity. */
export type KnownAction = Readonly<{
  name: ActionName
  lastLawful: ActionDefinition
  definitionDigest: DefinitionDigest
  availability: Availability
}>

/** The basis of one adoption: the connection generation, protocol version and capabilities. */
export type AdoptionBasis = Readonly<{
  generation: Generation
  protocolVersion: ProtocolVersion
  capabilities: JsonValue
}>

/** When the listing was acquired, the shortest freshness hint of its pages, and later news. */
export type Freshness = Readonly<{
  acquiredAt: string
  ttlMs?: number
  changedNotified: boolean
}>

/** An acquired catalog. The actions are sorted by name and the names are unique. */
export type ActionCatalogRecord = Readonly<{
  revision: CatalogRevision
  basis: AdoptionBasis
  freshness: Freshness
  actions: readonly KnownAction[]
}>

/** Not acquired and acquired are two states. Not acquired is not a catalog of zero actions. */
export type CatalogState =
  | Readonly<{ kind: 'not-acquired' }>
  | Readonly<{ kind: 'acquired'; record: ActionCatalogRecord }>

/** The revision that a conditional write expects. A key never written expects `absent`. */
export type ExpectedRevision = CatalogRevision | 'absent'

export type MergeRefusal = 'stale-revision'

function nextRevision(previous: CatalogRevision | undefined): CatalogRevision {
  const next = (previous ?? 0) + 1
  if (!isCatalogRevision(next)) throw new RangeError('the catalog revision is exhausted')
  return next
}

/** Orders known actions by name in UTF-16 code units. See `compareCodeUnits` on ties. */
function byName(left: KnownAction, right: KnownAction): number {
  return compareCodeUnits(left.name, right.name)
}

/**
 * The adoption algorithm. It accepts only a listing that `completeListing` built in this module,
 * and throws `TypeError` for any other object. It merges only when the current revision is the
 * revision the listing was based on. Offered actions become available with their new
 * definition; a known action that the peer no longer offers stays, with its last lawful
 * definition, as unavailable. The result is a whole new record whose revision is one higher.
 * Connection generations are not compared here.
 */
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

/**
 * Marks every known action unavailable for a connection, credential, authorization or landing
 * reason. An action that the peer no longer offers keeps that reason. Definitions stay; the
 * revision is one higher.
 */
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

/**
 * The per-action permission items, `execute:<action name>`, one for each known action whether
 * available or not. Before a catalog is acquired there are none, and that is not zero actions.
 */
export function actionPermissionItems(state: CatalogState): readonly string[] | 'not-acquired' {
  if (state.kind === 'not-acquired') return 'not-acquired'
  return state.record.actions.map(known => `execute:${known.name}`)
}
