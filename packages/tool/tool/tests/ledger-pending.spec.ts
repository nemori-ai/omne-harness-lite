import { describe, expect, it } from 'vitest'
import type { LedgerRecord } from '../src/ledger-store.ts'
import { hasPendingWork, pendingAfter } from '../src/ledger-pending.ts'

type Record = LedgerRecord

const call = (phase: string): Record =>
  ({ kind: 'call', call: { state: { phase } } }) as unknown as Record
const wait = (id: string, phase: string): Record =>
  ({ kind: 'wait', wait: { record: { phase, intent: { wait: id } } } }) as unknown as Record
const task = (operation: string, state: 'pending' | 'blocked'): Record =>
  ({ kind: 'task', task: { kind: 'clock', operation, state } }) as unknown as Record

describe('the pending work of a call domain', () => {
  it.each(['opening', 'open', 'responding'])(
    'counts a suspended call whose wait is %s, with no task',
    phase => {
      expect(hasPendingWork([call('suspended'), wait('w', phase)])).toBe(true)
    },
  )

  it('does not count a wait of a call that is not suspended, or a closed wait', () => {
    expect(hasPendingWork([call('settled'), wait('w', 'open')])).toBe(false)
    expect(hasPendingWork([call('starting'), wait('w', 'responding')])).toBe(false)
    expect(hasPendingWork([call('suspended'), wait('w', 'closed')])).toBe(false)
  })

  it('counts a pending task and not a blocked one', () => {
    expect(hasPendingWork([call('settled'), task('t', 'pending')])).toBe(true)
    expect(hasPendingWork([call('settled'), task('t', 'blocked')])).toBe(false)
  })

  it('judges the records after the writes, in order and by key', () => {
    const before = [call('suspended'), wait('w', 'open')]
    expect(pendingAfter(before, [{ kind: 'put', record: call('settled') }])).toBe(false)
    expect(pendingAfter([call('settled')], [{ kind: 'put', record: task('t', 'pending') }])).toBe(
      true,
    )
    expect(
      pendingAfter(
        [call('settled'), task('t', 'pending')],
        [{ kind: 'delete', key: 'task:clock:t' }],
      ),
    ).toBe(false)
  })
})
