import { describe, expectTypeOf, it } from 'vitest'
import type { FloatNote, FloatProps } from '@omne-harness/shell-contract'

describe('the say note a floating item asks the shell for', () => {
  it('reaches every item as four members: whether it can open, whether it is open beside this item, open or close it beside an element, close it', () => {
    expectTypeOf<FloatProps['note']>().toEqualTypeOf<FloatNote>()
    expectTypeOf<keyof FloatNote>().toEqualTypeOf<'there' | 'open' | 'toggle' | 'close'>()
    expectTypeOf<FloatNote['there']>().toEqualTypeOf<boolean>()
    expectTypeOf<FloatNote['open']>().toEqualTypeOf<boolean>()
    expectTypeOf<FloatNote['toggle']>().parameters.toEqualTypeOf<[element: Element]>()
    expectTypeOf<FloatNote['toggle']>().returns.toEqualTypeOf<void>()
    expectTypeOf<FloatNote['close']>().parameters.toEqualTypeOf<[]>()
    expectTypeOf<FloatNote['close']>().returns.toEqualTypeOf<void>()
  })
})
