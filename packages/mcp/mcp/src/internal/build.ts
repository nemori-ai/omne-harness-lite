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
  build(
    entry: Entry,
    access: Access<P>,
    prepared: PreparedSettings,
  ): Promise<Outcome<Ensured, EnsureFailure>>
  // The connection is lost: requests are refused before this returns; the teardown and the
  // catalog mark go on in `done`.
  markLost(entry: Entry, reason: LostReason, mark: UnavailableMark): Losing
}>

export type Losing = Readonly<{ done: Promise<CatalogMark> }>

export type BuilderDependencies = Readonly<{
  afterLanding(entry: Entry): void
  scope: Spawn
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

const STOPPED: Outcome<never, EnsureFailure> = fail({
  stage: 'settings',
  reason: CONNECTION_UNAVAILABLE,
})

const CREDENTIAL_BREACH = fail<CredentialFailure>('unknown')
const LANDING_BREACH = fail<LandingFailure>('unknown')
const OPEN_BREACH = fail<TransportFailure>(NOT_SENT_FAILURE)
const DISCOVER_BREACH = fail<TransportFailure>({ kind: 'no-answer', cause: 'abandoned' })

const CLOSED = 'closed'

function guarded<T>(entry: Entry, answer: Outcome<T, Failed>): Outcome<T, Failed | typeof CLOSED> {
  return entry.connection.closed ? fail(CLOSED) : answer
}

function failedOf(failure: TransportFailure): Failed {
  const lost = lostOf(failure)
  return {
    reason: connectionFailureOfBuildStep(failure),
    lost: lost?.reason ?? buildLostReasonOf(failure),
    mark: lost?.mark ?? 'connection-unavailable',
  }
}

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

  async function markCatalog(key: CatalogKey, reason: UnavailableMark): Promise<CatalogMark> {
    const read = await ask(() => ports.store.read(key), fail('unavailable'))
    if ('failure' in read) return 'unavailable'
    if (read.ok === 'absent') return 'not-acquired'
    const record = read.ok
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
    entry.connection.lose(reason)
    return { done: teardown(entry).then(() => markCatalog(entry.catalogKey, mark)) }
  }

  async function failed(
    entry: Entry,
    how: Failed,
    bound: AbortSignal,
  ): Promise<Outcome<never, EnsureFailure>> {
    const marked = await within(markLost(entry, how.lost, how.mark).done, bound, scope)
    const catalog = marked.kind === 'answered' ? marked.value : 'pending'
    return fail({ stage: 'connect', reason: how.reason, catalog })
  }

  async function ended(
    entry: Entry,
    failure: Failed | typeof CLOSED,
    bound: AbortSignal,
  ): Promise<Outcome<never, EnsureFailure>> {
    if (failure === CLOSED) return STOPPED
    return failed(entry, failure, bound)
  }

  async function leftoversStopped(
    entry: Entry,
    bound: AbortSignal,
  ): Promise<Outcome<void, Failed>> {
    const stopped = await within(teardown(entry), bound, scope)
    return stopped.kind === 'expired' ? fail(PREPARATION_FAILED) : succeed(undefined)
  }

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
      if (entry.connection.state.kind === 'preparing') entry.connection.lose('preparation-failed')
      await within(teardown(entry), bound, scope)
      throw error
    }
  }

  return { build, markLost }
}
