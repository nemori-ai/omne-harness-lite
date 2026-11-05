// The Catalog (P02, P16) over the binding registry of this process. It lists only live
// contributions that the asking tenant may access (G7). A name that is absent and a name that only
// another tenant registered get the same answer, so the Catalog does not tell whether another
// tenant registered anything. Whether a tool is available to the consumer is judged by facts that
// a trusted source verified; the Catalog never takes them from the caller.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  Access,
  Adoption,
  SourceLayer,
  ToolAvailability,
  ToolCatalogSearchEntry,
  ToolCatalog,
  ToolConsumerProfile,
  ToolDefinition,
  ToolFailure,
  ToolUsage,
} from '@omne-harness/tool-contract'
import {
  evaluateToolAvailability,
  type AvailabilityFacts,
} from '@omne-harness/tool-contract/provider'
import type { ToolListing, ToolListingSource } from './bindings.ts'
import { catalogWindow, encodeCatalogCursor } from './catalog-cursor.ts'
import {
  byCodeUnits,
  catalogDigest,
  catalogDocument,
  createCatalogRanking,
  type LocalToolCatalogSearchConfiguration,
} from './catalog-ranking.ts'
import {
  readCatalogView,
  visibleCatalogListings,
  type LocalToolCatalogViewSource,
  type LocalToolCatalogView,
} from './catalog-view.ts'

/** The facts about one definition for one consumer that only a trusted source can give. */
export type ToolAvailabilityVerdict = Pick<
  AvailabilityFacts,
  'qualification' | 'dependencies' | 'inputCompatible' | 'outputCompatible' | 'attachmentsReadable'
>

/** Judges, for the asking tenant and consumer, the facts that availability depends on. */
export interface LocalToolAvailabilitySource<P> {
  judge(
    input: Access<P> &
      Readonly<{ definition: ToolDefinition; layer: SourceLayer; consumer: ToolConsumerProfile }>,
  ): Promise<Outcome<ToolAvailabilityVerdict, ToolFailure>>
}

export type LocalToolCatalogInput<P> = Readonly<{
  /** Absent (null) means every call answers `unavailable`. */
  registry: ToolListingSource<P> | null
  availability: LocalToolAvailabilitySource<P>
  view: LocalToolCatalogViewSource<P> | null
  search: LocalToolCatalogSearchConfiguration
}>

const DEPENDENCY = 'toolBindings'

/** The answer for an unknown name and for a name that the tenant may not see. */
const unknownTool = fail({ kind: 'invalid', field: 'name', reason: 'unknown-tool' } as const)

/** The listing a name resolves to: the lowest registration ordinal among the live, visible ones. */
function choose(listings: readonly ToolListing[], name: string): ToolListing | undefined {
  let chosen: ToolListing | undefined
  for (const listing of listings)
    if (
      listing.definition.name === name &&
      (chosen === undefined || BigInt(listing.entry.ordinal) < BigInt(chosen.entry.ordinal))
    )
      chosen = listing
  return chosen
}

const same = (left: Adoption, right: Adoption): boolean =>
  left.owner === right.owner &&
  left.name === right.name &&
  left.revision === right.revision &&
  left.digest === right.digest

/** The usage of a definition for a command that the caller may use: its own, or the command's. */
function usageOf(
  definition: ToolDefinition,
  command: string | null,
): Outcome<ToolUsage, ToolFailure> {
  if (definition.kind === 'function') {
    if (command !== null)
      return fail({ kind: 'invalid', field: 'command', reason: 'unknown-command' })
    return succeed({
      definition: definition.adoption,
      command: null,
      description: definition.description,
      parameters: definition.parameters,
      returns: definition.returns,
    } satisfies ToolUsage)
  }
  if (command === null)
    return fail({ kind: 'invalid', field: 'command', reason: 'command-required' })
  const found = definition.commands.find(candidate => candidate.name === command)
  if (found === undefined)
    return fail({ kind: 'invalid', field: 'command', reason: 'unknown-command' })
  // The usage text and protocol of an executor-owned command live with the executor, which the
  // Catalog does not hold. It does not make them up.
  if (found.parameters.kind !== 'declared')
    return fail({
      kind: 'unavailable',
      dependency: DEPENDENCY,
      diagnostic: 'the usage of an executor-owned command is not part of its definition',
    })
  return succeed({
    definition: definition.adoption,
    command: found.name,
    description: found.summary,
    parameters: found.parameters.value,
    returns: found.returns,
  } satisfies ToolUsage)
}

/** Builds the Catalog. */
export function createLocalToolCatalog<P>(input: LocalToolCatalogInput<P>): ToolCatalog<P> {
  const { registry, availability } = input
  const rank = createCatalogRanking(input.search)

  const listingsFor = (access: Access<P>, view: LocalToolCatalogView) => {
    if (registry === null)
      return fail({
        kind: 'unavailable',
        dependency: DEPENDENCY,
        diagnostic: 'the binding registry is absent',
      } as const)
    const read = registry.listings(access)
    if ('failure' in read)
      return fail({
        kind: 'unavailable',
        dependency: DEPENDENCY,
        diagnostic: read.failure.diagnostic,
      } as const)
    return succeed(visibleCatalogListings(read.ok, view))
  }

  const liveFor = async (access: Access<P>) => {
    const observed = await readCatalogView(input.view, access)
    if ('failure' in observed) return observed
    const listed = listingsFor(access, observed.ok.view)
    if ('failure' in listed) return listed
    return succeed({ ...observed.ok, entries: listed.ok, registryDigest: catalogDigest(listed.ok) })
  }

  const changed = (after: string | null) =>
    after === null
      ? fail({
          kind: 'unavailable',
          dependency: 'toolCatalogView',
          diagnostic: 'catalog snapshot changed; retry',
        } as const)
      : fail({ kind: 'invalid-cursor', reason: 'catalog-snapshot-changed' } as const)

  const stable = (
    current: Awaited<ReturnType<typeof readCatalogView<P>>>,
    observed: Readonly<{ digest: string; registryDigest: string }>,
    access: Access<P>,
    after: string | null = null,
  ) => {
    if ('failure' in current) return current
    if (current.ok.digest !== observed.digest) return changed(after)
    const listed = listingsFor(access, current.ok.view)
    if ('failure' in listed) return listed
    if (catalogDigest(listed.ok) !== observed.registryDigest) return changed(after)
    return succeed(undefined)
  }

  const judged = async (
    access: Access<P>,
    listing: ToolListing,
    consumer: ToolConsumerProfile,
  ): Promise<Outcome<ToolAvailability, ToolFailure>> => {
    const verdict = await availability.judge({
      principal: access.principal,
      tenant: access.tenant,
      definition: listing.definition,
      layer: listing.entry.key.layer,
      consumer,
    })
    if ('failure' in verdict) return verdict
    return succeed(
      evaluateToolAvailability({
        ...verdict.ok,
        definition: listing.definition,
        executor: listing.executor,
        layer: listing.entry.key.layer,
      }),
    )
  }

  const searchEntries = async (
    request: Parameters<ToolCatalog<P>['search']>[0],
    visible: ReturnType<typeof visibleCatalogListings>,
  ): Promise<Outcome<readonly ToolCatalogSearchEntry[], ToolFailure>> => {
    const listings = visible.map(entry => entry.listing)
    const names = [...new Set(listings.map(listing => listing.definition.name))].sort(byCodeUnits)
    const entries: ToolCatalogSearchEntry[] = []
    for (const name of names) {
      const listing = choose(listings, name)
      if (listing === undefined) continue
      if (request.invocation === 'programmatic' && listing.definition.programmable !== true)
        continue
      const one = await judged(request, listing, request.consumer)
      if ('failure' in one) return one
      if (request.invocation === 'programmatic' && one.ok.kind !== 'available') continue
      const resident = visible.find(entry => entry.listing === listing)?.resident ?? false
      entries.push({ ...one.ok, resident })
    }
    return succeed(entries)
  }

  return Object.freeze({
    inspect: async request => {
      const live = await liveFor(request)
      if ('failure' in live) return live
      const listing = choose(
        live.ok.entries.map(entry => entry.listing),
        request.name,
      )
      if (listing === undefined) return unknownTool
      const { definition } = listing
      if (
        request.command !== null &&
        (definition.kind !== 'commands' ||
          !definition.commands.some(command => command.name === request.command))
      )
        return fail({ kind: 'invalid', field: 'command', reason: 'unknown-command' })
      const answer = await judged(request, listing, request.consumer)
      const current = await readCatalogView(input.view, request)
      const checked = stable(current, live.ok, request)
      return 'failure' in checked ? checked : answer
    },

    usage: async request => {
      const live = await liveFor(request)
      if ('failure' in live) return live
      const listing = choose(
        live.ok.entries.map(entry => entry.listing),
        request.name,
      )
      if (listing === undefined || !same(listing.definition.adoption, request.adoption))
        return unknownTool
      const { definition } = listing
      const verdict = await availability.judge({
        principal: request.principal,
        tenant: request.tenant,
        definition,
        layer: listing.entry.key.layer,
        consumer: request.consumer,
      })
      const current = await readCatalogView(input.view, request)
      const checked = stable(current, live.ok, request)
      if ('failure' in checked) return checked
      if ('failure' in verdict) return verdict
      if (verdict.ok.qualification !== 'allowed') return fail({ kind: 'denied', action: 'usage' })
      return usageOf(definition, request.command)
    },

    search: async request => {
      const window = catalogWindow(request.limit, request.after)
      if ('failure' in window) return window
      const live = await liveFor(request)
      if ('failure' in live) return live
      const judgedEntries = await searchEntries(request, live.ok.entries)
      if ('failure' in judgedEntries) return judgedEntries
      const entries = judgedEntries.ok
      const ranked = rank(
        entries.map(entry => catalogDocument(entry.definition)),
        request.query,
      )
      const binding = catalogDigest({
        query: request.query.normalize('NFKC').trim(),
        view: live.ok.digest,
        registry: live.ok.registryDigest,
        corpus: ranked.key,
        entries,
        consumer: request.consumer,
        invocation: request.invocation,
      })
      if (
        window.ok !== null &&
        (window.ok.binding !== binding || window.ok.offset >= ranked.names.length)
      )
        return fail({ kind: 'invalid-cursor', reason: 'catalog-snapshot-changed' })
      const offset = window.ok?.offset ?? 0
      const pageNames = new Set(ranked.names.slice(offset, offset + request.limit))
      const byName = new Map(
        entries
          .filter(entry => pageNames.has(entry.definition.name))
          .map(entry => [entry.definition.name, entry]),
      )
      const page = ranked.names.slice(offset, offset + request.limit).flatMap(name => {
        const entry = byName.get(name)
        return entry === undefined ? [] : [entry]
      })
      const current = await readCatalogView(input.view, request)
      const checked = stable(current, live.ok, request, request.after)
      if ('failure' in checked) return checked
      return succeed({
        entries: Object.freeze(page),
        next:
          offset + page.length < ranked.names.length
            ? encodeCatalogCursor({ binding, offset: offset + page.length })
            : null,
      })
    },
  } satisfies ToolCatalog<P>)
}
