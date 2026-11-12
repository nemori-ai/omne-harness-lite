// One entry of the connection table: the `Connection` aggregate of a key, the resources behind
// it, the views the table hands out, and the predicates the table decides on. No I/O here: the
// close order is `teardown.ts`, the arrivals after the bound are `late.ts`, the build is
// `build.ts`, and only `table.ts` puts an entry in or takes it out, when `forgettable` says so
// (MC-14).
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

/**
 * The read-only view of a connection: its generation, whether a generation is the present usable
 * one, and whether its close began. The aggregate itself stays in the table.
 */
export type ConnectionView = Readonly<{
  readonly generation: Generation
  readonly closed: boolean
  isCurrent(generation: Generation): boolean
}>

export type NotSent = Extract<TransportFailure, { kind: 'not-sent' }>

/**
 * A usable connection, as it was when `ensure` answered: its key, the generation and the peer of
 * that moment, the adoption revision it was built under, and the bound its requests use. The
 * transport is reached through `wire` only: it answers the transport while the connection takes
 * requests, that is, while it is ready or degraded at `generation`, and the refusal a closed
 * transport gives (contract T1, `NOT_SENT_FAILURE`) once its close began, once it is lost, or once
 * another generation replaced it (SPEC MC-10). A request reads `wire` in the same synchronous run
 * as the send, so no close can slip between them.
 */
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

/**
 * What marking a connection failure into the catalog did. `pending`: a build reached its bound
 * before the mark answered; the mark goes on in the table's scope (SPEC P8 T2).
 */
export type CatalogMark =
  | 'marked'
  | 'revision-conflict'
  | 'unavailable'
  | 'not-acquired'
  | 'pending'

export type ConnectionUnavailable = Extract<ConnectionFailure, { kind: 'connection-unavailable' }>

export const CONNECTION_UNAVAILABLE: ConnectionUnavailable = { kind: 'connection-unavailable' }

/**
 * Why `ensure` answered with nothing marked: a setting defect, a missing credential (S4, K1), the
 * adoption read again (withdrawn, unreadable, another revision, or not answered within the
 * bound), a close or teardown in the way that did not end within the bound, the table shut by
 * `closeAll` before the call, or the connection closed before the answer: under the build, or
 * between the build and the answer (MC-5, MC-10, P16).
 */
export type EnsureRefusal = SettingsFailure | AdoptionRefusal | ConnectionUnavailable

export type EnsureFailure =
  | Readonly<{ stage: 'settings'; reason: EnsureRefusal }>
  | Readonly<{ stage: 'connect'; reason: ConnectionFailure | EffectUnknown; catalog: CatalogMark }>

export type UnavailableMark = Exclude<UnavailableReason, 'no-longer-offered'>

/**
 * What an entry can hold. Each one is closed or released by the entry's teardown, or on its
 * arrival after the bound.
 */
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
  /** The teardown in flight, shared by a lose, a failed build, a rebuild and a close. */
  tearing: Promise<void> | undefined
  /** The close in flight: refuse requests, wait for the build, tear down, forget. */
  closing: Promise<void> | undefined
}

/**
 * True when the entry holds nothing: no transport and no credential handle. A pure function of
 * what is held.
 */
export function holdsNothing(held: Resources): boolean {
  return held.transport === undefined && held.credential === undefined
}

/**
 * The one condition an entry leaves the table on (MC-14): it refuses requests (`closed`),
 * `holdsNothing`, and no build is in flight that may still put a resource in it. A close refuses
 * requests before it waits for the build (MC-10), so a closed entry can hold nothing for a moment
 * while its build is still under way.
 */
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

/** True when nothing of the entry is in flight and it refuses requests: only leftovers remain. */
export function isSettled(entry: Entry): boolean {
  return (
    entry.connection.closed &&
    entry.pending === undefined &&
    entry.tearing === undefined &&
    entry.closing === undefined
  )
}

/** The handle of the entry's present connection on `transport`, as `ensure` answers it. */
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

/** The handle of the entry's connection while it takes requests, without building; else undefined. */
export function ensuredOf(entry: Entry): Ensured | undefined {
  const { transport } = entry
  const peer = entry.connection.usablePeer
  return transport === undefined || peer === undefined
    ? undefined
    : handleOf(entry, transport, peer)
}
