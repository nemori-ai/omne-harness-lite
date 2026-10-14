import { expectTypeOf, it } from 'vitest'
import type {
  Duration,
  DurationFailure,
  DurationParse,
  Instant,
  InstantFailure,
  InstantParse,
  LeapSecondData,
  LeapSecondDataRead,
} from '@omne-harness/utc-instant'

it('exports the failure kinds a caller can branch on', () => {
  expectTypeOf<InstantFailure['kind']>().toEqualTypeOf<
    'syntax' | 'offset' | 'range' | 'leap-second' | 'leap-data-expired'
  >()
  expectTypeOf<DurationFailure['kind']>().toEqualTypeOf<'syntax' | 'calendar-unit'>()
  expectTypeOf<LeapSecondDataRead & { ok: false }>()
    .toHaveProperty('failure')
    .toEqualTypeOf<{ readonly kind: 'syntax' | 'step' }>()
})

it('exports the parse results around the opaque values', () => {
  expectTypeOf<InstantParse & { ok: true }>().toHaveProperty('value').toEqualTypeOf<Instant>()
  expectTypeOf<DurationParse & { ok: true }>().toHaveProperty('value').toEqualTypeOf<Duration>()
  expectTypeOf<LeapSecondDataRead & { ok: true }>()
    .toHaveProperty('value')
    .toEqualTypeOf<LeapSecondData>()
})
