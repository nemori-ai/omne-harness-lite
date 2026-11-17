import { expect, it } from 'vitest'
import { calendarSupplySqlMaterials } from '../../src/index.ts'

it('lowers the read bound to what the host admits, never above its own', () => {
  const bound = (options?: { maxReadBytes?: number }) =>
    calendarSupplySqlMaterials(options).readHandlers[0]?.maxOutputBytes
  expect(bound()).toBe(128 * 1024 * 1024)
  expect(bound({ maxReadBytes: 20_971_520 })).toBe(20_971_520)
  expect(bound({ maxReadBytes: 1 << 30 })).toBe(128 * 1024 * 1024)
})
