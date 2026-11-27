import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolDecision, ToolWaitContract } from './author-context.ts'
import type { AuthorWait, ToolCheckpointDeclaration } from './checkpointed-author.ts'
import type { ToolCommandDeclaration, ToolDefinition } from './definitions.ts'
import type { Access, Adoption } from './identity.ts'
import { judgeToolDefinition } from './judge-definition.ts'
import type { Reply, ToolRenderedResult } from './results.ts'

export const TOOL_ENTRY_SOURCES_POINT = 'tool.entry-sources'

export type ToolCapabilityIdentity = Readonly<{ category: string; name: string }>

export type ToolSourceEntry = Readonly<{
  capability: ToolCapabilityIdentity
  definition: ToolDefinition
  executor: Adoption
  availability:
    | Readonly<{ kind: 'available' }>
    | Readonly<{ kind: 'known-unavailable'; reason: string }>
}>

export type ToolSourceWithheld = Readonly<{ name: string; reason: string }>

export type ToolSourceListing = Readonly<{
  entries: readonly ToolSourceEntry[]
  withheld: readonly ToolSourceWithheld[]
}>

export type ToolSourceCall<P> = Access<P> &
  Readonly<{
    name: string
    command: string | null
    declared: ToolCommandDeclaration | null
    arguments: JsonValue
    invocation: string
    /** Whether a program made this call: only then does the answer carry a value for a program. */
    program: boolean
    signal: AbortSignal
  }>

/** A call of a checkpoint source stops here until its wait is answered; the shape a checkpointed author suspends with. */
export type ToolSourceSuspension = Readonly<{
  kind: 'suspended'
  state: Uint8Array
  wait: AuthorWait
  closedResult: string
}>

export type ToolSourceAnswer<B extends ContentBlock> = ToolRenderedResult<B> | ToolSourceSuspension

/** A call taken up again: the facts of the call without its arguments, which the checkpoint keeps. */
export type ToolSourceResume<P> = Omit<ToolSourceCall<P>, 'arguments'> &
  Readonly<{ checkpoint: Uint8Array; response: ToolDecision<unknown> }>

/** How the state of a suspended call is kept, and the waits it may suspend on: at least one. */
export type ToolSourceCheckpoint = Readonly<{
  declaration: ToolCheckpointDeclaration
  waits: readonly ToolWaitContract<unknown, 'ask'>[]
}>

/** A source that gives `checkpoint` and `resume` together may suspend; any other that suspends breaks its contract. */
export type ToolEntrySource<P, B extends ContentBlock> = Readonly<{
  prefix: string
  list(access: Access<P>): Reply<ToolSourceListing>
  select(access: Access<P>, name: string): ToolSourceEntry | undefined
  execute(call: ToolSourceCall<P>): Promise<ToolSourceAnswer<B>>
  checkpoint?: ToolSourceCheckpoint
  resume?(call: ToolSourceResume<P>): Promise<ToolSourceAnswer<B>>
}>

export function isToolSourceSuspension<B extends ContentBlock>(
  answer: ToolSourceAnswer<B>,
): answer is ToolSourceSuspension {
  return 'kind' in answer && answer.kind === 'suspended'
}

export type ToolSourceBreach = Readonly<{ name: string; reason: string }>

const PREFIX = /^[a-z][a-z0-9]*__$/

export function isToolSourcePrefix(prefix: string): boolean {
  return PREFIX.test(prefix)
}

function entryBreach(prefix: string, entry: ToolSourceEntry): string | undefined {
  const { definition } = entry
  if (typeof definition?.name !== 'string' || !definition.name.startsWith(prefix))
    return 'name-outside-prefix'
  if ('failure' in judgeToolDefinition(definition)) return 'definition'
  const returns =
    definition.kind === 'function'
      ? [definition.returns]
      : definition.commands.map(command => command.returns)
  if (returns.some(declared => declared.kind !== 'structured')) return 'returns-not-structured'
  if (
    definition.kind === 'commands' &&
    definition.commands.some(command => command.parameters.kind !== 'declared')
  )
    return 'executor-owned-parameters'
  if (entry.capability.category === '' || entry.capability.name === '') return 'capability'
  return undefined
}

export function judgeToolSourceListing(
  prefix: string,
  listing: ToolSourceListing,
): Outcome<ToolSourceListing, ToolSourceBreach> {
  if (!isToolSourcePrefix(prefix)) return fail({ name: prefix, reason: 'prefix' })
  const names = new Set<string>()
  for (const entry of listing.entries) {
    const name = entry.definition?.name ?? ''
    const breach = entryBreach(prefix, entry)
    if (breach !== undefined) return fail({ name, reason: breach })
    if (names.has(name)) return fail({ name, reason: 'duplicate-name' })
    names.add(name)
  }
  for (const { name } of listing.withheld) {
    if (!name.startsWith(prefix)) return fail({ name, reason: 'name-outside-prefix' })
    if (names.has(name)) return fail({ name, reason: 'duplicate-name' })
    names.add(name)
  }
  return succeed(listing)
}
