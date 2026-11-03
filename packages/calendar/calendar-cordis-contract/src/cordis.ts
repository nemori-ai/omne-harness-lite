import { Service, type Context } from '@deepseek-ai/cordis'
import type { CalendarQueries, CalendarSupply } from '@omne-harness/calendar-contract'

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

/** @owner packages/calendar/calendar-cordis-contract */
export abstract class CalendarSupplyService extends Service implements CalendarSupply {
  static readonly provide = 'calendarSupply'

  constructor(ctx: Context) {
    super(ctx, CalendarSupplyService.provide)
  }

  abstract readonly probe: CalendarSupply['probe']
  abstract readonly refresh: CalendarSupply['refresh']
  abstract readonly importSeed: CalendarSupply['importSeed']
  abstract readonly queryPublication: CalendarSupply['queryPublication']
  abstract readonly health: CalendarSupply['health']
}
export const calendarSupplyKey = CalendarSupplyService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    calendarQuery: CalendarQueryService
    calendarSupply: CalendarSupplyService
  }
}
