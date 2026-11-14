import { expectTypeOf, test } from 'vitest'
import type { SettingInput } from '../src/index.ts'

test('the permission branch of SettingInput carries a pick and no allowed set', () => {
  type Permission = Extract<SettingInput, { kind: 'permission' }>
  expectTypeOf<keyof Permission>().toEqualTypeOf<'kind' | 'pick'>()
})
