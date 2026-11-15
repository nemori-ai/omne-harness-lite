import type {
  ScheduleExecutionRow,
  ScheduleExecutionsRequest,
  ScheduleInstant,
  SchedulePage,
  ScheduleQueries,
} from '@omne-harness/schedule-contract'
import type {
  ReadAccess,
  ReadResult,
  ScheduleManagementStore,
  ScheduleReadAuthorizer,
} from '../management/types.ts'
import type { SchedulePredictionService } from '../prediction/types.ts'

export interface ScheduleHistoryReader {
  observe(
    input: Readonly<{ access: ReadAccess }>,
  ): Promise<ReadResult<{ observationRevision: string }>>
  read(
    input: Readonly<{
      access: ReadAccess
      observationRevision: string
      request: ScheduleExecutionsRequest
    }>,
  ): Promise<ReadResult<SchedulePage<ScheduleExecutionRow>>>
  confirm(
    input: Readonly<{
      access: ReadAccess
      observationRevision: string
    }>,
  ): Promise<ReadResult<{ observationRevision: string }>>
}

export type ScheduleQueryLimits = Readonly<{
  timeoutMs: number
  maxDependencyCalls: number
  maxAgendaSchedules: number
  maxAgendaRows: number
}>

export type ScheduleQueryDependencies = Readonly<{
  store: ScheduleManagementStore
  authorizer: ScheduleReadAuthorizer
  prediction: Pick<SchedulePredictionService, 'preview'>
  history: ScheduleHistoryReader
  clock: Readonly<{ now(): ScheduleInstant }>
  monotonicClock: Readonly<{ now(): number }>
  limits: ScheduleQueryLimits
}>

export type ScheduleQueryApplication = Readonly<{ queries: ScheduleQueries }>
export type ScheduleQueryApplicationFactory = (
  dependencies: ScheduleQueryDependencies,
) => ScheduleQueryApplication
