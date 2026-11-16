import { expectTypeOf, it } from 'vitest'
import type { TimeSource } from '../src/index.ts'
import type { SimulatedTime } from '../src/simulated.ts'

it('the time source has two readings and two waits, and the driven system gets exactly that (TS-7)', () => {
  expectTypeOf<keyof TimeSource>().toEqualTypeOf<'now' | 'elapsed' | 'after' | 'at'>()
  expectTypeOf<SimulatedTime['source']>().toEqualTypeOf<TimeSource>()
  expectTypeOf<TimeSource>().not.toHaveProperty('advance')
})
