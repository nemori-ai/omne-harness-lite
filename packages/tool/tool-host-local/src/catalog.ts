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

function encodeCursor(name: string): string {
  return Buffer.from(JSON.stringify([1, name]), 'utf8').toString('base64url')
}

function decodeCursor(text: string): string | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'))
    return Array.isArray(value) &&
      value.length === 2 &&
      value[0] === 1 &&
      typeof value[1] === 'string' &&
      encodeCursor(value[1]) === text
      ? value[1]
      : null
  } catch {
    return null
  }
}

function matches(definition: ToolDefinition, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  const texts =
    definition.kind === 'commands'
      ? [
          definition.name,
          definition.description,
          ...definition.commands.flatMap(c => [c.name, c.summary]),
        ]
      : [definition.name, definition.description]
  return texts.some(text => text.toLowerCase().includes(needle))
}

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

/** The page size and the name after which a search resumes (null: from the start). */
function searchWindow(
  limit: number,
  cursor: string | null,
): Outcome<string | null, ToolFailure | { kind: 'invalid-cursor'; reason: string }> {
  if (!Number.isSafeInteger(limit) || limit < 1)
    return fail({ kind: 'invalid', field: 'limit', reason: 'not-a-positive-integer' })
  if (cursor === null) return succeed(null)
  const after = decodeCursor(cursor)
  if (after === null) return fail({ kind: 'invalid-cursor', reason: 'not-a-catalog-cursor' })
  return succeed(after)
}

const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The listings a search may return, in name order: one per name, past the cursor, matching. */
function candidates(
  live: readonly ToolListing[],
  request: Readonly<{ query: string; invocation: string }>,
  after: string | null,
): ToolListing[] {
  const names = [...new Set(live.map(listing => listing.definition.name))].sort(byCodeUnits)
  const chosen: ToolListing[] = []
  for (const name of names) {
    const listing = choose(live, name)
    if (listing === undefined || (after !== null && name <= after)) continue
    if (!matches(listing.definition, request.query)) continue
    if (request.invocation === 'programmatic' && listing.definition.programmable !== true) continue
    chosen.push(listing)
  }
  return chosen
}

/** Builds the Catalog. */
export function createLocalToolCatalog<P>(input: LocalToolCatalogInput<P>): ToolCatalog<P> {
  const { registry, availability } = input

  const liveFor = (access: Access<P>) => {
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
    return succeed(read.ok.filter(listing => listing.entry.state === 'live'))
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

  return Object.freeze({
    inspect: async request => {
      const live = liveFor(request)
      if ('failure' in live) return live
      const listing = choose(live.ok, request.name)
      if (listing === undefined) return unknownTool
      const { definition } = listing
      if (
        request.command !== null &&
        (definition.kind !== 'commands' ||
          !definition.commands.some(command => command.name === request.command))
      )
        return fail({ kind: 'invalid', field: 'command', reason: 'unknown-command' })
      return judged(request, listing, request.consumer)
    },

    usage: async request => {
      const live = liveFor(request)
      if ('failure' in live) return live
      const listing = choose(live.ok, request.name)
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
      if ('failure' in verdict) return verdict
      if (verdict.ok.qualification !== 'allowed') return fail({ kind: 'denied', action: 'usage' })
      return usageOf(definition, request.command)
    },

    search: async request => {
      const window = searchWindow(request.limit, request.after)
      if ('failure' in window) return window
      const live = liveFor(request)
      if ('failure' in live) return live
      const chosen = candidates(live.ok, request, window.ok)
      const page = chosen.slice(0, request.limit)
      const entries: ToolAvailability[] = []
      for (const listing of page) {
        const one = await judged(request, listing, request.consumer)
        if ('failure' in one) return one
        entries.push(one.ok)
      }
      const last = page.at(-1)
      return succeed({
        entries: Object.freeze(entries),
        next:
          chosen.length > page.length && last !== undefined
            ? encodeCursor(last.definition.name)
            : null,
      })
    },
  } satisfies ToolCatalog<P>)
}
