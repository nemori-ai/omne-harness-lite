import {
  channelNameSchema,
  eventTypeNameSchema,
  sourceNameSchema,
  type ChannelContribution,
  type ChannelLookup,
  type ChannelName,
  type DeliveryResult,
  type SourceDeclaration,
  type SourceLookup,
  type SourceName,
} from '@omne-harness/notification-contract'

export class NotificationRegistrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotificationRegistrationError'
  }
}

/** The extension point `notification.sources`. Registering is the effect; the result undoes it. */
export interface NotificationSources {
  register(declaration: SourceDeclaration): () => void
  lookup(name: SourceName): SourceLookup
  /** Every source registered right now. A source that cannot be read answers `unreadable`. */
  list(): readonly SourceLookup[]
}

function checkDeclaration(declaration: SourceDeclaration): void {
  if (!sourceNameSchema.safeParse(declaration.name).success)
    throw new NotificationRegistrationError(`invalid source name: ${String(declaration.name)}`)
  const names = new Set<string>()
  for (const type of declaration.types) {
    if (!eventTypeNameSchema.safeParse(type.name).success || names.has(type.name))
      throw new NotificationRegistrationError(
        `invalid or repeated event type in ${declaration.name}: ${String(type.name)}`,
      )
    names.add(type.name)
  }
}

/** The extension point `notification.channels`. */
export interface NotificationChannels {
  /** The result withdraws: absent at once, settled and the name free when no delivery is in flight. */
  register(channel: ChannelContribution): () => Promise<void>
  lookup(name: ChannelName): ChannelLookup
  list(): readonly ChannelContribution[]
}

export const CHANNEL_WITHDRAWN: DeliveryResult = Object.freeze({
  kind: 'failed',
  reason: 'channel-withdrawn',
  retryable: true,
})

type ChannelEntry = {
  offered: ChannelContribution
  open: boolean
  flights: Set<Promise<unknown>>
}

function offer(channel: ChannelContribution): ChannelEntry {
  const entry: ChannelEntry = { offered: channel, open: true, flights: new Set() }
  entry.offered = {
    ...channel,
    deliver(delivery) {
      if (!entry.open) return Promise.resolve(CHANNEL_WITHDRAWN)
      const flight = (async () => channel.deliver(delivery))()
      const landed = () => void entry.flights.delete(flight)
      entry.flights.add(flight)
      flight.then(landed, landed)
      return flight
    },
  }
  return entry
}

export function createChannelRegistry(onChange: () => void = () => {}): NotificationChannels {
  const entries = new Map<ChannelName, ChannelEntry>()
  return {
    register(channel) {
      if (!channelNameSchema.safeParse(channel.name).success)
        throw new NotificationRegistrationError(`invalid channel name: ${String(channel.name)}`)
      if (entries.has(channel.name))
        throw new NotificationRegistrationError(`channel already registered: ${channel.name}`)
      const entry = offer(channel)
      entries.set(channel.name, entry)
      onChange()
      let withdrawn: Promise<void> | undefined
      const withdraw = (): Promise<void> => {
        entry.open = false
        onChange()
        const free = () => void entries.delete(channel.name)
        if (entry.flights.size === 0) return Promise.resolve(free())
        return Promise.allSettled(entry.flights).then(free)
      }
      return () => (withdrawn ??= withdraw())
    },
    lookup(name) {
      const entry = entries.get(name)
      return entry?.open ? { kind: 'registered', channel: entry.offered } : { kind: 'absent' }
    },
    list: () => [...entries.values()].filter(entry => entry.open).map(entry => entry.offered),
  }
}

export function createSourceRegistry(onChange: () => void = () => {}): NotificationSources {
  const entries = new Map<SourceName, SourceDeclaration>()
  return {
    register(declaration) {
      checkDeclaration(declaration)
      if (entries.has(declaration.name))
        throw new NotificationRegistrationError(`source already registered: ${declaration.name}`)
      entries.set(declaration.name, declaration)
      onChange()
      return () => {
        if (entries.get(declaration.name) !== declaration) return
        entries.delete(declaration.name)
        onChange()
      }
    },
    lookup(name) {
      const declaration = entries.get(name)
      return declaration === undefined ? { kind: 'absent' } : { kind: 'registered', declaration }
    },
    list() {
      return [...entries.values()].map(declaration => ({ kind: 'registered', declaration }))
    },
  }
}
