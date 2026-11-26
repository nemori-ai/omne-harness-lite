import {
  ScheduleDefinitionSchema,
  type ScheduleCommand,
  type ScheduleDefinition,
  type ScheduleWork,
} from '@omne-harness/schedule-contract'
import type { ManagementRequest, ScheduleRecord } from './types.ts'

export function patchScheduleDefinition(
  definition: ScheduleDefinition,
  patch: Extract<ScheduleCommand, { action: 'update' }>['patch'],
): ScheduleDefinition | null {
  const purpose = definition.purpose
  switch (patch.kind) {
    case 'label':
      return { ...definition, label: patch.label }
    case 'executionText':
      if (purpose.kind !== 'execution' || purpose.work.kind !== 'agent') return null
      return {
        ...definition,
        label: patch.label ?? definition.label,
        purpose: { ...purpose, work: { ...purpose.work, instruction: patch.instruction } },
      }
    case 'reminderContent':
      if (purpose.kind !== 'reminder') return null
      return {
        ...definition,
        label: patch.label ?? definition.label,
        purpose: { ...purpose, content: patch.content },
      }
  }
}

export function requestedDefinition(
  request: ManagementRequest,
  current: ScheduleRecord | null,
): ScheduleDefinition | null {
  if (request.kind === 'create') return request.input.definition
  switch (request.input.action) {
    case 'replace':
      return request.input.successor
    case 'reviseDraft':
      return request.input.definition
    case 'promote':
      return current?.view.definition ?? null
    default:
      return null
  }
}

/** The work a request would leave to be carried out, when the request writes or activates one. */
export function requestedWork(
  request: ManagementRequest,
  current: ScheduleRecord | null,
): ScheduleWork | null {
  const edited =
    request.kind === 'execute' &&
    request.input.action === 'update' &&
    request.input.patch.kind === 'executionText' &&
    current !== null
      ? patchScheduleDefinition(current.view.definition, request.input.patch)
      : null
  const purpose = (edited ?? requestedDefinition(request, current))?.purpose
  return purpose?.kind === 'execution' ? purpose.work : null
}

export function timeIntent(definition: ScheduleDefinition) {
  return {
    recurrence: definition.recurrence,
    limits: definition.limits,
    binding: definition.binding,
    calendarOverlay: definition.calendarOverlay,
  }
}

export function validPatchedDefinition(definition: ScheduleDefinition) {
  return ScheduleDefinitionSchema.safeParse(definition)
}
