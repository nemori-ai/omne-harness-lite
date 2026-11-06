import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { CalendarSeedPackRegistry } from '../supply-storage/custody.ts'

export const shippedCalendarSeedRelease = Object.freeze({
  packRef: 'omne.calendar-seed/2026-11-06',
  releaseRef: 'calendar-2026-11-06',
  releaseDate: '2026-11-06',
  packHash: '4c7a54731c853e9291d4ae0febfe7f0e619058be836dfa9f6a97c24bd81147ae',
})

export function createShippedCalendarSeedRegistry(): CalendarSeedPackRegistry {
  return new Map([
    [
      shippedCalendarSeedRelease.packRef,
      {
        kind: 'bytes',
        async read() {
          const bytes = await readFile(
            new URL('../../data/seeds/calendar-2026-11-06.json', import.meta.url),
          )
          if (
            createHash('sha256').update(bytes).digest('hex') !== shippedCalendarSeedRelease.packHash
          )
            throw new Error('Shipped calendar seed digest mismatch')
          return bytes
        },
      },
    ],
  ])
}
