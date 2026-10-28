import { fields, choice, integer, string } from '../integration/parse.ts'
import { InputError } from './protocol.ts'
import type { Continuation, Disposition, WaveIdentity } from './collaboration-records.ts'
import {
  activeAssignment,
  evidenceList,
  parseContinuation,
  parseEvidence,
  parseReference,
  uuid,
} from './collaboration-values.ts'

export function parseDisposition(value: unknown): Disposition {
  const initial = fields(
    value,
    [
      'action',
      'remainingOwner',
      'waitReduceIssue',
      'evidence',
      'newRequestId',
      'assignment',
      'delta',
      'oldWritersStopped',
      'reduceWriteReleased',
      'authorization',
      'continuation',
      'consumerImpact',
    ],
    'disposition',
  )
  const action = choice(initial.action, ['takeover', 'redispatch', 'rescope'], 'disposition.action')
  const remainingOwner = string(initial.remainingOwner, 'remainingOwner')
  if (action === 'takeover') {
    const v = fields(
      value,
      ['action', 'remainingOwner', 'waitReduceIssue', 'evidence'],
      'disposition',
    )
    return {
      action,
      remainingOwner,
      waitReduceIssue: integer(v.waitReduceIssue, 'waitReduceIssue'),
      evidence: evidenceList(v.evidence),
    }
  }
  if (action === 'redispatch') {
    const v = fields(
      value,
      [
        'action',
        'remainingOwner',
        'newRequestId',
        'assignment',
        'delta',
        'oldWritersStopped',
        'reduceWriteReleased',
        'authorization',
      ],
      'disposition',
    )
    return {
      action,
      remainingOwner,
      newRequestId: uuid(v.newRequestId, 'newRequestId'),
      assignment: activeAssignment(v.assignment),
      delta: parseReference(v.delta),
      oldWritersStopped: parseEvidence(v.oldWritersStopped),
      reduceWriteReleased: parseEvidence(v.reduceWriteReleased),
      authorization: parseEvidence(v.authorization),
    }
  }
  const v = fields(
    value,
    ['action', 'remainingOwner', 'continuation', 'authorization', 'consumerImpact'],
    'disposition',
  )
  return {
    action,
    remainingOwner,
    continuation: parseContinuation(v.continuation),
    authorization: parseEvidence(v.authorization),
    consumerImpact: evidenceList(v.consumerImpact),
  }
}

export function sequence(revision: number, previousRecordId: number | null): void {
  if ((revision === 1) !== (previousRecordId === null))
    throw new InputError(
      'record-chain: first revision must have no predecessor; later revisions require one',
    )
}

export function successor(current: WaveIdentity, next: WaveIdentity): void {
  if (
    next.repo !== current.repo ||
    next.milestone !== current.milestone ||
    next.wave !== current.wave + 1 ||
    next.reduceIssue === current.reduceIssue ||
    next.planRevision < current.planRevision
  )
    throw new InputError('continuation: direct successor required')
}

export function continuationNext(continuation: Continuation): WaveIdentity | null {
  return continuation.kind === 'active'
    ? continuation.assignment.context
    : continuation.kind === 'idle'
      ? continuation.next
      : null
}

export function checkContinuation(
  current: WaveIdentity,
  lineParent: number,
  finalHead: string,
  continuation: Continuation,
): void {
  const next = continuationNext(continuation)
  if (next !== null) successor(current, next)
  if (
    continuation.kind === 'active' &&
    (continuation.assignment.lineParent !== lineParent ||
      continuation.assignment.finalHead !== finalHead)
  )
    throw new InputError('continuation: assignment line or baseline mismatch')
}
