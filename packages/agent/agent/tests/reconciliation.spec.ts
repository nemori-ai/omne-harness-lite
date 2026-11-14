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

describe('the pacer of one execution', () => {
  it('grows on the same revision and starts over on a new one', () => {
    const pacer = reconciliationPacer([1000, 2000, 5000])
    const seen = ['1', '1', '1', '1', '2', '2', '1'].map(r => pacer.delayAt(revision(r)))
    expect(seen).toEqual([1000, 2000, 5000, 5000, 1000, 2000, 1000])
  })

  it('counts each execution apart', () => {
    const one = reconciliationPacer([1000, 2000])
    const other = reconciliationPacer([1000, 2000])
    expect(one.delayAt(revision('1'))).toBe(1000)
    expect(one.delayAt(revision('1'))).toBe(2000)
    expect(other.delayAt(revision('1'))).toBe(1000)
  })
})
