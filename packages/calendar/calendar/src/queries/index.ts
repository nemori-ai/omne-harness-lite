import { Temporal } from '@js-temporal/polyfill'
import {
  calendarCallContextSchema,
  calendarListInputSchema,
  calendarGetInputSchema,
  calendarResolveSchema,
  instantSchema,
  type CalendarCallContext,
  type CalendarQueries,
  type CalendarQueryResult,
} from '@omne-harness/calendar-contract'
import { z } from 'zod'
import type { CalendarQueriesDependencies, CalendarQueryAction } from './ports.ts'
import { QueryAccess, readEnvironment } from './access.ts'
import { QueryFailure, domainError } from './failure.ts'
import {
  catalogSchema,
  calendarInfo,
  findCalendar,
  listDirectory,
  parseDirectoryCursor,
} from './catalog.ts'
import { resolveCalculation } from './calculate.ts'

export type * from './ports.ts'
export function createCalendarQueries(dependencies: CalendarQueriesDependencies): CalendarQueries {
  const { repository, authority, environment, clock } = dependencies
  const catalog = catalogSchema.parse(dependencies.catalog)
  const observedAt = () =>
    instantSchema.parse(
      Temporal.Instant.fromEpochMilliseconds(clock.now()).toString({ fractionalSecondDigits: 3 }),
    )

  async function execute<S extends z.ZodType, T>(
    context: CalendarCallContext,
    action: CalendarQueryAction,
    schema: S,
    input: unknown,
    run: (access: QueryAccess, input: z.output<S>) => Promise<T>,
  ): Promise<CalendarQueryResult<T>> {
    const parsedContext = calendarCallContextSchema.safeParse(context)
    const parsedInput = schema.safeParse(input)
    if (!parsedContext.success || !parsedInput.success)
      return {
        kind: 'error',
        error: domainError(
          new QueryFailure('invalid_input'),
          parsedContext.success ? parsedContext.data.requestId : 'invalid-request',
        ),
      }
    const access = new QueryAccess(authority, parsedContext.data, action)
    let result: CalendarQueryResult<T>
    try {
      result = { kind: 'ok', value: await run(access, parsedInput.data) }
    } catch (error) {
      result = { kind: 'error', error: domainError(error, parsedContext.data.requestId) }
    }
    try {
      await access.recheck()
    } catch (error) {
      return { kind: 'error', error: domainError(error, parsedContext.data.requestId) }
    }
    return result
  }
  return {
    list(context, input = {}) {
      return execute(context, 'list', calendarListInputSchema, input, async (access, page) => {
        parseDirectoryCursor(page.after)
        await access.require(null)
        const value = await listDirectory(repository, catalog, access, {
          after: page.after ?? null,
          limit: page.limit ?? 20,
        })
        return { ...value, observedAt: observedAt() }
      })
    },
    get(context, input) {
      return execute(context, 'get', calendarGetInputSchema, input, async (access, query) => {
        await access.require(query.calendarId)
        const directory = await findCalendar(repository, catalog, query.calendarId)
        const info = await calendarInfo(repository, directory, {
          after: query.versionsAfter ?? null,
          limit: query.versionsLimit ?? 20,
        })
        return { ...info, observedAt: observedAt() }
      })
    },
    effective(context) {
      return execute(context, 'effective', z.null(), null, async access => {
        await access.require(null)
        const value = await readEnvironment(environment, access.context)
        await access.require(value.calendarId)
        const directory = await findCalendar(repository, catalog, value.calendarId)
        return {
          owner: value.owner,
          environmentRevision: value.revision,
          activeTimezone: value.timezone,
          calendar: await calendarInfo(repository, directory, { after: null, limit: 20 }),
        }
      })
    },
    resolve(context, input) {
      return execute(context, 'resolve', calendarResolveSchema, input, async (access, query) => {
        let calendarId
        if (query.selection.kind === 'effective') {
          await access.require(null)
          calendarId = (await readEnvironment(environment, access.context)).calendarId
        } else calendarId = query.selection.calendarId
        await access.require(calendarId)
        await findCalendar(repository, catalog, calendarId)
        return resolveCalculation(repository, calendarId, query)
      })
    },
  }
}
