// The exhaustive sample table of `mergeListing`. Each case gives the catalog state, a complete
// listing, the revision the listing is based on, and the result that the merge must give. The
// expected records are written out from the inputs; they are not computed by `mergeListing`.
import type { Outcome } from '@omne-harness/operation-result'
import {
  completeListing,
  type ActionCatalogRecord,
  type AdoptionBasis,
  type CatalogState,
  type CompleteListing,
  type ExpectedRevision,
  type KnownAction,
  type MergeRefusal,
} from './catalog.ts'
import { generationOf, jsonOf, protocolVersionOf, revisionOf } from './testing-values.ts'

export type MergeListingCase = Readonly<{
  name: string
  current: CatalogState
  listing: CompleteListing
  basedOn: ExpectedRevision
  expected: Outcome<ActionCatalogRecord, MergeRefusal>
}>

function basis(generation: number): AdoptionBasis {
  return {
    generation: generationOf(generation),
    protocolVersion: protocolVersionOf('2026-07-28'),
    capabilities: jsonOf({ tools: { listChanged: true } }),
  }
}

const acquiredAt = '2026-11-03T08:00:00Z'

function listingOf(generation: number, tools: readonly Readonly<Record<string, unknown>>[]) {
  const listing = completeListing({
    pages: [
      { ok: { tools: tools.map(tool => jsonOf({ inputSchema: { type: 'object' }, ...tool })) } },
    ],
    basis: basis(generation),
    acquiredAt,
    limits: { maxPages: 1, maxActions: 10 },
  })
  if ('failure' in listing) throw new TypeError(listing.failure)
  return listing.ok
}

/** The known action that an offered entry of the listing becomes. */
function offered(listing: CompleteListing, index: number): KnownAction {
  const entry = listing.actions[index]
  if (entry === undefined) throw new TypeError(`the listing has no entry ${index}`)
  return {
    name: entry.definition.name,
    lastLawful: entry.definition,
    definitionDigest: entry.digest,
    availability: { kind: 'available' },
  }
}

function record(
  revision: number,
  listing: CompleteListing,
  actions: readonly KnownAction[],
): ActionCatalogRecord {
  return {
    revision: revisionOf(revision),
    basis: listing.basis,
    freshness: listing.freshness,
    actions,
  }
}

const notAcquired: CatalogState = { kind: 'not-acquired' }
const first = listingOf(1, [{ name: 'read' }, { name: 'write', description: 'v1' }])
const firstRecord = record(1, first, [offered(first, 0), offered(first, 1)])
const acquired: CatalogState = { kind: 'acquired', record: firstRecord }
const writeGone = listingOf(2, [{ name: 'read' }])
const writeChanged = listingOf(2, [{ name: 'write', description: 'v2' }, { name: 'read' }])
const empty = listingOf(2, [])
const unordered = listingOf(1, [{ name: 'zeta' }, { name: 'alpha' }])
const lost: CatalogState = {
  kind: 'acquired',
  record: {
    ...firstRecord,
    revision: revisionOf(2),
    actions: firstRecord.actions.map(action => ({
      ...action,
      availability: { kind: 'unavailable', reason: 'connection-unavailable' },
    })),
  },
}
const gone = (action: KnownAction): KnownAction => ({
  ...action,
  availability: { kind: 'unavailable', reason: 'no-longer-offered' },
})

export const mergeListingCases: readonly MergeListingCase[] = [
  {
    name: 'the first listing becomes revision 1 with every action available',
    current: notAcquired,
    listing: first,
    basedOn: 'absent',
    expected: { ok: firstRecord },
  },
  {
    name: 'an empty first listing is acquired with zero actions',
    current: notAcquired,
    listing: empty,
    basedOn: 'absent',
    expected: { ok: record(1, empty, []) },
  },
  {
    name: 'an action no longer offered stays with its last lawful definition, unavailable',
    current: acquired,
    listing: writeGone,
    basedOn: revisionOf(1),
    expected: {
      ok: record(2, writeGone, [offered(writeGone, 0), gone(offered(first, 1))]),
    },
  },
  {
    name: 'an empty listing keeps every known action, unavailable',
    current: acquired,
    listing: empty,
    basedOn: revisionOf(1),
    expected: { ok: record(2, empty, [gone(offered(first, 0)), gone(offered(first, 1))]) },
  },
  {
    name: 'a changed definition replaces the last lawful definition and its digest',
    current: acquired,
    listing: writeChanged,
    basedOn: revisionOf(1),
    expected: { ok: record(2, writeChanged, [offered(writeChanged, 1), offered(writeChanged, 0)]) },
  },
  {
    name: 'an action unavailable for a connection reason is available again when offered',
    current: lost,
    listing: writeChanged,
    basedOn: revisionOf(2),
    expected: { ok: record(3, writeChanged, [offered(writeChanged, 1), offered(writeChanged, 0)]) },
  },
  {
    name: 'actions are kept sorted by name',
    current: notAcquired,
    listing: unordered,
    basedOn: 'absent',
    expected: { ok: record(1, unordered, [offered(unordered, 1), offered(unordered, 0)]) },
  },
  {
    name: 'a listing based on an older revision is refused',
    current: lost,
    listing: writeGone,
    basedOn: revisionOf(1),
    expected: { failure: 'stale-revision' },
  },
  {
    name: 'a listing based on absent is refused once a catalog is acquired',
    current: acquired,
    listing: writeGone,
    basedOn: 'absent',
    expected: { failure: 'stale-revision' },
  },
  {
    name: 'a listing based on a revision is refused while nothing is acquired',
    current: notAcquired,
    listing: first,
    basedOn: revisionOf(1),
    expected: { failure: 'stale-revision' },
  },
]
