import { Service, type Context } from '@deepseek-ai/cordis'
import type { CalendarQueries } from '@omne-harness/calendar-contract'

/**
 * Injection grants assembly access, not calendar.read authorization.
 * @owner packages/calendar/calendar-cordis-contract
 */
export abstract class CalendarQueryService extends Service implements CalendarQueries {
  static readonly provide = 'calendarQuery'

  constructor(ctx: Context) {
    super(ctx, CalendarQueryService.provide)
  }

  abstract readonly list: CalendarQueries['list']
  abstract readonly get: CalendarQueries['get']
  abstract readonly effective: CalendarQueries['effective']
  abstract readonly resolve: CalendarQueries['resolve']
}
export const calendarQueryKey = CalendarQueryService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    calendarQuery: CalendarQueryService
  }
}
