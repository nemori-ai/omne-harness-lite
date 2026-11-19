import { describe, expect, it } from 'vitest'
import { accountUndelivered, costLookupOf, type DispatchRecord } from '@omne-harness/model-contract'

type Account = NonNullable<DispatchRecord['account']>
const cost = (state: 'known' | 'unknown') =>
  state === 'known'
    ? { state, lexeme: '0.001', unit: 'openrouter-credit', source: 'billable' }
    : { state, unit: 'openrouter-credit', source: 'billable', reason: 'not-recorded' }
const account = (receipt: 'received' | 'late', known: boolean, revision = '1') =>
  ({ cost: [cost(known ? 'known' : 'unknown')], receipt, revision }) as unknown as Account
const FAILED = {
  kind: 'failed',
  fault: { cause: 'stream-lost', diagnostic: 'd', upstreamStatus: null },
} as unknown as DispatchRecord['terminal']

function record(over: Partial<DispatchRecord> = {}): DispatchRecord {
  return {
    send: 'started',
    terminal: FAILED,
    account: null,
    request: 'gen-1',
    ...over,
  } as DispatchRecord
}

describe('where the cost lookup of a dispatch stands', () => {
  it('reads each row of the table off the record', () => {
    const rows: readonly (readonly [string, DispatchRecord, string])[] = [
      ['never sent', record({ send: 'not-sent' }), 'not-needed'],
      ['only prepared', record({ send: 'prepared' }), 'not-needed'],
      ['not ended yet', record({ terminal: null }), 'not-needed'],
      ['cost came with the stream', record({ account: account('received', true) }), 'not-needed'],
      ['cost found later', record({ account: account('late', true) }), 'found'],
      ['no request id', (({ request: _request, ...rest }) => rest)(record()), 'no-request-id'],
      ['nothing asked yet', record(), 'pending'],
      ['send unknown', record({ send: 'unknown' }), 'pending'],
      ['an unknown cost stays pending', record({ account: account('received', false) }), 'pending'],
      ['missed, still asking', record({ lookup: { misses: 2, exhausted: false } }), 'pending'],
      ['gave up', record({ lookup: { misses: 3, exhausted: true } }), 'not-found'],
    ]
    for (const [name, given, state] of rows) expect(costLookupOf(given), name).toBe(state)
  })
})

describe('whether a late account still waits for its consumer', () => {
  it('waits only for a late account newer than the revision the consumer confirmed', () => {
    expect(accountUndelivered(record())).toBe(false)
    expect(accountUndelivered(record({ account: account('received', true) }))).toBe(false)
    expect(accountUndelivered(record({ account: account('late', true, '2') }))).toBe(true)
    const late = account('late', true, '3')
    expect(accountUndelivered(record({ account: late, lateDelivered: '2' }))).toBe(true)
    expect(accountUndelivered(record({ account: late, lateDelivered: '3' }))).toBe(false)
    expect(accountUndelivered(record({ account: late, lateDelivered: '10' }))).toBe(false)
  })
})
