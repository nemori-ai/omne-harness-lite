import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  NOT_SENT_FAILURE,
  type AdoptionRevision,
  type CatalogKey,
  type ConnectionFailure,
  type ConnectionKey,
  type EffectUnknown,
  type EndpointRef,
  type Generation,
  type Millis,
  type PeerIdentity,
  type UnavailableReason,
} from '@omne-harness/mcp-contract'
import type {
  HttpCredentialHandle,
  McpTransport,
  TransportFailure,
} from '@omne-harness/mcp-contract/provider'
import type { Connection } from './connection.ts'
import type { AdoptionRefusal } from './gate.ts'
import type { SettingsFailure } from './settings.ts'

export type ConnectionView = Readonly<{
  readonly generation: Generation
  readonly closed: boolean
  isCurrent(generation: Generation): boolean
}>

export type NotSent = Extract<TransportFailure, { kind: 'not-sent' }>

export type Ensured = Readonly<{
  key: ConnectionKey
  generation: Generation
  connection: ConnectionView
  peer: PeerIdentity
  catalogKey: CatalogKey
  adoptionRevision: AdoptionRevision
  bound: Millis
  wire(): Outcome<McpTransport, NotSent>
}>

export type CatalogMark =
  | 'marked'
  | 'revision-conflict'
  | 'unavailable'
  | 'not-acquired'
  | 'pending'

export type ConnectionUnavailable = Extract<ConnectionFailure, { kind: 'connection-unavailable' }>

export const CONNECTION_UNAVAILABLE: ConnectionUnavailable = { kind: 'connection-unavailable' }

export type EnsureRefusal = SettingsFailure | AdoptionRefusal | ConnectionUnavailable

export type EnsureFailure =
  | Readonly<{ stage: 'settings'; reason: EnsureRefusal }>
  | Readonly<{ stage: 'connect'; reason: ConnectionFailure | EffectUnknown; catalog: CatalogMark }>

export type UnavailableMark = Exclude<UnavailableReason, 'no-longer-offered'>

export type Resources = {
  transport: McpTransport | undefined
  credential: HttpCredentialHandle | undefined
}

export type Entry = Resources & {
  readonly ref: EndpointRef
  readonly tenantText: string
  readonly keyText: string
  readonly catalogKey: CatalogKey
  readonly adoptionRevision: AdoptionRevision
  readonly bound: Millis
  connection: Connection
  view: ConnectionView
  pending: Promise<Outcome<Ensured, EnsureFailure>> | undefined
  tearing: Promise<void> | undefined
  closing: Promise<void> | undefined
}

export function holdsNothing(held: Resources): boolean {
  return held.transport === undefined && held.credential === undefined
}

export function forgettable(entry: Resources & Pick<Entry, 'connection' | 'pending'>): boolean {
  return entry.connection.closed && entry.pending === undefined && holdsNothing(entry)
}

export function viewOf(connection: Connection): ConnectionView {
  return Object.freeze({
    get generation() {
      return connection.generation
    },
    get closed() {
      return connection.closed
    },
    isCurrent: (generation: Generation) => connection.isCurrent(generation),
  })
}

export function isSettled(entry: Entry): boolean {
  return (
    entry.connection.closed &&
    entry.pending === undefined &&
    entry.tearing === undefined &&
    entry.closing === undefined
  )
}

export function handleOf(entry: Entry, transport: McpTransport, peer: PeerIdentity): Ensured {
  const { view } = entry
  const generation = view.generation
  return {
    key: entry.connection.key,
    generation,
    connection: view,
    peer,
    catalogKey: entry.catalogKey,
    adoptionRevision: entry.adoptionRevision,
    bound: entry.bound,
    wire: () => (view.isCurrent(generation) ? succeed(transport) : fail(NOT_SENT_FAILURE)),
  }
}

export function ensuredOf(entry: Entry): Ensured | undefined {
  const { transport } = entry
  const peer = entry.connection.usablePeer
  return transport === undefined || peer === undefined
    ? undefined
    : handleOf(entry, transport, peer)
}
