import type { CalendarEnvironmentReader } from '@omne-harness/calendar'
import type { SchedulePredictionEnvironmentReader } from '@omne-harness/schedule'

/** This projection carries an observation, not a guard for a later command. */
export function createScheduleCalendarEnvironment(
  environment: CalendarEnvironmentReader,
): SchedulePredictionEnvironmentReader {
  return {
    async observe(context) {
      try {
        const result = await environment.read(context)
        if (result.kind === 'missing') return { kind: 'absent' }
        if (result.kind === 'found') {
          return {
            kind: 'ok',
            value: {
              owner: result.value.owner,
              revision: result.value.revision,
              timezone: result.value.timezone,
              calendar:
                result.value.calendarId === null
                  ? null
                  : {
                      calendarId: result.value.calendarId,
                      version: { kind: 'latest' },
                    },
            },
          }
        }
      } catch {}
      return {
        kind: 'unavailable',
        error: {
          code: 'authority_unavailable',
          requestId: context.requestId,
          message: 'The effective environment is unavailable',
          retryable: true,
          details: {},
        },
      }
    },
  }
}
