import {
  relationToReference,
  type DirectoryStanding,
  type RelationToReference,
  type SessionId,
} from '@omne-harness/session-contract'
import type { SqlValue } from '@omne-harness/sql-contract/worker'
import { big, oneRow, text, type Executor, type Row } from './support.ts'

export const STANDING_COLUMN_NAMES = [
  'relation_kind',
  'parent',
  'origin',
  'root',
  'depth',
  'attendance',
  'definition',
] as const
export const STANDING_COLUMNS = STANDING_COLUMN_NAMES.join(', ')
const PLACE = 'session, parent, origin, root, depth'

export type Clause = readonly [string, readonly SqlValue[]]
export type StandingFilter = Readonly<{
  kind?: string
  parent?: string
  root?: string
  attendance?: string
  definition?: string
  toReference?: RelationToReference
}>
export type StandingQuery = Readonly<{ filter?: StandingFilter; reference?: string }>

const nullable = (cell: Row[string] | undefined): SessionId | null =>
  cell === null || cell === undefined ? null : (text(cell) as SessionId)

function placeOf(row: Row): DirectoryStanding {
  return {
    session: text(row['session']) as SessionId,
    parent: nullable(row['parent']),
    origin: nullable(row['origin']),
    root: text(row['root']) as SessionId,
    depth: Number(big(row['depth'])),
  }
}

/** The row of the reference in this tenant, or null: another tenant's session is not found here. */
export function referenceOf(port: Executor, tenant: string, session: string) {
  const row = oneRow(
    port,
    `SELECT ${PLACE} FROM sl_session_list WHERE tenant = ? AND session = ? LIMIT 1`,
    [tenant, session],
  )
  return row === undefined ? null : placeOf(row)
}

type Predicate = (reference: DirectoryStanding, p: string) => Clause

/** Each value as a predicate over the columns. An end the reference lacks is NULL: `=` then matches nothing. */
const TO_REFERENCE: Readonly<Record<RelationToReference, Predicate>> = {
  self: (ref, p) => [`${p}session = ?`, [ref.session]],
  parent: (ref, p) => [`${p}session = ?`, [ref.parent]],
  child: (ref, p) => [`${p}parent = ?`, [ref.session]],
  sibling: (ref, p) => [`${p}parent = ? AND ${p}session <> ?`, [ref.parent, ref.session]],
  upper: (ref, p) => [
    `${p}root = ? AND ${p}depth < ? AND ${p}session IS NOT ?`,
    [ref.root, BigInt(ref.depth), ref.parent],
  ],
  lower: (ref, p) => [
    `${p}root = ? AND ${p}depth > ? AND ${p}parent IS NOT ?`,
    [ref.root, BigInt(ref.depth), ref.session],
  ],
  rest: (ref, p) => [
    `${p}root = ? AND ${p}depth = ? AND ${p}session <> ? AND ${p}parent IS NOT ?`,
    [ref.root, BigInt(ref.depth), ref.session, ref.parent],
  ],
  'handed-off': (ref, p) => [`${p}root <> ? AND ${p}origin = ?`, [ref.root, ref.session]],
  'handed-from': (ref, p) => [`${p}root <> ? AND ${p}session = ?`, [ref.root, ref.origin]],
  unrelated: (ref, p) => [
    `${p}root <> ? AND ${p}origin IS NOT ? AND ${p}session IS NOT ?`,
    [ref.root, ref.session, ref.origin],
  ],
}

const EQUALS = [
  ['kind', 'relation_kind'],
  ['parent', 'parent'],
  ['root', 'root'],
  ['attendance', 'attendance'],
  ['definition', 'definition'],
] as const

/** The filter as WHERE clauses over the list columns, under a table alias when the query joins. */
export function standingClauses(
  filter: StandingFilter,
  reference: DirectoryStanding | null,
  alias = '',
): readonly Clause[] {
  const clauses: Clause[] = []
  for (const [key, column] of EQUALS) {
    const value = filter[key]
    if (value !== undefined) clauses.push([`${alias}${column} = ?`, [value]])
  }
  if (filter.toReference !== undefined && reference !== null)
    clauses.push(TO_REFERENCE[filter.toReference](reference, alias))
  return clauses
}

/** The standing members of one list item, with what the row is to the reference when one is named. */
export function standingOfRow(row: Row, reference: DirectoryStanding | null) {
  const place = placeOf(row)
  const kind = text(row['relation_kind'])
  return {
    relation:
      kind === 'child'
        ? { kind, parent: place.parent }
        : kind === 'handoff'
          ? { kind, origin: place.origin }
          : { kind: 'main' },
    root: place.root,
    depth: place.depth,
    attendance: text(row['attendance']),
    definition: text(row['definition']),
    toReference: reference === null ? null : relationToReference(place, reference),
  }
}
