import type {
  AgentEvent,
  ControlRecord,
  ControlStage,
  AgentJournal,
} from '@omne-harness/agent-contract'
import {
  deriveDriveOperation,
  type ControlProgress,
  type SessionCallRegistration,
  type SessionLogConsequence,
  type ProducerRef,
} from '@omne-harness/session-contract'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { resolveToolInvocationRef, resolveToolOperationRef } from '@omne-harness/tool-contract'
import { canonical, rowData } from './session-values.ts'
import { corrupt, unavailable } from './history-failure.ts'
import type { CommonRoot } from './root.ts'
import type { MemoryExecution } from './journal.ts'
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b)
const reached = (record: ControlRecord, stage: ControlStage) =>
  record.stages[stage]?.state === 'reached'
function actualCall(root: CommonRoot, producer: ProducerRef): string {
  const tenant = root.session?.snapshot.tenant
  if (!tenant) unavailable('Session')
  const value =
    producer.kind === 'model'
      ? resolveModelInvocationRef(producer.call, tenant)
      : resolveToolInvocationRef(producer.call, tenant)
  if ('failure' in value) corrupt('original control producer reference')
  return value.ok.call
}
function originalRegistration(root: CommonRoot, id: string): SessionCallRegistration {
  const row = root.sources.rowsById.get(id)
  if (!row || row.kind !== 'call.bound') unavailable('original SE18')
  const value = rowData(row)
  if ('registration' in value) return value['registration'] as SessionCallRegistration
  return {
    kind: 'associated',
    binding: value['binding'],
    purpose: value['purpose'],
  } as SessionCallRegistration
}
function attemptOf(registration: SessionCallRegistration) {
  return registration.kind === 'tool-intent'
    ? registration.initiatingAttempt
    : registration.binding.initiatingAttempt
}
function covers(
  root: CommonRoot,
  execution: MemoryExecution,
  record: ControlRecord,
  registration: SessionCallRegistration,
): boolean {
  const attempt = attemptOf(registration),
    owner = attempt === null ? null : root.sources.attempts.get(attempt)?.execution
  if (attempt !== null && owner === undefined) unavailable('original responsibility attempt')
  if (record.command.kind === 'cancel') return owner === execution.id
  if (registration.kind !== 'associated') return false
  const producer = registration.binding.producer
  if (record.command.kind === 'interrupt-model')
    return producer.kind === 'model' && record.command.call === actualCall(root, producer)
  if (record.command.kind === 'interrupt-tool' || record.command.kind === 'background-tool') {
    const reference = resolveToolInvocationRef(record.toolInvocation, execution.tenant)
    if ('failure' in reference) corrupt('original Tool control reference')
    return (
      producer.kind === 'tool' &&
      reference.ok.call === record.command.call &&
      record.command.call === actualCall(root, producer) &&
      record.toolInvocation === producer.call
    )
  }
  return false
}
function directMatches(
  root: CommonRoot,
  execution: MemoryExecution,
  record: ControlRecord,
  progress: ControlProgress,
  originalExecution: string | null,
): boolean {
  if (
    record.operation !==
    deriveDriveOperation({ kind: 'control', execution: execution.id, control: progress.operation })
  )
    return false
  if (progress.intent.kind === 'interrupt') return false
  const intent = progress.intent.kind === 'control' ? progress.intent.value : null
  if (intent?.kind === 'unarchive') return false
  if (intent?.kind === 'stop-call')
    return (
      record.command.kind ===
        (intent.producer.kind === 'model' ? 'interrupt-model' : 'interrupt-tool') &&
      'call' in record.command &&
      record.command.call === actualCall(root, intent.producer)
    )
  if (intent?.kind === 'background-tool')
    return (
      record.command.kind === 'background-tool' &&
      record.command.call === actualCall(root, intent.producer)
    )
  return originalExecution === execution.id && record.command.kind === 'cancel'
}
export function normalizeControl(
  root: CommonRoot,
  execution: MemoryExecution,
  event: AgentEvent,
): readonly SessionLogConsequence[] {
  const records = root.agent.controls.get(`${execution.id}\0${event.sequence}`)
  if (!records) unavailable('original control event material')
  const original = root.agent.eventReceipts.get(`${execution.id}\0${event.sequence}`)
  if (!original || !same(original.evidence, event.cause))
    unavailable('control event original revision')
  return normalizeControls(root, execution, records, Number(original.revision))
}
export function normalizeControls(
  root: CommonRoot,
  execution: MemoryExecution,
  records: readonly ControlRecord[],
  through = execution.revision,
): readonly SessionLogConsequence[] {
  const state = root.session
  if (!state) unavailable('Session')
  for (const record of records) {
    const original = root.agent.originalByOperation.get(`${execution.id}\0${record.operation}`)
    if (!original || original.method !== 'control') unavailable('original control command')
    if (record.toolOperation !== undefined && record.toolOperation !== null) {
      const operation = resolveToolOperationRef(record.toolOperation, execution.tenant),
        invocation = resolveToolInvocationRef(record.toolInvocation, execution.tenant)
      if (
        'failure' in operation ||
        'failure' in invocation ||
        operation.ok.call !== invocation.ok.call ||
        operation.ok.admission !== invocation.ok.admission
      )
        corrupt('Tool operation does not belong to original invocation')
    }
    if (
      !same(
        (original.input as Parameters<AgentJournal<unknown>['control']>[0]).command,
        record.command,
      )
    )
      corrupt('control record differs from original command')
  }
  const consequences: SessionLogConsequence[] = []
  for (const current of state.snapshot.controls) {
    if (current.state === 'reconciled') continue
    const original = root.sources.controls.get(current.operation)
    if (!original) unavailable('original SE24')
    const references = state.snapshot.workEntryIndex?.controls.find(
      item => item.operation === current.operation,
    )
    if (!references) unavailable('original control responsibility references')
    const selected = references.selected.map(item => {
      const registration = originalRegistration(root, item.registered)
      const live = state.snapshot.callRegistrations?.find(
        record => record.consumption === item.consumption,
      )?.registration
      if (!live) unavailable('current original call registration')
      return {
        item,
        registration,
        live,
        released: records.some(
          record => reached(record, 'duty-released') && covers(root, execution, record, live),
        ),
      }
    })
    if (
      original.execution !== execution.id &&
      !selected.some(
        item =>
          attemptOf(item.live) !== null &&
          root.sources.attempts.get(attemptOf(item.live)!)?.execution === execution.id,
      ) &&
      !records.some(record => directMatches(root, execution, record, current, original.execution))
    )
      continue
    const pendingUnassociatedWaiting = (current.pendingUnassociatedWaiting ?? []).filter(wait => {
      const source = selected.find(
        item => item.item.consumption === wait.consumption && item.item.position === wait.position,
      )
      if (!source) corrupt('control wait outside original selected responsibilities')
      return !source.released
    })
    const pending = current.pending.filter(producer => {
      const direct = original.progress.pending.some(item => same(item, producer))
      const registrations =
        state.snapshot.callRegistrations
          ?.filter(
            item =>
              item.registration.kind === 'associated' &&
              same(item.registration.binding.producer, producer),
          )
          .map(item => item.registration) ?? []
      if (direct && registrations.length === 0) unavailable('original direct producer registration')
      const confirmed =
        !direct ||
        registrations.every(registration =>
          records.some(record => {
            if (!covers(root, execution, record, registration)) return false
            if (
              current.intent.kind === 'control' &&
              current.intent.value.kind === 'background-tool'
            )
              return (
                record.command.kind === 'background-tool' &&
                directMatches(root, execution, record, current, original.execution) &&
                reached(record, 'intent-established') &&
                (root.agent.background.get(execution.id) ?? []).some(
                  fragment =>
                    Number(fragment.receipt.revision) <= through &&
                    fragment.slot.kind === 'background' &&
                    registration.kind === 'associated' &&
                    same(fragment.binding, registration.binding),
                )
              )
            if (
              record.command.kind === 'background-tool' ||
              !directMatches(root, execution, record, current, original.execution)
            )
              return false
            const command = root.agent.originalByOperation.get(
              `${execution.id}\0${record.operation}`,
            )
            const completed =
              registration.kind === 'associated' &&
              (root.agent.background.get(execution.id) ?? []).some(
                fragment =>
                  fragment.slot.kind === 'result' &&
                  Number(fragment.receipt.revision) <= through &&
                  command !== undefined &&
                  Number(fragment.receipt.revision) < Number(command.receipt.revision) &&
                  same(fragment.binding, registration.binding),
              )
            const modelCompleted =
              registration.kind === 'associated' &&
              (root.agent.modelSettlements.get(execution.id) ?? []).some(
                fragment =>
                  Number(fragment.receipt.revision) <= through &&
                  command !== undefined &&
                  Number(fragment.receipt.revision) < Number(command.receipt.revision) &&
                  same(fragment.binding, registration.binding),
              )
            return (
              reached(record, 'producer-confirmed') ||
              reached(record, 'physically-stopped') ||
              completed ||
              modelCompleted
            )
          }),
        )
      const duties = selected.filter(
        item => item.live.kind === 'associated' && same(item.live.binding.producer, producer),
      )
      return !confirmed || duties.some(item => !item.released)
    })
    const direct = records.find(record =>
      directMatches(root, execution, record, current, original.execution),
    )
    let intent = false,
      qualification = true
    if (current.intent.kind === 'interrupt') {
      const run = root.sources.runs.get(execution.id)
      if (run?.run === current.intent.run) {
        const input = current.intent.urgent,
          operation = deriveDriveOperation({
            kind: 'submit',
            execution: execution.id,
            input: input.input,
          })
        const accepted = root.agent.originalByOperation.get(`${execution.id}\0${operation}`)
        if (accepted?.method === 'submit') {
          const originalInput = accepted.input as Parameters<AgentJournal<unknown>['submit']>[0]
          if (
            String(originalInput.value.id) !== String(input.input) ||
            originalInput.value.priority !== 'urgent' ||
            !same(originalInput.value.content, input.message) ||
            !same(originalInput.value.source, input.origin)
          )
            corrupt('urgent original submission mismatch')
          intent = true
        }
      }
    } else if (current.intent.kind === 'control' && current.intent.value.kind === 'unarchive')
      intent = true
    else if (original.execution === null && current.target.kind === 'session') intent = true
    else intent = direct !== undefined && reached(direct, 'intent-established')
    if (direct?.command.kind === 'cancel') {
      const attempts = root.sources.attemptsByExecution.get(execution.id) ?? []
      qualification =
        reached(direct, 'qualification-revoked') &&
        attempts.length > 0 &&
        attempts.every(item => root.sources.releasedAttempts.has(item.attempt))
    } else if (
      original.execution !== null &&
      (current.intent.kind === 'auto-archive' ||
        (current.intent.kind === 'control' &&
          (current.intent.value.kind === 'cancel-run' || current.intent.value.kind === 'archive')))
    )
      qualification = false
    const reconciled =
      intent && qualification && pending.length === 0 && pendingUnassociatedWaiting.length === 0
    const progress: ControlProgress = {
      ...current,
      pending,
      pendingUnassociatedWaiting,
      state: reconciled ? 'reconciled' : current.state,
    }
    if (!same(progress, current)) consequences.push({ kind: 'control', progress })
  }
  return consequences.length ? consequences : [{ kind: 'observed' }]
}
