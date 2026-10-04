import { expectTypeOf, test } from 'vitest'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import { ClockService, CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
import type { Storage } from '@omne-harness-lite/storage'
import { StorageService, STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'

test('shared Service signatures preserve the independent interfaces and exact keys', () => {
  expectTypeOf<StorageService['read']>().toEqualTypeOf<Storage['read']>()
  expectTypeOf<StorageService['write']>().toEqualTypeOf<Storage['write']>()
  expectTypeOf<ClockService['now']>().toEqualTypeOf<Clock['now']>()
  expectTypeOf<typeof STORAGE_SERVICE>().toEqualTypeOf<'storage'>()
  expectTypeOf<typeof CLOCK_SERVICE>().toEqualTypeOf<'clock'>()
  expectTypeOf<StorageService>().not.toHaveProperty('atomic')
  expectTypeOf<StorageService>().not.toHaveProperty('close')
  expectTypeOf<StorageService>().not.toHaveProperty('maintenance')
})
