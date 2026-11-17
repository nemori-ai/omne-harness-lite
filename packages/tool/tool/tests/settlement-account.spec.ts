import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeToolInstant } from '@omne-harness/tool-contract/provider'
import { measuredDuration, settlementAccount, SETTLEMENT_EVENT } from '../src/ledger-account.ts'
import type { Snapshot } from '../src/ledger-decider.ts'
import { INITIAL_REVISION } from '../src/evidence.ts'
import { settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import { callId, ok, tenantA } from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

const instant = (text: string) => ok(decodeToolInstant(text))

describe('the duration of a real execution (TL-54, I-14)', () => {
  it('is the time from the start to the settlement in SI seconds', () => {
    const start = instant('2026-11-17T05:00:00.000Z')
    expect(measuredDuration(start, instant('2026-11-17T05:00:01.234Z'))).toBe('PT1.234S')
    expect(measuredDuration(start, instant('2026-11-17T05:02:00.005Z'))).toBe('PT120.005S')
    expect(measuredDuration(start, start)).toBe('PT0.000S')
  })

  it('is unknown, never zero, when either instant is missing or they are out of order', () => {
    const start = instant('2026-11-17T05:00:01.000Z')
    expect(measuredDuration(null, start)).toBeNull()
    expect(measuredDuration(undefined, start)).toBeNull()
    expect(measuredDuration(start, null)).toBeNull()
    expect(measuredDuration(start, instant('2026-11-17T05:00:00.000Z'))).toBeNull()
  })
})

describe('the account a settlement writes (C14)', () => {
  const place = { tenant: tenantA, call: callId('account-call') }
  const mint = { revision: INITIAL_REVISION }
  const write = (accounts: Snapshot['accounts'], duration: string | null) => {
    const put = settlementAccount({ accounts } as unknown as Snapshot, place, duration, mint)
    if (put.kind !== 'put' || put.record.kind !== 'account') throw new Error('not an account')
    return put.record.account
  }

  it('is revision 1, received, with the measured duration when the call has no account yet', () => {
    const account = write([], 'PT2.500S')
    expect(account.event).toBe(SETTLEMENT_EVENT)
    expect(account.value).toEqual({
      subject: { kind: 'tool_execution', id: place.call },
      usage: [],
      cost: [],
      trimmed: { state: 'known', lexeme: '0', unit: 'bytes' },
      place: expect.any(String),
      duration: 'PT2.500S',
      receipt: 'received',
      revision: '1',
    })
    expect(write([], null).value.duration).toEqual({ state: 'unknown' })
  })

  it('names the call and nothing else of the call record it is given', () => {
    const record = { ...place, admission: 'admit-1', request: { arguments: 'x'.repeat(1000) } }
    const put = settlementAccount({ accounts: [] } as unknown as Snapshot, record, null, mint)
    if (put.kind !== 'put' || put.record.kind !== 'account') throw new Error('not an account')
    expect(Object.keys(put.record.account).sort()).toEqual([
      'call',
      'event',
      'source',
      'start',
      'tenant',
      'value',
    ])
    expect(JSON.stringify(put.record.account)).not.toContain('x'.repeat(100))
  })

  it('is the next revision of the same account, marked late, after an earlier one', () => {
    const first = write([], null)
    const late = write([first], 'PT9.000S')
    expect(late.event).toBe(first.event)
    expect(late.value).toMatchObject({ revision: '2', receipt: 'late', duration: 'PT9.000S' })
    const synthetic = { ...first, event: 'admission' }
    expect(write([synthetic], null)).toMatchObject({ event: 'admission', value: { revision: '2' } })
  })

  it('is written by the commit that settles a real execution, and only once', async () => {
    const f = await settlementFixture()
    ok(await f.preserve())
    const account = ok(await f.ledger.reads.account(f.access))
    expect(account).toMatchObject({ receipt: 'received', revision: '1' })
    expect(typeof account.duration).toBe('string')
    ok(await f.preserve())
    const records = await f.records()
    expect(records.filter(record => record.kind === 'account')).toHaveLength(1)
  })
})
