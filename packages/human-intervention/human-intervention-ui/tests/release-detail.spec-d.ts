import { describe, expectTypeOf, it } from 'vitest'
import type { PointProps } from '@omne-harness/shell-contract'
import { releaseDetail } from '../src/cordis.ts'

type Item = Parameters<typeof releaseDetail.contribute>[2]

describe('what a view of a detail kind is given', () => {
  it('is the scope and the text of the typed value, and no option or submit of the card', () => {
    expectTypeOf<Parameters<Item['render']>[0]>().toEqualTypeOf<PointProps<string>>()
    expectTypeOf<keyof Parameters<Item['render']>[0]>().toEqualTypeOf<'scope' | 'subject'>()
  })
})
