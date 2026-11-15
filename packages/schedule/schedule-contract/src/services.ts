import type { ScheduleCallContext } from './values.ts'
import type { ScheduleCommand, ScheduleCreateRequest } from './commands.ts'
import type { ScheduleOperationLocator } from './operation.ts'
import type {
  ScheduleCommandResult,
  ScheduleQueryResult,
  ScheduleOperationView,
} from './results.ts'
import type { ScheduleView, ScheduleRevisionView } from './views.ts'
import type { ScheduleExecutionRow } from './history.ts'
import type {
  SchedulePage,
  ScheduleListRequest,
  ScheduleListPage,
  ScheduleGetRequest,
  ScheduleRevisionsRequest,
  ScheduleExecutionsRequest,
  ScheduleAgendaRequest,
  ScheduleAgendaView,
  SchedulePreviewRequest,
  SchedulePreviewView,
} from './queries.ts'
export interface ScheduleCommands {
  create(
    ctx: ScheduleCallContext,
    input: ScheduleCreateRequest,
  ): Promise<ScheduleCommandResult<ScheduleView>>
  execute(
    ctx: ScheduleCallContext,
    input: ScheduleCommand,
  ): Promise<ScheduleCommandResult<ScheduleView>>
  queryOperation(
    ctx: ScheduleCallContext,
    input: ScheduleOperationLocator,
  ): Promise<ScheduleQueryResult<ScheduleOperationView>>
}
export interface ScheduleQueries {
  list(
    ctx: ScheduleCallContext,
    input: ScheduleListRequest,
  ): Promise<ScheduleQueryResult<ScheduleListPage>>
  get(
    ctx: ScheduleCallContext,
    input: ScheduleGetRequest,
  ): Promise<ScheduleQueryResult<ScheduleView>>
  revisions(
    ctx: ScheduleCallContext,
    input: ScheduleRevisionsRequest,
  ): Promise<ScheduleQueryResult<SchedulePage<ScheduleRevisionView>>>
  executions(
    ctx: ScheduleCallContext,
    input: ScheduleExecutionsRequest,
  ): Promise<ScheduleQueryResult<SchedulePage<ScheduleExecutionRow>>>
  agenda(
    ctx: ScheduleCallContext,
    input: ScheduleAgendaRequest,
  ): Promise<ScheduleQueryResult<ScheduleAgendaView>>
  preview(
    ctx: ScheduleCallContext,
    input: SchedulePreviewRequest,
  ): Promise<ScheduleQueryResult<SchedulePreviewView>>
}
