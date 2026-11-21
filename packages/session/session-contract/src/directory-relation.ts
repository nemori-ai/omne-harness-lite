import type { SessionId } from './identity.ts'

export const RELATIONS_TO_REFERENCE = [
  'self',
  'parent',
  'child',
  'sibling',
  'upper',
  'lower',
  'rest',
  'handed-off',
  'handed-from',
  'unrelated',
] as const
/** What a session of the directory is to the session a reader names as its reference. */
export type RelationToReference = (typeof RELATIONS_TO_REFERENCE)[number]

/** The columns of one directory row that place a session: fixed when the session is created. */
export type DirectoryStanding = Readonly<{
  session: SessionId
  parent: SessionId | null
  origin: SessionId | null
  root: SessionId
  depth: number
}>

function inTree(row: DirectoryStanding, reference: DirectoryStanding): RelationToReference {
  if (row.depth < reference.depth) return 'upper'
  return row.depth > reference.depth ? 'lower' : 'rest'
}

/** Exactly one of the ten values, from the two rows alone: the first that holds, in this order. */
export function relationToReference(
  row: DirectoryStanding,
  reference: DirectoryStanding,
): RelationToReference {
  if (row.session === reference.session) return 'self'
  if (row.session === reference.parent) return 'parent'
  if (row.parent === reference.session) return 'child'
  if (row.parent !== null && row.parent === reference.parent) return 'sibling'
  if (row.root === reference.root) return inTree(row, reference)
  if (row.origin === reference.session) return 'handed-off'
  return row.session === reference.origin ? 'handed-from' : 'unrelated'
}
