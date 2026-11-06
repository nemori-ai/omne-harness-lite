import type { RegisterRequest } from '@omne-harness/human-intervention'
import type { ActiveWait, InboxEntry, IndependentControl } from './independent-schema.ts'
import { digest, equal, operationKey } from './encoding.ts'

export type LegacyInboxItem = Readonly<{ sequence: string; key: string; entry: InboxEntry }>
function verifyActive(
  state: IndependentControl,
  active: ActiveWait | undefined,
  inboxCount: number,
) {
  if (inboxCount > 64 || (!active && (inboxCount || state.receipts.length)))
    throw new TypeError('Legacy inactive wait has custody')
  const registration = state.preparation.registration
  if (
    active &&
    (active.requestRef.tenantRef !== registration.operation.tenantRef ||
      active.requestRef.requestId !== `request-${operationKey(registration.operation)}` ||
      !equal(
        active.cardIds,
        registration.questions.map(item => item.cardId),
      ))
  )
    throw new TypeError('Legacy active registration mismatch')
}
function verifyInboxItem(registration: RegisterRequest, active: ActiveWait, item: LegacyInboxItem) {
  const { decision, wait, positionRef, adoptionRef } = item.entry
  if (
    !equal(decision.ref.card.request, active.requestRef) ||
    !active.cardIds.includes(decision.ref.card.cardId) ||
    !equal(wait, registration.origin.wait) ||
    positionRef !== registration.origin.positionRef ||
    adoptionRef !== registration.origin.adoptionRef ||
    decision.ref.submission.tenantRef !== registration.operation.tenantRef ||
    item.key !== digest(decision.ref)
  )
    throw new TypeError('Legacy inbox association mismatch')
}
function verifyInbox(
  state: IndependentControl,
  active: ActiveWait | undefined,
  inbox: readonly LegacyInboxItem[],
) {
  const cards = new Set<string>(),
    decisions = new Set<string>()
  for (const item of inbox) {
    if (!active) throw new TypeError('Legacy inactive wait has custody')
    verifyInboxItem(state.preparation.registration, active, item)
    const ref = item.entry.decision.ref
    if (cards.has(ref.card.cardId) || decisions.has(ref.decisionId))
      throw new TypeError('Legacy duplicate decision custody')
    cards.add(ref.card.cardId)
    decisions.add(ref.decisionId)
  }
}
function verifyCheckpoint(state: IndependentControl, active: ActiveWait | undefined) {
  const expected =
    state.lifecycle.kind === 'terminal'
      ? 'terminal'
      : active && state.receipts.length === active.cardIds.length
        ? 'resume-ready'
        : 'waiting'
  if (
    state.checkpoint !== expected ||
    (state.receiver.kind === 'unbound'
      ? state.receiver.generation !== '0'
      : state.receiver.generation === '0')
  )
    throw new TypeError('Legacy checkpoint or receiver mismatch')
}
export function verifyLegacyCustody(
  state: IndependentControl,
  active: ActiveWait | undefined,
  inbox: readonly LegacyInboxItem[],
) {
  verifyActive(state, active, inbox.length)
  verifyInbox(state, active, inbox)
  const received = new Set<string>(),
    wait = state.preparation.registration.origin.wait
  for (const receipt of state.receipts) {
    const item = inbox.find(item => equal(item.entry.decision.ref, receipt.decision))
    if (
      !item ||
      !equal(receipt.wait, wait) ||
      received.has(receipt.decision.card.cardId) ||
      BigInt(receipt.receiverGeneration) < 1n ||
      BigInt(receipt.receiverGeneration) > BigInt(state.receiver.generation)
    )
      throw new TypeError('Legacy receipt association mismatch')
    received.add(receipt.decision.card.cardId)
  }
  verifyCheckpoint(state, active)
  return received
}
