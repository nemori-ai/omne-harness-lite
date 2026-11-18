import { describe, expect, it } from 'vitest'
import { INITIAL, type Entry, type State } from '../src/model/inbox-machine.ts'
import { arrivals, UNREAD_LEDGER } from '../src/model/strong-arrivals.ts'
import { dismissed, entry, seen, superseded } from './fixtures/entries.ts'

const ready = (entries: readonly Entry[]): State => ({
  ...INITIAL,
  entries,
  read: { kind: 'ready', more: false },
})
const strong = (event: string, sequence: number, more: Partial<Entry> = {}) =>
  entry(event, sequence, { level: 'strong', ...more })
const events = (list: readonly Entry[]) => list.map(item => item.event)

describe('arrivals', () => {
  it('takes the first read as what was already there and announces none of it', () => {
    const first = arrivals(UNREAD_LEDGER, ready([strong('old', 1)]))
    expect(first.strong).toEqual([])
    const again = arrivals(first.ledger, ready([strong('old', 1)]))
    expect(again.strong).toEqual([])
  })

  it('announces nothing until a read is ready, and the first ready read is still the baseline', () => {
    const reading: State = {
      ...INITIAL,
      entries: [strong('a', 1)],
      read: { kind: 'reading', token: 1, collected: [], pages: 1, again: false },
    }
    const failed: State = { ...INITIAL, read: { kind: 'failed', reason: 'unavailable' } }
    expect(arrivals(UNREAD_LEDGER, reading)).toEqual({ ledger: UNREAD_LEDGER, strong: [] })
    expect(arrivals(UNREAD_LEDGER, failed)).toEqual({ ledger: UNREAD_LEDGER, strong: [] })
    expect(arrivals(UNREAD_LEDGER, ready([strong('a', 1)])).strong).toEqual([])
  })

  it('announces a strong one that came after the baseline, once', () => {
    const base = arrivals(UNREAD_LEDGER, ready([strong('old', 1)])).ledger
    const next = arrivals(base, ready([strong('old', 1), strong('new', 2)]))
    expect(events(next.strong)).toEqual(['new'])
    expect(arrivals(next.ledger, ready([strong('old', 1), strong('new', 2)])).strong).toEqual([])
  })

  it('does not announce a weak one, nor one already seen, settled or replaced', () => {
    const base = arrivals(UNREAD_LEDGER, ready([])).ledger
    const next = arrivals(
      base,
      ready([
        entry('weak', 1),
        strong('seen', 2, { marks: seen }),
        strong('dismissed', 3, { marks: dismissed }),
        strong('superseded', 4, { marks: superseded }),
        strong('fresh', 5),
      ]),
    )
    expect(events(next.strong)).toEqual(['fresh'])
  })

  it('keeps the same ledger when the read brought nothing it did not know', () => {
    const base = arrivals(UNREAD_LEDGER, ready([strong('a', 1)])).ledger
    expect(arrivals(base, ready([strong('a', 1)])).ledger).toBe(base)
    expect(arrivals(base, ready([])).ledger).toBe(base)
  })
})
