import type {
  ActionBatchId,
  ActionId,
  ActionSlot,
  PendingCall,
  CommandReceipt,
} from '@omne-harness/agent-contract'
import type { CallBinding } from '@omne-harness/session-contract'
import { resolveToolInvocationRef } from '@omne-harness/tool-contract'
import type { CommonRoot } from './root.ts'
import type { MemoryExecution } from './journal.ts'
import { registration } from './history.ts'
import { corrupt } from './history-failure.ts'
import { canonical } from './canonical.ts'
export type BackgroundFragment = Readonly<{
  receipt: CommandReceipt
  batch: ActionBatchId
  action: ActionId
  pending: Extract<PendingCall, { kind: 'tool'; association: 'associated' }>
  binding: CallBinding
  slot: Extract<ActionSlot, { kind: 'background' | 'result' }>
}>
const evidence = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  ['owner', 'record', 'revision', 'digest'].every(
    key =>
      key in value &&
      typeof value[key as keyof typeof value] === 'string' &&
      String(value[key as keyof typeof value]).length > 0,
  )
/** Captured only inside the authenticated original Agent commit, before the common publication. */
export function captureBackground(
  root: CommonRoot,
  execution: MemoryExecution,
  receipt: CommandReceipt,
): readonly BackgroundFragment[] {
  const batch = execution.checkpoint.batch
  if (!batch) return []
  return batch.slots.flatMap(slot => {
    if (slot.kind !== 'background' && slot.kind !== 'result') return []
    if (slot.kind === 'result' && slot.terminal.kind === 'no-response') return []
    const actions = batch.actions.filter(item => item.id === slot.action),
      pending = actions[0]?.call
    if (
      actions.length !== 1 ||
      !pending ||
      pending.action !== slot.action ||
      pending.kind !== 'tool' ||
      pending.association !== 'associated'
    )
      corrupt('background slot has no unique associated original Tool action')
    const action = actions[0]!
    if (
      action.judgment.kind !== 'allowed' ||
      (slot.kind === 'background' &&
        !action.judgment.request.availability.definition.backgroundAllowed) ||
      batch.barrier.kind !== 'open' ||
      !batch.barrier.approved.includes(action.id)
    )
      corrupt('background slot lacks its original approved Tool action')
    const result = slot.kind === 'background' ? slot.placeholder : slot.result,
      proof = slot.kind === 'background' ? slot.confirmation : slot.custody
    const reference = resolveToolInvocationRef(pending.reference, execution.tenant)
    if (
      'failure' in reference ||
      result.producer.kind !== 'tool' ||
      result.producer.call !== reference.ok.call
    )
      corrupt('background placeholder differs from original invocation')
    if (
      !result.version ||
      !evidence(result.source) ||
      !evidence(proof) ||
      (result.delivery !== null && !result.delivery)
    )
      corrupt('incomplete original background evidence')
    const value = registration(root, execution, pending)
    if (value.kind !== 'associated') corrupt('background has no original binding')
    const fragment = {
      receipt,
      batch: batch.id,
      action: slot.action,
      pending,
      binding: value.binding,
      slot,
    }
    const prior = root.agent.background.get(execution.id) ?? []
    return prior.some(
      item => canonical({ ...item, receipt: null }) === canonical({ ...fragment, receipt: null }),
    )
      ? []
      : [structuredClone(fragment)]
  })
}
