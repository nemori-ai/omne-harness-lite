import { canonical, same } from '../integration/parse.ts'
import { readCollaborationAuthority, recordAuthorityFor } from './collaboration-authority.ts'
import { recordComments, recordContext } from './collaboration-read.ts'
import type { RequestStateRecord, WaveIdentity } from './collaboration-records.ts'
import { registeredRequests, type RegisteredRequest } from './collaboration-requests.ts'
import { orderedRecords, type SequencedComment } from './collaboration-sequence.ts'
import { validateRecordAuthority } from './collaboration-trust.ts'
import { assertReduceStateTransition } from './reduce-integration-state.ts'
import { InputError } from './protocol.ts'
import { type ReduceWatchPorts } from './reduce-watch-materials.ts'

export type ReduceRequest = RegisteredRequest & {
  history: SequencedComment<RequestStateRecord>[]
  current: SequencedComment<RequestStateRecord> | undefined
}
export type ReduceReadPorts = Pick<ReduceWatchPorts, 'read' | 'authorityFor'>

export function readReduceQueue(ports: ReduceReadPorts, context: WaveIdentity) {
  const config = ports.authorityFor(context.reduceIssue)
  if (config.policy.repository !== context.repo) throw new InputError('reduce-repository-mismatch')
  const authority = readCollaborationAuthority({
    ...config,
    reduceIssue: context.reduceIssue,
    read: ports.read,
  })
  same(authority.scope.context, context, 'reduce-context-stale')
  const comments = recordComments(authority.snapshot).map(comment => {
    validateRecordAuthority(
      comment,
      recordAuthorityFor(authority, recordContext(comment.record)),
      ports.read,
    )
    return comment
  })
  const requests: ReduceRequest[] = registeredRequests(comments).map(request => {
    const history = orderedRecords(
      comments.flatMap(comment => {
        const record = comment.record
        if (record.kind !== 'state' || record.requestId !== request.input.requestId) return []
        if (
          record.lineParent !== request.input.lineParent ||
          record.requestHead !== (request.input.pull?.head ?? null)
        )
          throw new InputError('reduce-state-request-mismatch')
        same(record.context, request.input.context, 'reduce-state-context-mismatch')
        return [{ ...comment, record }]
      }),
    )
    for (const [index, item] of history.entries())
      assertReduceStateTransition(item.record, history[index - 1]?.record)
    return { ...request, history, current: history.at(-1) }
  })
  for (const comment of comments) {
    const record = comment.record
    if (
      record.kind === 'state' &&
      !requests.some(item => item.input.requestId === record.requestId)
    )
      throw new InputError('reduce-state-request-missing')
  }
  const current = requests.filter(item => canonical(item.input.context) === canonical(context))
  const byLine = new Map<number, ReduceRequest[]>()
  for (const request of current) {
    const group = byLine.get(request.input.lineParent) ?? []
    group.push(request)
    byLine.set(request.input.lineParent, group)
  }
  for (const group of byLine.values()) validateReplacementChain(group)
  const activeWrites = current.filter(
    item =>
      item.current?.record.state === 'claimed' || item.current?.record.state === 'integrating',
  )
  if (activeWrites.length > 1) throw new InputError('reduce-active-write-conflict')
  return { authority, requests: current, activeWrite: activeWrites[0] }
}

function validateReplacementChain(group: ReduceRequest[]): void {
  const children = new Set<string>()
  const roots = group.filter(item => item.input.previousRequestId === null)
  if (roots.length !== 1) throw new InputError('reduce-line-request-conflict')
  for (const request of group) {
    const previous = request.input.previousRequestId
    if (previous === null) continue
    if (children.has(previous)) throw new InputError('reduce-request-replacement-fork')
    children.add(previous)
    const parent = group.find(item => item.input.requestId === previous)
    const disposition = parent?.current?.record.disposition
    if (
      parent?.current?.record.state !== 'superseded' ||
      disposition?.action !== 'redispatch' ||
      disposition.newRequestId !== request.input.requestId
    )
      throw new InputError('reduce-request-replacement-not-authorized')
    same(disposition.assignment.tasks, request.input.tasks, 'reduce-request-replacement-tasks')
  }
  const visited = new Set<string>()
  let request = roots[0]
  while (request !== undefined) {
    if (visited.has(request.input.requestId))
      throw new InputError('reduce-request-replacement-cycle')
    visited.add(request.input.requestId)
    const parent = request.input.requestId
    request = group.find(item => item.input.previousRequestId === parent)
  }
  if (visited.size !== group.length) throw new InputError('reduce-request-replacement-disconnected')
}

/** Complete authority reconciliation precedes selection. A cursor never consumes business work. */
export function nextReduceRequest(
  ports: ReduceReadPorts,
  input: { context: WaveIdentity; owner: string; since?: number },
) {
  const queue = readReduceQueue(ports, input.context)
  if (queue.authority.binding.responsible !== input.owner)
    throw new InputError('reduce-owner-mismatch')
  if (
    input.since !== undefined &&
    input.since !== 0 &&
    !queue.authority.snapshot.comments.some(item => item.id === input.since)
  )
    throw new InputError('reduce-cursor-not-comment')
  const pending = queue.requests.filter(
    item => !['merged', 'superseded'].includes(item.current?.record.state ?? 'registered'),
  )
  const selected =
    pending.find(item => item.current === undefined) ??
    pending.find(item => item.current?.record.state !== 'blocked')
  return {
    status: selected === undefined ? (pending.length === 0 ? 'idle' : 'blocked') : 'ready',
    selected: selected ?? null,
    pending,
    activeWrite: queue.activeWrite?.input.requestId ?? null,
    cursor: Math.max(0, ...queue.authority.snapshot.comments.map(item => item.id)),
  }
}
