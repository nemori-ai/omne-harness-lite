import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { CalendarSeedPackRegistry } from '../supply-storage/custody.ts'

export const shippedCalendarSeedRelease = Object.freeze({
  packRef: 'omne.calendar-seed/2026-11-03',
  releaseRef: 'calendar-2026-11-03',
  releaseDate: '2026-11-03',
  packHash: '46526f9d219bb41c013ade483492bae2d8ae60200e58c071e31fb389ea597eb5',
})

export function createShippedCalendarSeedRegistry(): CalendarSeedPackRegistry {
  return new Map([
    [
      shippedCalendarSeedRelease.packRef,
      {
        kind: 'bytes',
        async read() {
          const bytes = await readFile(
            new URL('../../data/seeds/calendar-2026-11-03.json', import.meta.url),
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
