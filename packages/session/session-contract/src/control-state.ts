import { resolveControlScope } from './judgments.ts'
import { waitKey } from './call-state.ts'
import type { ControlProgress, WorkSnapshot } from './values.ts'
import { equalValue, invalidAt, nonempty, unavailableAt, unique } from './session-validation.ts'

type Draft = { -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K] }
export function validateControlIdentity(snapshot: WorkSnapshot, progress: ControlProgress): void {
  nonempty(progress.operation, 'control.operation')
  if (!['committed', 'propagating', 'reconciled'].includes(progress.state))
    invalidAt('control.state', 'unknown state')
  const original = snapshot.controls.find(item => item.operation === progress.operation)
  if (original === undefined) unavailableAt('control.original')
  if (
    !equalValue(original.target, progress.target) ||
    !equalValue(original.intent, progress.intent)
  )
    invalidAt('control', 'original target or intent changed')
  unique(progress.pending, item => `${item.kind}\0${item.call}`, 'control.pending')
  for (const producer of progress.pending) {
    if (producer.kind !== 'model' && producer.kind !== 'tool')
      invalidAt('control.pending', 'unknown producer')
    nonempty(producer.call, 'control.pending.call')
  }
  const next = progress.pendingUnassociatedWaiting ?? []
  unique(next, waitKey, 'control.pendingUnassociatedWaiting')
  for (const wait of next) {
    nonempty(wait.consumption, 'control.pendingUnassociatedWaiting.consumption')
    nonempty(wait.position, 'control.pendingUnassociatedWaiting.position')
  }
  if (progress.state === 'reconciled' && (progress.pending.length > 0 || next.length > 0))
    invalidAt('control.state', 'unsettled responsibilities cannot be reconciled')
}

export function validateControlProgress(snapshot: WorkSnapshot, progress: ControlProgress): void {
  validateControlIdentity(snapshot, progress)
  const original = snapshot.controls.find(item => item.operation === progress.operation)!
  if (progress.pending.some(item => !original.pending.some(prior => equalValue(item, prior))))
    invalidAt('control.pending', 'outside original responsibility')
  const prior = original.pendingUnassociatedWaiting ?? []
  if (prior.length > 0 && progress.pendingUnassociatedWaiting === undefined)
    unavailableAt('control.pendingUnassociatedWaiting')
  const next = progress.pendingUnassociatedWaiting ?? []
  if (next.some(item => !prior.some(old => equalValue(old, item))))
    invalidAt('control.pendingUnassociatedWaiting', 'outside original responsibility')
  if (original.state === 'reconciled' && progress.state !== 'reconciled')
    invalidAt('control.state', 'settled control cannot reopen')
}

export function requestControl(draft: Draft, progress: ControlProgress): void {
  nonempty(progress.operation, 'control.operation')
  if (draft.controls.some(item => item.operation === progress.operation))
    invalidAt('control.operation', 'duplicate control')
  const intent = progress.intent
  const value = intent.kind === 'control' ? intent.value : null
  const target =
    intent.kind === 'interrupt'
      ? { kind: 'run', run: intent.run }
      : value?.kind === 'cancel-run'
        ? { kind: 'run', run: value.run }
        : value?.kind === 'stop-call' || value?.kind === 'background-tool'
          ? { kind: 'producer', producer: value.producer }
          : { kind: 'session' }
  if (!equalValue(target, progress.target))
    invalidAt('control.target', 'does not match original intent')
  const scope = resolveControlScope(draft, progress.intent)
  if (
    scope.kind !== 'scope' ||
    !equalValue(scope.producers, progress.pending) ||
    !equalValue(scope.unassociatedWaiting ?? [], progress.pendingUnassociatedWaiting ?? [])
  )
    invalidAt('control.scope', 'does not preserve the original selected responsibilities')
  const removed = new Set((progress.pendingUnassociatedWaiting ?? []).map(waitKey))
  draft.callWaits = (draft.callWaits ?? []).filter(item => !removed.has(waitKey(item)))
  draft.waiting = draft.waiting.filter(
    item =>
      item.kind !== 'producer' ||
      !progress.pending.some(producer => equalValue(producer, item.binding.producer)),
  )
  draft.controls = [...draft.controls, progress]
}
