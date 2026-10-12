import { expectTypeOf, test } from 'vitest'
import type { EntryOpeningSignal } from '../src/index.ts'
import type { EntryOpening } from '../src/cordis.ts'

test('Cordis opening service carries the pure signal without control authority', () => {
  expectTypeOf<EntryOpening>().toExtend<EntryOpeningSignal>()
  expectTypeOf<EntryOpening>().not.toHaveProperty('confirm')
  expectTypeOf<EntryOpening>().not.toHaveProperty('close')
})
