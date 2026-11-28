import type { CalendarQueries } from '@omne-harness/calendar-contract'
import type {
  ScheduleAdoptedBasis,
  ScheduleCalendarSelection,
  ScheduleCallContext,
  ScheduleDefinition,
  ScheduleInstant,
  ScheduleOwner,
  SchedulePreviewView,
  ScheduleQueryResult,
} from '@omne-harness/schedule-contract'
import type { ScheduleRecurrenceCalculator, ScheduleTimezone } from '../calculation/types.ts'
import type { ManagementDefinitionResolver, ReadResult } from '../management/types.ts'

export type SchedulePredictionInput = Readonly<{
  definition: ScheduleDefinition
  definitionRevision: number
  activationExclusive: ScheduleInstant | null
  eligibleConsumed: number
  /** Where the count stands: the eligible slots from this instant on are not among `eligibleConsumed`.
   * Null counts on from `after`. Read only when the definition has an eligible limit. */
  eligibleFrom: ScheduleInstant | null
  acceptedJobCount: number
  after: ScheduleInstant
  count: number
}>
export type SchedulePredictionEnvironment = Readonly<{
  owner: ScheduleOwner
  revision: string
  timezone: ScheduleTimezone
  calendar: ScheduleCalendarSelection | null
}>
export interface SchedulePredictionEnvironmentReader {
  observe(context: ScheduleCallContext): Promise<ReadResult<SchedulePredictionEnvironment>>
}
export interface SchedulePredictionBasisGuards {
  prepare(
    input: Readonly<{
      context: ScheduleCallContext
      definition: ScheduleDefinition
      basis: ScheduleAdoptedBasis
      referenceExclusive: ScheduleInstant
    }>,
  ): Promise<ReadResult<Readonly<{ guardRef: string }>>>
}
export type SchedulePredictionLimits = Readonly<{
  maxCandidates: number
  maxYears: number
  maxExplanations: number
  maxCalendarCalls: number
  timeoutMs: number
}>
export type SchedulePredictionDependencies = Readonly<{
  calculator: ScheduleRecurrenceCalculator
  calendar: CalendarQueries
  environment: SchedulePredictionEnvironmentReader
  basisGuards: SchedulePredictionBasisGuards
  monotonicClock: Readonly<{ now(): number }>
  versions: Readonly<{ tzdbVersion: string; ruleEngineVersion: string }>
  limits: SchedulePredictionLimits
}>
export interface SchedulePredictionService {
  preview(
    context: ScheduleCallContext,
    input: SchedulePredictionInput,
  ): Promise<ScheduleQueryResult<SchedulePreviewView>>
  definitions: ManagementDefinitionResolver
}
