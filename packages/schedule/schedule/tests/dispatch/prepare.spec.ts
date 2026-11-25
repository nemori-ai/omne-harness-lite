import { describe, expect, it } from 'vitest'
import type { ScheduleCandidate, ScheduleInstant } from '@omne-harness/schedule-contract'
import { admitCommand, refreshCommand, type DispatcherPorts } from '../../src/dispatch/prepare.ts'
import type { DispatchSchedule, DispatchState } from '../../src/dispatch/types.ts'

const T0 = Date.parse('2026-11-04T00:00:00.000Z')
const MINUTE = 60_000
const at = (minutes: number) => new Date(T0 + minutes * MINUTE).toISOString() as ScheduleInstant
const slot = (minutes: number) => ({ scheduledAt: at(minutes), sourceKeys: [] }) as never
const CONSUMED = 5

function item(state: Partial<DispatchState>, eligibleLimit: number | null = null) {
  return {
    record: {
      activationExclusive: at(-10),
      quota: { kind: 'held', reservationRef: 'r' },
      view: {
        scheduleId: 's',
        revision: 1,
        control: 'active',
        standing: { kind: 'ready', reasons: [] },
        eligibleConsumed: CONSUMED,
        acceptedJobCount: 0,
        definition: {
          recurrence: { kind: 'cron' },
          limits: { eligibleLimit, jobLimit: null, excludeDates: [] },
          purpose: { kind: 'execution', catchUp: { kind: 'none' }, overlap: 'parallel' },
        },
      },
    },
    state: {
      revision: 1,
      watchedFrom: at(-10),
      watchedCause: 'enabled',
      disposedThrough: null,
      next: null,
      block: null,
      selected: [],
      counting: null,
      ...state,
    },
    latest: null,
    unfinishedJobs: 0,
  } as unknown as DispatchSchedule
}

/** A rule with a slot every minute, and every question the dispatcher asked of the prediction. */
function world() {
  const asked: { after: string; count: number; counted: number }[] = []
  const ports = {
    owner: { kind: 'tenant', tenantId: 't', ownerId: 'o' },
    policy: { intervalMs: 1000, gapMs: 1000, roundLimit: 10, classifyPages: 5 },
    standing: async () => ({ kind: 'eligible' }),
    missingCarriers: () => [],
    async predict(_record: unknown, after: ScheduleInstant, count: number, counted: number) {
      asked.push({ after, count, counted })
      const first = Math.floor((Date.parse(after) - T0) / MINUTE) + 1
      const candidates = Array.from({ length: count }, (_, index) => slot(first + index))
      return { kind: 'ok', candidates: candidates as ScheduleCandidate[], complete: true }
    },
  } as unknown as DispatcherPorts
  return { ports, asked }
}

describe('what the dispatcher tells the prediction about where the count stands', () => {
  it('a refresh counts the consumed slots and the ones queued to be caught up', async () => {
    const w = world()
    const queued = item({ disposedThrough: at(9), selected: [slot(8), slot(9)] })
    await refreshCommand(w.ports, queued, at(10))
    expect(w.asked).toEqual([{ after: at(9), count: 1, counted: CONSUMED + 2 }])
  })

  it('the first refresh of a schedule, with no dispatch state yet, counts on from what it consumed', async () => {
    const w = world()
    await refreshCommand(w.ports, { ...item({}), state: null }, at(10))
    expect(w.asked).toEqual([{ after: at(10), count: 1, counted: CONSUMED }])
  })

  it('a due slot counts itself before asking what follows it', async () => {
    const w = world()
    await admitCommand(w.ports, item({ next: slot(3) }), null, at(3))
    expect(w.asked).toEqual([{ after: at(3), count: 1, counted: CONSUMED + 1 }])
  })

  it('a missed stretch counts on page by page, then counts the whole stretch before asking what follows it', async () => {
    const w = world()
    const watch = { beatAt: at(150), watchFrom: at(150) }
    const command = await admitCommand(w.ports, item({ next: slot(0) }), watch, at(150))
    expect(w.asked.map(question => [question.count, question.counted])).toEqual([
      [100, CONSUMED],
      [100, CONSUMED + 100],
      [1, CONSUMED + 150],
    ])
    expect(command).toMatchObject({ kind: 'classify', next: { scheduledAt: at(150) } })
    expect(command?.kind === 'classify' ? command.counted?.length : null).toBe(150)
  })
})
