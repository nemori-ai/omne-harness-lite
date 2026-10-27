import { canonical } from '../integration/parse.ts'
import {
  recordAuthorityFor,
  type VerifiedCollaborationAuthority,
} from './collaboration-authority.ts'
import {
  readCompleteComments,
  readReferencedComment,
  recordComments,
  type RecordComment,
} from './collaboration-read.ts'
import { decodeRecordComment } from './collaboration-comments.ts'
import { verifyEvidence, type RequestEvidenceReader } from './integration-request-evidence.ts'
import type { RequestInput, RequestStateRecord } from './collaboration-records.ts'
import { registeredRequests, type RegisteredRequest } from './collaboration-requests.ts'
import { orderedRecords, type SequencedComment } from './collaboration-sequence.ts'
import { validateRecordAuthority, type VerifiedRecordComment } from './collaboration-trust.ts'
import type { GhRead } from './github-read.ts'
import { InputError } from './protocol.ts'

export type RequestHistory = {
  registered: RegisteredRequest[]
  incomplete: RecordComment[]
  states: SequencedComment<RequestStateRecord>[]
}

export function readRequestHistory(
  authority: VerifiedCollaborationAuthority,
  read: GhRead,
): RequestHistory {
  const context = authority.scope.context
  const snapshot = readCompleteComments(context.repo, context.reduceIssue, read)
  const verified: VerifiedRecordComment[] = [],
    incomplete: RecordComment[] = []
  const states: SequencedComment<RequestStateRecord>[] = []
  for (const comment of recordComments(snapshot)) {
    const record = comment.record
    if (record.kind !== 'request' && record.kind !== 'state') continue
    const recordContext = record.kind === 'request' ? record.input.context : record.context
    try {
      validateRecordAuthority(comment, recordAuthorityFor(authority, recordContext), read)
    } catch (error) {
      if (
        record.kind === 'request' &&
        error instanceof InputError &&
        [
          'collaboration-request-workflow-pending',
          'collaboration-request-workflow-failed',
        ].includes(error.message)
      ) {
        incomplete.push(comment)
        continue
      }
      throw error
    }
    verified.push(comment)
    if (record.kind === 'state') states.push({ ...comment, record })
  }
  if (
    canonical(snapshot) !== canonical(readCompleteComments(context.repo, context.reduceIssue, read))
  )
    throw new InputError('integration-request-history-changed')
  return { registered: registeredRequests(verified), incomplete, states }
}

export function existingRequest(
  input: RequestInput,
  history: RequestHistory,
): RegisteredRequest | undefined {
  const candidates = [
    ...history.registered.map(request => request.input),
    ...history.incomplete.flatMap(comment =>
      comment.record.kind === 'request' ? [comment.record.input] : [],
    ),
  ]
  for (const candidate of candidates) {
    if (candidate.requestId === input.requestId && canonical(candidate) !== canonical(input))
      throw new InputError('integration-request-identity-conflict')
  }
  return history.registered.find(request => request.input.requestId === input.requestId)
}

export function requireRequestSlot(input: RequestInput, history: RequestHistory): void {
  existingRequest(input, history)
  const other = history.registered.filter(
    request =>
      request.input.lineParent === input.lineParent &&
      request.input.context.wave === input.context.wave &&
      request.input.requestId !== input.requestId,
  )
  for (const request of other) {
    const final = orderedRecords(
      history.states.filter(item => item.record.requestId === request.input.requestId),
    ).at(-1)?.record
    if (final?.state !== 'superseded')
      throw new InputError('integration-request-line-already-active')
  }
  if (
    history.incomplete.some(
      comment =>
        comment.record.kind === 'request' && comment.record.input.lineParent === input.lineParent,
    )
  )
    throw new InputError('integration-request-earlier-registration-unknown')
  if (input.previousRequestId === null) {
    if (other.length > 0) throw new InputError('integration-request-replacement-link-missing')
    return
  }
  const previous = other.find(request => request.input.requestId === input.previousRequestId)
  const state = orderedRecords(
    history.states.filter(item => item.record.requestId === input.previousRequestId),
  ).at(-1)?.record
  const disposition = state?.disposition
  if (
    previous === undefined ||
    state?.state !== 'superseded' ||
    disposition?.action !== 'redispatch' ||
    disposition.newRequestId !== input.requestId ||
    canonical(disposition.assignment.context) !== canonical(input.context) ||
    disposition.assignment.lineParent !== input.lineParent ||
    canonical(disposition.assignment.tasks) !== canonical(input.tasks) ||
    input.tasks.some(task =>
      previous.input.tasks.some(old => old.issue === task.issue && old.attempt === task.attempt),
    )
  )
    throw new InputError('integration-request-redispatch-not-authorized')
}

export function verifyRedispatchReferences(
  input: RequestInput,
  history: RequestHistory,
  authority: VerifiedCollaborationAuthority,
  read: GhRead,
  evidence: RequestEvidenceReader,
): void {
  if (input.previousRequestId === null) return
  const state = orderedRecords(
    history.states.filter(item => item.record.requestId === input.previousRequestId),
  ).at(-1)?.record
  if (state?.disposition?.action !== 'redispatch')
    throw new InputError('integration-request-redispatch-not-authorized')
  const disposition = state.disposition
  const comment = readReferencedComment(input.context.repo, disposition.delta, read)
  const record = decodeRecordComment(comment.body)
  if (
    record?.kind !== 'delta' ||
    record.purpose !== 'redispatch' ||
    record.newRequestId !== input.requestId ||
    record.continuation.kind !== 'active' ||
    canonical(record.continuation.assignment) !== canonical(disposition.assignment)
  )
    throw new InputError('integration-request-redispatch-delta-mismatch')
  validateRecordAuthority(
    { ...comment, record },
    recordAuthorityFor(authority, record.context),
    read,
  )
  for (const item of [
    disposition.oldWritersStopped,
    disposition.reduceWriteReleased,
    disposition.authorization,
    ...disposition.assignment.inputs,
    ...disposition.assignment.acceptance,
  ])
    verifyEvidence(input.context.repo, item, evidence)
}
