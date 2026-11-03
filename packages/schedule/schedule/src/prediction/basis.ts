import {
  ScheduleCalendarSelectionSchema,
  ScheduleOwnerSchema,
  ScheduleTimezoneSchema,
} from '@omne-harness/schedule-contract'
import type { ScheduleAdoptedBasis, ScheduleCallContext } from '@omne-harness/schedule-contract'
import type { SchedulePredictionDependencies, SchedulePredictionInput } from './types.ts'
import { FixedCalendar } from './calendar.ts'
import { PredictionBudget, PredictionFailure } from './budget.ts'

export async function captureBasis(
  context: ScheduleCallContext,
  input: SchedulePredictionInput,
  dependencies: SchedulePredictionDependencies,
  budget: PredictionBudget,
): Promise<{ basis: ScheduleAdoptedBasis; calendar: FixedCalendar | null }> {
  const binding = input.definition.binding
  let timezone: string
  let selection
  let environmentRevision: string | null = null
  if (binding.kind === 'explicit') {
    timezone = binding.timezone
    selection = binding.calendar
  } else {
    if (context.owner.kind !== 'tenant')
      throw new PredictionFailure(
        'missing_environment',
        'System schedules require an explicit binding',
      )
    const observation = await budget.read(() => dependencies.environment.observe(context))
    if (observation.kind === 'unavailable')
      throw new PredictionFailure(
        observation.error.code,
        observation.error.message,
        observation.error.details,
        observation.error.retryable,
      )
    if (observation.kind === 'changed')
      throw new PredictionFailure('stale_basis', 'Environment changed during observation', {}, true)
    if (observation.kind !== 'ok')
      throw new PredictionFailure('missing_environment', 'No effective environment')
    const owner = ScheduleOwnerSchema.safeParse(observation.value.owner)
    const zone = ScheduleTimezoneSchema.safeParse(observation.value.timezone)
    const calendar = ScheduleCalendarSelectionSchema.nullable().safeParse(
      observation.value.calendar,
    )
    if (
      !owner.success ||
      !zone.success ||
      !calendar.success ||
      typeof observation.value.revision !== 'string' ||
      observation.value.revision.length === 0
    )
      throw new PredictionFailure('provider_failure', 'Malformed environment projection')
    if (
      owner.data.kind !== 'tenant' ||
      owner.data.tenantId !== context.owner.tenantId ||
      owner.data.ownerId !== context.owner.ownerId
    )
      throw new PredictionFailure('environment_incoherent', 'Environment belongs to another owner')
    timezone = zone.data
    selection = calendar.data
    environmentRevision = observation.value.revision
  }
  const recurrence = input.definition.recurrence
  if (
    selection === null &&
    (input.definition.calendarOverlay !== null ||
      (recurrence.kind === 'position' && recurrence.selector.kind === 'workingDay'))
  )
    throw new PredictionFailure('missing_environment', 'This recurrence requires a calendar')
  const calendar =
    selection === null
      ? null
      : await FixedCalendar.capture(selection, timezone, dependencies.calendar, context, budget)
  return {
    calendar,
    basis: {
      timezone,
      tzdbVersion: dependencies.versions.tzdbVersion,
      ruleEngineVersion: dependencies.versions.ruleEngineVersion,
      definitionRevision: input.definitionRevision,
      environmentRevision,
      calendarId: calendar?.basis.calendarId ?? null,
      calendarVersionId: calendar?.basis.versionId ?? null,
      publicationGeneration: calendar?.basis.publicationGeneration ?? null,
    },
  }
}
