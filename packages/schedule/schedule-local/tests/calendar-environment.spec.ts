import { expect, test, vi } from 'vitest'
import { createScheduleCalendarEnvironment } from '@omne-harness/schedule-local'
import { calendarIdSchema } from '@omne-harness/calendar-contract'
import type { CalendarEnvironmentReader } from '@omne-harness/calendar'
import { ScheduleCallContextSchema } from '@omne-harness/schedule-contract'

const context = ScheduleCallContextSchema.parse({
  principalRef: 'alice',
  owner: { kind: 'tenant', tenantId: 't1', ownerId: 'alice' },
  actor: { kind: 'human', actorRef: 'alice' },
  authContextRef: 'auth:1',
  requestId: 'r1',
  originatingSessionRef: null,
})
test.each([calendarIdSchema.parse('cn'), null])(
  'preserves the same environment revision with calendar %s',
  async calendarId => {
    const read = vi.fn<CalendarEnvironmentReader['read']>(async () => ({
      kind: 'found',
      value: {
        owner: context.owner,
        revision: 'settings:19',
        timezone: 'Asia/Shanghai',
        calendarId,
      },
    }))
    expect(await createScheduleCalendarEnvironment({ read }).observe(context)).toEqual({
      kind: 'ok',
      value: {
        owner: context.owner,
        revision: 'settings:19',
        timezone: 'Asia/Shanghai',
        calendar: calendarId === null ? null : { calendarId, version: { kind: 'latest' } },
      },
    })
    expect(read).toHaveBeenCalledExactlyOnceWith(context)
  },
)
test('preserves missing versus unavailable and catches dependency rejection', async () => {
  const read = vi
    .fn<CalendarEnvironmentReader['read']>()
    .mockResolvedValueOnce({ kind: 'missing' })
    .mockResolvedValueOnce({ kind: 'unavailable' })
    .mockRejectedValueOnce(new Error('offline'))
  const environment = createScheduleCalendarEnvironment({ read })
  expect(await environment.observe(context)).toEqual({ kind: 'absent' })
  for (let i = 0; i < 2; i++)
    expect(await environment.observe(context)).toMatchObject({
      kind: 'unavailable',
      error: { code: 'authority_unavailable', requestId: 'r1' },
    })
})
