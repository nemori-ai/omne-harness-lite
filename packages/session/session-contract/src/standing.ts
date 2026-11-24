import { completeEvidence, invalid, originOf, rejected, sourceOf } from './decision-support.ts'
import { encodeEntry } from './entries.ts'
import { judgeForkPoint, type ForkFacts } from './fork.ts'
import type { SessionId, SessionOperationId } from './identity.ts'
import type { Decision, EncodedEntry } from './judgments.ts'
import { digestOf } from './operations.ts'
import type { Attendance, Relation, SessionCreation, SessionTree, WorkSnapshot } from './values.ts'

export const MAX_SESSION_DEPTH = 2

export type RelatedSession = Readonly<{
  session: SessionId
  lifecycle: WorkSnapshot['lifecycle']
  tree: SessionTree
}>

type Standing = Readonly<{ relation: Relation; attendance: Attendance; tree: SessionTree }>

const MAIN: Relation = { kind: 'main' }

export function standingOf(
  snapshot: Pick<WorkSnapshot, 'session' | 'relation' | 'attendance' | 'tree'>,
): Standing {
  return {
    relation: snapshot.relation ?? MAIN,
    attendance: snapshot.attendance ?? 'attended',
    tree: snapshot.tree ?? { root: snapshot.session, depth: 0 },
  }
}

export function relatedOf(snapshot: WorkSnapshot): RelatedSession {
  return {
    session: snapshot.session,
    lifecycle: snapshot.lifecycle,
    tree: standingOf(snapshot).tree,
  }
}

function judgeChild(
  session: SessionId,
  relation: Extract<Relation, { kind: 'child' }>,
  attendance: Attendance | undefined,
  parent: RelatedSession,
): Decision | Readonly<{ tree: SessionTree }> {
  if (relation.parent === session) return invalid('creation.relation.parent', 'self parenting')
  if (attendance !== 'unattended')
    return invalid('creation.attendance', 'a child session is unattended')
  if (parent.lifecycle === 'archived') return rejected({ kind: 'archived' })
  if (parent.lifecycle === 'frozen') return rejected({ kind: 'frozen', verdict: null })
  if (parent.tree.depth >= MAX_SESSION_DEPTH)
    return invalid('creation.relation', `the depth would exceed ${MAX_SESSION_DEPTH}`)
  return { tree: { root: parent.tree.root, depth: parent.tree.depth + 1 } }
}

function readOther(
  relation: Exclude<Relation, { kind: 'main' }>,
  related: RelatedSession | null | undefined,
): Decision | RelatedSession {
  const named = relation.kind === 'child' ? relation.parent : relation.origin
  if (related === null) return rejected({ kind: 'denied', action: 'create' })
  if (related === undefined || related.session !== named)
    return rejected({
      kind: 'unavailable',
      owner: '@omne-harness/session-contract',
      diagnostic: 'the other end of the relation was not read',
    })
  return related
}

/** Judges a create against the other end of its relation: null is no such session, absent is not read. */
export function judgeStanding(
  session: SessionId,
  creation: Pick<SessionCreation, 'relation' | 'attendance'>,
  related: RelatedSession | null | undefined,
): Decision | Readonly<{ tree: SessionTree | null }> {
  const { relation } = creation
  if (relation === undefined || relation.kind === 'main') return { tree: null }
  if (!completeEvidence(relation.basis))
    return invalid('creation.relation.basis', 'incomplete evidence')
  const other = readOther(relation, related)
  if ('kind' in other) return other
  return relation.kind === 'child'
    ? judgeChild(session, relation, creation.attendance, other)
    : { tree: null }
}

type Created = Readonly<{
  session: SessionId
  operation: SessionOperationId
  creation: SessionCreation
}>

export function relatedSessionOf(creation: Pick<SessionCreation, 'relation'>): SessionId | null {
  const relation = creation.relation ?? MAIN
  if (relation.kind === 'main') return null
  return relation.kind === 'child' ? relation.parent : relation.origin
}

export type ChildRecord = Readonly<{
  parent: SessionId
  operation: SessionOperationId
  entry: EncodedEntry
}>

/** What the parent log takes in the commit that creates a child, under a derived operation. */
export function childRecorded(created: Created): ChildRecord | null {
  const relation = created.creation.relation ?? MAIN
  if (relation.kind !== 'child') return null
  const elements = { kind: 'child-recorded', child: created.session, create: created.operation }
  return {
    parent: relation.parent,
    operation: `sop_${digestOf(elements)}` as SessionOperationId,
    entry: encodeEntry(
      { kind: 'session.child-recorded', child: created.session, basis: relation.basis },
      originOf(sourceOf(created.operation, 'child-recorded')),
    ),
  }
}

/** The other end as a recorded create saw it: the parent of a child stood one layer above it. */
export function relatedAsRecorded(
  creation: Pick<SessionCreation, 'relation'>,
  tree: SessionTree | undefined,
): Readonly<{ related?: RelatedSession }> {
  const session = relatedSessionOf(creation)
  if (session === null) return {}
  const stood =
    tree === undefined ? { root: session, depth: 0 } : { root: tree.root, depth: tree.depth - 1 }
  return { related: { session, lifecycle: 'dormant', tree: stood } }
}

/** A fork is of a child from its parent, at a point the parent shows as a request boundary. */
export function judgeFork(
  creation: Pick<SessionCreation, 'fork' | 'relation'>,
  facts: ForkFacts | undefined,
): Decision | null {
  const { fork, relation } = creation
  if (fork === undefined) return null
  if (relation?.kind !== 'child' || relation.parent !== fork.source)
    return invalid('creation.fork.source', 'not the parent of the session')
  if (facts === undefined)
    return rejected({
      kind: 'unavailable',
      owner: '@omne-harness/session-contract',
      diagnostic: 'the source of the fork was not read',
    })
  const judged = judgeForkPoint(fork.point, facts)
  return judged === 'boundary' ? null : invalid('creation.fork.point', judged)
}

/** The source as a recorded create saw it: its point stood before an assistant message. */
export function forkAsRecorded(
  creation: Pick<SessionCreation, 'fork'>,
): Readonly<{ fork?: ForkFacts }> {
  const point = creation.fork?.point
  if (point === undefined) return {}
  const seen = { rows: point.upper, next: 'assistant', current: true, running: true } as const
  return { fork: { ...seen, floor: point.position, tail: point.position } }
}
