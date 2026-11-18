import {
  channelNameSchema,
  parseWith,
  recipientRefSchema,
  type CallContext,
  type Destination,
  type DestinationRef,
  type DestinationRefusal,
  type DestinationView,
  type NotificationDestinations,
  type Outcome,
  type RecipientRef,
} from '@omne-harness/notification-contract'
import { ask, type NotificationAuthority } from './ports.ts'
import type { NotificationChannels } from './registries.ts'
import type { NotificationStore, StoreAnswer } from './store.ts'
import {
  withBuiltin,
  type DestinationCommand,
  type DestinationResult,
  type RecipientDefaults,
} from './transactions/destinations.ts'

export type DestinationsDependencies = Readonly<{
  authority: NotificationAuthority
  store: NotificationStore
  channels: NotificationChannels
  defaults: RecipientDefaults
}>

const UNAVAILABLE = { kind: 'basis-unavailable' } as const
const refuse = (reason: DestinationRefusal) => ({ kind: 'refused', reason }) as const
type Blocked = typeof UNAVAILABLE | ReturnType<typeof refuse>
type Written = Outcome<DestinationView, DestinationRefusal>

const LEVELS = ['strong', 'weak']

function validPatch(patch: Readonly<{ minLevel?: unknown; enabled?: unknown }>): boolean {
  const { minLevel, enabled, ...rest } = patch
  if (Object.keys(rest).length > 0 || (minLevel === undefined && enabled === undefined))
    return false
  if (minLevel !== undefined && !LEVELS.includes(minLevel as string)) return false
  return enabled === undefined || typeof enabled === 'boolean'
}

export function createDestinations(deps: DestinationsDependencies): NotificationDestinations {
  function view(destination: Destination): DestinationView {
    const { recipient, id, channel, address, minLevel, builtin, blocked, enabled } = destination
    const present = deps.channels.lookup(channel).kind === 'registered'
    const state = !present ? 'channel-absent' : enabled ? 'enabled' : 'disabled'
    return { recipient, id, channel, address, minLevel, builtin, blocked, state }
  }

  /** Only the owner manages destinations: they decide where content is pushed. */
  async function gate(
    ctx: CallContext,
    kind: 'manage-destinations' | 'read-inbox',
    recipient: RecipientRef,
  ): Promise<Blocked | null> {
    if (kind === 'manage-destinations' && ctx.actor.kind !== 'owner') return refuse('not-permitted')
    const answer = await ask(deps.authority, ctx, { kind, recipient })
    if (answer === 'denied') return refuse('not-permitted')
    return answer === 'unavailable' ? UNAVAILABLE : null
  }

  function written(answer: StoreAnswer<DestinationResult>): Written {
    if (answer.kind === 'rolled-back') return UNAVAILABLE
    if (answer.kind === 'unknown') return { kind: 'unknown' }
    const result = answer.value
    if (result.kind === 'not-found' || result.kind === 'builtin') return refuse(result.kind)
    if (result.kind === 'removed' || result.destination === null) return refuse('not-found')
    const recalled = result.kind === 'recalled'
    return { kind: 'done', recalled, value: view(result.destination) }
  }

  async function write(ctx: CallContext, command: DestinationCommand): Promise<Written> {
    return written(await deps.store.destination(ctx.tenant, command))
  }

  function parseDestinationRef(ref: DestinationRef): DestinationRef | null {
    const recipient = parseWith(recipientRefSchema, ref?.recipient)
    const named = typeof ref?.id === 'string' && ref.id.length > 0
    return 'ok' in recipient && named ? { recipient: recipient.ok, id: ref.id } : null
  }

  return {
    async add(ctx, input) {
      const recipient = parseWith(recipientRefSchema, input?.recipient)
      const name = channelNameSchema.safeParse(input?.channel)
      const shaped = typeof input?.address === 'string' && LEVELS.includes(input?.minLevel)
      if (!('ok' in recipient) || !name.success || !shaped) return refuse('invalid-request')
      const blocked = await gate(ctx, 'manage-destinations', recipient.ok)
      if (blocked !== null) return blocked
      const channel = deps.channels.lookup(name.data)
      if (channel.kind !== 'registered') return UNAVAILABLE
      let accepted
      try {
        accepted = channel.channel.address.accepts(input.address)
      } catch {
        return UNAVAILABLE
      }
      if (!accepted) return refuse('invalid-address')
      const { address, minLevel } = input
      const target = { recipient: recipient.ok, channel: name.data, address, minLevel }
      return write(ctx, { kind: 'add', ...target, defaults: deps.defaults })
    },

    async change(ctx, input, patch) {
      const ref = parseDestinationRef(input)
      if (ref === null || !validPatch(patch ?? {})) return refuse('invalid-request')
      const blocked = await gate(ctx, 'manage-destinations', ref.recipient)
      if (blocked !== null) return blocked
      return write(ctx, { kind: 'change', ref, patch, defaults: deps.defaults })
    },

    async remove(ctx, input) {
      const ref = parseDestinationRef(input)
      if (ref === null) return refuse('invalid-request')
      const blocked = await gate(ctx, 'manage-destinations', ref.recipient)
      if (blocked !== null) return blocked
      const command = { kind: 'remove', ref, defaults: deps.defaults } as const
      const answer = await deps.store.destination(ctx.tenant, command)
      if (answer.kind === 'committed' && answer.value.kind === 'removed')
        return { kind: 'done', recalled: false, value: null }
      if (answer.kind === 'committed' && answer.value.kind === 'recalled')
        return { kind: 'done', recalled: true, value: null }
      const failed = written(answer)
      return failed.kind === 'done' ? UNAVAILABLE : failed
    },

    async list(ctx, input) {
      const recipient = parseWith(recipientRefSchema, input)
      if (!('ok' in recipient)) return refuse('invalid-request')
      const blocked = await gate(ctx, 'read-inbox', recipient.ok)
      if (blocked !== null) return blocked
      const stored = await deps.store.destinations(ctx.tenant, recipient.ok)
      if (stored.kind === 'unavailable') return UNAVAILABLE
      const all = withBuiltin(recipient.ok, stored.value, deps.defaults)
      return { kind: 'done', recalled: false, value: all.map(view) }
    },
  }
}
