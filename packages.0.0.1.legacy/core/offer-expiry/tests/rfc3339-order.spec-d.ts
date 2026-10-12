import { type Parsed } from '@omne-harness-lite/identity-values'
import { describe, expectTypeOf, it } from 'vitest'
import { compareRfc3339Instants } from '../src/index.ts'

describe('D089 public conditional comparator types', () => {
  it('accepts two unknowns and returns only original Parsed ordering', () => {
    expectTypeOf(compareRfc3339Instants).parameters.toEqualTypeOf<[unknown, unknown]>()
    expectTypeOf(compareRfc3339Instants).returns.toEqualTypeOf<Parsed<-1 | 0 | 1>>()
  })
})
