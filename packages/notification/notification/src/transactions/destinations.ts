import type {
  ChannelName,
  Destination,
  DestinationRef,
  MinLevel,
  RecipientRef,
} from '@omne-harness/notification-contract'
import type { NotificationTxn } from '../txn.ts'

export type DestinationDefault = Readonly<{ channel: ChannelName; minLevel: MinLevel }>

/** The destination a recipient of each kind starts with. Null: that kind starts with none. */
export type RecipientDefaults = Readonly<{
  person: DestinationDefault
  agent: DestinationDefault | null
}>

export const BUILTIN_ID = 'default'

export function builtinDestination(
  recipient: RecipientRef,
  defaults: RecipientDefaults,
  cursor: number,
): Destination | null {
  const base = defaults[recipient.kind]
  if (base === null) return null
  return {
    recipient,
    id: BUILTIN_ID,
    channel: base.channel,
    address: recipient.kind === 'agent' ? recipient.ref : '',
    minLevel: base.minLevel,
    enabled: true,
    builtin: true,
    lastStrongAt: null,
    strongCursor: cursor,
    strongUnits: 0,
    blocked: false,
  }
}

/** The destinations of a recipient as they will be once written: the builtin one is always there. */
export function withBuiltin(
  recipient: RecipientRef,
  stored: readonly Destination[],
  defaults: RecipientDefaults,
): readonly Destination[] {
  if (stored.some(destination => destination.builtin)) return stored
  const builtin = builtinDestination(recipient, defaults, 0)
  return builtin === null ? stored : [builtin, ...stored]
}

/** Records the recipient and its builtin destination. What is in the inbox already is not pushed. */
export function ensureRecipient(
  txn: NotificationTxn,
  recipient: RecipientRef,
  defaults: RecipientDefaults,
): void {
  txn.ensureRecipient(recipient)
  if (txn.destinations(recipient).some(destination => destination.builtin)) return
  const builtin = builtinDestination(recipient, defaults, txn.currentSequence())
  if (builtin !== null) txn.putDestination(builtin)
}

export type DestinationCommand =
  | Readonly<{
      kind: 'add'
      recipient: RecipientRef
      channel: ChannelName
      address: string
      minLevel: MinLevel
      defaults: RecipientDefaults
    }>
  | Readonly<{
      kind: 'change'
      ref: DestinationRef
      patch: Readonly<{ minLevel?: MinLevel; enabled?: boolean }>
      defaults: RecipientDefaults
    }>
  | Readonly<{ kind: 'remove'; ref: DestinationRef; defaults: RecipientDefaults }>

export type DestinationResult =
  | Readonly<{ kind: 'written'; destination: Destination }>
  | Readonly<{ kind: 'recalled'; destination: Destination | null }>
  | Readonly<{ kind: 'removed' }>
  | Readonly<{ kind: 'not-found' }>
  | Readonly<{ kind: 'builtin' }>

export const destinationId = (channel: ChannelName, address: string) =>
  JSON.stringify([channel, address])

function find(txn: NotificationTxn, ref: DestinationRef): Destination | null {
  return txn.destinations(ref.recipient).find(destination => destination.id === ref.id) ?? null
}

export function writeDestination(
  txn: NotificationTxn,
  command: DestinationCommand,
): DestinationResult {
  const recipient = command.kind === 'add' ? command.recipient : command.ref.recipient
  ensureRecipient(txn, recipient, command.defaults)
  if (command.kind === 'add') {
    const { channel, address, minLevel } = command
    const same = txn
      .destinations(recipient)
      .find(destination => destination.channel === channel && destination.address === address)
    if (same !== undefined) return { kind: 'recalled', destination: same }
    const destination: Destination = {
      recipient,
      id: destinationId(channel, address),
      channel,
      address,
      minLevel,
      enabled: true,
      builtin: false,
      lastStrongAt: null,
      strongCursor: txn.currentSequence(),
      strongUnits: 0,
      blocked: false,
    }
    txn.putDestination(destination)
    return { kind: 'written', destination }
  }
  const current = find(txn, command.ref)
  if (command.kind === 'remove') {
    if (current === null) return { kind: 'recalled', destination: null }
    if (current.builtin) return { kind: 'builtin' }
    txn.deleteDestination(command.ref)
    return { kind: 'removed' }
  }
  if (current === null) return { kind: 'not-found' }
  const destination = { ...current, ...command.patch }
  const unchanged =
    destination.minLevel === current.minLevel && destination.enabled === current.enabled
  if (unchanged) return { kind: 'recalled', destination: current }
  txn.putDestination(destination)
  return { kind: 'written', destination }
}
