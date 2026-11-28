import type {
  CalendarCalculator,
  CalendarCallContext,
  CalendarQueries,
  CalendarSupply,
} from '@omne-harness/calendar-contract'
import {
  calendarCalculatorKey,
  calendarQueryKey,
  calendarSupplyKey,
} from '@omne-harness/calendar-cordis-contract/cordis'
import { defineEntry } from '@omne-harness/assembly-cordis/cordis'
import type { RowEntry } from '../../row.ts'
import { monotonicClock } from '../../shutdown.ts'

const DRAIN_MS = 10_000

/** No generation of the calendar serves: the call was not made, and asking again later may be answered. */
const unavailable = async (ctx: CalendarCallContext) =>
  ({
    kind: 'error',
    error: {
      code: 'provider_failure',
      message: 'no generation of the calendar serves now',
      retryable: true,
      requestId: ctx.requestId,
      details: {},
    },
  }) as const

const drain = {
  drainTimeoutMs: DRAIN_MS,
  clock: { delay: (ms: number) => monotonicClock.after(ms).promise },
}

/** The entries of the calendar row: what the rows that depend on it inject, whichever generation serves. */
export function calendarEntries(): readonly RowEntry[] {
  return [
    defineEntry<CalendarQueries>({
      key: calendarQueryKey,
      unavailable: {
        list: unavailable,
        get: unavailable,
        effective: unavailable,
        resolve: unavailable,
        health: unavailable,
      },
      ...drain,
    }),
    defineEntry<CalendarCalculator>({
      key: calendarCalculatorKey,
      unavailable: { answer: unavailable },
      ...drain,
    }),
    defineEntry<CalendarSupply>({
      key: calendarSupplyKey,
      unavailable: {
        probe: unavailable,
        refresh: unavailable,
        importSeed: unavailable,
        queryPublication: unavailable,
        health: unavailable,
      },
      ...drain,
    }),
  ]
}
