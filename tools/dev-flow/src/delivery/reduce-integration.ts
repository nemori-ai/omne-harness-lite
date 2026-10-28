import { readGateRun } from '../integration/gate-correlation.ts'
import { same } from '../integration/parse.ts'
import { commentDigest, encodeRecordComment } from './collaboration-comments.ts'
import { parseCollaborationRecord } from './collaboration-parse.ts'
import type { RequestStateRecord } from './collaboration-records.ts'
import { writeSequencedRecord } from './collaboration-write.ts'
import type { GhCommand } from './github-read.ts'
import { operationJournal } from './operation-journal.ts'
import { InputError } from './protocol.ts'
import { assertReduceOperationsSettled } from './reduce-integration-recovery.ts'
import { readCandidateFacts, verifyMergedFacts } from './reduce-integration-facts.ts'
import { withReduceLock } from './reduce-integration-lock.ts'
import { readReduceQueue, type ReduceRequest } from './reduce-integration-read.ts'
import { assertReduceStateTransition } from './reduce-integration-state.ts'
import { readDisposition, verifyDisposition } from './reduce-watch-disposition.ts'
import { verifyMaterial, type ReduceWatchPorts } from './reduce-watch-materials.ts'

export type ReduceIntegrationPorts = ReduceWatchPorts & {
  call: GhCommand
  gateWorkflowHead: string
  /** Validates the actual check report's subject and results; never creates acceptance. */
  verifyCandidateEvidence: (request: ReduceRequest, record: RequestStateRecord) => void
}
export type ReduceRecordInput = { record: unknown; journalRoot: string; checkpoint: string }

function stateRecord(value: unknown) {
  const record = parseCollaborationRecord(value)
  if (record.kind !== 'state') throw new InputError('reduce-state-required')
  return record
}

function assertWriter(ports: ReduceIntegrationPorts, record: RequestStateRecord) {
  const queue = readReduceQueue(ports, record.context)
  same(
    record.writer,
    {
      login: queue.authority.binding.responsible,
      epoch: queue.authority.scope.epoch,
      authorization: queue.authority.binding.dispatch,
    },
    'reduce-writer-epoch-mismatch',
  )
  if (queue.authority.snapshot.state !== 'open') throw new InputError('reduce-wave-closed')
  const request = queue.requests.find(item => item.input.requestId === record.requestId)
  if (request === undefined) throw new InputError('reduce-request-not-registered')
  if (
    record.lineParent !== request.input.lineParent ||
    record.requestHead !== (request.input.pull?.head ?? null)
  )
    throw new InputError('reduce-state-request-mismatch')
  return { queue, request }
}

function assertTransition(record: RequestStateRecord, request: ReduceRequest): void {
  const previous = request.current
  if (
    record.revision !== (previous?.record.revision ?? 0) + 1 ||
    record.previousRecordId !== (previous?.id ?? null)
  )
    throw new InputError('reduce-state-precondition-failed')
  assertReduceStateTransition(record, previous?.record)
}

function checkCandidate(
  ports: ReduceIntegrationPorts,
  input: ReduceRecordInput,
  record: RequestStateRecord,
  request: ReduceRequest,
) {
  for (const evidence of [...record.changes, ...record.verification])
    verifyMaterial(ports, evidence)
  if (record.state === 'merged')
    return verifyMergedFacts(
      ports.read,
      request.input,
      record,
      ports.gateWorkflowHead,
      input.checkpoint,
    )
  if (record.state !== 'integrating') return
  if (record.candidateHead === null || record.targetBase === null)
    throw new InputError('reduce-candidate-required')
  const facts = readCandidateFacts(ports.read, request.input)
  same(facts.head, record.candidateHead, 'reduce-external-head-conflict')
  same(facts.targetHead, record.targetBase, 'reduce-target-base-changed')
  if (facts.state !== 'open' || facts.merged) throw new InputError('reduce-candidate-pull-not-open')
  if (
    record.candidateHead !== (request.current?.record.candidateHead ?? request.input.pull?.head)
  ) {
    const prepared = operationJournal(input.journalRoot, record.operationId).read('candidate.json')
    if (prepared === undefined) throw new InputError('reduce-candidate-intent-missing')
    same(
      prepared,
      {
        requestId: record.requestId,
        previousRecordId: record.previousRecordId,
        candidateHead: record.candidateHead,
        targetBase: record.targetBase,
        writer: record.writer,
      },
      'reduce-candidate-intent-missing',
    )
  }
  if (record.workflow !== null) {
    if (record.verification.length === 0)
      throw new InputError('reduce-candidate-verification-missing')
    ports.verifyCandidateEvidence(request, record)
    if (request.input.pull === null) throw new InputError('reduce-pull-required')
    readGateRun(ports.read, {
      repo: record.context.repo,
      pull: request.input.pull.number,
      candidateHead: record.candidateHead,
      checkpoint: input.checkpoint,
      workflow: record.workflow,
      adoptedWorkflowHead: ports.gateWorkflowHead,
    })
  }
}

/** Called before the owner's push. This grants no extra scope and performs no Git mutation. */
export function prepareReduceCandidate(ports: ReduceIntegrationPorts, input: ReduceRecordInput) {
  const record = stateRecord(input.record)
  return withReduceLock(input.journalRoot, record.context, record.operationId, () => {
    const { queue, request } = assertWriter(ports, record)
    assertReduceOperationsSettled(
      input.journalRoot,
      record.context,
      record.operationId,
      queue.requests,
    )
    assertTransition(record, request)
    if (
      record.state !== 'integrating' ||
      queue.activeWrite?.input.requestId !== record.requestId ||
      record.candidateHead === null ||
      record.targetBase === null
    )
      throw new InputError('reduce-candidate-write-not-owned')
    const facts = readCandidateFacts(ports.read, request.input)
    same(
      facts.head,
      request.current?.record.candidateHead ?? request.input.pull?.head,
      'reduce-external-head-conflict',
    )
    same(facts.targetHead, record.targetBase, 'reduce-target-base-changed')
    const intent = {
      requestId: record.requestId,
      previousRecordId: record.previousRecordId,
      candidateHead: record.candidateHead,
      targetBase: record.targetBase,
      writer: record.writer,
    }
    const journal = operationJournal(input.journalRoot, record.operationId)
    const saved = journal.read('candidate.json')
    if (saved === undefined) journal.save('candidate.json', intent)
    else same(saved, intent, 'reduce-candidate-intent-conflict')
    return intent
  })
}

export function recordReduceRequest(ports: ReduceIntegrationPorts, input: ReduceRecordInput) {
  const record = stateRecord(input.record)
  return withReduceLock(input.journalRoot, record.context, record.operationId, () => {
    const journal = operationJournal(input.journalRoot, record.operationId)
    const body = encodeRecordComment(record)
    const intent = {
      repo: record.context.repo,
      issue: record.context.reduceIssue,
      operationId: record.operationId,
      body,
      sha256: commentDigest(body),
    }
    const saved = journal.read('intent.json')
    if (saved !== undefined) same(saved, intent, 'reduce-operation-intent-conflict')
    const { queue, request } = assertWriter(ports, record)
    assertReduceOperationsSettled(
      input.journalRoot,
      record.context,
      record.operationId,
      queue.requests,
    )
    const already = request.history.find(item => item.record.operationId === record.operationId)
    if (already !== undefined) same(already.record, record, 'reduce-operation-conflict')
    if (already === undefined && saved === undefined) {
      assertTransition(record, request)
      if (
        ['claimed', 'integrating', 'merged'].includes(record.state) &&
        queue.activeWrite !== undefined &&
        queue.activeWrite.input.requestId !== record.requestId
      )
        throw new InputError('reduce-active-write-conflict')
      checkCandidate(ports, input, record, request)
      if (record.disposition !== null)
        verifyDisposition(
          ports,
          record.context,
          record.lineParent,
          { requestId: record.requestId, tasks: request.input.tasks },
          record,
        )
    }
    const common = {
      record,
      call: ports.call,
      authority: (context: RequestStateRecord['context']) =>
        ports.authorityFor(context.reduceIssue),
    }
    const result =
      saved === undefined
        ? writeSequencedRecord({
            ...common,
            mode: 'publish',
            checkpoint: value => journal.save('intent.json', value),
          })
        : writeSequencedRecord({ ...common, mode: 'recover' })
    if (
      result.kind === 'confirmed' &&
      record.disposition !== null &&
      request.input.outcome !== 'ready'
    )
      readDisposition(ports, record.context, record.lineParent, {
        requestId: record.requestId,
        tasks: request.input.tasks,
      })
    return result
  })
}

export function claimReduceRequest(ports: ReduceIntegrationPorts, input: ReduceRecordInput) {
  const record = stateRecord(input.record)
  if (record.state !== 'claimed') throw new InputError('reduce-claim-state-required')
  return recordReduceRequest(ports, { ...input, record })
}
