import { z } from 'zod'
import {
  calendarInfoSchema,
  calendarVersionInfoSchema,
  type CalendarId,
  type CalendarInfo,
} from '@omne-harness/calendar-contract'
import type {
  CalendarDirectoryEntry,
  CalendarPageRequest,
  CalendarRepository,
} from '../persistence.ts'
import type { CalendarCatalogEntry } from './ports.ts'
import { QueryAccess } from './access.ts'
import { QueryFailure, readValue } from './failure.ts'

export const catalogSchema = z
  .array(
    calendarInfoSchema.unwrap().pick({ calendarId: true, timezone: true, semanticBoundary: true }),
  )
  .max(100)
  .refine(
    items => new Set(items.map(item => item.calendarId)).size === items.length,
    'Catalog identities must be unique',
  )

export async function findCalendar(
  repository: CalendarRepository,
  catalog: readonly CalendarCatalogEntry[],
  calendarId: CalendarId,
) {
  const stored = readValue(await repository.getCalendar({ calendarId }))
  if (stored !== null) {
    if (stored.calendarId !== calendarId) throw new QueryFailure('provider_failure')
    return stored
  }
  const definition = catalog.find(item => item.calendarId === calendarId)
  if (!definition) throw new QueryFailure('not_found')
  return { ...definition, current: null }
}
type Directory = CalendarDirectoryEntry | (CalendarCatalogEntry & { readonly current: null })
export async function calendarInfo(
  repository: CalendarRepository,
  directory: Directory,
  page: CalendarPageRequest,
): Promise<CalendarInfo> {
  const { calendarId, timezone, semanticBoundary } = directory
  const publishedVersionId = directory.current?.versionId ?? null
  const publicationGeneration = directory.current?.publicationGeneration ?? 0
  const versions =
    publishedVersionId === null
      ? { items: [], nextCursor: null }
      : readValue(await repository.listVersions({ calendarId, ...page }))
  if (versions.items.length > page.limit) throw new QueryFailure('provider_failure')
  return calendarInfoSchema.parse({
    calendarId,
    timezone,
    semanticBoundary,
    publishedVersionId,
    publicationGeneration,
    supplyStanding: null,
    versions: {
      items: versions.items.map(version => {
        if (version.calendarId !== calendarId) throw new QueryFailure('provider_failure')
        return calendarVersionInfoSchema.parse({
          versionId: version.versionId,
          coverageStart: version.coverageStart,
          coverageEnd: version.coverageEnd,
          knowledgeAsOf: version.knowledgeAsOf,
          synthesizedAt: version.synthesizedAt,
          contentHash: version.contentHash,
          provenanceRefs: version.provenanceRefs,
          isPublished: version.versionId === publishedVersionId,
        })
      }),
      nextCursor: versions.nextCursor,
    },
  })
}
export function parseDirectoryCursor(
  after: string | null | undefined,
): { kind: 'repository'; after: string | null } | { kind: 'catalog'; offset: number } {
  if (after === undefined || after === null) return { kind: 'repository', after: null }
  if (after.startsWith('r:') && after.length > 2)
    return { kind: 'repository', after: after.slice(2) }
  if (/^c:(0|[1-9][0-9]*)$/.test(after)) {
    const offset = Number(after.slice(2))
    if (Number.isSafeInteger(offset) && offset <= 100) return { kind: 'catalog', offset }
  }
  throw new QueryFailure('invalid_input')
}
async function listPublished(
  repository: CalendarRepository,
  access: QueryAccess,
  page: CalendarPageRequest,
  hasCatalog: boolean,
) {
  const result = readValue(await repository.listCalendars(page))
  if (result.items.length > page.limit) throw new QueryFailure('provider_failure')
  const items: CalendarInfo[] = []
  for (const directory of result.items) {
    if (await access.allow(directory.calendarId))
      items.push(await calendarInfo(repository, directory, { after: null, limit: 20 }))
  }
  return {
    items,
    nextCursor: result.nextCursor === null ? (hasCatalog ? 'c:0' : null) : `r:${result.nextCursor}`,
  }
}
async function listUnpublished(
  repository: CalendarRepository,
  catalog: readonly CalendarCatalogEntry[],
  access: QueryAccess,
  offset: number,
  limit: number,
) {
  if (offset > catalog.length) throw new QueryFailure('invalid_input')
  const items: CalendarInfo[] = []
  const end = Math.min(offset + limit, catalog.length)
  for (const definition of catalog.slice(offset, end)) {
    if (!(await access.allow(definition.calendarId))) continue
    const stored = readValue(await repository.getCalendar({ calendarId: definition.calendarId }))
    if (stored === null)
      items.push(
        await calendarInfo(
          repository,
          { ...definition, current: null },
          { after: null, limit: 20 },
        ),
      )
  }
  return { items, nextCursor: end < catalog.length ? `c:${end}` : null }
}
export async function listDirectory(
  repository: CalendarRepository,
  catalog: readonly CalendarCatalogEntry[],
  access: QueryAccess,
  page: CalendarPageRequest,
) {
  const cursor = parseDirectoryCursor(page.after)
  return cursor.kind === 'repository'
    ? listPublished(
        repository,
        access,
        { after: cursor.after, limit: page.limit },
        catalog.length > 0,
      )
    : listUnpublished(repository, catalog, access, cursor.offset, page.limit)
}
