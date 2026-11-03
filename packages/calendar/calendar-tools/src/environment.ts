import {
  calendarCallContextSchema,
  calendarQueryResultSchema,
  type CalendarCallContext,
  type CalendarQueryResult,
} from '@omne-harness/calendar-contract'
import { succeed } from '@omne-harness/operation-result'
import type {
  CallAccess,
  PreparationProgress,
  ToolEnvironment,
} from '@omne-harness/tool-contract/provider'

export interface CalendarToolContextResolver<P> {
  resolve(access: CallAccess<P>): Promise<CalendarQueryResult<CalendarCallContext>>
}
export type CalendarToolEnvironment = Readonly<{
  calendarContext: CalendarQueryResult<CalendarCallContext>
}>
const contextResultSchema = calendarQueryResultSchema(calendarCallContextSchema)

/** The host retains preparation/release ownership; the resolver contributes no resource lease. */
export function createCalendarToolEnvironment<P, E>(
  base: ToolEnvironment<P, E>,
  resolver: CalendarToolContextResolver<P>,
): ToolEnvironment<P, CalendarToolEnvironment> {
  const project = async (
    input: Parameters<typeof base.prepare>[0],
    progress: Awaited<ReturnType<typeof base.prepare>>,
  ): Promise<Awaited<ReturnType<ToolEnvironment<P, CalendarToolEnvironment>['prepare']>>> => {
    if ('failure' in progress) return progress
    if (progress.ok.kind !== 'prepared') return succeed(progress.ok)
    const calendarContext = await resolveContext(resolver, input)
    const prepared: PreparationProgress<CalendarToolEnvironment> = {
      kind: 'prepared',
      environment: { ...progress.ok.environment, value: { calendarContext } },
    }
    return succeed(prepared)
  }
  return {
    adoption: base.adoption,
    prepare: async input => project(input, await base.prepare(input)),
    inspectPreparation: async input => project(input, await base.inspectPreparation(input)),
    release: input => base.release(input),
    inspectRelease: input => base.inspectRelease(input),
  }
}

async function resolveContext<P>(
  resolver: CalendarToolContextResolver<P>,
  input: CallAccess<P>,
): Promise<CalendarQueryResult<CalendarCallContext>> {
  try {
    const result = contextResultSchema.safeParse(await resolver.resolve(input))
    if (result.success) return result.data
    return contextFailure(input, 'environment_incoherent')
  } catch {
    return contextFailure(input, 'provider_failure')
  }
}

function contextFailure<P>(
  input: CallAccess<P>,
  code: 'environment_incoherent' | 'provider_failure',
): CalendarQueryResult<CalendarCallContext> {
  return {
    kind: 'error',
    error: {
      code,
      message: 'Calendar call context could not be prepared',
      retryable: code === 'provider_failure',
      requestId: input.call,
      details: {},
    },
  }
}
