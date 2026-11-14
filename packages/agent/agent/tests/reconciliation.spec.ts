// The check delays of a wait (package SPEC "等着的时候"): the n-th wake in a row on the same
// revision waits the n-th delay, the last delay once the list is used up; a new revision starts over.
import { describe, expect, it } from 'vitest'
import type { ExecutionRevision } from '@omne-harness/agent-contract'
import { reconciliationDelayAt, reconciliationPacer } from '../src/loop/reconciliation.ts'

const revision = (text: string) => text as ExecutionRevision

describe('the delay after n quiet wakes', () => {
  it('takes the delays in order and repeats the last one', () => {
    const delays = [1000, 2000, 5000]
    expect([0, 1, 2, 3, 4, 100].map(n => reconciliationDelayAt(delays, n))).toEqual([
      1000, 2000, 5000, 5000, 5000, 5000,
    ])
  })

  it('keeps one delay for a list of one', () => {
    expect([0, 1, 7].map(n => reconciliationDelayAt([0], n))).toEqual([0, 0, 0])
  })
})

/** The delays of waits entered at `revisions`, each but the last woken by its check time. */
function timedWaits(pacer: ReturnType<typeof reconciliationPacer>, revisions: string[]): number[] {
  return revisions.map(r => {
    const delay = pacer.delayAt(revision(r))
    pacer.timerWoke()
    return delay
  })
}

describe('the pacer of one execution', () => {
  it('grows on timer wakes at the same revision and starts over on a new one', () => {
    const pacer = reconciliationPacer([1000, 2000, 5000])
    const seen = timedWaits(pacer, ['1', '1', '1', '1', '2', '2', '1'])
    expect(seen).toEqual([1000, 2000, 5000, 5000, 1000, 2000, 1000])
  })

  it('starts over after an event wake, at the same revision', () => {
    const pacer = reconciliationPacer([1000, 2000, 5000])
    expect(timedWaits(pacer, ['1', '1', '1', '1'])).toEqual([1000, 2000, 5000, 5000])
    // This wait is woken by an event: no `timerWoke`.
    expect(pacer.delayAt(revision('1'))).toBe(5000)
    expect(pacer.delayAt(revision('1'))).toBe(1000)
  })

  it('counts each execution apart', () => {
    const one = reconciliationPacer([1000, 2000])
    const other = reconciliationPacer([1000, 2000])
    expect(timedWaits(one, ['1', '1'])).toEqual([1000, 2000])
    expect(other.delayAt(revision('1'))).toBe(1000)
  })
})
