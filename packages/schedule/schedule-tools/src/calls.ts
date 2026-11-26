import type {
  ScheduleCommand,
  ScheduleCommandResult,
  ScheduleCreateRequest,
  ScheduleInstant,
  ScheduleSessionDefaults,
  ScheduleView,
} from '@omne-harness/schedule-contract'
import type { ScheduleFaces } from './port.ts'
import { definitionOf, unreadLine, type SchedulesArguments } from './protocol.ts'
import { doneLine, refusalLine, summaryOf, upcomingOf } from './text.ts'

type Of<K extends SchedulesArguments['command']> = Extract<SchedulesArguments, { command: K }>
export type WriteArguments = Of<
  | 'create'
  | 'draft'
  | 'update'
  | 'revise'
  | 'replace'
  | 'promote'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'discard'
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

type Meta = Readonly<{ operationKey: string }>
type WriteRequest = Readonly<
  { create: ScheduleCreateRequest } | { execute: ScheduleCommand } | { invalid: string }
>

function createRequestOf(
  args: Of<'create' | 'draft'>,
  meta: Meta,
  defaults: ScheduleSessionDefaults,
): WriteRequest {
  const read = definitionOf(args.params.definition, defaults)
  if (read.kind !== 'read') return { invalid: unreadLine(read) }
  return {
    create: {
      definition: read.definition,
      initial:
        args.command === 'create'
          ? { kind: 'active' }
          : { kind: 'draft', reason: args.params.reason },
      meta: { ...meta, expectedRevision: null },
    } as ScheduleCreateRequest,
  }
}

function changeOf(
  args: Exclude<WriteArguments, Of<'create' | 'draft'>>,
  defaults: ScheduleSessionDefaults,
): object | string {
  switch (args.command) {
    case 'update': {
      const { label, instruction } = args.params
      return {
        action: 'update',
        patch:
          instruction === undefined
            ? { kind: 'label', label }
            : { kind: 'executionText', instruction, label: null },
      }
    }
    case 'revise':
    case 'replace': {
      const read = definitionOf(args.params.definition, defaults)
      if (read.kind !== 'read') return unreadLine(read)
      const { reason } = args.params
      return args.command === 'revise'
        ? { action: 'reviseDraft', definition: read.definition, reason }
        : { action: 'replace', successor: read.definition, reason }
    }
    default:
      return { action: args.command, reason: args.params.reason ?? null }
  }
}

/** The domain request of one write. `defaults` is what the place of the call fills in for agent work a definition carries. */
export function writeRequestOf(
  args: WriteArguments,
  meta: Meta,
  defaults: ScheduleSessionDefaults,
): WriteRequest {
  if (args.command === 'create' || args.command === 'draft')
    return createRequestOf(args, meta, defaults)
  const change = changeOf(args, defaults)
  if (typeof change === 'string') return { invalid: change }
  return {
    execute: {
      scheduleId: args.params.schedule,
      meta: { ...meta, expectedRevision: args.params.revision },
      ...change,
    } as ScheduleCommand,
  }
}

export async function submit(
  faces: ScheduleFaces,
  request: Exclude<WriteRequest, { invalid: string }>,
): Promise<ScheduleCommandResult<ScheduleView>> {
  return 'create' in request
    ? faces.commands.create(faces.context, request.create)
    : faces.commands.execute(faces.context, request.execute)
}

type Reader<K extends ReadArguments['command']> = (
  faces: ScheduleFaces,
  params: Of<K>['params'],
  now: ScheduleInstant,
) => Promise<string>

const preview: Reader<'preview'> = async ({ queries, context, defaults }, params, now) => {
  const { definition, schedule, count } = params
  if ((definition === undefined) === (schedule === undefined))
    return 'invalid reason=preview takes exactly one of definition and schedule code=invalid_input'
  const full = definition === undefined ? undefined : definitionOf(definition, await defaults())
  if (full !== undefined && full.kind !== 'read') return unreadLine(full)
  const source =
    full === undefined
      ? { kind: 'schedule' as const, scheduleId: schedule! }
      : { kind: 'inline' as const, definition: full.definition }
  const answer = await queries.preview(context, { source, after: now, count: count ?? 5 })
  return answer.kind === 'error'
    ? refusalLine(answer.error)
    : doneLine('preview', {
        upcoming: answer.value.candidates.map(upcomingOf),
        complete: answer.value.complete,
      })
}

const list: Reader<'list'> = async ({ queries, context }, params) => {
  const answer = await queries.list(context, {
    ...NO_FILTER,
    control: params.state ?? null,
    cursor: (params.after ?? null) as never,
    limit: params.limit ?? 20,
  })
  return answer.kind === 'error'
    ? refusalLine(answer.error)
    : doneLine('list', { items: answer.value.items.map(summaryOf), next: answer.value.nextCursor })
}

const show: Reader<'show'> = async ({ queries, context }, params) => {
  const answer = await queries.get(context, { scheduleId: params.schedule })
  return answer.kind === 'error'
    ? refusalLine(answer.error)
    : doneLine('show', { ...summaryOf(answer.value), definition: answer.value.definition })
}

const history: Reader<'history'> = async ({ queries, context }, params) => {
  const answer = await queries.revisions(context, {
    scheduleId: params.schedule,
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

/** The outcome of a write that answered unknown, by its operation; never sends it again. */
const recover: Reader<'recover'> = async ({ commands, context }, params) => {
  const answer = await commands.queryOperation(context, {
    kind: 'ref',
    operationRef: params.operation,
  })
  if (answer.kind === 'error') return refusalLine(answer.error)
  const view = answer.value
  if (view.kind === 'committed' || view.kind === 'noChange')
    return doneLine('recover', {
      ...summaryOf(view.result as ScheduleView),
      operation: params.operation,
    })
  if (view.kind === 'rejected') return refusalLine(view.error)
  if (view.kind === 'notCommitted')
    return 'not_committed reason=the write did not happen; it can be sent again'
  return 'unknown reason=the outcome is not known yet; try recover again later'
}

const READERS: { [K in ReadArguments['command']]: Reader<K> } = {
  preview,
  list,
  show,
  history,
  recover,
}

/** A read answers with what the schedule services hold now; it never writes. */
export function read(faces: ScheduleFaces, args: ReadArguments, now: ScheduleInstant) {
  return (READERS[args.command] as Reader<typeof args.command>)(faces, args.params as never, now)
}
