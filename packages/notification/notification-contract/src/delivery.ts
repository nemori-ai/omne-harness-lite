import type {
  BoxEntry,
  DeliveryResult,
  Destination,
  DestinationRef,
  Disclosure,
  RetryPlan,
  RetryPolicy,
  UnitBody,
  UnitEntry,
  UnitKind,
} from './delivery-model.ts'
import { recipientKey, type Instant } from './values.ts'

export type DestinationFacts = Pick<Destination, 'enabled' | 'minLevel' | 'lastStrongAt'> &
  Readonly<{ channelPresent: boolean; minIntervalMs: number }>

export type StrongPlan =
  | Readonly<{ kind: 'form'; members: readonly BoxEntry[] }>
  | Readonly<{ kind: 'wait'; until: Instant }>
  | Readonly<{ kind: 'nothing' }>

const plus = (instant: Instant, ms: number): Instant =>
  new Date(Date.parse(instant) + ms).toISOString() as Instant

const usable = (destination: DestinationFacts) => destination.enabled && destination.channelPresent

/** `pending`: unresolved strong notifications past the destination's cursor, in inbox order. */
export function planStrong(
  now: Instant,
  destination: DestinationFacts,
  pending: readonly BoxEntry[],
): StrongPlan {
  if (!usable(destination) || pending.length === 0) return { kind: 'nothing' }
  const { lastStrongAt, minIntervalMs } = destination
  const earliest = lastStrongAt === null ? now : plus(lastStrongAt, minIntervalMs)
  return now < earliest ? { kind: 'wait', until: earliest } : { kind: 'form', members: pending }
}

export type BeatSlot = Readonly<{ index: number; start: Instant }>

export function beatSlot(now: Instant, intervalMinutes: number): BeatSlot {
  const intervalMs = intervalMinutes * 60_000
  const index = Math.floor(Date.parse(now) / intervalMs)
  return { index, start: new Date(index * intervalMs).toISOString() as Instant }
}

/** A person is reminded of what it has not seen; an entrusted agent of what is not resolved. */
export function remindable(entry: BoxEntry): boolean {
  const { marks, recipient } = entry
  if (marks.resolved !== null || marks.supersededBy !== null) return false
  return recipient.kind === 'agent' || marks.seenAt === null
}

export type BeatPlan =
  | Readonly<{ kind: 'form'; members: readonly BoxEntry[]; standingOpen: number | null }>
  | Readonly<{ kind: 'nothing' }>

/** Only what was in the inbox when the slot started: a late wake-up does not pull the next beat forward. */
export function planBeat(
  slot: BeatSlot,
  destination: DestinationFacts,
  box: readonly BoxEntry[],
  standingOpen: number | null,
): BeatPlan {
  if (!usable(destination) || destination.minLevel !== 'weak') return { kind: 'nothing' }
  const members = box.filter(entry => remindable(entry) && entry.acceptedAt <= slot.start)
  if (members.length === 0 && (standingOpen ?? 0) === 0) return { kind: 'nothing' }
  return { kind: 'form', members, standingOpen }
}

const entryOf = ({ identity, source, type, title }: BoxEntry): UnitEntry => ({
  identity,
  source,
  type,
  title,
})

/** Mechanical: one strong notification in full, otherwise the count and the earliest few titles. */
export function composeBody(
  kind: Exclude<UnitKind, 'standing'>,
  members: readonly BoxEntry[],
  listLimit: number,
  standingOpen: number | null,
): UnitBody {
  const [only, ...rest] = members
  if (kind === 'strong' && only !== undefined && rest.length === 0) {
    const { body, locator, cause, external } = only
    return { kind: 'single', entry: { ...entryOf(only), body, locator, cause, external } }
  }
  const listed = [...members].sort((a, b) => a.sequence - b.sequence).slice(0, listLimit)
  return { kind: 'digest', count: members.length, listed: listed.map(entryOf), standingOpen }
}

export function planRetry(
  attempts: number,
  last: DeliveryResult,
  policy: RetryPolicy,
  now: Instant,
): RetryPlan {
  if (last.kind === 'delivered') return { kind: 'settled' }
  if (last.kind === 'failed' && !last.retryable) return { kind: 'stop' }
  if (attempts >= policy.maxAttempts) return { kind: 'stop' }
  const backoff = policy.backoffMs[Math.min(attempts, policy.backoffMs.length) - 1] ?? 0
  return { kind: 'retry', at: plus(now, backoff) }
}

/** What leaves the system: title and locator stay, the text is cut to what may be disclosed. */
export function redact(body: UnitBody, disclosure: Disclosure): UnitBody {
  if (body.kind !== 'single' || disclosure.kind === 'full') return body
  const text = disclosure.kind === 'excerpt' ? body.entry.body.slice(0, disclosure.length) : ''
  return { ...body, entry: { ...body.entry, body: text } }
}

export function unitId(destination: DestinationRef, kind: UnitKind, key: string | number): string {
  return JSON.stringify([recipientKey(destination.recipient), destination.id, kind, String(key)])
}
