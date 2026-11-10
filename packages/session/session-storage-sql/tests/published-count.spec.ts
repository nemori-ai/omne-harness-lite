// RT-06: the publication count of the Agent records as this process knows it.
import { describe, expect, it } from 'vitest'
import type { SqlStorage } from '@omne-harness/sql-contract'
import {
  PUBLISHED_COUNT_MAX_AGE_MS,
  planPublishedCount,
  publishedCountsOf,
} from '@omne-harness/session-storage-sql/participants'

const unused = (): never => {
  throw new Error('not called')
}
const storage = (): SqlStorage => ({
  registerCombination: unused,
  commit: unused,
  query: unused,
  read: () => unused(),
})
const SESSION = '["tenant","session"]'

describe('planPublishedCount', () => {
  const known = { published: 7, confirmedAt: 100 }

  it('answers the known count within the bound', () => {
    expect(planPublishedCount(known, false, 100 + PUBLISHED_COUNT_MAX_AGE_MS)).toEqual({
      kind: 'known',
      published: 7,
    })
  })

  it.each([
    ['nothing is known', undefined, false, 100],
    ['a write of the caller is undecided', known, true, 100],
    [
      'the last confirmation is older than the bound',
      known,
      false,
      101 + PUBLISHED_COUNT_MAX_AGE_MS,
    ],
  ] as const)('asks the storage when %s', (_name, held, undecided, at) => {
    expect(planPublishedCount(held, undecided, at)).toEqual({ kind: 'read' })
  })
})

describe('the counts of one database', () => {
  it('are shared by every storage object over the database, and by none over another', () => {
    const one = storage()
    publishedCountsOf(one).confirm(SESSION, 3, 0)
    expect(publishedCountsOf({ ...one }).get(SESSION)).toEqual({ published: 3, confirmedAt: 0 })
    expect(publishedCountsOf(storage()).get(SESSION)).toBeUndefined()
  })

  it('keep the larger count: an answer below it is a read that a publication crossed', () => {
    const counts = publishedCountsOf(storage())
    counts.confirm(SESSION, 5, 10)
    counts.confirm(SESSION, 4, 20)
    expect(counts.get(SESSION)).toEqual({ published: 5, confirmedAt: 10 })
    counts.confirm(SESSION, 5, 30)
    expect(counts.get(SESSION)).toEqual({ published: 5, confirmedAt: 30 })
  })

  it('know nothing of a session after a doubt', () => {
    const counts = publishedCountsOf(storage())
    counts.confirm(SESSION, 5, 10)
    counts.doubt(SESSION)
    expect(counts.get(SESSION)).toBeUndefined()
  })

  it('drop the session confirmed longest ago past the bound of sessions', () => {
    const counts = publishedCountsOf(storage())
    for (let index = 0; index <= 4_096; index += 1) counts.confirm(`s${index}`, 1, index)
    expect(counts.get('s0')).toBeUndefined()
    expect(counts.get('s1')).toEqual({ published: 1, confirmedAt: 1 })
  })
})
