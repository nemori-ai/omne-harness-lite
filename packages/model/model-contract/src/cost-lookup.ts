// Where the after-the-fact lookup of one dispatch's cost stands. It is a view of the dispatch record:
// a sent and ended dispatch without a known cost and with the upstream's request id is looked up
// until the cost is found or the lookup gave up; an unknown cost never becomes zero.
import type { DispatchRecord } from './call-surface.ts'

export type CostLookupState = 'not-needed' | 'pending' | 'found' | 'not-found' | 'no-request-id'

export function costLookupOf(record: DispatchRecord): CostLookupState {
  if (record.send !== 'started' && record.send !== 'unknown') return 'not-needed'
  if (record.terminal === null) return 'not-needed'
  const known = record.account?.cost.some(item => item.state === 'known') ?? false
  if (known) return record.account?.receipt === 'late' ? 'found' : 'not-needed'
  if (record.request === undefined) return 'no-request-id'
  return record.lookup?.exhausted === true ? 'not-found' : 'pending'
}
