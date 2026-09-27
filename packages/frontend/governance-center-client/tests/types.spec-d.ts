import { expectTypeOf, test } from 'vitest'
import {
  readPublicHealth,
  type PublicHealthOptions,
  type PublicHealthOutcome,
} from '../src/index.ts'

test('only exposes a fixed public operation, not arbitrary bodies or credentials', () => {
  expectTypeOf(readPublicHealth).returns.toEqualTypeOf<Promise<PublicHealthOutcome>>()
  expectTypeOf<PublicHealthOptions>().not.toHaveProperty('body')
  expectTypeOf<PublicHealthOptions>().not.toHaveProperty('credential')
  expectTypeOf<PublicHealthOptions>().not.toHaveProperty('loginState')
})
