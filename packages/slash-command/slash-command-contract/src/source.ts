import type { TenantId } from '@omne-harness/legal-identity'
import { fail, type Outcome, succeed } from '@omne-harness/operation-result'
import { type Catalog, type CommandEntry, fullName, isFullName, RESERVED_SPACE } from './names.ts'

export const ENTRY_SOURCES_POINT = 'slash-command.entry-sources'

/** Who asks, always named outright: the tenant, the subject and the session the list is for. */
export type Asker<P> = Readonly<{ principal: P; tenant: TenantId; session: string }>

/** Where a handed-over text came from: the entry's full name and the version that won when it was taken. */
export type Origin = Readonly<{ name: string; layer: string; version: string; digest: string }>

/** An entry named: its name in the source's space, what the person wrote after it, and the request that brought it. */
export type Naming = Readonly<{ name: string; args: string; request: string }>

/** A text to hand over, an operation of a protocol to do with these fields, or arguments the entry cannot take. */
export type Taken =
  | Readonly<{ kind: 'text'; text: string; origin: Origin }>
  | Readonly<{
      kind: 'operation'
      protocol: Readonly<{ name: string; major: number }>
      operation: string
      fields: Readonly<Record<string, unknown>>
    }>
  | Readonly<{ kind: 'invalid'; reason: string }>

export type Candidate = Readonly<{
  value: string
  title?: string
  current?: true
  unavailable?: string
}>

export type EntrySource<P> = Readonly<{
  name: string
  space: string
  list(
    asker: Asker<P>,
    signal: AbortSignal,
  ): Promise<Outcome<readonly CommandEntry[], 'unavailable'>>
  take(
    asker: Asker<P>,
    naming: Naming,
    signal: AbortSignal,
  ): Promise<Outcome<Taken, 'unavailable' | 'not-listed'>>
  candidates?(
    asker: Asker<P>,
    name: string,
    param: number,
    signal: AbortSignal,
  ): Promise<Outcome<readonly Candidate[], 'unavailable' | 'not-listed'>>
  watch?(tenant: TenantId, changed: () => void): () => void
}>

export type EntrySourceSlot<P> = Readonly<{ source: EntrySource<P>; official: boolean }>

/** The list a session can name now, and what went wrong while asking for it. */
export type CatalogRead = Readonly<{ catalog: Catalog; errors: readonly string[] }>

export type CommandCatalog<P> = Readonly<{
  read(asker: Asker<P>, signal?: AbortSignal): Promise<CatalogRead>
  take(
    asker: Asker<P>,
    naming: Naming,
    signal?: AbortSignal,
  ): Promise<Outcome<Taken, 'unavailable' | 'not-listed'>>
  candidates(
    asker: Asker<P>,
    full: string,
    param: number,
    signal?: AbortSignal,
  ): Promise<Outcome<readonly Candidate[], 'unavailable' | 'not-listed'>>
}>

export type ListingBreach = Readonly<{
  name: string
  reason: 'outside-space' | 'reserved-space' | 'bad-name' | 'duplicate'
}>

/** A listing counts only when every entry stands in the source's own namespace, the reserved one only for an official source. */
export function judgeListing(
  slot: Readonly<{ source: Readonly<{ space: string }>; official: boolean }>,
  entries: readonly CommandEntry[],
): Outcome<readonly CommandEntry[], ListingBreach> {
  const names = new Set<string>()
  for (const entry of entries) {
    const name = fullName(entry)
    if (entry.space !== slot.source.space) return fail({ name, reason: 'outside-space' })
    if (entry.space === RESERVED_SPACE && !slot.official)
      return fail({ name, reason: 'reserved-space' })
    if (!isFullName(name)) return fail({ name, reason: 'bad-name' })
    if (names.has(name)) return fail({ name, reason: 'duplicate' })
    names.add(name)
  }
  return succeed(entries)
}
