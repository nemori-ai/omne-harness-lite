import { z } from 'zod'
import {
  ScheduleCallContextSchema,
  ScheduleExecutionsRequestSchema,
  ScheduleGetRequestSchema,
  ScheduleListRequestSchema,
  SchedulePreviewRequestSchema,
  ScheduleRevisionsPageSchema,
  ScheduleRevisionsRequestSchema,
  ScheduleAgendaRequestSchema,
  ScheduleFingerprintSchema,
  type ScheduleCallContext,
  type ScheduleDomainError,
  type SchedulePage,
  type ScheduleQueryResult,
  type ScheduleQueries,
} from '@omne-harness/schedule-contract'
import type { ReadAccess } from '../management/types.ts'
import type { ScheduleQueryApplication, ScheduleQueryDependencies } from './types.ts'
import {
  decodeCursor,
  digest,
  encodeCursor,
  fail,
  freeze,
  QueryFailure,
  requireEqual,
  type QueryCursor,
} from './boundary.ts'
import { predictionInput, QueryObservation } from './observation.ts'
import { agenda } from './agenda.ts'

const LimitsSchema = z.strictObject({
  timeoutMs: z.int().positive().max(2_147_483_647),
  maxDependencyCalls: z.int().positive(),
  maxAgendaSchedules: z.int().positive().max(10_000),
  maxAgendaRows: z.int().positive().max(5_000),
})
function paging(
  observation: QueryObservation,
  access: ReadAccess,
  action: QueryCursor['action'],
  request: { cursor: string | null },
) {
  const queryHash = ScheduleFingerprintSchema.parse(
    digest([
      action,
      observation.context.owner,
      observation.context.principalRef,
      access,
      { ...request, cursor: null },
    ]),
  )
  const cursor = decodeCursor(observation.context, request.cursor, action, queryHash)
  if (cursor !== null && cursor.continuation.kind !== 'provider')
    fail(observation.context, 'stale_cursor', 'Invalid page continuation')
  return {
    providerCursor: cursor?.continuation.kind === 'provider' ? cursor.continuation.cursor : null,
    finish<T, P extends SchedulePage<T>>(page: P, dataObservation = page.observationRevision): P {
      if (cursor !== null)
        requireEqual(observation.context, cursor.observationRevision, dataObservation)
      return {
        ...page,
        nextCursor:
          page.nextCursor === null
            ? null
            : encodeCursor({
                version: 1,
                action,
                queryHash,
                observationRevision: dataObservation,
                continuation: { kind: 'provider', cursor: page.nextCursor },
              }),
      }
    },
  }
}
function invalid(error: ScheduleDomainError): ScheduleQueryResult<never> {
  return { kind: 'error', error }
}
export function createScheduleQueryApplication(
  dependencies: ScheduleQueryDependencies,
): ScheduleQueryApplication {
  LimitsSchema.parse(dependencies.limits)
  if (
    !dependencies.history ||
    !dependencies.prediction ||
    !dependencies.authorizer ||
    !dependencies.store
  )
    throw new TypeError('Schedule query providers must be explicit')
  function run<I, O>(
    action: keyof ScheduleQueries,
    schema: z.ZodType<I>,
    work: (observation: QueryObservation, access: ReadAccess, request: I) => Promise<O>,
  ) {
    return async (context: ScheduleCallContext, input: I): Promise<ScheduleQueryResult<O>> => {
      const parsedContext = ScheduleCallContextSchema.safeParse(context)
      const request = schema.safeParse(input)
      if (!parsedContext.success || !request.success)
        return invalid({
          code: 'invalid_input',
          message: 'Invalid query or context',
          retryable: false,
          requestId: parsedContext.success
            ? parsedContext.data.requestId
            : 'schedule.query.invalid-context',
          details: {},
        })
      try {
        const observation = new QueryObservation(dependencies, freeze(parsedContext.data))
        const access = await observation.authorize(action)
        const value = await work(observation, access, request.data)
        return { kind: 'ok', value }
      } catch (error) {
        return invalid(
          error instanceof QueryFailure
            ? error.error
            : {
                code: 'provider_failure',
                message: 'Query failed',
                retryable: true,
                requestId: parsedContext.data.requestId,
                details: {},
              },
        )
      }
    }
  }
  return {
    queries: {
      list: run('list', ScheduleListRequestSchema, async (observation, access, request) => {
        const page = paging(observation, access, 'list', request)
        const result = await observation.list(access, { ...request, cursor: page.providerCursor })
        const value = page.finish(result)
        await observation.confirm(access)
        return value
      }),
      get: run('get', ScheduleGetRequestSchema, async (observation, access, request) => {
        const result = await observation.get(access, request.scheduleId)
        await observation.confirm(access)
        return result.value.view
      }),
      revisions: run(
        'revisions',
        ScheduleRevisionsRequestSchema,
        async (observation, access, request) => {
          const page = paging(observation, access, 'revisions', request)
          const current = await observation.get(access, request.scheduleId)
          const result = await observation.read(ScheduleRevisionsPageSchema, () =>
            dependencies.store.readRevisions({
              access,
              request: { ...request, cursor: page.providerCursor },
            }),
          )
          requireEqual(observation.context, current.observationRevision, result.observationRevision)
          if (
            result.items.length > request.limit ||
            result.items.some(row => row.scheduleId !== request.scheduleId) ||
            (result.nextCursor !== null &&
              (result.items.length === 0 || result.nextCursor === page.providerCursor))
          )
            fail(
              observation.context,
              'provider_failure',
              'Revision page does not match the request',
            )
          const value = page.finish(result)
          await observation.confirm(access)
          return value
        },
      ),
      executions: run(
        'executions',
        ScheduleExecutionsRequestSchema,
        async (observation, access, request) => {
          const page = paging(observation, access, 'executions', request)
          const current = await observation.get(access, request.scheduleId)
          const history = await observation.historyObservation(access)
          const result = await observation.history(access, history.observationRevision, {
            ...request,
            cursor: page.providerCursor,
          })
          const value = page.finish(
            result,
            digest([current.observationRevision, history.observationRevision]),
          )
          await observation.confirmHistory(access, history.observationRevision)
          await observation.confirm(access)
          return value
        },
      ),
      preview: run(
        'preview',
        SchedulePreviewRequestSchema,
        async (observation, access, request) => {
          const current =
            request.source.kind === 'schedule'
              ? await observation.get(access, request.source.scheduleId)
              : null
          const input =
            current === null && request.source.kind === 'inline'
              ? {
                  definition: request.source.definition,
                  definitionRevision: 0,
                  activationExclusive: null,
                  eligibleConsumed: 0,
                  acceptedJobCount: 0,
                  after: request.after,
                  count: request.count,
                }
              : current === null
                ? fail(observation.context, 'invalid_input', 'Missing preview source')
                : predictionInput(current.value, request.after, request.count)
          const value = await observation.predict(input)
          if (current !== null) {
            const final = await observation.get(access, current.value.view.scheduleId)
            requireEqual(observation.context, current, final)
          }
          await observation.confirm(access)
          return value
        },
      ),
      agenda: run('agenda', ScheduleAgendaRequestSchema, agenda),
    },
  }
}
