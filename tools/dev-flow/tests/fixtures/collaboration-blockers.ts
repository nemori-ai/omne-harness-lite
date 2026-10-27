import { canonical, digest } from '../../src/integration/parse.ts'
import { commentDigest, encodeRecordComment } from '../../src/delivery/collaboration-comments.ts'
import type {
  ActiveAssignment,
  LineDeltaRecord,
  RequestRecord,
  RequestStateRecord,
} from '../../src/delivery/collaboration-records.ts'
import { assignment, context, delta, evidence, NEXT_UUID, request, state } from './collaboration.ts'

export function blockedRequest(): RequestRecord {
  const receipt = request()
  receipt.input = {
    ...receipt.input,
    outcome: 'blocked',
    pull: null,
    reason: 'Shared contract is not available in the dispatched baseline',
    remaining: ['Reduce must settle the shared contract and integration'],
    verification: [],
  }
  receipt.workflow.inputDigest = digest(canonical(receipt.input))
  return receipt
}

export function takeoverState(): RequestStateRecord {
  return {
    ...state(),
    state: 'blocked',
    requestHead: null,
    candidateHead: null,
    targetBase: null,
    mergeCommit: null,
    verification: [],
    workflow: null,
    reason: 'Reduce takes responsibility for the remaining work',
    disposition: {
      action: 'takeover',
      remainingOwner: 'owner',
      waitReduceIssue: context.reduceIssue,
      evidence: [{ ...evidence }],
    },
  }
}

export function rescopeState(): RequestStateRecord {
  return {
    ...takeoverState(),
    state: 'superseded',
    reason: 'Authorized scope change removes this line from later waves',
    disposition: {
      action: 'rescope',
      remainingOwner: 'owner',
      continuation: {
        kind: 'terminal',
        reason: 'No later work remains for this line under the revised scope',
        authorization: { ...evidence },
      },
      authorization: { ...evidence },
      consumerImpact: [{ ...evidence }],
    },
  }
}

export function redispatchScenario(): {
  original: RequestRecord
  disposition: RequestStateRecord
  delta: LineDeltaRecord
  retry: RequestRecord
} {
  const original = blockedRequest()
  const newAssignment: ActiveAssignment = {
    ...assignment(),
    context: { ...context, planRevision: 2 },
    tasks: [{ ...original.input.tasks[0], revision: 2, attempt: '11-r2-a2' }],
  }
  const newDelta: LineDeltaRecord = {
    ...delta(),
    purpose: 'redispatch',
    newRequestId: NEXT_UUID,
    integrationResults: [],
    continuation: { kind: 'active', assignment: newAssignment },
  }
  const disposition: RequestStateRecord = {
    ...takeoverState(),
    state: 'superseded',
    reason: 'New inputs and a new attempt explicitly authorize another execution',
    disposition: {
      action: 'redispatch',
      remainingOwner: 'line-owner',
      newRequestId: NEXT_UUID,
      assignment: newAssignment,
      delta: { issue: 10, commentId: 24, sha256: commentDigest(encodeRecordComment(newDelta)) },
      oldWritersStopped: { ...evidence },
      reduceWriteReleased: { ...evidence },
      authorization: { ...evidence },
    },
  }
  const retry = request()
  retry.input = {
    ...retry.input,
    context: { ...newAssignment.context },
    requestId: NEXT_UUID,
    previousRequestId: original.input.requestId,
    tasks: newAssignment.tasks,
  }
  retry.workflow.inputDigest = digest(canonical(retry.input))
  return { original, disposition, delta: newDelta, retry }
}
