import type { ModelFailure, ModelResultReceiver } from '@omne-harness/model-contract'

export function laterRevision(next: string, known: string): boolean {
  return BigInt(next) > BigInt(known)
}

export function definite(failure: ModelFailure): boolean {
  return failure.kind !== 'commit-unknown' && failure.kind !== 'unavailable'
}

export function pauseAfter(failures: number): number {
  if (failures === 0) return 1000
  return failures === 1 ? 5000 : 30000
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
    record.acknowledgement !== 'acknowledged' ||
    record.cleanup !== 'released' ||
    record.accounts.some(due)
  )
}

function retried({ standing }: Held): boolean {
  return (
    standing.status === 'pending' ||
    (standing.status === 'waiting' && standing.reason !== 'no-receiver')
  )
}

export function workLeft(record: PushProgress): boolean {
  if (record.acknowledgement === 'acknowledged')
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
  return record.acknowledgement !== 'acknowledged' && resolve(record.origin.consumer.owner) === null
}
