import { afterEach, describe, expect, it } from 'vitest'
import { simulatedTime } from '@omne-harness/time-source/simulated'
import { T1, fakePorts, openApplication } from './fixture.ts'
import { openSqlWorld, type SqlWorld } from './storage/world.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const worlds: SqlWorld[] = []
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})

describe('dispatch on the time the assembly runs on', () => {
  it('a wall clock moved an hour ahead is a stop of an hour: the periodic pass does not run early, and runs at its interval after', async () => {
    const sql = await openSqlWorld()
    worlds.push(sql)
    const time = simulatedTime({ wall: Date.parse('2026-11-18T06:00:00.000Z') })
    let scans = 0
    const reported: unknown[] = []
    const { application } = await openApplication(sql, fakePorts(), {
      timers: time.source,
      report: error => void reported.push(error),
      sql: {
        storage: sql.storage,
        bind: tenant => sql.bind(tenant),
        tenants: async () => {
          scans += 1
          return [T1]
        },
      },
    })
    const atStart = scans
    time.setWall(time.source.now() + HOUR)
    expect(scans).toBe(atStart)
    time.advance(MINUTE - 1)
    expect(scans).toBe(atStart)
    time.advance(1)
    expect(scans).toBe(atStart + 1)
    await application.scan()
    expect(reported).toEqual([])
    await application.close()
    expect(time.pending()).toBe(0)
  })
})
