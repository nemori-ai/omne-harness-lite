import {
  channelNameSchema,
  parseWith,
  recipientRefSchema,
  type CallContext,
  type ChannelName,
  type Destination,
  type DestinationRef,
  type DestinationView,
  type MinLevel,
  type NewDestination,
  type NotificationDestinations,
  type RecipientRef,
} from '@omne-harness/notification-contract'
import { ask, type NotificationAuthority } from './ports.ts'
import type { NotificationChannels } from './registries.ts'
import type { NotificationStore, StoreAnswer } from './store.ts'
import { withBuiltin, type RecipientDefaults } from './transactions/destinations.ts'

export type DestinationsDependencies = Readonly<{
  authority: NotificationAuthority
  store: NotificationStore
  channels: NotificationChannels
  defaults: RecipientDefaults
}>

const UNAVAILABLE = { kind: 'basis-unavailable' } as const
const refuse = <R extends string>(reason: R) => ({ kind: 'refused', reason }) as const
type Blocked = typeof UNAVAILABLE | ReturnType<typeof refuse<'not-permitted'>>

const LEVELS = ['strong', 'weak']

type Patch = Readonly<{ minLevel?: MinLevel; enabled?: boolean }>

/** Keeps the keys that carry a value: a key that is present and undefined changes nothing. */
function parsePatch(patch: Readonly<{ minLevel?: unknown; enabled?: unknown }>): Patch | null {
  const { minLevel, enabled, ...rest } = patch
  if (Object.keys(rest).length > 0 || (minLevel === undefined && enabled === undefined)) return null
  if (minLevel !== undefined && !LEVELS.includes(minLevel as string)) return null
  if (enabled !== undefined && typeof enabled !== 'boolean') return null
  return {
    ...(minLevel === undefined ? {} : { minLevel: minLevel as MinLevel }),
    ...(enabled === undefined ? {} : { enabled }),
  }
}

type NewTarget = Readonly<{
  recipient: RecipientRef
  channel: ChannelName
  address: string
  minLevel: MinLevel
}>

function parseNew(input: NewDestination): NewTarget | null {
  const recipient = parseWith(recipientRefSchema, input.recipient)
  const channel = channelNameSchema.safeParse(input.channel)
  if (!('ok' in recipient) || !channel.success) return null
  if (typeof input.address !== 'string' || !LEVELS.includes(input.minLevel)) return null
  const { address, minLevel } = input
  return { recipient: recipient.ok, channel: channel.data, address, minLevel }
}

export function createDestinations(deps: DestinationsDependencies): NotificationDestinations {
  function view(destination: Destination): DestinationView {
    const { recipient, id, channel, address, minLevel, builtin, blockedSince, enabled } =
      destination
    const present = deps.channels.lookup(channel).kind === 'registered'
    const state = !present ? 'channel-absent' : enabled ? 'enabled' : 'disabled'
    return { recipient, id, channel, address, minLevel, builtin, blockedSince, state }
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

  const uncommitted = (answer: Exclude<StoreAnswer<unknown>, { kind: 'committed' }>) =>
    answer.kind === 'rolled-back' ? UNAVAILABLE : ({ kind: 'unknown' } as const)

  const done = (result: Readonly<{ kind: 'written' | 'recalled'; destination: Destination }>) =>
    ({
      kind: 'done',
      recalled: result.kind === 'recalled',
      value: view(result.destination),
    }) as const

  /** Whether the channel takes this address. A channel that is absent or cannot answer: unavailable. */
  function addressAccepted(name: ChannelName, address: string): boolean | 'unavailable' {
    const channel = deps.channels.lookup(name)
    if (channel.kind !== 'registered') return 'unavailable'
    try {
      return channel.channel.address.accepts(address)
    } catch {
      return 'unavailable'
    }
  }

  function parseDestinationRef(ref: DestinationRef): DestinationRef | null {
    const recipient = parseWith(recipientRefSchema, ref.recipient)
    const named = typeof ref.id === 'string' && ref.id.length > 0
    return 'ok' in recipient && named ? { recipient: recipient.ok, id: ref.id } : null
  }

  return {
    async add(ctx, input) {
      const target = parseNew(input)
      if (target === null) return refuse('invalid-request')
      const blocked = await gate(ctx, 'manage-destinations', target.recipient)
      if (blocked !== null) return blocked
      const accepted = addressAccepted(target.channel, target.address)
      if (accepted === 'unavailable') return UNAVAILABLE
      if (!accepted) return refuse('invalid-address')
      const command = { kind: 'add', ...target, defaults: deps.defaults } as const
      const answer = await deps.store.destination(ctx.tenant, command)
      return answer.kind === 'committed' ? done(answer.value) : uncommitted(answer)
    },

    async change(ctx, input, given) {
      const ref = parseDestinationRef(input)
      const patch = parsePatch(given ?? {})
      if (ref === null || patch === null) return refuse('invalid-request')
      const blocked = await gate(ctx, 'manage-destinations', ref.recipient)
      if (blocked !== null) return blocked
      const command = { kind: 'change', ref, patch, defaults: deps.defaults } as const
      const answer = await deps.store.destination(ctx.tenant, command)
      if (answer.kind !== 'committed') return uncommitted(answer)
      return answer.value.kind === 'not-found' ? refuse('not-found') : done(answer.value)
    },

    async remove(ctx, input) {
      const ref = parseDestinationRef(input)
      if (ref === null) return refuse('invalid-request')
      const blocked = await gate(ctx, 'manage-destinations', ref.recipient)
      if (blocked !== null) return blocked
      const command = { kind: 'remove', ref, defaults: deps.defaults } as const
      const answer = await deps.store.destination(ctx.tenant, command)
      if (answer.kind !== 'committed') return uncommitted(answer)
      const { kind } = answer.value
      if (kind === 'builtin') return refuse('builtin')
      return { kind: 'done', recalled: kind === 'absent', value: null }
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
