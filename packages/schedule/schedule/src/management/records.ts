import type { ScheduleAuthor, ScheduleView } from '@omne-harness/schedule-contract'
import type {
  ManagementDecisionInput,
  ManagementDecision,
  ManagementMutation,
  QuotaEffect,
  QuotaHolding,
  RevisionRecord,
  ScheduleRecord,
} from './types.ts'
import { createScheduleDefinitionRef, createScheduleRecordRef } from './references.ts'

export function authorRef(author: ScheduleAuthor): string {
  return author.kind === 'system' ? author.principalRef : author.actorRef
}

export function createManagementRecord(
  input: ManagementDecisionInput,
  view: ScheduleView,
  quota: QuotaHolding,
): ScheduleRecord {
  return {
    view,
    activationExclusive: view.control === 'draft' ? null : input.now,
    consentLock: input.access.consentLock,
    quota,
    adoptedBasis: input.definition.kind === 'resolved' ? input.definition.basis : null,
    definitionRef: createScheduleDefinitionRef(view),
  }
}

function revisionRecord(
  input: ManagementDecisionInput,
  before: ScheduleRecord | null,
  after: ScheduleRecord,
): RevisionRecord {
  const request = input.request
  const action = request.kind === 'create' ? 'create' : request.input.action
  const reason =
    request.kind === 'create'
      ? request.input.initial.kind === 'draft'
        ? request.input.initial.reason
        : null
      : 'reason' in request.input
        ? request.input.reason
        : null
  return {
    revision: after.view.revision,
    beforeRecordRef: before === null ? null : createScheduleRecordRef(before.view),
    afterRecordRef: createScheduleRecordRef(after.view),
    view: {
      scheduleId: after.view.scheduleId,
      stateRevision: after.view.stateRevision,
      definitionRevision: after.view.definitionRevision,
      actor: input.operation.scope.actor,
      action,
      occurredAt: input.now,
      reason,
      beforeDefinitionRef: before?.definitionRef ?? null,
      afterDefinitionRef: after.definitionRef,
      operationRef: input.operation.operationRef,
    },
  }
}

export function savedDecision(
  input: ManagementDecisionInput,
  mutation: ManagementMutation,
  quota: QuotaEffect,
): ManagementDecision {
  if (mutation.kind === 'noChange')
    return {
      kind: 'save',
      mutation,
      result: mutation.current.view,
      quota: { kind: 'none' },
      revisions: [],
      events: [],
    }
  const records =
    mutation.kind === 'replace' ? [mutation.predecessor, mutation.successor] : [mutation.next]
  return {
    kind: 'save',
    mutation,
    result: mutation.kind === 'replace' ? mutation.successor.view : mutation.next.view,
    quota,
    revisions: records.map(record =>
      revisionRecord(
        input,
        record.view.scheduleId === input.current?.view.scheduleId ? input.current : null,
        record,
      ),
    ),
    events: records.map(record => ({
      kind: 'scheduleManagementChanged',
      scheduleId: record.view.scheduleId,
      revision: record.view.revision,
      operationRef: input.operation.operationRef,
    })),
  }
}
