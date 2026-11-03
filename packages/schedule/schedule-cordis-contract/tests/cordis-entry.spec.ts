import { expect, it } from 'vitest'
import { Service } from '@deepseek-ai/cordis'
import {
  ScheduleCommandsService,
  ScheduleQueriesService,
  scheduleCommandsKey,
  scheduleQueriesKey,
} from '@omne-harness/schedule-cordis-contract/cordis'

it('exposes the unique command and query service identities for Cordis consumers', () => {
  expect(scheduleCommandsKey).toBe('scheduleCommands')
  expect(scheduleQueriesKey).toBe('scheduleQueries')
  expect(ScheduleCommandsService.provide).toBe(scheduleCommandsKey)
  expect(ScheduleQueriesService.provide).toBe(scheduleQueriesKey)
  expect(ScheduleCommandsService.prototype).toBeInstanceOf(Service)
  expect(ScheduleQueriesService.prototype).toBeInstanceOf(Service)
})
