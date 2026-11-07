// The build of one connection (SPEC S4 step 4, MC-5) under one connection bound, which starts with
// the build and covers the stop of what the key's earlier connection left, the credential, the
// process start, the open, the negotiation and the wrap-up of a failure: once it fires, the build
// waits for no port (SPEC P8 T2) and what is still under way goes on in the table's scope. Every
// port is asked through `ask`, so a port breach is an answer, not an exception. The build is a
// sequence of steps, and the close is checked after each one (`guarded`): a build whose connection
// is closed under it (by `release`, a rebuild of another revision, or `closeAll`: MC-10) goes no
// further than the step it is in and answers at once, without a mark; the close that closed it
// tears the entry down once the build ended. The builder writes the entry's resources and drives
// its `Connection` (`attempt`, `ready`, `lose`); the table decides when the entry exists and when
// it closes.
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  markUnavailable,
  NOT_SENT_FAILURE,
  type CatalogKey,
  type ConnectionFailure,
  type EffectUnknown,
  type Generation,
  type LostReason,
  type McpConfig,
  type McpPorts,
  type PeerIdentity,
} from '@omne-harness/mcp-contract'
import type {
  CredentialFailure,
  McpTransport,
  ProcessEnvironment,
  ProcessHandle,
  TransportFailure,
  TransportMaterial,
} from '@omne-harness/mcp-contract/provider'
import {
  CONNECTION_UNAVAILABLE,
  handOverToLanding,
  handleOf,
  takeBackFromLanding,
  type CatalogMark,
  type CredentialHandle,
  type Ensured,
  type EnsureFailure,
  type Entry,
  type Landing,
  type UnavailableMark,
} from './entry.ts'
import { closeArrived, landArrived, releaseArrived, type LandingFailure } from './late.ts'
import { connectionFailureOf, lostOf } from './lost.ts'
import { ask, within, type Settle, type StartBound } from './port.ts'
import type { Spawn } from './scope.ts'
import type { PreparedSettings } from './settings.ts'
import { teardown } from './teardown.ts'

export type Builder<P> = Readonly<{
  /** Builds the connection of `entry` from `prepared`, under the connection bound. */
  build(
    entry: Entry,
    access: Access<P>,
    prepared: PreparedSettings,
  ): Promise<Outcome<Ensured, EnsureFailure>>
  /**
   * The connection is lost: requests are refused before this returns; the teardown and the
   * catalog mark go on in `done`.
   */
  markLost(entry: Entry, reason: LostReason, mark: UnavailableMark): Losing
}>

/**
 * A loss under way: the connection refuses requests already; `done` ends when the entry is
 * torn down and the catalog marked. The shape holds the synchronous part at the level of the
 * signature only: an `async` function, or one that awaits first, cannot answer it, but a
 * synchronous one could still defer the marking into `done`. `markLost` marks first, on its first
 * line; a case that reads the state in the call's own continuation guards it.
 */
export type Losing = Readonly<{ done: Promise<CatalogMark> }>

export type BuilderDependencies = Readonly<{
  /** A landing that was still pending after its bound has answered: the table looks again. */
  afterLanding(entry: Entry): void
  /** Where the work a build stops waiting for goes on. */
  scope: Spawn
  /** The source of the connection bound. */
  startBound: StartBound
}>

type Failed = Readonly<{
  reason: ConnectionFailure | EffectUnknown
  lost: LostReason
  mark: UnavailableMark
}>

const PREPARATION_FAILED: Failed = {
  reason: CONNECTION_UNAVAILABLE,
  lost: 'preparation-failed',
  mark: 'connection-unavailable',
}

/** What a build whose connection was closed under it answers: the refusal after the shutdown. */
const STOPPED: Outcome<never, EnsureFailure> = fail({
  stage: 'settings',
  reason: CONNECTION_UNAVAILABLE,
})

/** How a breach reads, per port (SPEC MC-15; contract T9 for the transport). */
const CREDENTIAL_BREACH = fail<CredentialFailure>('unknown')
const LANDING_BREACH = fail<LandingFailure>('unknown')
const OPEN_BREACH = fail<TransportFailure>(NOT_SENT_FAILURE)
const DISCOVER_BREACH = fail<TransportFailure>({ kind: 'no-answer', cause: 'abandoned' })

/** A step of the build found its connection closed (MC-10). */
const CLOSED = 'closed'

/**
 * The check after each step of the build: once the connection was closed under the build (its
 * close refuses requests before it waits for the build, MC-10), the build ends here, whatever the
 * step answered. Called in the build's own continuation, so what follows a step that passed runs
 * in the same synchronous run as the check: the last one is next to `ready`, and a closed
 * connection never becomes ready.
 */
function guarded<T>(entry: Entry, answer: Outcome<T, Failed>): Outcome<T, Failed | typeof CLOSED> {
  return entry.connection.closed ? fail(CLOSED) : answer
}

/**
 * How a failure of `open` or `discover` is reported (SPEC R6, S5, S7, MC-5): the connection
 * failure for the caller, by the kind of the failure; the `lost` reason and the catalog mark from
 * `lostOf` first, as on a ready connection, and from the build rule when it gives none.
 */
function failedOf(failure: TransportFailure): Failed {
  const lost = lostOf(failure)
  return {
    reason: connectionFailureOfBuildStep(failure),
    lost: lost?.reason ?? buildLostReasonOf(failure),
    mark: lost?.mark ?? 'connection-unavailable',
  }
}

/** The connection failure of a failed `open` or `discover` (SPEC R6). */
function connectionFailureOfBuildStep(
  failure: TransportFailure,
): ConnectionFailure | EffectUnknown {
  switch (failure.kind) {
    case 'not-sent':
      return connectionFailureOf(failure)
    case 'no-answer':
      return { kind: 'effect-unknown', cause: failure.cause }
    case 'error-answer':
    case 'answer-malformed':
      return CONNECTION_UNAVAILABLE
    default: {
      const exhaustive: never = failure
      return exhaustive
    }
  }
}

/**
 * The build rule (MC-5) for a failure `lostOf` gives no reason for: an answer of the peer that is
 * an error or unreadable is `discover-failed`; anything else is `preparation-failed`.
 */
function buildLostReasonOf(failure: TransportFailure): LostReason {
  return failure.kind === 'error-answer' || failure.kind === 'answer-malformed'
    ? 'discover-failed'
    : 'preparation-failed'
}

export function createBuilder<P, S>(
  ports: McpPorts<P, S>,
  config: McpConfig<P>,
  deps: BuilderDependencies,
): Builder<P> {
  const { scope } = deps

  /** Marks the catalog; a store that breaches is unavailable (SPEC MC-15). */
  async function markCatalog(key: CatalogKey, reason: UnavailableMark): Promise<CatalogMark> {
    const read = await ask(() => ports.store.read(key), fail('unavailable'))
    if ('failure' in read) return 'unavailable'
    if (read.ok === 'absent') return 'not-acquired'
    const record = read.ok
    // Computed outside `ask`: an error of this package here is not a breach of the store.
    const marked = markUnavailable(record, reason)
    const written = await ask(
      () => ports.store.write(key, marked, record.revision),
      fail('unavailable'),
    )
    if ('failure' in written)
      return written.failure === 'unavailable' ? 'unavailable' : 'revision-conflict'
    return 'marked'
  }

  function markLost(entry: Entry, reason: LostReason, mark: UnavailableMark): Losing {
    // Requests are refused at once; the teardown is the entry's one teardown.
    entry.connection.lose(reason)
    return { done: teardown(entry).then(() => markCatalog(entry.catalogKey, mark)) }
  }

  /**
   * A step failed on a connection that is not closed: refuse requests, close what was taken (S9
   * handle included), mark, report. Within the bound only: past it the wrap-up goes on in the
   * scope, and the report says the mark is `pending`.
   */
  async function failed(
    entry: Entry,
    how: Failed,
    bound: AbortSignal,
  ): Promise<Outcome<never, EnsureFailure>> {
    const marked = await within(markLost(entry, how.lost, how.mark).done, bound, scope)
    const catalog = marked.kind === 'answered' ? marked.value : 'pending'
    return fail({ stage: 'connect', reason: how.reason, catalog })
  }

  /**
   * How a step that did not pass ends the build; called in the same synchronous run as its check.
   * A connection closed under the build (MC-10; MC-5 and P4 for `closeAll`),
   * whether the step failed or not, answers at once with the refusal a call after the shutdown
   * gets (MC-5), and nothing is marked: the close is a decision of this side, not a fact
   * about the endpoint. The close tears the entry down once the build ended: that teardown is the
   * only one after the close began, so the range the close reports is the one it confirmed.
   * A failure on an open connection is `failed`.
   */
  async function ended(
    entry: Entry,
    failure: Failed | typeof CLOSED,
    bound: AbortSignal,
  ): Promise<Outcome<never, EnsureFailure>> {
    if (failure === CLOSED) return STOPPED
    return failed(entry, failure, bound)
  }

  /** The step that stops again what the key's earlier connection left, before the new attempt. */
  async function leftoversStopped(
    entry: Entry,
    bound: AbortSignal,
  ): Promise<Outcome<void, Failed>> {
    const stopped = await within(teardown(entry), bound, scope)
    return stopped.kind === 'expired' ? fail(PREPARATION_FAILED) : succeed(undefined)
  }

  /** The step that takes the credential handle; the entry holds it from the answer on. */
  async function acquireCredential(
    entry: Entry,
    access: Access<P>,
    prepared: PreparedSettings,
    bound: AbortSignal,
  ): Promise<Outcome<void, Failed>> {
    const { credential, transport } = prepared
    if (credential.auth === 'none') return succeed(undefined)
    const holding = entry.ref.holding
    const asked = ask<Outcome<CredentialHandle, CredentialFailure>>(
      () =>
        transport.kind === 'stdio'
          ? ports.credentials.acquire(access, holding, { kind: 'process-env' }, credential.binding)
          : ports.credentials.acquire(
              access,
              holding,
              { kind: 'http-authorization', target: transport.target },
              credential.binding,
            ),
      CREDENTIAL_BREACH,
    )
    const acquired = await within(asked, bound, scope, () => releaseArrived)
    if (acquired.kind === 'expired') return fail(PREPARATION_FAILED)
    if ('failure' in acquired.value)
      return fail({
        reason: { kind: 'credential-unavailable', cause: acquired.value.failure },
        lost: 'preparation-failed',
        mark: 'credential-unavailable',
      })
    entry.credential = acquired.value.ok
    return succeed(undefined)
  }

  /**
   * A landing still pending at its bound: the entry keeps it, with the handle it carries, until
   * it answers (MC-14). The handle is released after the stop of the process that lands
   * (S9), or at the shutdown (MC-14): `closeAll` releases the handle of every landing still
   * pending, so one whose bound fires after the shutdown began holds no handle any more.
   */
  function landingOutlived(
    entry: Entry,
    landing: Landing,
  ): Settle<Outcome<ProcessHandle, LandingFailure>> {
    const arrived = landArrived(entry, landing)
    return async started => {
      await arrived(started)
      deps.afterLanding(entry)
    }
  }

  /**
   * The step that prepares the transport material: for stdio, the process start, after which the
   * entry holds the process; for HTTP, nothing is asked.
   */
  async function materialOf(
    entry: Entry,
    access: Access<P>,
    prepared: PreparedSettings,
    generation: Generation,
    bound: AbortSignal,
  ): Promise<Outcome<TransportMaterial, Failed>> {
    const { transport } = prepared
    const { instructionsByteLimit } = config
    const credential = entry.credential
    if (transport.kind === 'streamable-http') {
      const { target } = transport
      return succeed(
        credential?.purpose === 'http-authorization'
          ? { kind: 'streamable-http', target, credential, generation, instructionsByteLimit }
          : { kind: 'streamable-http', target, generation, instructionsByteLimit },
      )
    }
    const env: ProcessEnvironment = {
      values: transport.values,
      credentials:
        credential?.purpose === 'process-env'
          ? transport.credentialVariables.map(name => ({ name, handle: credential }))
          : [],
    }
    // From its start the landing is in flight: the handle goes with it, so a shutdown releases
    // the handle at once, within the bound too (MC-14).
    const landing = handOverToLanding(entry)
    const asked = ask(() => ports.landing.start(access, transport.launch, env), LANDING_BREACH)
    const started = await within(asked, bound, scope, () => landingOutlived(entry, landing))
    if (started.kind === 'expired') return fail(PREPARATION_FAILED)
    takeBackFromLanding(entry, landing)
    if ('failure' in started.value)
      return fail({
        reason: { kind: 'landing-unavailable' },
        lost: 'preparation-failed',
        mark: 'landing-unavailable',
      })
    entry.process = started.value.ok
    return succeed({ kind: 'stdio', process: started.value.ok, generation, instructionsByteLimit })
  }

  /** The step that opens the transport from `material`; the entry holds it from the answer on. */
  async function opened(
    entry: Entry,
    material: TransportMaterial,
    bound: AbortSignal,
  ): Promise<Outcome<McpTransport, Failed>> {
    const asked = ask(() => ports.transports.open(material, bound), OPEN_BREACH)
    const answer = await within(asked, bound, scope, () => closeArrived)
    if (answer.kind === 'expired') return fail(PREPARATION_FAILED)
    if ('failure' in answer.value) return fail(failedOf(answer.value.failure))
    entry.transport = answer.value.ok
    return succeed(answer.value.ok)
  }

  /** The step that negotiates on `transport`: the identity of the peer. */
  async function discovered(
    transport: McpTransport,
    bound: AbortSignal,
  ): Promise<Outcome<PeerIdentity, Failed>> {
    const answer = await within(
      ask(() => transport.discover(), DISCOVER_BREACH),
      bound,
      scope,
    )
    if (answer.kind === 'expired') return fail(PREPARATION_FAILED)
    if ('failure' in answer.value) return fail(failedOf(answer.value.failure))
    return succeed(answer.value.ok)
  }

  /**
   * The steps of MC-5 in order, each followed by the check of the close (`guarded`); a step that
   * takes a resource puts it in the entry before it answers, so the teardown finds it whichever
   * way the build ends.
   */
  async function build(
    entry: Entry,
    access: Access<P>,
    prepared: PreparedSettings,
  ): Promise<Outcome<Ensured, EnsureFailure>> {
    const generation = entry.connection.attempt()
    const bound = deps.startBound(prepared.bound, 'build')
    try {
      const leftovers = guarded(entry, await leftoversStopped(entry, bound))
      if ('failure' in leftovers) return await ended(entry, leftovers.failure, bound)
      const credential = guarded(entry, await acquireCredential(entry, access, prepared, bound))
      if ('failure' in credential) return await ended(entry, credential.failure, bound)
      const material = guarded(entry, await materialOf(entry, access, prepared, generation, bound))
      if ('failure' in material) return await ended(entry, material.failure, bound)
      const transport = guarded(entry, await opened(entry, material.ok, bound))
      if ('failure' in transport) return await ended(entry, transport.failure, bound)
      const peer = guarded(entry, await discovered(transport.ok, bound))
      if ('failure' in peer) return await ended(entry, peer.failure, bound)
      entry.connection.ready(peer.ok)
      return succeed(handleOf(entry, transport.ok, peer.ok))
    } catch (error: unknown) {
      // Only an error of this package reaches here: ports are asked through `ask`.
      if (entry.connection.state.kind === 'preparing') entry.connection.lose('preparation-failed')
      await within(teardown(entry), bound, scope)
      throw error
    }
  }

  return { build, markLost }
}
