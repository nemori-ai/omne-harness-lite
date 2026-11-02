// `readOrNull`, the read the production Journal makes of the original fragments of an event. A
// missing original leaves the event undecided with no noise; a `TypeError` leaves it undecided too
// but is reported through `fault`, so a defect of the reader is not turned into a quiet "undecided";
// any other error is not hidden.
import { describe, expect, it } from 'vitest'
import { readOrNull } from '../src/cordis/agent-journal.ts'
import { HistoryFailure } from '../src/testing/history-failure.ts'

describe('reading an original fragment of an event', () => {
  it('answers what the read gave, and reports nothing', () => {
    const faults: string[] = []
    expect(
      readOrNull(
        'x',
        diagnostic => faults.push(diagnostic),
        () => 7,
      ),
    ).toBe(7)
    expect(faults).toEqual([])
  })

  it('a missing original is null and quiet: nothing is invented, nothing is a defect', () => {
    const faults: string[] = []
    const missing = () => {
      throw new HistoryFailure({ kind: 'unavailable', owner: 'session-history', diagnostic: 'o' })
    }
    expect(readOrNull('x', diagnostic => faults.push(diagnostic), missing)).toBeNull()
    expect(faults).toEqual([])
  })

  it('a TypeError is null and reported once, naming what was read and why it failed', () => {
    const faults: string[] = []
    const defect = () => {
      throw new TypeError('cannot read properties of undefined')
    }
    expect(
      readOrNull('the consequences of e1/3', diagnostic => faults.push(diagnostic), defect),
    ).toBeNull()
    expect(faults).toHaveLength(1)
    expect(faults[0]).toContain('the consequences of e1/3')
    expect(faults[0]).toContain('cannot read properties of undefined')
  })

  it('a TypeError without a fault channel is still null', () => {
    const defect = () => {
      throw new TypeError('defect')
    }
    expect(readOrNull('x', undefined, defect)).toBeNull()
  })

  it('any other error is not hidden', () => {
    const other = new RangeError('not this function’s to hide')
    expect(() =>
      readOrNull('x', undefined, () => {
        throw other
      }),
    ).toThrow(other)
  })
})
