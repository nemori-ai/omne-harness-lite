// One entry of the connection table: the `Connection` aggregate of a key, the resources behind
// it, the views the table hands out, and the predicates the table decides on. No I/O here: the
// close order is `teardown.ts`, the arrivals after the bound are `late.ts`, the build is
// `build.ts`, and only `table.ts` puts an entry in or takes it out. An entry is taken out only
// when `holdsNothing` says so (SPEC decision 20).
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

/** What marking a connection failure into the catalog did. */
export type CatalogMark = 'marked' | 'revision-conflict' | 'unavailable' | 'not-acquired'

export type ConnectionUnavailable = Extract<ConnectionFailure, { kind: 'connection-unavailable' }>

/**
 * Why `ensure` did not get to a build, with nothing marked: a setting defect, a missing
 * credential (S4, K1), the adoption read again (withdrawn, unreadable, another revision, or not
 * answered within the bound), or the table shut by `closeAll`.
 */
export type EnsureRefusal = SettingsFailure | AdoptionRefusal | ConnectionUnavailable

export type EnsureFailure =
  | Readonly<{ stage: 'settings'; reason: EnsureRefusal }>
  | Readonly<{ stage: 'connect'; reason: ConnectionFailure | EffectUnknown; catalog: CatalogMark }>

export type UnavailableMark = Exclude<UnavailableReason, 'no-longer-offered'>

export type CredentialHandle = ProcessCredentialHandle | HttpCredentialHandle

/** What a teardown confirmed: the stop range of the processes, or that there was none. */
export type Scope = StopScope | 'no-process'

/** A process whose stop confirmed less than the whole tree. Stopped again at every close. */
export type Lingering = Readonly<{ handle: ProcessHandle; confirmed: StopScope }>

/**
 * A landing still pending after its bound. The process it may hand over carries `credential` in
 * its environment; the handle is released once: after that process's stop (S9), or at the
 * shutdown (the exception of S9, decision 6), whichever comes first.
 */
export type Landing = { credential: ProcessCredentialHandle | undefined }

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
  tearing: Promise<Scope> | undefined
  /** The close in flight: refuse requests, wait for the build, tear down, forget. */
  closing: Promise<Scope> | undefined
}

/**
 * True when the entry holds nothing: no transport, no process handle, no credential handle, no
 * process whose stop was not confirmed, no landing in flight. The one condition an entry is
 * forgotten on (decision 20): a pure function of what is held, nothing else.
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

/** `lingering` with the latest stop of `handle` recorded: kept when it confirmed less than the tree. */
export function kept(
  lingering: readonly Lingering[],
  handle: ProcessHandle,
  confirmed: StopScope,
): readonly Lingering[] {
  const others = lingering.filter(item => item.handle !== handle)
  return confirmed === 'tree-confirmed' ? others : [...others, { handle, confirmed }]
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
