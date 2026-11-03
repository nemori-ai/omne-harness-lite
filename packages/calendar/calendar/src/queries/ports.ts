import type {
  CalendarCallContext,
  CalendarId,
  CalendarOwner,
  CalendarInfo,
} from '@omne-harness/calendar-contract'
import type { CalendarRepository } from '../persistence.ts'

export type CalendarQueryAction = 'list' | 'get' | 'effective' | 'resolve'
export interface CalendarAuthorityReader {
  check(
    input: Readonly<{
      context: CalendarCallContext
      action: CalendarQueryAction
      calendarId: CalendarId | null
    }>,
  ): Promise<
    | Readonly<{ kind: 'allowed' }>
    | Readonly<{ kind: 'denied' }>
    | Readonly<{ kind: 'unauthenticated' }>
    | Readonly<{ kind: 'unavailable' }>
  >
}
export interface CalendarEnvironmentReader {
  read(context: CalendarCallContext): Promise<
    | Readonly<{
        kind: 'found'
        value: Readonly<{
          owner: CalendarOwner
          revision: string
          timezone: string
          calendarId: CalendarId | null
        }>
      }>
    | Readonly<{ kind: 'missing' }>
    | Readonly<{ kind: 'unavailable' }>
  >
}
export interface CalendarQueryClock {
  now(): number
}
export type CalendarCatalogEntry = Pick<
  CalendarInfo,
  'calendarId' | 'timezone' | 'semanticBoundary'
>
export type CalendarQueriesDependencies = Readonly<{
  repository: CalendarRepository
  environment: CalendarEnvironmentReader
  authority: CalendarAuthorityReader
  clock: CalendarQueryClock
  catalog: readonly CalendarCatalogEntry[]
}>
