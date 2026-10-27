import { canonical } from '../integration/parse.ts'
import type { RequestStateRecord } from './collaboration-records.ts'
import { InputError } from './protocol.ts'

const transitions: Record<RequestStateRecord['state'], readonly RequestStateRecord['state'][]> = {
  claimed: ['claimed', 'integrating', 'blocked', 'superseded'],
  integrating: ['integrating', 'merged', 'blocked', 'superseded'],
  merged: ['reverted'],
  blocked: ['blocked', 'claimed', 'superseded'],
  superseded: [],
  reverted: ['claimed', 'blocked', 'superseded'],
}

export function assertReduceStateTransition(
  record: RequestStateRecord,
  previous: RequestStateRecord | undefined,
): void {
  if (
    previous === undefined
      ? !['claimed', 'blocked'].includes(record.state)
      : !transitions[previous.state].includes(record.state)
  )
    throw new InputError('reduce-state-transition-forbidden')
  if (
    record.state === 'claimed' &&
    (record.candidateHead !== null ||
      record.targetBase !== null ||
      record.mergeCommit !== null ||
      record.workflow !== null)
  )
    throw new InputError('reduce-claim-has-unobserved-facts')
  if (
    record.state === 'superseded' &&
    !['redispatch', 'rescope'].includes(record.disposition?.action ?? '')
  )
    throw new InputError('reduce-superseded-disposition-required')
  if (record.state === 'merged') {
    if (
      previous?.candidateHead !== record.candidateHead ||
      previous.targetBase !== record.targetBase ||
      canonical(previous.workflow) !== canonical(record.workflow)
    )
      throw new InputError('reduce-merge-candidate-not-validated')
  } else if (record.mergeCommit !== null && record.state !== 'reverted') {
    throw new InputError('reduce-premature-merge-fact')
  }
}
