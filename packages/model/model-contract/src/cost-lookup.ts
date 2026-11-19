// Where the after-the-fact cost lookup of one dispatch stands, read off its record; an unknown cost
// is looked up until it is found or the lookup gave up, and never becomes zero.
import type { DispatchRecord } from './call-surface.ts'

export type CostLookupState = 'not-needed' | 'pending' | 'found' | 'not-found' | 'no-request-id'

/** A late account the consumer has not confirmed it saved, at its latest revision. */
export function accountUndelivered(record: DispatchRecord): boolean {
  const account = record.account
  if (account?.receipt !== 'late') return false
  return (
    record.lateDelivered === undefined || BigInt(record.lateDelivered) < BigInt(account.revision)
  )
}

export function costLookupOf(record: DispatchRecord): CostLookupState {
  if (record.send !== 'started' && record.send !== 'unknown') return 'not-needed'
  if (record.terminal === null) return 'not-needed'
  const known = record.account?.cost.some(item => item.state === 'known') ?? false
  if (known) return record.account?.receipt === 'late' ? 'found' : 'not-needed'
  if (record.request === undefined) return 'no-request-id'
  return record.lookup?.exhausted === true ? 'not-found' : 'pending'
}
