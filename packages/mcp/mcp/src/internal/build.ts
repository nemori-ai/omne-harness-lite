// The build of one connection (SPEC S4 step 4, MC-5) under the connection bound of invariant 5,
// which starts at the credential and covers the process start, the open and the negotiation;
// and how a lost one is settled: requests refused, the entry torn down, the catalog marked. A
// port that throws within the bound is torn down like a failure, then the error goes on to the
// caller. A build under way when the table shuts goes no further than the step it is in and is
// wrapped up without a mark. The builder writes the entry's resources and drives its
// `Connection` (`attempt`, `ready`, `lose`); the table decides when the entry exists.
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
  TransportFailure,
  TransportMaterial,
} from '@omne-harness/mcp-contract/provider'
import { answerOf, untilAborted } from './abort.ts'
import {
  CONNECTION_UNAVAILABLE,
  handOverToLanding,
  type CatalogMark,
  type CredentialHandle,
  type Ensured,
  type EnsureFailure,
  type Entry,
  type UnavailableMark,
} from './entry.ts'
import { closeLate, landLate, releaseLate } from './late.ts'
import type { PreparedSettings } from './settings.ts'
import { releaseLanding, teardown } from './teardown.ts'

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
  /** Marks the catalog; a store that rejects instead of answering is unavailable (decision 4). */
  async function markCatalog(key: CatalogKey, reason: UnavailableMark): Promise<CatalogMark> {
    const read = await answerOf(ports.store.read(key), fail('unavailable'))
    if ('failure' in read) return 'unavailable'
    if (read.ok === 'absent') return 'not-acquired'
    const written = await answerOf(
      ports.store.write(key, markUnavailable(read.ok, reason), read.ok.revision),
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

  /** A preparation failed: refuse requests, close what was taken (S9 handle included), mark, report. */
  async function failed(entry: Entry, how: Failed): Promise<Outcome<never, EnsureFailure>> {
    const catalog = await markLost(entry, how.lost, how.mark)
    return fail({ stage: 'connect', reason: how.reason, catalog })
  }

  /**
   * The table shut while the build was under way (decision 5): wrapped up as a failed preparation
   * (requests refused, the handle released, a started process stopped), but nothing is marked:
   * the shutdown is a fact of this instance, not of the endpoint.
   */
  async function shutDown(entry: Entry): Promise<Outcome<never, EnsureFailure>> {
    entry.connection.lose('preparation-failed')
    await teardown(entry)
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
    const asked: Promise<Outcome<CredentialHandle, CredentialFailure>> =
      transport.kind === 'stdio'
        ? ports.credentials.acquire(access, holding, { kind: 'process-env' }, credential.binding)
        : ports.credentials.acquire(
            access,
            holding,
            { kind: 'http-authorization', target: transport.target },
            credential.binding,
          )
    const acquired = await untilAborted(asked, bound)
    if (acquired.kind === 'aborted') {
      void releaseLate(acquired.late)
      return fail(PREPARATION_FAILED)
    }
    if ('failure' in acquired.value)
      return fail({
        reason: { kind: 'credential-unavailable', cause: acquired.value.failure },
        lost: 'preparation-failed',
        mark: 'credential-unavailable',
      })
    return succeed(acquired.value.ok)
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
    const started = await untilAborted(ports.landing.start(access, transport.launch, env), bound)
    if (started.kind === 'aborted') {
      // The process may still land, with the handle in its environment: the handle goes with the
      // landing, released after that process's stop (S9) or at the shutdown (decision 6). The
      // entry holds the landing until it answers (decision 20).
      const landing = handOverToLanding(entry)
      void landLate(entry, landing, started.late).then(() => deps.afterLanding(entry))
      // A landing that outlives its bound after the shutdown began keeps no handle (decision 6).
      if (deps.shut()) void releaseLanding(landing)
      return fail(PREPARATION_FAILED)
    }
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
    const opened = await untilAborted(ports.transports.open(material, bound), bound)
    if (opened.kind === 'aborted') {
      void closeLate(opened.late)
      return fail(PREPARATION_FAILED)
    }
    if ('failure' in opened.value) return fail(failedOf(opened.value.failure))
    const transport = opened.value.ok
    entry.transport = transport
    const discovered = await untilAborted(transport.discover(), bound)
    if (discovered.kind === 'aborted') return fail(PREPARATION_FAILED)
    if ('failure' in discovered.value) return fail(failedOf(discovered.value.failure))
    return succeed({ transport, peer: discovered.value.ok })
  }

  async function build(
    entry: Entry,
    access: Access<P>,
    prepared: PreparedSettings,
  ): Promise<Outcome<Ensured, EnsureFailure>> {
    // What the key's earlier connection left is stopped again before the new attempt.
    await teardown(entry)
    const generation = entry.connection.attempt()
    const bound = AbortSignal.timeout(prepared.bound)
    try {
      const credential = await acquireCredential(entry, access, prepared, bound)
      if ('failure' in credential) return await failed(entry, credential.failure)
      entry.credential = credential.ok
      // The shutdown is checked after each step that may hand over a resource: after the
      // credential (before the process starts) and after the process (before the transport opens).
      if (deps.shut()) return await shutDown(entry)
      const material = await materialOf(entry, access, prepared, generation, bound)
      if ('failure' in material) return await failed(entry, material.failure)
      if (deps.shut()) return await shutDown(entry)
      const negotiated = await negotiate(entry, material.ok, bound)
      if ('failure' in negotiated) return await failed(entry, negotiated.failure)
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
      if (entry.connection.state.kind === 'preparing') entry.connection.lose('preparation-failed')
      await teardown(entry)
      throw error
    }
  }

  return { build, markLost }
}
