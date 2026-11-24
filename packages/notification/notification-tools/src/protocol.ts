import { z } from 'zod'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import {
  BODY_CEILING,
  levelSchema,
  locatorSchema,
  noteSchema,
  scopeSchema,
  termSchema,
} from '@omne-harness/notification-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ParameterContract } from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  describedAdoption,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'

export const notificationsAdoption = describedAdoption({
  owner: '@omne-harness/notification-tools',
  name: 'notifications-protocol',
  revision: '2',
  changes:
    'One declaration with the command named in the call; the emitter of a post comes from the call; a subscribe is one commit.',
})
const vocabulary = describedAdoption({
  owner: '@omne-harness/notification-tools',
  name: 'json-schema',
  revision: '2020-12',
  dialect: 'https://json-schema.org/draft/2020-12/schema',
})
const limits = {
  maxBytes: 262_144,
  maxDepth: 16,
  maxItems: 1024,
  maxMembers: 64,
  maxStringLength: BODY_CEILING,
  maxNumberLength: 32,
}

export function tree(value: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new TypeError('Notifications protocol JSON is not bounded')
  return read.value
}

export const notificationsCommandNames = [
  'help',
  'send',
  'sent',
  'inbox',
  'read',
  'done',
  'dismiss',
  'restore',
  'sources',
  'subscriptions',
  'subscribe',
  'unsubscribe',
] as const
export type NotificationsCommandName = (typeof notificationsCommandNames)[number]

/** The agent's own name for one post. With the emitter it makes the event id, so the same id again is the same post. */
const id = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/)
const notification = z.strictObject({
  source: z.string().min(1).max(100),
  event: z.string().min(1).max(200),
})
const kind = z.strictObject({
  source: z.string().min(1).max(100),
  type: z.string().min(1).max(100),
})

const shapes = {
  help: z.strictObject({ name: z.enum(notificationsCommandNames).optional() }),
  send: z.strictObject({
    id,
    title: z.string().min(1).max(200),
    body: z.string().max(BODY_CEILING).optional(),
    locator: locatorSchema.optional(),
    replace: z.string().min(1).max(120).optional(),
    renotify: z.boolean().optional(),
  }),
  sent: z.strictObject({ id }),
  inbox: z.strictObject({
    filter: z.enum(['unresolved', 'all']).optional(),
    after: z.int().min(0).optional(),
    limit: z.int().min(1).max(50).optional(),
  }),
  read: notification,
  done: notification,
  dismiss: notification,
  restore: notification,
  sources: z.strictObject({}),
  subscriptions: z.strictObject({}),
  subscribe: kind.extend({
    level: levelSchema,
    scope: scopeSchema.optional(),
    note: noteSchema.optional(),
    term: termSchema.optional(),
  }),
  unsubscribe: kind.extend({ scope: scopeSchema.optional() }),
} as const satisfies Record<NotificationsCommandName, z.ZodType>

export const subscribeParamsSchema = shapes.subscribe

export type NotificationsArguments = {
  [K in NotificationsCommandName]: Readonly<{ command: K; params: z.output<(typeof shapes)[K]> }>
}[NotificationsCommandName]
export type ArgumentsOf<K extends NotificationsCommandName> = Extract<
  NotificationsArguments,
  { command: K }
>

export const notificationsSummaries: Readonly<Record<NotificationsCommandName, string>> = {
  help: 'Read command usage.',
  send: 'Post one item to the owner. The same id again is the same post and writes nothing; replace supersedes your earlier post with that key.',
  sent: 'Whether a post was accepted, and how each recipient disposed it.',
  inbox: 'List your own inbox, oldest first. Unresolved only unless filter is all.',
  read: 'Read one notification of your inbox in full. Reading does not mark it.',
  done: 'Mark a notification of your inbox as handled.',
  dismiss: 'Mark a notification of your inbox as not needing action.',
  restore: 'Take back done or dismiss.',
  sources: 'List the sources and event types you can subscribe to, with the subject each takes.',
  subscriptions: 'List your own subscriptions.',
  subscribe: 'Set your subscription to one event type.',
  unsubscribe: 'Return one subscription to the default of its event type.',
}

/** The contract's values are immutable, which zod writes as `readOnly`: in a schema that means "do not send". */
const sendable = (ctx: { jsonSchema: { readOnly?: boolean } }) => {
  delete ctx.jsonSchema.readOnly
}

export function notificationsContract(name: NotificationsCommandName): ParameterContract {
  const document = z.toJSONSchema(shapes[name], { override: sendable })
  const { $schema: _dialect, ...schema } = document as Record<string, unknown>
  return { schema: tree(schema), vocabulary, descriptions: [] }
}

const strictJson = createDefaultParameterCodec(limits)

/** Parses one command's params. A field the command does not have is invalid: it is never dropped silently. */
export function notificationsParameterCodec(
  name: NotificationsCommandName,
): ParameterCodec<NotificationsArguments> {
  if ('failure' in strictJson) throw new TypeError(strictJson.failure.reason)
  const base = strictJson.ok
  return {
    adoption: notificationsAdoption,
    parse(input) {
      const read = base.parse(input)
      if ('failure' in read) return read
      const parsed = shapes[name].safeParse(JSON.parse(writeJsonText(read.ok)))
      if (!parsed.success) {
        const problems = parsed.error.issues.map(({ path, message }) =>
          path.length === 0 ? message : `${path.join('.')}: ${message}`,
        )
        return fail({ kind: 'invalid', reason: problems.join('; ') })
      }
      return succeed({ command: name, params: parsed.data } as NotificationsArguments)
    },
  }
}
