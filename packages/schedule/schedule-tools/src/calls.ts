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

type Meta = Readonly<{ operationKey: string; consentRef: string | null }>
type WriteRequest = Readonly<
  { create: ScheduleCreateRequest } | { execute: ScheduleCommand } | { invalid: string }
>

function createRequestOf(params: Of<'create'>['params'], meta: Meta): WriteRequest {
  const definition = definitionOf(params.definition)
  if (!definition.success) return { invalid: invalidDefinition }
  const { state, reason } = params
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

function changeOf(args: Exclude<WriteArguments, Of<'create'>>): object | undefined {
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
      const definition = definitionOf(args.params.definition)
      if (!definition.success) return undefined
      const { reason } = args.params
      return args.command === 'revise'
        ? { action: 'reviseDraft', definition: definition.data, reason }
        : { action: 'replace', successor: definition.data, reason }
    }
    default:
      return { action: args.command, reason: args.params.reason ?? null }
  }
}

/** The domain request of a write; `consentRef` names the owner's answer when there is one. */
export function writeRequestOf(args: WriteArguments, meta: Meta): WriteRequest {
  if (args.command === 'create') return createRequestOf(args.params, meta)
  const change = changeOf(args)
  if (change === undefined) return { invalid: invalidDefinition }
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

const preview: Reader<'preview'> = async ({ queries, context }, params, now) => {
  const { definition, schedule, count } = params
  if ((definition === undefined) === (schedule === undefined))
    return 'invalid reason=preview takes exactly one of definition and schedule code=invalid_input'
  const full = definition === undefined ? undefined : definitionOf(definition)
  if (full !== undefined && !full.success) return invalidDefinition
  const source =
    full === undefined
      ? { kind: 'schedule' as const, scheduleId: schedule! }
      : { kind: 'inline' as const, definition: full.data }
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
