// RT-06: the publication count of the Agent records as this process knows it.
import { describe, expect, it } from 'vitest'
import type { SqlStorage } from '@omne-harness/sql-contract'
import {
  planPublishedCount,
  publishedCountsOf,
} from '@omne-harness/session-storage-sql/participants'

const unused = (): never => {
  throw new Error('not called')
}
const storage = (): SqlStorage => ({
  database: {},
  registerCombination: unused,
  commit: unused,
  query: unused,
  read: () => unused(),
})
const SESSION = '["tenant","session"]'

describe('planPublishedCount', () => {
  it('answers the known count without a read', () => {
    expect(planPublishedCount(7, false)).toEqual({ kind: 'known', published: 7 })
    expect(planPublishedCount(0, false)).toEqual({ kind: 'known', published: 0 })
  })

  it.each([
    ['nothing is known', undefined, false],
    ['a write of the caller is undecided', 7, true],
  ] as const)('asks the storage when %s', (_name, held, undecided) => {
    expect(planPublishedCount(held, undecided)).toEqual({ kind: 'read' })
  })
})

describe('the counts of one database', () => {
  it('are shared by every storage object over the database, and by none over another', () => {
    const one = storage()
    publishedCountsOf(one).confirm(SESSION, 3)
    expect(publishedCountsOf({ ...one }).get(SESSION)).toBe(3)
    expect(publishedCountsOf(storage()).get(SESSION)).toBeUndefined()
  })

  it('keep the larger count: an answer below it is a read that a publication crossed', () => {
    const counts = publishedCountsOf(storage())
    counts.confirm(SESSION, 5)
    counts.confirm(SESSION, 4)
    expect(counts.get(SESSION)).toBe(5)
    counts.confirm(SESSION, 6)
    expect(counts.get(SESSION)).toBe(6)
  })

  it('know nothing of a session after a doubt', () => {
    const counts = publishedCountsOf(storage())
    counts.confirm(SESSION, 5)
    counts.doubt(SESSION)
    expect(counts.get(SESSION)).toBeUndefined()
  })

  it('drop the session confirmed longest ago past the bound of sessions', () => {
    const counts = publishedCountsOf(storage())
    for (let index = 0; index <= 4_096; index += 1) counts.confirm(`s${index}`, 1)
    expect(counts.get('s0')).toBeUndefined()
    expect(counts.get('s1')).toBe(1)
  })
})
