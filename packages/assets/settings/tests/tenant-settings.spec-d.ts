// The tenant layer writes a pick only (RFC-0015 §9, S-12): the permission branch of `SettingInput`
// has no allowed set.
import { expectTypeOf, test } from 'vitest'
import type { SettingInput } from '../src/index.ts'

test('the permission branch of SettingInput carries a pick and no allowed set', () => {
  type Permission = Extract<SettingInput, { kind: 'permission' }>
  expectTypeOf<keyof Permission>().toEqualTypeOf<'kind' | 'pick'>()
})
