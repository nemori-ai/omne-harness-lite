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
  HttpCredentialHandle,
  McpTransport,
  TransportFailure,
  TransportMaterial,
} from '@omne-harness/mcp-contract/provider'
import {
  CONNECTION_UNAVAILABLE,
  handleOf,
  type CatalogMark,
  type Ensured,
  type EnsureFailure,
  type Entry,
  type UnavailableMark,
} from './entry.ts'
import { closeArrived, releaseArrived } from './late.ts'
import { connectionFailureOf, lostOf } from './lost.ts'
import { ask, within, type StartBound } from './port.ts'
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
    const { credential, target } = prepared
    if (credential.auth === 'none') return succeed(undefined)
    const holding = entry.ref.holding
    const asked = ask<Outcome<HttpCredentialHandle, CredentialFailure>>(
      () =>
        ports.credentials.acquire(
          access,
          holding,
          { kind: 'http-authorization', target },
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

  async function materialOf(
    entry: Entry,
    prepared: PreparedSettings,
    generation: Generation,
  ): Promise<Outcome<TransportMaterial, Failed>> {
    const { target } = prepared
    const { instructionsByteLimit } = config
    const credential = entry.credential
    return succeed(
      credential === undefined
        ? { kind: 'streamable-http', target, generation, instructionsByteLimit }
        : { kind: 'streamable-http', target, credential, generation, instructionsByteLimit },
    )
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
      const material = guarded(entry, await materialOf(entry, prepared, generation))
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
