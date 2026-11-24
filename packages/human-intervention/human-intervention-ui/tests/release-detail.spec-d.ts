import { describe, expectTypeOf, it } from 'vitest'
import type { KeyDrawing } from '@omne-harness/shell-contract'
import { releaseDetail } from '../src/cordis.ts'

type Given = Parameters<Parameters<typeof releaseDetail.put>[2]>[0]

describe('what a view of a detail kind is given', () => {
  it('is the scope, the text of the typed value and the rows the card draws, and no option or submit of the card', () => {
    expectTypeOf<Given>().toEqualTypeOf<KeyDrawing<string>>()
    expectTypeOf<keyof Given>().toEqualTypeOf<'scope' | 'subject' | 'generic'>()
  })
})
