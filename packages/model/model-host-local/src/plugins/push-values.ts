import type { ModelFailure, ModelResultReceiver } from '@omne-harness/model-contract'

/** Whether the decimal revision `next` comes after `known`. */
export function laterRevision(next: string, known: string): boolean {
  return BigInt(next) > BigInt(known)
}

/** A failure that leaves the write uncommitted for sure; anything else may have committed. */
export function definite(failure: ModelFailure): boolean {
  return failure.kind !== 'commit-unknown' && failure.kind !== 'unavailable'
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
  return record.acknowledgement !== 'acknowledged' && resolve(record.origin.consumer.owner) === null
}
