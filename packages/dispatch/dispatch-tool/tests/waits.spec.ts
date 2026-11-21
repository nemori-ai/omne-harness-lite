import { describe, expect, it } from 'vitest'
import type { WaitOutcome } from '@omne-harness/dispatch'
import { createReportWaits, type CallWaits } from '../src/index.ts'
import { reported, waitRecord } from './values.ts'

const OUTCOME: WaitOutcome = reported
const other = { owner: 'someone-else', name: 'report-wait', revision: '1', digest: 'sha256:x' }

function world(read: CallWaits | Error) {
  const scheduled: string[] = []
  const waits = createReportWaits({
    callOf: async () => {
      if (read instanceof Error) throw read
      return read
    },
    schedule: async (_tenant, dispatch) => void scheduled.push(dispatch.call),
  })
  return { scheduled, hand: () => waits.hand(reported.tenant, reported, OUTCOME) }
}

const call = (settled: boolean, ...waits: ReturnType<typeof waitRecord>[]): CallWaits => ({
  kind: 'read',
  value: { settled, waits },
})

describe('whether the wait of the dispatching call took the outcome is read from the one commit of Tool', () => {
  it('answers delivered when the report wait was closed as continued', async () => {
    const { scheduled, hand } = world(call(true, waitRecord('continued')))
    expect(await hand()).toBe('delivered')
    expect(scheduled).toEqual([])
  })

  it.each(['cancelled', 'terminal'] as const)(
    'answers closed when the report wait was closed as %s',
    async cause => {
      const { scheduled, hand } = world(call(true, waitRecord(cause)))
      expect(await hand()).toBe('closed')
      expect(scheduled).toEqual([])
    },
  )

  it('answers closed when the call ended and never opened a report wait', async () => {
    expect(await world(call(true)).hand()).toBe('closed')
    expect(await world(call(true, waitRecord('continued', other))).hand()).toBe('closed')
  })

  it('answers closed when Tool keeps no such call', async () => {
    expect(await world({ kind: 'read', value: null }).hand()).toBe('closed')
  })

  it.each(['open', 'responding'] as const)(
    'wakes the call and answers unreadable while the report wait is %s',
    async phase => {
      const { scheduled, hand } = world(call(false, waitRecord(phase)))
      expect(await hand()).toBe('unreadable')
      expect(scheduled).toEqual([reported.call])
    },
  )

  it('wakes the call and answers unreadable while the call runs and has not opened its wait', async () => {
    const { scheduled, hand } = world(call(false))
    expect(await hand()).toBe('unreadable')
    expect(scheduled).toEqual([reported.call])
  })

  it('answers unreadable, and wakes nothing, when the call cannot be read', async () => {
    for (const read of [{ kind: 'unavailable' } as const, new Error('down')]) {
      const { scheduled, hand } = world(read)
      expect(await hand()).toBe('unreadable')
      expect(scheduled).toEqual([])
    }
  })

  it('still answers unreadable when the wake-up fails', async () => {
    const waits = createReportWaits({
      callOf: async () => call(false, waitRecord('open')),
      schedule: () => Promise.reject(new Error('the queue is full')),
    })
    expect(await waits.hand(reported.tenant, reported, OUTCOME)).toBe('unreadable')
  })

  it('takes a delivered wait over a closed one of the same call', async () => {
    const read = call(true, waitRecord('cancelled'), waitRecord('continued'))
    expect(await world(read).hand()).toBe('delivered')
  })
})
