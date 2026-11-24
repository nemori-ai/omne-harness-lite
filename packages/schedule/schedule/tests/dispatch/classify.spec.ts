import { describe, expect, it } from 'vitest'
import { classifyMissed, missCause } from '../../src/dispatch/classify.ts'

const slot = (hour: number) =>
  ({ scheduledAt: `2026-11-04T${String(hour).padStart(2, '0')}:00:00.000Z` }) as never
const missed = [slot(8), slot(9), slot(10)]
const execution = (change: Record<string, unknown> = {}) =>
  ({
    kind: 'execution',
    work: { kind: 'program', programRef: 'p', input: {} },
    scope: { kind: 'fleet' },
    catchUp: { kind: 'latest', maximum: 1 },
    overlap: 'parallel',
    misfire: null,
    notifications: [],
    ...change,
  }) as never
const reminder = {
  kind: 'reminder',
  content: { title: null, body: 'x' },
  admissionPolicy: 'reminder-window-v1',
  overlap: 'parallel',
} as never

describe('the outcome of a missed stretch, by kind of schedule and cause', () => {
  it.each([
    [
      'periodic, stopped, latest 1: the most recent is caught up',
      execution(),
      false,
      'stopped',
      { selected: [slot(10)], reason: 'catch-up-latest' },
    ],
    [
      'periodic, paused then resumed: by the catch-up policy',
      execution({ catchUp: { kind: 'latest', maximum: 2 } }),
      false,
      'paused',
      { selected: [slot(9), slot(10)], reason: 'catch-up-latest' },
    ],
    [
      'periodic, dependency recovered, no catch-up: none',
      execution({ catchUp: { kind: 'none' } }),
      false,
      'recovered',
      { selected: [], reason: 'catch-up-none' },
    ],
    [
      'periodic, environment incompatible: none, whatever the policy',
      execution(),
      false,
      'incompatible',
      { selected: [], reason: 'environment-incompatible' },
    ],
    [
      'once, stopped, lapse: lapsed',
      execution({ misfire: { kind: 'lapse' } }),
      true,
      'stopped',
      { selected: [], reason: 'lapsed' },
    ],
    [
      'once, stopped, await recovery: accepted late',
      execution({ misfire: { kind: 'awaitRecovery' } }),
      true,
      'stopped',
      { selected: missed, reason: 'awaiting-recovery' },
    ],
    [
      'once, paused across its time: lapsed',
      execution({ misfire: { kind: 'awaitRecovery' } }),
      true,
      'paused',
      { selected: [], reason: 'paused-across' },
    ],
    [
      'a reminder: never sent late',
      reminder,
      false,
      'stopped',
      { selected: [], reason: 'reminder-not-resent' },
    ],
  ] as const)('%s', (_, purpose, once, cause, outcome) => {
    expect(classifyMissed(purpose, once, cause, missed)).toEqual(outcome)
  })

  it('a heartbeat gap is the cause when it started after the schedule was watched; otherwise the schedule says why', () => {
    expect(missCause('2026-11-04T10:30:00.000Z', '2026-11-04T00:00:00.000Z', 'resumed')).toBe(
      'stopped',
    )
    expect(missCause('2026-11-04T00:00:00.000Z', '2026-11-04T10:30:00.000Z', 'resumed')).toBe(
      'paused',
    )
    expect(missCause('2026-11-04T00:00:00.000Z', '2026-11-04T10:30:00.000Z', 'recovered')).toBe(
      'recovered',
    )
    expect(missCause('2026-11-04T00:00:00.000Z', '2026-11-04T10:30:00.000Z', 'enabled')).toBe(
      'stopped',
    )
    expect(missCause('2026-11-04T10:30:00.000Z', '2026-11-04T10:30:00.000Z', 'resumed')).toBe(
      'paused',
    )
  })

  it('a one-off schedule that names no misfire policy lapses', () => {
    expect(classifyMissed(execution({ misfire: null }), true, 'stopped', missed)).toEqual({
      selected: [],
      reason: 'lapsed',
    })
  })
})
