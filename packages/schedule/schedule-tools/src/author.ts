import { hitlDecisionWait } from '@omne-harness/human-intervention-tool'
import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { CommandTable } from '@omne-harness/tool-contract'
import {
  commandGuide,
  defineCommandTool,
  defineToolOperation,
  describedAdoption,
  type AuthorSegment,
  type CheckpointedToolExecutor,
  type ToolSegmentContext,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
  type ToolOperation,
  type ToolOperationParameters,
  type ToolPrimitiveFailure,
} from '@omne-harness/tool-contract/provider'
import { read, submit, writeRequestOf, type ReadArguments, type WriteArguments } from './calls.ts'
import {
  CONSENT_STATE_MAX_BYTES,
  consentCard,
  consentStateCodec,
  consentStateIdentity,
  ownerAnswerOf,
  readConsentState,
  requestTree,
  type ConsentState,
} from './consent.ts'
import { schedulesOf, type BoundSchedules, type ScheduleFaces } from './port.ts'
import {
  schedulesAdoption,
  schedulesCommandNames,
  schedulesContract,
  schedulesParameterCodec,
  schedulesSummaries,
  tree,
  type SchedulesArguments,
} from './protocol.ts'
import { upcomingOf, writeLine } from './text.ts'

const ENCODING = 'wrapped' as const
const encoder = new TextEncoder()
const utf8 = (text: string) => encoder.encode(text)

const guide = [
  'A definition has label, recurrence, limits and purpose. It always follows the user time zone and calendar; you cannot pick a calendar. Preview a definition before you create it.',
  'Every change to a saved schedule takes the revision you last read with show or list; a stale revision answers conflict and changes nothing.',
  'The owner decides how agent changes take effect. When the owner asks to confirm, an inquiry card waits for the owner and the call returns after the answer: confirmed, kept as draft, declined, replied in words, or skipped. If the owner may be away, create a draft instead.',
  'A write that answers unknown may or may not have happened: call recover with its operation; do not send it again.',
  'Failures are one line, <kind> reason=<why> code=<code>: not_found, conflict, limited, invalid, coverage_insufficient, not_configured, unavailable, card_stale, owner_declined, owner_skipped, owner_replied.',
].join('\n\n')

const returns = {
  kind: 'ordinary',
  value: {
    kind: 'encoded-value',
    codec: schedulesAdoption,
    value: {
      identity: {
        id: '@omne-harness/schedule-tools/text',
        revision: '1',
        digest: describedAdoption({
          owner: '@omne-harness/schedule-tools',
          name: 'text',
          revision: '1',
          schema: { type: 'string' },
        }).digest,
      },
      definition: {
        schema: tree({ type: 'string' }),
        vocabulary: schedulesAdoption,
        descriptions: [],
      },
    },
  },
  program: { kind: 'none' },
  body: {
    kind: 'text',
    codec: describedAdoption({
      owner: '@omne-harness/schedule-tools',
      name: 'utf8-text-body',
      revision: '1',
      encoding: 'UTF-8',
    }),
  },
  offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
} as const

const menu: CommandTable = {
  name: 'Schedules',
  encoding: ENCODING,
  guide,
  commands: schedulesCommandNames.map(name => ({
    name,
    summary: schedulesSummaries[name],
    parameters: { kind: 'declared', value: schedulesContract(name) },
    returns,
  })),
}

const WRITES = new Set([
  'create',
  'update',
  'revise',
  'replace',
  'promote',
  'pause',
  'resume',
  'stop',
  'discard',
])
const isWrite = (args: SchedulesArguments): args is WriteArguments => WRITES.has(args.command)

type CardSubject = Exclude<ReturnType<typeof writeRequestOf>, { invalid: string }>

const done = (value: string): Outcome<AuthorSegment<Uint8Array, string>, ToolPrimitiveFailure> =>
  succeed({ kind: 'completed', value })
const UNATTACHED = 'unavailable reason=the schedule services are not attached to this call'

async function reach(
  execution: ToolSegmentContext,
): Promise<Readonly<{ bound: BoundSchedules; faces: ScheduleFaces }> | string> {
  const bound = schedulesOf(execution)
  if (bound === undefined) return UNATTACHED
  const faces = await bound.faces()
  if ('kind' in faces)
    return faces.reason === 'forbidden'
      ? 'not_found reason=the call does not act for the owner of these schedules'
      : 'unavailable reason=the schedule services are not available'
  return { bound, faces }
}

/** The name and next few times of what the card is about, best effort: a failure leaves them out. */
async function aboutOf(faces: ScheduleFaces, request: CardSubject, bound: BoundSchedules) {
  const { queries, context } = faces
  try {
    const label =
      'create' in request
        ? request.create.definition.label
        : await queries
            .get(context, { scheduleId: request.execute.scheduleId })
            .then(found => (found.kind === 'ok' ? found.value.definition.label : null))
    const source =
      'create' in request
        ? { kind: 'inline' as const, definition: request.create.definition }
        : { kind: 'schedule' as const, scheduleId: request.execute.scheduleId }
    const answer = await queries.preview(context, { source, after: bound.now(), count: 3 })
    const times =
      answer.kind === 'ok'
        ? answer.value.candidates.map(item => {
            const next = upcomingOf(item)
            return `${next.local}（${next.calendar ?? '不依赖日历'} ${next.version ?? ''}）`.trim()
          })
        : []
    return { label: label ?? '未命名', times }
  } catch {
    return { label: '未命名', times: [] as string[] }
  }
}

async function initial(args: SchedulesArguments, execution: ToolSegmentContext) {
  if (args.command === 'help')
    return done(
      `done Schedules help${args.params.name === undefined ? '' : ` ${args.params.name}`}\n${commandGuide(menu, args.params.name)}`,
    )
  const reached = await reach(execution)
  if (typeof reached === 'string') return done(reached)
  const { bound, faces } = reached
  if (!isWrite(args)) return done(await read(faces, args as ReadArguments, bound.now()))
  const request = writeRequestOf(args, {
    operationKey: bound.operationKey('initial'),
    consentRef: null,
  })
  if ('invalid' in request) return done(request.invalid)
  const result = await submit(faces, request)
  if (result.kind !== 'rejected' || result.error.code !== 'consent_required')
    return done(writeLine(args.command, result))
  const digest = result.error.details['consentDigest']
  if (typeof digest !== 'string') return done(writeLine(args.command, result))
  const about = await aboutOf(faces, request, bound)
  const card = consentCard({
    args,
    digest,
    label: about.label,
    upcoming: about.times,
    session: faces.context.originatingSessionRef,
  })
  const state: ConsentState = { args, digest, cardId: card.cardId }
  const bytes = utf8(JSON.stringify(state))
  if (bytes.byteLength > CONSENT_STATE_MAX_BYTES)
    return fail({ kind: 'too-large' as const, reason: 'consent-state-too-large' })
  return succeed({
    kind: 'suspended' as const,
    state: bytes,
    closedResult:
      'owner_skipped reason=the card was closed before the owner answered; nothing was changed',
    wait: {
      kind: 'ask' as const,
      key: 'consent',
      contract: hitlDecisionWait,
      request: requestTree(card),
    },
  })
}

async function resume(
  state: ConsentState,
  decision: Parameters<typeof ownerAnswerOf>[1],
  execution: ToolSegmentContext,
) {
  const answer = ownerAnswerOf(state, decision)
  const { args } = state
  if (answer.kind === 'declined')
    return done('owner_declined reason=the owner declined; nothing was changed')
  if (answer.kind === 'skipped')
    return done('owner_skipped reason=the owner did not answer; nothing was changed')
  if (answer.kind === 'replied')
    return done(
      `owner_replied reason=the owner answered in words; nothing was changed text=${JSON.stringify(answer.text)}`,
    )
  const reached = await reach(execution)
  if (typeof reached === 'string') return done(reached)
  const { bound, faces } = reached
  const write: WriteArguments =
    answer.kind === 'draft' && args.command === 'create'
      ? {
          command: 'create',
          params: { ...args.params, state: 'draft', reason: 'owner 在卡上选了先存草稿' },
        }
      : args
  const request = writeRequestOf(write, {
    operationKey: bound.operationKey(answer.kind === 'draft' ? 'draft' : 'confirmed'),
    consentRef: answer.kind === 'draft' ? null : bound.consentRef(state.cardId),
  })
  if ('invalid' in request) return done(request.invalid)
  const result = await submit(faces, request)
  if (
    result.kind === 'rejected' &&
    (result.error.code === 'revision_conflict' || result.error.code === 'consent_required')
  )
    return done(
      `card_stale reason=the schedule or the content changed while the card was open; nothing was changed code=${result.error.code}`,
    )
  return done(writeLine(write.command, result))
}

export const schedulesExecutor: CheckpointedToolExecutor<SchedulesArguments, string, null> = {
  checkpoint: {
    schema: consentStateIdentity,
    codec: consentStateCodec,
    maxBytes: CONSENT_STATE_MAX_BYTES,
  },
  initial: (args, _environment, context) => initial(args, context),
  async resume({ checkpoint, response }, _environment, context) {
    const state = readConsentState(checkpoint)
    if ('failure' in state) return fail({ kind: 'invalid' as const, reason: state.failure })
    return resume(state.ok, response, context)
  },
}

function resultMaxBytesOf(construction: JsonValue): number | undefined {
  if (construction.kind !== 'object' || construction.entries.length !== 1) return undefined
  const [entry] = construction.entries
  if (entry?.key !== 'resultMaxBytes' || entry.value.kind !== 'number') return undefined
  const value = Number(entry.value.lexeme)
  return Number.isSafeInteger(value) && value >= 64 ? value : undefined
}

export function createSchedulesAuthor(
  construction: JsonValue,
): ReturnType<ToolImplementationModule<null, ToolMessageContentBlock>['createAuthor']> {
  const maximum = resultMaxBytesOf(construction)
  if (maximum === undefined)
    return fail({
      field: 'construction',
      reason: 'Schedules takes only resultMaxBytes, at least 64',
    })
  const operations: Record<
    string,
    { summary: string; operation: ToolOperation<null, ToolMessageContentBlock> }
  > = {}
  for (const name of schedulesCommandNames) {
    const operation = defineToolOperation<
      SchedulesArguments,
      string,
      null,
      ToolMessageContentBlock,
      Extract<ToolOperationParameters, { kind: 'declared' }>
    >({
      parameters: { kind: 'declared', value: schedulesContract(name) },
      returns,
      author: {
        kind: 'ordinary',
        parameters: schedulesParameterCodec(name),
        waits: [hitlDecisionWait],
        executor: schedulesExecutor,
        codec: {
          adoption: schedulesAdoption,
          encode: (value: unknown) =>
            typeof value === 'string' ? succeed(utf8(value)) : fail({ reason: 'text-required' }),
          decode(bytes) {
            try {
              return succeed(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
            } catch {
              return fail({ reason: 'invalid-utf8' })
            }
          },
        },
        output: {
          adoption: schedulesAdoption,
          check: ({ value }: { value: unknown }) =>
            typeof value === 'string' && utf8(value).byteLength <= maximum
              ? succeed(value)
              : fail({ reason: 'the Schedules result exceeds resultMaxBytes' }),
        },
        renderer: { render: (value: string) => succeed(value) },
        program: { kind: 'none' },
      },
    })
    if ('failure' in operation)
      return fail({ field: 'commands', reason: JSON.stringify(operation.failure) })
    operations[name] = { summary: schedulesSummaries[name], operation: operation.ok }
  }
  const author = defineCommandTool({
    implementation: {
      description:
        'Create, change and read the owner schedules, and preview their next times with the calendar each one used.',
      backgroundAllowed: false,
      declarations: {
        adoption: schedulesAdoption,
        environment: null,
        attachments: [],
        inputModalities: ['text'],
        outputModalities: ['text'],
        settings: null,
      },
    },
    encoding: ENCODING,
    guide,
    commands: operations,
  })
  return 'failure' in author
    ? fail({ field: 'commands', reason: JSON.stringify(author.failure) })
    : author
}

export const schedulesToolModule: ToolImplementationModule<null, ToolMessageContentBlock> = {
  executor: describedAdoption({
    owner: '@omne-harness/schedule-tools',
    name: 'Schedules',
    revision: '2',
    changes:
      'Commands over an attached schedules port; consent through one inquiry card checkpoint.',
  }),
  createAuthor: createSchedulesAuthor,
}
