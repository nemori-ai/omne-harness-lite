import type {
  ScheduleCommand,
  ScheduleCommandResult,
  ScheduleCreateRequest,
  ScheduleInstant,
  ScheduleView,
} from '@omne-harness/schedule-contract'
import type { ScheduleFaces } from './port.ts'
import { definitionOf, type SchedulesArguments } from './protocol.ts'
import { doneLine, refusalLine, summaryOf, upcomingOf } from './text.ts'

type Of<K extends SchedulesArguments['command']> = Extract<SchedulesArguments, { command: K }>
export type WriteArguments = Of<
  'create' | 'update' | 'revise' | 'replace' | 'promote' | 'pause' | 'resume' | 'stop' | 'discard'
>
export type ReadArguments = Of<'preview' | 'list' | 'show' | 'history' | 'recover'>

const NO_FILTER = {
  agentRef: null,
  control: null,
  standing: null,
  createdBy: null,
  targetDeviceRef: null,
  calendarId: null,
  purpose: null,
} as const

const invalidDefinition =
  'invalid reason=the definition does not form a schedule code=invalid_input'

/** The domain request of a write; `consentRef` names the owner's answer when there is one. */
export function writeRequestOf(
  args: WriteArguments,
  meta: Readonly<{ operationKey: string; consentRef: string | null }>,
): Readonly<
  { create: ScheduleCreateRequest } | { execute: ScheduleCommand } | { invalid: string }
> {
  if (args.command === 'create') {
    const definition = definitionOf(args.params.definition)
    if (!definition.success) return { invalid: invalidDefinition }
    const { state, reason } = args.params
    if (state === 'draft' && reason === undefined)
      return { invalid: 'invalid reason=a draft needs a reason code=invalid_input' }
    return {
      create: {
        definition: definition.data,
        initial: state === 'active' ? { kind: 'active' } : { kind: 'draft', reason: reason! },
        meta: { ...meta, expectedRevision: null },
      } as ScheduleCreateRequest,
    }
  }
  const common = {
    scheduleId: args.params.schedule,
    meta: { ...meta, expectedRevision: args.params.revision },
  }
  switch (args.command) {
    case 'update': {
      const { label, instruction } = args.params
      const patch =
        instruction === undefined
          ? { kind: 'label', label }
          : { kind: 'executionText', instruction, label: null }
      return { execute: { ...common, action: 'update', patch } as ScheduleCommand }
    }
    case 'revise':
    case 'replace': {
      const definition = definitionOf(args.params.definition)
      if (!definition.success) return { invalid: invalidDefinition }
      const { reason } = args.params
      return {
        execute: (args.command === 'revise'
          ? { ...common, action: 'reviseDraft', definition: definition.data, reason }
          : {
              ...common,
              action: 'replace',
              successor: definition.data,
              reason,
            }) as ScheduleCommand,
      }
    }
    default:
      return {
        execute: {
          ...common,
          action: args.command,
          reason: args.params.reason ?? null,
        } as ScheduleCommand,
      }
  }
}

export async function submit(
  faces: ScheduleFaces,
  request: Exclude<ReturnType<typeof writeRequestOf>, { invalid: string }>,
): Promise<ScheduleCommandResult<ScheduleView>> {
  return 'create' in request
    ? faces.commands.create(faces.context, request.create)
    : faces.commands.execute(faces.context, request.execute)
}

/** A read answers with what the schedule services hold now; it never writes. */
export async function read(
  faces: ScheduleFaces,
  args: ReadArguments,
  now: ScheduleInstant,
): Promise<string> {
  const { commands, queries, context } = faces
  switch (args.command) {
    case 'preview': {
      const { definition, schedule, count } = args.params
      if ((definition === undefined) === (schedule === undefined))
        return 'invalid reason=preview takes exactly one of definition and schedule code=invalid_input'
      let source
      if (definition !== undefined) {
        const full = definitionOf(definition)
        if (!full.success) return invalidDefinition
        source = { kind: 'inline' as const, definition: full.data }
      } else source = { kind: 'schedule' as const, scheduleId: schedule! }
      const answer = await queries.preview(context, { source, after: now, count: count ?? 5 })
      return answer.kind === 'error'
        ? refusalLine(answer.error)
        : doneLine('preview', {
            upcoming: answer.value.candidates.map(upcomingOf),
            complete: answer.value.complete,
          })
    }
    case 'list': {
      const answer = await queries.list(context, {
        ...NO_FILTER,
        control: args.params.state ?? null,
        cursor: (args.params.after ?? null) as never,
        limit: args.params.limit ?? 20,
      })
      return answer.kind === 'error'
        ? refusalLine(answer.error)
        : doneLine('list', {
            items: answer.value.items.map(summaryOf),
            next: answer.value.nextCursor,
          })
    }
    case 'show': {
      const answer = await queries.get(context, { scheduleId: args.params.schedule })
      return answer.kind === 'error'
        ? refusalLine(answer.error)
        : doneLine('show', { ...summaryOf(answer.value), definition: answer.value.definition })
    }
    case 'history': {
      const answer = await queries.revisions(context, {
        scheduleId: args.params.schedule,
        cursor: null,
        limit: 50,
      })
      return answer.kind === 'error'
        ? refusalLine(answer.error)
        : doneLine('history', {
            items: answer.value.items.map(item => ({
              revision: item.revision,
              action: item.action,
              actor: item.actor.kind,
              at: item.occurredAt,
              reason: item.reason,
            })),
          })
    }
    case 'recover': {
      const answer = await commands.queryOperation(context, {
        kind: 'ref',
        operationRef: args.params.operation,
      })
      if (answer.kind === 'error') return refusalLine(answer.error)
      const view = answer.value
      if (view.kind === 'committed' || view.kind === 'noChange')
        return doneLine('recover', {
          ...summaryOf(view.result as ScheduleView),
          operation: args.params.operation,
        })
      if (view.kind === 'rejected') return refusalLine(view.error)
      if (view.kind === 'notCommitted')
        return 'not_committed reason=the write did not happen; it can be sent again'
      return 'unknown reason=the outcome is not known yet; try recover again later'
    }
  }
}
