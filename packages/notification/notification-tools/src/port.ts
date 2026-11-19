import { createHash } from 'node:crypto'
import type {
  CallContext,
  NotificationCatalog,
  NotificationInbox,
  NotificationSending,
  NotificationSubscriptions,
  RecipientRef,
} from '@omne-harness/notification-contract'
import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'

export type NotificationToolFaces = Readonly<{
  sending: NotificationSending
  inbox: NotificationInbox
  subscriptions: Pick<NotificationSubscriptions, 'set' | 'remove' | 'list'>
  catalog: Pick<NotificationCatalog, 'sources'>
}>

export type NotificationCallSource = Readonly<{
  tenant: string
  call: string
  posts: Readonly<{ source: string; type: string }>
  faces(): NotificationToolFaces | undefined
  /** The context of the agent this call runs for: its actor is that agent. */
  context(): Promise<CallContext | undefined>
  /** How many turns woken by notifications lie between a person and this turn. A turn a person started: 0. */
  causalDepth(): number
  now(): string
}>

export type AgentRecipient = Extract<RecipientRef, { kind: 'agent' }>

export type Reached = Readonly<{
  faces: NotificationToolFaces
  context: CallContext
  self: AgentRecipient
}>

export type Unreachable = Readonly<{ unreachable: 'unavailable' | 'forbidden' }>

/** The notification services bound to one call. What identifies the agent comes from the call, never from the model. */
export type BoundNotifications = Readonly<{
  reach(): Promise<Reached | Unreachable>
  posts: NotificationCallSource['posts']
  /** A name of this agent made its own: another agent that picks the same name does not meet it. */
  scoped(self: AgentRecipient, name: string): string
  causalDepth(): number
  now(): string
}>

const unavailable: Unreachable = { unreachable: 'unavailable' }
const forbidden: Unreachable = { unreachable: 'forbidden' }

const digestOf = (value: unknown, length: number) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, length)

/** Binds a call. A context of another tenant, or one that does not act as an agent, is refused before
 * any service is asked. The services get the reference of this call with every request. */
export function bindNotifications(source: NotificationCallSource): BoundNotifications {
  return {
    async reach() {
      const faces = source.faces()
      if (faces === undefined) return unavailable
      const context = await (async () => source.context())().catch(() => undefined)
      if (context === undefined) return unavailable
      if (context.tenant !== source.tenant || context.actor.kind !== 'agent') return forbidden
      return { faces, context: { ...context, call: source.call }, self: context.actor.recipient }
    },
    posts: source.posts,
    scoped: (self, name) => `${digestOf(self.ref, 24)}.${name}`,
    causalDepth: () => source.causalDepth(),
    now: () => source.now(),
  }
}

/** Keyed by the call's abort signal: a checkpoint segment gets a narrowed context that keeps it. */
const attachments = new WeakMap<AbortSignal, BoundNotifications>()
export function notificationsOf(
  context: Pick<ToolExecutionContext, 'signal'>,
): BoundNotifications | undefined {
  return attachments.get(context.signal)
}

export function attachNotifications(
  scope: ToolExecutionScope,
  notifications: BoundNotifications,
): ToolExecutionScope {
  const context = scope.context
  attachments.set(context.signal, notifications)
  let finished: ReturnType<ToolExecutionScope['finish']> | undefined
  return {
    context,
    limits: scope.limits,
    finish(exit) {
      if (finished !== undefined) return finished
      if (attachments.get(context.signal) === notifications) attachments.delete(context.signal)
      finished = Promise.resolve().then(() => scope.finish(exit))
      return finished
    },
  }
}
