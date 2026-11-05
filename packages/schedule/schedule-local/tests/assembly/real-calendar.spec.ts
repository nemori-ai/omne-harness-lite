import { expect, it } from 'vitest'
import { createCalendarQueries } from '@omne-harness/calendar'
import { createScheduleLocalApplication } from '@omne-harness/schedule-local'
import { ScheduleDefinitionSchema, ScheduleInstantSchema } from '@omne-harness/schedule-contract'
import {
  command,
  openWorld as openCalendar,
} from '../../../../calendar/calendar-local/tests/world.ts'
import { openWorld as openSchedule } from '../storage/world.ts'
import { context } from '../storage/data.ts'
import { localOptions } from './fixture.ts'

it('accepts a real Calendar nth prefix witness over SQLite in a Schedule worker preview', async () => {
  const calendar = await openCalendar()
  const schedule = await openSchedule()
  const options = localOptions(schedule)
  const queries = createCalendarQueries({
    repository: calendar.repository,
    authority: { check: async () => ({ kind: 'allowed' }) },
    environment: { read: async () => ({ kind: 'missing' }) },
    clock: { now: () => Date.parse('2026-01-01T00:00:00Z') },
    catalog: [],
  })
  const app = await createScheduleLocalApplication({
    ...options,
    prediction: { ...options.prediction, calendar: queries },
  })
  try {
    expect(await calendar.persistence.commitDisposition(command())).toMatchObject({
      kind: 'recorded',
    })
    const definition = ScheduleDefinitionSchema.parse({
      label: 'First working day',
      recurrence: {
        kind: 'position',
        period: 'month',
        interval: 1,
        begin: '2026-11-01T00:00:00',
        until: '2026-11-30T23:59:59',
        ordinal: 1,
        selector: { kind: 'workingDay' },
        times: ['09:00:00'],
      },
      binding: {
        kind: 'explicit',
        timezone: 'Asia/Tokyo',
        calendar: { calendarId: 'test-calendar', version: { kind: 'latest' } },
      },
      calendarOverlay: null,
      limits: { eligibleLimit: null, jobLimit: null, excludeDates: [] },
      purpose: {
        kind: 'reminder',
        content: { title: null, body: 'Check the first workday' },
        admissionPolicy: 'reminder-window-v1',
        overlap: 'parallel',
      },
    })
    const result = await app.queries.preview(context, {
      source: { kind: 'inline', definition },
      after: ScheduleInstantSchema.parse('2026-10-31T00:00:00.000Z'),
      count: 1,
    })
    expect(result).toMatchObject({
      kind: 'ok',
      value: {
        complete: true,
        candidates: [
          {
            scheduledAt: '2026-11-02T00:00:00.000Z',
            dateExplanation: [
              { basis: { inspectedRange: { from: '2026-11-01', to: '2026-11-02' } } },
            ],
          },
        ],
      },
    })
  } finally {
    await app.close()
    await schedule.close()
    await calendar.close()
  }
})
