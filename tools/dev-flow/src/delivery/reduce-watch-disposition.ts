import { same } from '../integration/parse.ts'
import { recordAuthorityFor } from './collaboration-authority.ts'
import {
  readCompleteComments,
  readReferencedComment,
  recordComments,
  recordContext,
} from './collaboration-read.ts'
import { registeredRequests } from './collaboration-requests.ts'
import { orderedRecords } from './collaboration-sequence.ts'
import { validateRecordAuthority } from './collaboration-trust.ts'
import type { TaskReference, WaveIdentity } from './collaboration-records.ts'
import { InputError } from './protocol.ts'
import {
  referenceOf,
  verifyActiveAssignment,
  verifyMaterial,
  watchAuthority,
  type ReduceWatchPorts,
} from './reduce-watch-materials.ts'

export type DispositionTarget = { requestId: string; tasks: [TaskReference, ...TaskReference[]] }

export function readDisposition(
  ports: ReduceWatchPorts,
  context: WaveIdentity,
  parent: number,
  target: DispositionTarget,
) {
  const authority = watchAuthority(ports, context.repo, context.reduceIssue)
  same(authority.scope.context, context, 'watch-disposition-context-stale')
  const comments = recordComments(authority.snapshot).map(comment => {
    validateRecordAuthority(
      comment,
      recordAuthorityFor(authority, recordContext(comment.record)),
      ports.read,
    )
    return comment
  })
  const request = registeredRequests(comments).find(
    item => item.input.requestId === target.requestId && item.input.lineParent === parent,
  )
  if (request === undefined) throw new InputError('watch-request-not-registered')
  same(request.input.context, context, 'watch-request-context-stale')
  same(request.input.tasks, target.tasks, 'watch-request-attempt-stale')
  if (request.input.outcome === 'ready') throw new InputError('watch-ready-requires-wave')
  const states = comments.flatMap(comment =>
    comment.record.kind === 'state' &&
    comment.record.lineParent === parent &&
    comment.record.requestId === target.requestId
      ? [{ ...comment, record: comment.record }]
      : [],
  )
  const last = orderedRecords(states).at(-1)
  const disposition = last?.record.disposition
  if (last === undefined || disposition === null || disposition === undefined) return undefined
  if (last.record.requestHead !== (request.input.pull?.head ?? null))
    throw new InputError('watch-disposition-request-head')
  if (disposition.action === 'takeover') {
    if (
      disposition.waitReduceIssue !== context.reduceIssue ||
      !['claimed', 'integrating', 'blocked'].includes(last.record.state)
    )
      throw new InputError('watch-takeover-current-reduce-required')
    if (disposition.evidence.length === 0) throw new InputError('watch-takeover-evidence-missing')
    for (const evidence of disposition.evidence) verifyMaterial(ports, evidence)
  } else if (disposition.action === 'rescope') {
    if (last.record.state !== 'superseded') throw new InputError('watch-rescope-not-superseded')
    verifyMaterial(ports, disposition.authorization)
    for (const evidence of disposition.consumerImpact) verifyMaterial(ports, evidence)
  } else {
    if (last.record.state !== 'superseded') throw new InputError('watch-redispatch-not-superseded')
    for (const evidence of [
      disposition.oldWritersStopped,
      disposition.reduceWriteReleased,
      disposition.authorization,
    ])
      verifyMaterial(ports, evidence)
    const next = disposition.assignment
    if (
      next.tasks.some(task =>
        target.tasks.some(old => old.issue === task.issue && old.attempt === task.attempt),
      )
    )
      throw new InputError('watch-redispatch-old-attempt')
    verifyActiveAssignment(ports, next)
    const snapshot = readCompleteComments(context.repo, parent, ports.read)
    const deltas = recordComments(snapshot).flatMap(comment => {
      if (
        comment.record.kind !== 'delta' ||
        comment.record.lineParent !== parent ||
        comment.record.context.milestone !== context.milestone
      )
        return []
      const history = watchAuthority(ports, context.repo, comment.record.context.reduceIssue)
      validateRecordAuthority(
        comment,
        recordAuthorityFor(history, comment.record.context),
        ports.read,
      )
      return [{ ...comment, record: comment.record }]
    })
    const delta = orderedRecords(deltas).at(-1)
    if (
      delta === undefined ||
      delta.record.purpose !== 'redispatch' ||
      delta.record.newRequestId !== disposition.newRequestId
    )
      throw new InputError('watch-redispatch-delta-not-current')
    same(referenceOf(delta), disposition.delta, 'watch-redispatch-delta-reference')
    same(
      delta.record.continuation,
      { kind: 'active', assignment: next },
      'watch-redispatch-delta-assignment',
    )
    same(
      delta.body,
      readReferencedComment(context.repo, disposition.delta, ports.read).body,
      'watch-redispatch-delta-changed',
    )
    same(
      snapshot,
      readCompleteComments(context.repo, parent, ports.read),
      'watch-redispatch-history-changed',
    )
  }
  same(
    authority.snapshot,
    readCompleteComments(context.repo, context.reduceIssue, ports.read),
    'watch-disposition-changed',
  )
  return { disposition, reference: referenceOf(last), revision: last.record.revision }
}
