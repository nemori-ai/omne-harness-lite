import { describe, expect, it } from 'vitest'
import { simulatedTime } from '@omne-harness/time-source/simulated'
import { openApplication } from './fixture.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

describe('notification on the time the assembly runs on', () => {
  it('a wall clock moved an hour ahead is a stop of an hour: the periodic scan does not run early, and runs at its interval after', async () => {
    const time = simulatedTime({ wall: Date.parse('2026-11-18T06:01:00.000Z') })
    const app = await openApplication({ timers: time.source })
    try {
      const atStart = app.scans.count
      time.setWall(time.source.now() + HOUR)
      expect(app.scans.count).toBe(atStart)
      time.advance(MINUTE - 1)
      expect(app.scans.count).toBe(atStart)
      time.advance(1)
      expect(app.scans.count).toBe(atStart + 1)
      await app.application.scan()
      expect(app.reported).toEqual([])
    } finally {
      await app.application.close()
    }
    expect(time.pending()).toBe(0)
  })
})
