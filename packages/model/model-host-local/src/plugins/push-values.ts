import type { ModelFailure, ModelResultReceiver } from '@omne-harness/model-contract'

export function laterRevision(next: string, known: string): boolean {
  return BigInt(next) > BigInt(known)
}

export function definite(failure: ModelFailure): boolean {
  return failure.kind !== 'commit-unknown' && failure.kind !== 'unavailable'
}

/** The pause before the next try after `failures` in a row: the next delay of the table, then its last. */
export function delayAfter(delaysMs: readonly number[], failures: number): number {
  return delaysMs[Math.min(failures, delaysMs.length - 1)] ?? 0
}

/** Custody ended either way: acknowledged by a consumer, or abandoned after a refusal. */
export function custodyEnded(acknowledgement: string): boolean {
  return acknowledgement === 'acknowledged' || acknowledgement === 'abandoned'
}

type Held = Readonly<{ standing: Readonly<{ status: string; reason?: string }> }>

export type PushProgress = Readonly<{
  acknowledgement: string
  cleanup: string
  result: Held | null
  accounts: readonly Held[]
}>

export function due({ standing: { status } }: Held): boolean {
  return status === 'pending' || status === 'waiting' || status === 'unknown'
}

export function unfinished(record: PushProgress): boolean {
  return (
    !custodyEnded(record.acknowledgement) ||
    record.cleanup !== 'released' ||
    record.accounts.some(due)
  )
}

function retried({ standing }: Held): boolean {
  return (
    standing.status === 'pending' ||
    standing.status === 'unknown' ||
    (standing.status === 'waiting' && standing.reason !== 'no-receiver')
  )
}

export function workLeft(record: PushProgress): boolean {
  if (custodyEnded(record.acknowledgement))
    return record.cleanup !== 'released' || record.accounts.some(retried)
  const held = record.result
  return held !== null && (held.standing.status === 'saved' || retried(held))
}

type PushedRecord = Readonly<{
  origin: Readonly<{ consumer: Readonly<{ owner: string }> }> | null
  acknowledgement: string
}>

export function awaitsReceiver(
  record: PushedRecord | undefined,
  resolve: (owner: string) => ModelResultReceiver<unknown> | null,
): boolean {
  if (record?.origin === undefined || record.origin === null) return false
  return !custodyEnded(record.acknowledgement) && resolve(record.origin.consumer.owner) === null
}
