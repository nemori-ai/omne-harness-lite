import { describe, expect, it } from 'vitest'
import { createExplicitCleanupSchedule } from '../src/deployment.ts'

describe('explicit acknowledgement cleanup schedule', () => {
  it('waits the listed time for each retry, then stops the round', () => {
    const policy = createExplicitCleanupSchedule([10, 20])
    const input = (attempts: number) => ({
      attempts,
      pendingReasons: ['writer_in_flight' as const],
    })
    expect(policy.next(input(1))).toEqual({ waitMs: 10 })
    expect(policy.next(input(2))).toEqual({ waitMs: 20 })
    expect(policy.next(input(3))).toEqual({ stop: true })
  })

  it('accepts an empty schedule as immediate stop and refuses invalid waits', () => {
    expect(
      createExplicitCleanupSchedule([]).next({ attempts: 1, pendingReasons: ['receipt_unknown'] }),
    ).toEqual({ stop: true })
    expect(() => createExplicitCleanupSchedule([-1])).toThrow(TypeError)
    expect(() => createExplicitCleanupSchedule([0.5])).toThrow(TypeError)
  })
})
