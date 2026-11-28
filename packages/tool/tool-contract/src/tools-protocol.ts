import type { ToolCatalog, ToolCatalogSearchEntry, ToolInspection, ToolUsage } from './authoring.ts'
import type { ToolAvailability } from './definitions.ts'
import type { ToolSourceWithheld } from './entry-source.ts'
import type { ToolInvocationRef } from './reference.ts'

export type SearchArguments = Pick<
  Parameters<ToolCatalog<unknown>['search']>[0],
  'query' | 'after' | 'limit'
> &
  /** `true`: only the tools a program can call now. */
  Readonly<{ programmable?: true }>
export type SearchPage = Readonly<{
  entries: readonly ToolCatalogSearchEntry[]
  withheld?: readonly ToolSourceWithheld[]
  next: string | null
}>
export type InspectArguments = Pick<ToolInspection<unknown>, 'name' | 'command'>
export type ToolUsageView =
  | (Extract<ToolAvailability, { kind: 'available' }> & Readonly<{ usage: ToolUsage | null }>)
  | (Extract<ToolAvailability, { kind: 'known-unavailable' }> & Readonly<{ usage: null }>)
export type ToolFixedReadArguments = Readonly<{
  kind: 'result' | 'attachment' | 'body'
  reference: string
  after: string | null
}>
export type ToolsReadArguments =
  | ToolFixedReadArguments
  | Readonly<{ kind: 'invocation'; reference: ToolInvocationRef; after: null }>
  | Readonly<{ kind: 'forwarding'; reference: ToolInvocationRef; after: null }>
