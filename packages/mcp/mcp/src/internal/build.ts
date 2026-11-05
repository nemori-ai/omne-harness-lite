// The build of one connection (SPEC S4 step 4, MC-5) under one connection bound, which starts with
// the build and covers the stop of what the key's earlier connection left, the credential, the
// process start, the open, the negotiation and the wrap-up of a failure: once it fires, the build
// waits for no port (SPEC P8 T2) and what is still under way goes on in the table's scope. Every
// port is asked through `ask`, so a port breach is an answer, not an exception. A build under way
// when the table shuts goes no further than the step it is in and is wrapped up without a mark.
// The builder writes the entry's resources and drives its `Connection` (`attempt`, `ready`,
// `lose`); the table decides when the entry exists.
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  markUnavailable,
  type CatalogKey,
  type ConnectionFailure,
  type EffectUnknown,
  type Generation,
  type LostReason,
  type McpConfig,
  type McpPorts,
  type NoAnswerCause,
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
import { ask, within, type Settle, type StartBound } from './port.ts'
import type { TaskScope } from './scope.ts'
import type { PreparedSettings } from './settings.ts'
import { teardown } from './teardown.ts'

export type Builder<P> = Readonly<{
  /** Builds the connection of `entry` from `prepared`, under the connection bound. */
  build(
    entry: Entry,
    access: Access<P>,
    prepared: PreparedSettings,
  ): Promise<Outcome<Ensured, EnsureFailure>>
  /** The connection is lost: requests refused, the entry torn down, the catalog marked. */
  markLost(entry: Entry, reason: LostReason, mark: UnavailableMark): Promise<CatalogMark>
}>

export type BuilderDependencies = Readonly<{
  /** A landing that was still pending after its bound has answered: the table looks again. */
  afterLanding(entry: Entry): void
  /** True once `closeAll` began: a build goes no further than the step it is in (decision 5). */
  shut(): boolean
  /** Where the work a build stops waiting for goes on. */
  scope: TaskScope
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

/** How a breach reads, per port (SPEC MC-15; contract T9 for the transport). */
const CREDENTIAL_BREACH = fail<CredentialFailure>('unknown')
const LANDING_BREACH = fail<LandingFailure>('unknown')
const OPEN_BREACH = fail<TransportFailure>({ kind: 'not-sent', cause: 'connection-unavailable' })
const DISCOVER_BREACH = fail<TransportFailure>({ kind: 'no-answer', cause: 'abandoned' })

function lostOfNoAnswer(cause: NoAnswerCause): LostReason {
  switch (cause) {
    case 'stream-broken':
      return 'stream-broken'
    case 'process-exited':
      return 'process-exited'
    case 'abandoned':
      return 'preparation-failed'
    default: {
      const exhaustive: never = cause
      return exhaustive
    }
  }
}

/** How a failure of `open` or `discover` is reported (SPEC R6, S5, S7). */
function failedOf(failure: TransportFailure): Failed {
  switch (failure.kind) {
    case 'not-sent':
      return failure.cause === 'authorization-required'
        ? {
            reason: { kind: 'authorization-required', discovery: failure.discovery },
            lost: 'authorization-required',
            mark: 'authorization-required',
          }
        : PREPARATION_FAILED
    case 'no-answer':
      return {
        reason: { kind: 'effect-unknown', cause: failure.cause },
        lost: lostOfNoAnswer(failure.cause),
        mark: 'connection-unavailable',
      }
    case 'error-answer':
    case 'answer-malformed':
      return { ...PREPARATION_FAILED, lost: 'discover-failed' }
    default: {
      const exhaustive: never = failure
      return exhaustive
    }
  }
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

  async function markLost(
    entry: Entry,
    reason: LostReason,
    mark: UnavailableMark,
  ): Promise<CatalogMark> {
    // Requests are refused at once; the teardown is the entry's one teardown.
    entry.connection.lose(reason)
    await teardown(entry)
    return markCatalog(entry.catalogKey, mark)
  }

  /**
   * A preparation failed: refuse requests, close what was taken (S9 handle included), mark,
   * report. Within the bound only: past it the wrap-up goes on in the scope, and the report says
   * the mark is `pending`. A build that fails after the shutdown began is wrapped up like one the
   * shutdown stopped, without a mark (takeover ruling K3).
   */
  async function failed(
    entry: Entry,
    how: Failed,
    bound: AbortSignal,
  ): Promise<Outcome<never, EnsureFailure>> {
    if (deps.shut()) return shutDown(entry, bound)
    const marked = await within(markLost(entry, how.lost, how.mark), bound, scope)
    const catalog = marked.kind === 'answered' ? marked.value : 'pending'
    return fail({ stage: 'connect', reason: how.reason, catalog })
  }

  /**
   * The table shut while the build was under way (decision 5, takeover ruling K3): wrapped up as
   * a failed preparation (requests refused, the handle released, a started process stopped), but
   * nothing is marked: the shutdown is a fact of this instance, not of the endpoint.
   */
  async function shutDown(
    entry: Entry,
    bound: AbortSignal,
  ): Promise<Outcome<never, EnsureFailure>> {
    entry.connection.lose('preparation-failed')
    await within(teardown(entry), bound, scope)
    return fail({ stage: 'settings', reason: CONNECTION_UNAVAILABLE })
  }

  async function acquireCredential(
    entry: Entry,
    access: Access<P>,
    prepared: PreparedSettings,
    bound: AbortSignal,
  ): Promise<Outcome<CredentialHandle | undefined, Failed>> {
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
    return succeed(acquired.value.ok)
  }

  /**
   * A landing still pending at its bound: the entry keeps it, with the handle it carries, until
   * it answers (decision 20). The handle is released after the stop of the process that lands
   * (S9), or at the shutdown (decision 6): `closeAll` releases the handle of every landing still
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
    // the handle at once, within the bound too (decision 6).
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

  /** Opens the transport from `material` and negotiates on it, under the connection bound. */
  async function negotiate(
    entry: Entry,
    material: TransportMaterial,
    bound: AbortSignal,
  ): Promise<Outcome<Readonly<{ transport: McpTransport; peer: PeerIdentity }>, Failed>> {
    const asked = ask(() => ports.transports.open(material, bound), OPEN_BREACH)
    const opened = await within(asked, bound, scope, () => closeArrived)
    if (opened.kind === 'expired') return fail(PREPARATION_FAILED)
    if ('failure' in opened.value) return fail(failedOf(opened.value.failure))
    const transport = opened.value.ok
    entry.transport = transport
    const discovered = await within(
      ask(() => transport.discover(), DISCOVER_BREACH),
      bound,
      scope,
    )
    if (discovered.kind === 'expired') return fail(PREPARATION_FAILED)
    if ('failure' in discovered.value) return fail(failedOf(discovered.value.failure))
    return succeed({ transport, peer: discovered.value.ok })
  }

  async function build(
    entry: Entry,
    access: Access<P>,
    prepared: PreparedSettings,
  ): Promise<Outcome<Ensured, EnsureFailure>> {
    const generation = entry.connection.attempt()
    const bound = deps.startBound(prepared.bound, 'build')
    try {
      // What the key's earlier connection left is stopped again before the new attempt.
      const leftovers = await within(teardown(entry), bound, scope)
      if (leftovers.kind === 'expired') return await failed(entry, PREPARATION_FAILED, bound)
      const credential = await acquireCredential(entry, access, prepared, bound)
      if ('failure' in credential) return await failed(entry, credential.failure, bound)
      entry.credential = credential.ok
      // The shutdown is checked after each step that may hand over a resource: after the
      // credential, after the process, and after the negotiation, before the connection is ready.
      if (deps.shut()) return await shutDown(entry, bound)
      const material = await materialOf(entry, access, prepared, generation, bound)
      if ('failure' in material) return await failed(entry, material.failure, bound)
      if (deps.shut()) return await shutDown(entry, bound)
      const negotiated = await negotiate(entry, material.ok, bound)
      if ('failure' in negotiated) return await failed(entry, negotiated.failure, bound)
      if (deps.shut()) return await shutDown(entry, bound)
      const { transport, peer } = negotiated.ok
      entry.connection.ready(peer)
      return succeed({
        transport,
        generation: entry.connection.generation,
        connection: entry.view,
        peer,
        catalogKey: entry.catalogKey,
        adoptionRevision: entry.adoptionRevision,
        bound: entry.bound,
      })
    } catch (error: unknown) {
      // Only an error of this package reaches here: ports are asked through `ask`.
      if (entry.connection.state.kind === 'preparing') entry.connection.lose('preparation-failed')
      await within(teardown(entry), bound, scope)
      throw error
    }
  }

  return { build, markLost }
}
