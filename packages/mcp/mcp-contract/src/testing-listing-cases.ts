// The exhaustive sample table of `mergeListing`. Each case gives the catalog state, a complete
// listing that carries the revision it is based on, and the result that the merge must give. The
// expected records are written out from the inputs; they are not computed by `mergeListing`.
import type { Outcome } from '@omne-harness/operation-result'
import type {
  ActionCatalogRecord,
  AdoptionBasis,
  CatalogState,
  ExpectedRevision,
  KnownAction,
  MergeRefusal,
} from './catalog.ts'
import { completeListing, type CompleteListing } from './listing.ts'
import { generationOf, jsonOf, protocolVersionOf, revisionOf } from './testing-values.ts'

export type MergeListingCase = Readonly<{
  name: string
  current: CatalogState
  listing: CompleteListing
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

function listingOf(
  generation: number,
  basedOn: ExpectedRevision,
  tools: readonly Readonly<Record<string, unknown>>[],
) {
  const listing = completeListing({
    basedOn,
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
const v1 = revisionOf(1)
const v2 = revisionOf(2)
const first = listingOf(1, 'absent', [{ name: 'read' }, { name: 'write', description: 'v1' }])
const firstRecord = record(1, first, [offered(first, 0), offered(first, 1)])
const acquired: CatalogState = { kind: 'acquired', record: firstRecord }
const writeGone = listingOf(2, v1, [{ name: 'read' }])
const writeChangedTools = [{ name: 'write', description: 'v2' }, { name: 'read' }]
const writeChanged = listingOf(2, v1, writeChangedTools)
const writeChangedAfterLoss = listingOf(3, v2, writeChangedTools)
const emptyFirst = listingOf(1, 'absent', [])
const empty = listingOf(2, v1, [])
const unordered = listingOf(1, 'absent', [{ name: 'zeta' }, { name: 'alpha' }])
const absentBased = listingOf(2, 'absent', [{ name: 'read' }])
const revisionBased = listingOf(1, v1, [{ name: 'read' }])
const lost: CatalogState = {
  kind: 'acquired',
  record: {
    ...firstRecord,
    revision: v2,
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
    expected: { ok: firstRecord },
  },
  {
    name: 'an empty first listing is acquired with zero actions',
    current: notAcquired,
    listing: emptyFirst,
    expected: { ok: record(1, emptyFirst, []) },
  },
  {
    name: 'an action no longer offered stays with its last lawful definition, unavailable',
    current: acquired,
    listing: writeGone,
    expected: {
      ok: record(2, writeGone, [offered(writeGone, 0), gone(offered(first, 1))]),
    },
  },
  {
    name: 'an empty listing keeps every known action, unavailable',
    current: acquired,
    listing: empty,
    expected: { ok: record(2, empty, [gone(offered(first, 0)), gone(offered(first, 1))]) },
  },
  {
    name: 'a changed definition replaces the last lawful definition and its digest',
    current: acquired,
    listing: writeChanged,
    expected: { ok: record(2, writeChanged, [offered(writeChanged, 1), offered(writeChanged, 0)]) },
  },
  {
    name: 'an action unavailable for a connection reason is available again when offered',
    current: lost,
    listing: writeChangedAfterLoss,
    expected: {
      ok: record(3, writeChangedAfterLoss, [
        offered(writeChangedAfterLoss, 1),
        offered(writeChangedAfterLoss, 0),
      ]),
    },
  },
  {
    name: 'actions are kept sorted by name',
    current: notAcquired,
    listing: unordered,
    expected: { ok: record(1, unordered, [offered(unordered, 1), offered(unordered, 0)]) },
  },
  {
    name: 'a listing based on an older revision is refused',
    current: lost,
    listing: writeGone,
    expected: { failure: 'stale-revision' },
  },
  {
    name: 'a listing based on absent is refused once a catalog is acquired',
    current: acquired,
    listing: absentBased,
    expected: { failure: 'stale-revision' },
  },
  {
    name: 'a listing based on a revision is refused while nothing is acquired',
    current: notAcquired,
    listing: revisionBased,
    expected: { failure: 'stale-revision' },
  },
]
