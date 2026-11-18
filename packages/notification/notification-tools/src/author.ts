import { hitlDecisionWait } from '@omne-harness/human-intervention-tool'
import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { CommandTable } from '@omne-harness/tool-contract'
import {
  commandGuide,
  defineCommandTool,
  defineToolOperation,
  describedAdoption,
  type CheckpointedToolExecutor,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
  type ToolOperation,
  type ToolOperationParameters,
  type ToolSegmentContext,
} from '@omne-harness/tool-contract/provider'
import { HANDLERS, changeOf, subscribed, type Handler, type Reaching } from './commands.ts'
import {
  CONSENT_STATE_MAX_BYTES,
  consentStateCodec,
  consentStateIdentity,
  ownerAnswerOf,
  readConsentState,
  type ConsentState,
} from './consent.ts'
import { notificationsOf, type BoundNotifications, type Reached } from './port.ts'
import {
  notificationsAdoption,
  notificationsCommandNames,
  notificationsContract,
  notificationsParameterCodec,
  notificationsSummaries,
  tree,
  type NotificationsArguments,
  type NotificationsCommandName,
} from './protocol.ts'
import { settle, unavailable, type Segment } from './results.ts'

const ENCODING = 'wrapped' as const
const encoder = new TextEncoder()
const utf8 = (text: string) => encoder.encode(text)

const guide = [
  'You act as yourself: a post is from you, and inbox, read, done, dismiss, restore and subscriptions are about your own inbox. A post goes to the owner; other agents get it only if they subscribed to you.',
  'Give every post an id of your own. After a failure that says unknown, send the same command with the same id: a post that was accepted is recalled, not posted twice.',
  'A notification is named by its source and event, as inbox lists them. Done and dismiss both resolve it; restore takes either back.',
  'Subscribe sets one subscription: level off, weak or strong; scope all, one subject or a subject prefix; term standing, once or until an instant. See sources for the subject each event type takes. When the owner asks to confirm, an inquiry card waits for the owner and the call returns after the answer.',
  'A failure starts with its reason, then says what to do.',
].join('\n\n')

const returns = {
  kind: 'ordinary',
  value: {
    kind: 'encoded-value',
    codec: notificationsAdoption,
    value: {
      identity: {
        id: '@omne-harness/notification-tools/text',
        revision: '1',
        digest: describedAdoption({
          owner: '@omne-harness/notification-tools',
          name: 'text',
          revision: '1',
          schema: { type: 'string' },
        }).digest,
      },
      definition: {
        schema: tree({ type: 'string' }),
        vocabulary: notificationsAdoption,
        descriptions: [],
      },
    },
  },
  program: { kind: 'none' },
  body: {
    kind: 'text',
    codec: describedAdoption({
      owner: '@omne-harness/notification-tools',
      name: 'utf8-text-body',
      revision: '1',
      encoding: 'UTF-8',
    }),
  },
  offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
} as const

const menu: CommandTable = {
  name: 'Notifications',
  encoding: ENCODING,
  guide,
  commands: notificationsCommandNames.map(name => ({
    name,
    summary: notificationsSummaries[name],
    parameters: { kind: 'declared', value: notificationsContract(name) },
    returns,
  })),
}

const UNREACHABLE = {
  unattached: 'the notification services are not attached to this call',
  unavailable: 'the notification services are not available now',
  forbidden: 'this call does not act as an agent of the tenant',
} as const

async function reach(
  command: NotificationsCommandName,
  execution: ToolSegmentContext,
): Promise<Readonly<{ reached: Reached; bound: BoundNotifications }> | Segment> {
  const bound = notificationsOf(execution)
  if (bound === undefined) return unavailable(command, UNREACHABLE.unattached)
  const reached = await bound.reach()
  if ('kind' in reached) return unavailable(command, UNREACHABLE[reached.reason])
  return { reached, bound }
}

async function initial(
  args: NotificationsArguments,
  execution: ToolSegmentContext,
): Promise<Segment> {
  if (args.command === 'help')
    return succeed({
      kind: 'completed',
      value: `done Notifications help${args.params.name === undefined ? '' : ` ${args.params.name}`}\n${commandGuide(menu, args.params.name)}`,
    })
  const ready = await reach(args.command, execution)
  if (!('reached' in ready)) return ready
  const handler = HANDLERS[args.command] as Handler<Reaching>
  return handler(ready.reached, args.params, ready.bound)
}

const cancelled = (reason: string): Segment => fail({ kind: 'cancelled', reason })

/** The owner answered: an approval sets the subscription with this card as its basis; anything else writes nothing. */
async function resume(
  state: ConsentState,
  decision: Parameters<typeof ownerAnswerOf>[1],
  execution: ToolSegmentContext,
): Promise<Segment> {
  const answer = ownerAnswerOf(state, decision)
  if (answer.kind === 'declined')
    return cancelled('owner-declined: the owner declined; nothing was changed')
  if (answer.kind === 'skipped')
    return cancelled('owner-skipped: the owner did not answer; nothing was changed')
  if (answer.kind === 'replied')
    return cancelled(
      `owner-replied: the owner answered in words; nothing was changed. text=${JSON.stringify(answer.text)}`,
    )
  const ready = await reach('subscribe', execution)
  if (!('reached' in ready)) return ready
  const { reached, bound } = ready
  const confirmation = {
    decision: bound.decisionRef(state.cardId),
    content: state.content,
    approved: true,
  }
  return settle(
    'subscribe',
    'write',
    async () => {
      const outcome = await reached.faces.subscriptions.set(
        reached.context,
        changeOf(reached, state.params),
        confirmation,
      )
      return outcome.kind === 'needs-confirmation'
        ? ({ kind: 'refused', reason: 'confirmation-mismatch' } as const)
        : outcome
    },
    subscribed,
  )
}

export const notificationsExecutor: CheckpointedToolExecutor<NotificationsArguments, string, null> =
  {
    checkpoint: {
      schema: consentStateIdentity,
      codec: consentStateCodec,
      maxBytes: CONSENT_STATE_MAX_BYTES,
    },
    initial: (args, _environment, context) => initial(args, context),
    async resume({ checkpoint, response }, _environment, context) {
      const state = readConsentState(checkpoint)
      if ('failure' in state) return fail({ kind: 'invalid', reason: state.failure })
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

type Operation = ToolOperation<null, ToolMessageContentBlock>

function operationOf(name: NotificationsCommandName, maximum: number) {
  return defineToolOperation<
    NotificationsArguments,
    string,
    null,
    ToolMessageContentBlock,
    Extract<ToolOperationParameters, { kind: 'declared' }>
  >({
    parameters: { kind: 'declared', value: notificationsContract(name) },
    returns,
    author: {
      kind: 'ordinary',
      parameters: notificationsParameterCodec(name),
      waits: [hitlDecisionWait],
      executor: notificationsExecutor,
      codec: {
        adoption: notificationsAdoption,
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
        adoption: notificationsAdoption,
        check: ({ value }: { value: unknown }) =>
          typeof value === 'string' && utf8(value).byteLength <= maximum
            ? succeed(value)
            : fail({ reason: 'the Notifications result exceeds resultMaxBytes' }),
      },
      renderer: { render: (value: string) => succeed(value) },
      program: { kind: 'none' },
    },
  })
}

export function createNotificationsAuthor(
  construction: JsonValue,
): ReturnType<ToolImplementationModule<null, ToolMessageContentBlock>['createAuthor']> {
  const maximum = resultMaxBytesOf(construction)
  if (maximum === undefined)
    return fail({
      field: 'construction',
      reason: 'Notifications takes only resultMaxBytes, at least 64',
    })
  const operations: Record<string, { summary: string; operation: Operation }> = {}
  for (const name of notificationsCommandNames) {
    const operation = operationOf(name, maximum)
    if ('failure' in operation)
      return fail({ field: 'commands', reason: JSON.stringify(operation.failure) })
    operations[name] = { summary: notificationsSummaries[name], operation: operation.ok }
  }
  const author = defineCommandTool({
    implementation: {
      description:
        'Post for the owner, read and resolve your own notifications, and subscribe to what the sources of this tenant publish.',
      backgroundAllowed: false,
      declarations: {
        adoption: notificationsAdoption,
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

export const notificationsToolModule: ToolImplementationModule<null, ToolMessageContentBlock> = {
  executor: describedAdoption({
    owner: '@omne-harness/notification-tools',
    name: 'Notifications',
    revision: '1',
    changes:
      'Commands over an attached notifications port; the emitter comes from the call; consent through one inquiry card checkpoint.',
  }),
  createAuthor: createNotificationsAuthor,
}
