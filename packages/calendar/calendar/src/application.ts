import type { CalendarPersistence, CalendarRepository } from './persistence.ts'
import { createCalendarQueries, type CalendarQueriesDependencies } from './queries/index.ts'
import { createCalendarSupplyApplication } from './supply-application/index.ts'
import type { CalendarSupplyDependencies } from './supply-application/ports.ts'

export type CalendarApplicationDependencies = Readonly<{
  repository: CalendarRepository
  persistence: CalendarPersistence
  queries: Omit<CalendarQueriesDependencies, 'repository'>
  supply: Omit<CalendarSupplyDependencies, 'repository' | 'persistence'>
}>

export function createCalendarApplication(input: CalendarApplicationDependencies) {
  return {
    queries: createCalendarQueries({ ...input.queries, repository: input.repository }),
    supply: createCalendarSupplyApplication({
      ...input.supply,
      repository: input.repository,
      persistence: input.persistence,
    }),
  }
}

export type CalendarApplication = ReturnType<typeof createCalendarApplication>
