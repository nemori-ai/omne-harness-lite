import {
  composeBody,
  planBeat,
  planRetry,
  planStrong,
  redact,
  unitId,
  type BeatSlot,
  type DeliveryResult,
  type DeliveryUnit,
  type Destination,
  type DestinationRef,
  type Disclosure,
  type Instant,
  type RecipientRef,
  type RetryPlan,
  type RetryPolicy,
  type StandingItem,
  type UnitBody,
  type UnitKind,
} from '@omne-harness/notification-contract'
import { unitOf, type NotificationTxn, type StoredUnit } from '../txn.ts'
import { ensureRecipient, type RecipientDefaults } from './destinations.ts'

export type FormStrongCommand = Readonly<{
  destination: DestinationRef
  now: Instant
  minIntervalMs: number
  listLimit: number
  disclosure: Disclosure
  defaults: RecipientDefaults
}>

export type FormBeatCommand = Readonly<{
  destination: DestinationRef
  slot: BeatSlot
  now: Instant
  listLimit: number
  standingOpen: number | null
  defaults: RecipientDefaults
}>

export type FormResult =
  | Readonly<{ kind: 'formed'; unit: DeliveryUnit }>
  | Readonly<{ kind: 'recalled'; unit: DeliveryUnit }>
  | Readonly<{ kind: 'wait'; until: Instant }>
  | Readonly<{ kind: 'nothing' }>

const destinationOf = (txn: NotificationTxn, ref: DestinationRef): Destination | null =>
  txn.destinations(ref.recipient).find(destination => destination.id === ref.id) ?? null

/** The destination a unit is formed for, with the recipient and its builtin destination recorded. */
function target(
  txn: NotificationTxn,
  command: Readonly<{ destination: DestinationRef; defaults: RecipientDefaults }>,
): Destination | null {
  ensureRecipient(txn, command.destination.recipient, command.defaults)
  return destinationOf(txn, command.destination)
}

function insert(
  txn: NotificationTxn,
  destination: Destination,
  kind: UnitKind,
  key: string | number,
  body: UnitBody,
  members: DeliveryUnit['members'],
  now: Instant,
): StoredUnit {
  const ref = { recipient: destination.recipient, id: destination.id }
  const unit = { id: unitId(ref, kind, key), destination: ref, kind, members, body, formedAt: now }
  const stored: StoredUnit = { ...unit, attempts: 0, state: 'pending', dueAt: now, last: null }
  txn.putUnit(stored)
  return stored
}

/** Forms at most one strong unit of everything pending, and moves the cursor past its members. */
export function formStrongUnit(txn: NotificationTxn, command: FormStrongCommand): FormResult {
  const destination = target(txn, command)
  if (destination === null) return { kind: 'nothing' }
  const pending = txn.pendingStrong(destination.recipient, destination.strongCursor)
  const facts = { ...destination, channelPresent: true, minIntervalMs: command.minIntervalMs }
  const plan = planStrong(command.now, facts, pending)
  if (plan.kind !== 'form') return plan
  const body = redact(
    composeBody('strong', plan.members, command.listLimit, null),
    command.disclosure,
  )
  const strongUnits = destination.strongUnits + 1
  const members = plan.members.map(entry => entry.identity)
  const unit = insert(txn, destination, 'strong', strongUnits, body, members, command.now)
  txn.putDestination({
    ...destination,
    lastStrongAt: command.now,
    strongCursor: Math.max(...plan.members.map(entry => entry.sequence)),
    strongUnits,
  })
  return { kind: 'formed', unit: unitOf(unit) }
}

/** Forms the unit of one slot once. Nothing remindable: nothing is written. */
export function formBeatUnit(txn: NotificationTxn, command: FormBeatCommand): FormResult {
  const destination = target(txn, command)
  if (destination === null) return { kind: 'nothing' }
  const existing = txn.unit(unitId(command.destination, 'beat', command.slot.index))
  if (existing !== null) return { kind: 'recalled', unit: unitOf(existing) }
  const facts = { ...destination, channelPresent: true, minIntervalMs: 0 }
  const box = txn.unresolved(destination.recipient)
  const plan = planBeat(command.slot, facts, box, command.standingOpen)
  if (plan.kind !== 'form') return plan
  const body = composeBody('beat', plan.members, command.listLimit, plan.standingOpen)
  const members = plan.members.map(entry => entry.identity)
  const unit = insert(txn, destination, 'beat', command.slot.index, body, members, command.now)
  return { kind: 'formed', unit: unitOf(unit) }
}

export type RemindCommand = Readonly<{
  recipient: RecipientRef
  item: StandingItem
  defaults: RecipientDefaults
  now: Instant
}>

/** Reminds one recipient of one standing item once: the record and its units in one commit. */
export function remindStanding(
  txn: NotificationTxn,
  command: RemindCommand,
): readonly DeliveryUnit[] {
  const { recipient, item, now } = command
  if (txn.reminded(recipient, item.id)) return []
  ensureRecipient(txn, recipient, command.defaults)
  txn.insertReminder(recipient, item.id, now)
  return txn
    .destinations(recipient)
    .filter(destination => destination.enabled)
    .map(destination =>
      unitOf(insert(txn, destination, 'standing', item.id, { kind: 'standing', item }, [], now)),
    )
}

export type RecordCommand = Readonly<{
  unit: string
  result: DeliveryResult
  policy: RetryPolicy
  now: Instant
}>

export type RecordResult =
  | Readonly<{ kind: 'recorded'; plan: RetryPlan }>
  | Readonly<{ kind: 'settled-before' }>
  | Readonly<{ kind: 'not-found' }>

const STATE = { settled: 'delivered', retry: 'pending', stop: 'stopped' } as const

/** Records one delivery of a unit. A unit that is settled stays settled. */
export function recordDelivery(txn: NotificationTxn, command: RecordCommand): RecordResult {
  const unit = txn.unit(command.unit)
  if (unit === null) return { kind: 'not-found' }
  if (unit.state !== 'pending') return { kind: 'settled-before' }
  const attempts = unit.attempts + 1
  const plan = planRetry(attempts, command.result, command.policy, command.now)
  const dueAt = plan.kind === 'retry' ? plan.at : unit.dueAt
  txn.putUnit({ ...unit, attempts, state: STATE[plan.kind], dueAt, last: command.result })
  const destination = destinationOf(txn, unit.destination)
  if (destination !== null && plan.kind !== 'retry')
    txn.putDestination({ ...destination, blocked: plan.kind === 'stop' })
  return { kind: 'recorded', plan }
}
