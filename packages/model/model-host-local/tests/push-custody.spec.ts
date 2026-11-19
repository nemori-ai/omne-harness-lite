import { describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import { createCustodyEnd } from '../src/plugins/push-custody.ts'
import { isDelayTable } from '../src/plugins/push-values.ts'
import type { DeliveryStanding, ResultPushRecord, RuntimeEvent } from '../src/plugins/runtime.ts'

const ACCESS = { principal: 'host', tenant: 'tenant' as unknown as TenantId }
const RESULT = 'mrver_one'

/** A push record whose result stands as given, and the commands that answer its abandonment. */
function ending(standing: DeliveryStanding, answer: 'ok' | 'unknown' = 'ok') {
  const abandons: unknown[] = []
  const reports: RuntimeEvent[] = []
  const marked: unknown[] = []
  const commands = {
    abandon: (input: unknown) => {
      abandons.push(input)
      return Promise.resolve(
        answer === 'ok' ? { ok: {} } : { failure: { kind: 'commit-unknown', operation: 'op' } },
      )
    },
  } as unknown as ModelCommands<unknown>
  const record = {
    call: 'mcall_one',
    operations: { read: 'mop_read', ack: 'mop_ack', abandon: 'mop_abandon' },
    result: { delivery: { key: { kind: 'result', result: RESULT } }, standing, attempts: 1 },
    acknowledgement: 'none',
  } as unknown as ResultPushRecord
  const custody = createCustodyEnd({
    commands,
    maxRedeliveries: 0,
    stopping: new AbortController().signal,
    report: event => reports.push(event),
    mark: (target, failure) => {
      marked.push(failure)
      return target
    },
  })
  return { end: () => custody.end(record, ACCESS), abandons, reports, marked, record }
}

describe('how the custody of a pushed result ends', () => {
  it.each(['denied', 'invalid', 'conflict'] as const)(
    'abandons a result its receiver refused with %s, with that refusal as the basis',
    async refusal => {
      const failure =
        refusal === 'invalid' ? { kind: refusal, field: 'f', reason: 'r' } : { kind: refusal }
      const e = ending({
        status: 'failed',
        failure: { kind: 'rejected', failure },
      } as DeliveryStanding)
      expect((await e.end()).acknowledgement).toBe('abandoned')
      expect(e.abandons).toEqual([
        {
          ...ACCESS,
          call: 'mcall_one',
          operation: 'mop_abandon',
          result: RESULT,
          basis: { kind: 'refused', refusal },
        },
      ])
    },
  )

  it('does not abandon a result whose receipt did not match, nor one still waiting', async () => {
    for (const standing of [
      { status: 'failed', failure: { kind: 'receipt-mismatch' } },
      { status: 'unknown' },
      { status: 'waiting', reason: 'unavailable' },
    ]) {
      const e = ending(standing as DeliveryStanding)
      expect(await e.end(), JSON.stringify(standing)).toBe(e.record)
      expect(e.abandons).toEqual([])
    }
  })

  it('keeps the record and owes another try when the abandonment did not commit', async () => {
    const e = ending(
      { status: 'failed', failure: { kind: 'rejected', failure: { kind: 'denied' } } },
      'unknown',
    )
    expect((await e.end()).acknowledgement).toBe('none')
    expect(e.reports).toEqual([{ kind: 'abandon-failed', failure: 'commit-unknown' }])
    expect(e.marked).toEqual([{ kind: 'commit-unknown', operation: 'op' }])
  })
})

describe('a table of pauses', () => {
  it('takes one or more integers of at least one millisecond, and nothing else', () => {
    expect(isDelayTable([1])).toBe(true)
    expect(isDelayTable([1000, 5000])).toBe(true)
    for (const value of [[], [0], [1.5], ['1'], [1, -1], undefined, 1])
      expect(isDelayTable(value), JSON.stringify(value)).toBe(false)
  })
})
