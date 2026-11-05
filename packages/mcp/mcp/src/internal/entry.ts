// One entry of the connection table: the `Connection` aggregate of a key, the resources behind
// it, the views the table hands out, the predicates the table decides on, and the moves that
// keep a resource in one place. No I/O here: the close order is `teardown.ts`, the arrivals
// after the bound are `late.ts`, the build is `build.ts`, and only `table.ts` puts an entry in or
// takes it out, when `forgettable` says so (SPEC decision 20).
import type { Outcome } from '@omne-harness/operation-result'
import type {
  AdoptionRevision,
  CatalogKey,
  ConnectionFailure,
  EffectUnknown,
  EndpointRef,
  Generation,
  Millis,
  PeerIdentity,
  Residual,
  StopScope,
  UnavailableReason,
} from '@omne-harness/mcp-contract'
import type {
  HttpCredentialHandle,
  McpTransport,
  ProcessCredentialHandle,
  ProcessHandle,
} from '@omne-harness/mcp-contract/provider'
import type { Connection } from './connection.ts'
import type { AdoptionRefusal } from './gate.ts'
import type { SettingsFailure } from './settings.ts'

/** The read-only view of a connection's generation; the aggregate itself stays in the table. */
export type ConnectionView = Readonly<{
  readonly generation: Generation
  isCurrent(generation: Generation): boolean
}>

/**
 * A usable connection, as it was when `ensure` answered: the transport, the generation and the
 * peer of that moment, the adoption revision it was built under, and the bound its requests use.
 */
export type Ensured = Readonly<{
  transport: McpTransport
  generation: Generation
  connection: ConnectionView
  peer: PeerIdentity
  catalogKey: CatalogKey
  adoptionRevision: AdoptionRevision
  bound: Millis
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
 * bound), a close or teardown in the way that did not end within the bound, or the table shut by
 * `closeAll`, before the build or during it.
 */
export type EnsureRefusal = SettingsFailure | AdoptionRefusal | ConnectionUnavailable

export type EnsureFailure =
  | Readonly<{ stage: 'settings'; reason: EnsureRefusal }>
  | Readonly<{ stage: 'connect'; reason: ConnectionFailure | EffectUnknown; catalog: CatalogMark }>

export type UnavailableMark = Exclude<UnavailableReason, 'no-longer-offered'>

export type CredentialHandle = ProcessCredentialHandle | HttpCredentialHandle

/** What a teardown confirmed: the stop range of the processes, or that there was none. */
export type StopRange = StopScope | 'no-process'

/** A process whose stop confirmed less than the whole tree. Stopped again at every close. */
export type Lingering = Readonly<{ handle: ProcessHandle; confirmed: StopScope }>

/**
 * A landing in flight, with the handle the process it may hand over carries in its environment.
 * The handle is released once: after that process's stop (S9), or at the shutdown while the
 * landing is in flight (decision 6). `landed` once a landing past its bound handed over a
 * process: from then on the handle waits for that process's stop.
 */
export type Landing = { credential: ProcessCredentialHandle | undefined; landed: boolean }

/**
 * What an entry can hold. Each one is closed, stopped or released by the entry's teardown, or
 * on its arrival after the bound.
 */
export type Resources = {
  transport: McpTransport | undefined
  process: ProcessHandle | undefined
  credential: CredentialHandle | undefined
  lingering: readonly Lingering[]
  landings: readonly Landing[]
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
  tearing: Promise<StopRange> | undefined
  /** The close in flight: refuse requests, wait for the build, tear down, forget. */
  closing: Promise<StopRange> | undefined
}

/**
 * True when the entry holds nothing: no transport, no process handle, no credential handle, no
 * process whose stop was not confirmed, no landing in flight. A pure function of what is held.
 */
export function holdsNothing(held: Resources): boolean {
  return (
    held.transport === undefined &&
    held.process === undefined &&
    held.credential === undefined &&
    held.lingering.length === 0 &&
    held.landings.length === 0
  )
}

/**
 * The one condition an entry leaves the table on (decision 20): it refuses requests (`closed`)
 * and `holdsNothing`.
 */
export function forgettable(entry: Resources & Readonly<{ connection: Connection }>): boolean {
  return entry.connection.state.kind === 'closed' && holdsNothing(entry)
}

/**
 * Records what a stop of `handle` confirmed. A process handle is in `process` or in `lingering`,
 * never in both: it leaves `process`, and stays in `lingering` while its stop confirmed less than
 * the whole tree.
 */
export function recordStop(held: Resources, handle: ProcessHandle, confirmed: StopScope): void {
  if (held.process === handle) held.process = undefined
  const others = held.lingering.filter(item => item.handle !== handle)
  held.lingering = confirmed === 'tree-confirmed' ? others : [...others, { handle, confirmed }]
}

/** What `from` still lingers with moves to `held`, which stops it at its next teardown. */
export function adoptLingering(held: Resources, from: Resources): void {
  held.lingering = [...held.lingering, ...from.lingering]
  from.lingering = []
}

/**
 * A landing starts: it goes on the entry as a landing in flight, and the process credential
 * handle goes with it, because the process that may land carries it in its environment. The
 * handle is in the entry or in one landing, never in both (S9).
 */
export function handOverToLanding(held: Resources): Landing {
  const { credential } = held
  const landing: Landing = {
    credential: credential?.purpose === 'process-env' ? credential : undefined,
    landed: false,
  }
  if (landing.credential !== undefined) held.credential = undefined
  held.landings = [...held.landings, landing]
  return landing
}

/** The landing answered: it leaves the entry. */
export function landingAnswered(held: Resources, landing: Landing): void {
  held.landings = held.landings.filter(pending => pending !== landing)
}

/**
 * The landing answered within its bound: it leaves the entry, and the handle it carried comes
 * back to the entry, which releases it at its teardown, unless the shutdown released it already.
 */
export function takeBackFromLanding(held: Resources, landing: Landing): void {
  if (landing.credential !== undefined) held.credential = landing.credential
  landing.credential = undefined
  landingAnswered(held, landing)
}

export function viewOf(connection: Connection): ConnectionView {
  return Object.freeze({
    get generation() {
      return connection.generation
    },
    isCurrent: (generation: Generation) => connection.isCurrent(generation),
  })
}

export function isUsable(entry: Entry): entry is Entry & { transport: McpTransport } {
  const kind = entry.connection.state.kind
  return entry.transport !== undefined && (kind === 'ready' || kind === 'degraded')
}

/** True when nothing of the entry is in flight and it refuses requests: only leftovers remain. */
export function isSettled(entry: Entry): boolean {
  return (
    entry.connection.state.kind === 'closed' &&
    entry.pending === undefined &&
    entry.tearing === undefined &&
    entry.closing === undefined
  )
}

export function ensuredOf(entry: Entry & { transport: McpTransport }): Ensured | undefined {
  const peer = entry.connection.peer
  if (peer === undefined) return undefined
  return {
    transport: entry.transport,
    generation: entry.connection.generation,
    connection: entry.view,
    peer,
    catalogKey: entry.catalogKey,
    adoptionRevision: entry.adoptionRevision,
    bound: entry.bound,
  }
}

/** The processes the entries of one holding left, as the status view reports them. */
export function residualOf(found: readonly Entry[]): readonly Residual[] | undefined {
  const lingering = found.flatMap(entry => entry.lingering)
  if (lingering.length === 0) return undefined
  return lingering.map(({ confirmed }) => ({ kind: 'process', confirmed }))
}
