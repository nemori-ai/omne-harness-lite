import { createHash } from 'node:crypto'
import type { EntryId, SessionId, SessionRevision } from '@omne-harness/session-contract'
import type { DocId } from './index-port.ts'
import type { SearchQuery } from './query.ts'

/** Where the first page found a session of the index behind its log, and its last recorded time. */
export type FrozenCover = readonly [session: SessionId, through: SessionRevision, at: number]

/** The tail scan goes on in this session after this revision, past this entry of the next commit. */
export type TailPoint = Readonly<{
  session: SessionId
  through: SessionRevision
  at: number
  position: EntryId
}>

// Where a search goes on: bound to one query and one generation of the index. It keeps the covers
// the first page read, and later pages judge by them, whatever the index learned since.
export type SearchCursor = Readonly<{
  query: string
  generation: number
  frozen: readonly FrozenCover[]
  tail: TailPoint | null
  before: DocId | null
  last: Readonly<{ session: SessionId; position: EntryId }> | null
}>

/** One digest for one query: a cursor of another query does not continue this one. */
export function queryDigest(query: SearchQuery): string {
  const scope = query.scope.kind === 'tenant' ? null : [...query.scope.sessions].sort()
  const { content } = query
  const canonical = [
    scope,
    query.archived,
    query.from,
    query.to,
    [...query.kinds].sort(),
    query.modelReadable,
    [
      content.kind,
      content.kind === 'literals' ? content.all : content.pattern,
      content.caseSensitive,
    ],
  ]
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

const text = (value: unknown): value is string => typeof value === 'string' && value !== ''
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const digits = (value: unknown): value is string => text(value) && /^\d+$/u.test(value)

function point(value: unknown, key: 'through' | 'position'): boolean {
  const given = value as Record<string, unknown>
  return typeof given === 'object' && text(given['session']) && digits(given[key])
}

function tailPoint(value: unknown): boolean {
  const given = value as Record<string, unknown>
  return point(value, 'through') && count(given['at']) && digits(given['position'])
}

const cover = (item: unknown): boolean =>
  Array.isArray(item) && text(item[0]) && digits(item[1]) && count(item[2])
const orNull =
  (check: (value: unknown) => boolean) =>
  (value: unknown): boolean =>
    value === null || check(value)

const FIELDS: Readonly<Record<keyof SearchCursor, (value: unknown) => boolean>> = {
  query: text,
  generation: count,
  frozen: value => Array.isArray(value) && value.every(cover),
  tail: orNull(tailPoint),
  before: orNull(digits),
  last: orNull(value => point(value, 'position')),
}
const KEYS = Object.keys(FIELDS) as (keyof SearchCursor)[]

/** Reads a cursor that came back from outside. Null: not one this search wrote. */
export function parseCursor(value: unknown): SearchCursor | null {
  if (typeof value !== 'object' || value === null) return null
  const given = value as Record<string, unknown>
  if (!KEYS.every(key => FIELDS[key](given[key]))) return null
  return Object.fromEntries(KEYS.map(key => [key, given[key]])) as SearchCursor
}
