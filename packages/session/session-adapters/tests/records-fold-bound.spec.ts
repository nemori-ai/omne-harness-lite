// The bound of the folds that the step reads of an execution keep (`readExecutionRecords`). A
// reader does not learn that an execution ended, so a fold leaves by age. A fold holds every block
// of its executions, so a bound on the number of folds bounds no memory: the bound is on the text
// of the blocks. What is checked: the least recently read leave first, the fold being read stays
// whatever its size, and nothing leaves at or under the bound.
import { describe, expect, it } from 'vitest'
import { dropFoldsOver } from '../src/cordis/agent-journal.ts'

const fold = (...sizes: number[]) => ({
  blobs: new Map(sizes.map((size, index) => [`digest-${String(index)}`, 'x'.repeat(size)])),
})

describe('the text bound of the kept folds', () => {
  it('drops the least recently read folds until the text fits', () => {
    const [oldest, middle, used] = [fold(40, 20), fold(30), fold(30)]
    const folds = new Map([
      ['oldest', oldest],
      ['middle', middle],
      ['used', used],
    ])
    dropFoldsOver(folds, used, 70)
    expect([...folds.keys()]).toEqual(['middle', 'used'])
  })

  it('keeps the fold being read when it alone is over the bound', () => {
    const [other, used] = [fold(10), fold(500)]
    const folds = new Map([
      ['used', used],
      ['other', other],
    ])
    dropFoldsOver(folds, used, 100)
    expect([...folds.keys()]).toEqual(['used'])
  })

  it('drops nothing at the bound', () => {
    const [first, used] = [fold(50), fold(50)]
    const folds = new Map([
      ['first', first],
      ['used', used],
    ])
    dropFoldsOver(folds, used, 100)
    expect(folds.size).toBe(2)
  })
})
