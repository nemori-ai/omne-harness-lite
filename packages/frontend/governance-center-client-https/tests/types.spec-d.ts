import { expectTypeOf, test } from 'vitest'
import { readPublicHealth } from '../src/index.ts'
import {
  type PublicHealthOptions,
  type PublicHealthOutcome,
} from '@omne-harness-lite/governance-center-entry-https-json'

test('only exposes a fixed public operation, not arbitrary bodies or credentials', () => {
  expectTypeOf(readPublicHealth).returns.toEqualTypeOf<Promise<PublicHealthOutcome>>()
  expectTypeOf<PublicHealthOptions>().not.toHaveProperty('body')
  expectTypeOf<PublicHealthOptions>().not.toHaveProperty('credential')
  expectTypeOf<PublicHealthOptions>().not.toHaveProperty('loginState')
})
