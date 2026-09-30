import { createHash } from 'node:crypto'
import { ExactDecimal, type AttemptId, type RunId } from '@omne-harness-lite/call-accounts'
import { isOk, parseOpaqueIdentifier, tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { CallKey, CreationKey, SessionRef } from '@omne-harness-lite/messages'
import {
  encodeModelLogKey,
  type CallAccess,
  type CallAccessEvidence,
  type CallContainer,
  type CallContainerStore,
  type CallFacts,
  type CallOrigin,
  type CallPresence,
  type CallPresenceFact,
  type CallPresenceInput,
  type CallSource,
  type ModelLogSettlementTarget,
  type SettlementLogBinding,
} from '@omne-harness-lite/model-request-runtime'
import type { PlannedRequest, RawResponse } from '@omne-harness-lite/pi-ai-transport'

type DemoContainer = CallContainer<PlannedRequest, RawResponse>

/**
 * The single-process demo host is the only trusted source for both access and presence
 * evidence. This label names that source, not a cross-process or production authority.
 */
export const DEMO_REFERENCE_SOURCE_VERSION = 'model-invocation-minimal-demo/single-process-host/v1'

/**
 * MS8 S-51: the creation key is an explicit operation association scoped by tenant and Session.
 * The demo's operation is "answer this user message", so the key is a pure function of that
 * message's identity plus the explicit call and Run coordinates, never a per-attempt random value.
 * Replaying the same operation therefore recognizes the original call, and a changed request under
 * the same identity is left for openCall to report as a creation conflict.
 */
export function deriveCreationKey(input: {
  readonly session: SessionRef
  readonly userMessage: string
  readonly callId?: string
  readonly run?: RunId
  readonly attempt?: AttemptId
}): CreationKey {
  const canonical = JSON.stringify([
    'model-invocation-minimal-demo/creation/v1',
    input.session,
    input.userMessage,
    input.callId ?? null,
    input.run ?? null,
    input.attempt === undefined ? null : ExactDecimal.from(input.attempt).toString(),
  ])
  const parsed = parseOpaqueIdentifier(
    `creation-${createHash('sha256').update(canonical, 'utf8').digest('hex')}`,
    'CreationKey',
  )
  if (!isOk(parsed)) throw new Error('creation key derivation invalid')
  return parsed.ok
}

export interface DemoCallPresenceHost {
  readonly calls: CallContainerStore<PlannedRequest, RawResponse>
  /** The container this process actually opened, even after the store released it. */
  readonly retained: (ref: CallKey) => DemoContainer | undefined
  /** True only when this session's settlement owner has no unknown opened or response writer. */
  readonly settled: (session: SessionRef) => boolean
  /**
   * Host-witnessed exit of the previous worker, available only after this session's cold
   * recovery scope was built. Absent means this process cannot prove any old execution stopped.
   */
  readonly coldRecovered: (
    ref: CallKey,
  ) => { readonly target: ModelLogSettlementTarget | null } | undefined
}

function presenceFact(
  host: DemoCallPresenceHost,
  input: CallPresenceInput,
): CallPresenceFact | undefined {
  const sourceVersion = DEMO_REFERENCE_SOURCE_VERSION
  const stored = host.calls.find(input.ref)
  // A closed container can remain findable until the store drops it, so the container itself,
  // not its presence in the store, says whether the original execution still holds resources.
  const container = stored ?? host.retained(input.ref)
  if (container !== undefined) {
    const view = container.view()
    if (
      view.session.log.generation !== input.source.generation ||
      view.session.log.session !== input.ref.session ||
      !tenantIdEquals(view.session.log.tenant, input.origin.tenant)
    )
      return undefined
    if (stored !== undefined && !container.canRemove())
      return {
        kind: 'live',
        source: input.source,
        executionGeneration: view.executionGeneration,
        sourceVersion,
      }
    // Only a container that released its exact lease, with no unknown writer left on the
    // session owner, is an actual stop.
    if (!container.canRemove() || !host.settled(input.ref.session))
      return { kind: 'unknown', source: input.source, executionGeneration: null, sourceVersion }
    return {
      kind: 'stopped',
      source: input.source,
      executionGeneration: view.executionGeneration,
      sourceVersion,
      target: null,
      unknownBatches: [],
    }
  }
  const cold = host.coldRecovered(input.ref)
  if (cold !== undefined && host.settled(input.ref.session))
    return {
      kind: 'stopped',
      source: input.source,
      executionGeneration: null,
      sourceVersion,
      target: cold.target,
      unknownBatches: [],
    }
  return { kind: 'unknown', source: input.source, executionGeneration: null, sourceVersion }
}

/** Presence is read from the demo's real execution registry; an empty Map never means stopped. */
export function createDemoCallPresence(host: DemoCallPresenceHost): CallPresence {
  return {
    async read(input, observed) {
      const fact = presenceFact(host, input)
      if (fact === undefined) return { unavailable: true }
      return { read: await observed(fact) }
    },
  }
}

export type DemoAccessAuthorization =
  | { readonly binding: SettlementLogBinding }
  | { readonly denied: true }
  | { readonly unavailable: true }

export interface DemoCallAccessHost {
  /**
   * Re-verifies the login state, effective membership and Session-to-tenant holding that this
   * application captured at its authenticated entry, then yields the borrowed log binding.
   */
  readonly authorize: (session: SessionRef) => Promise<DemoAccessAuthorization>
  readonly facts: CallFacts
  /** Aborted when the application withdraws access; never a cached grant. */
  readonly revoked: AbortSignal
  readonly diagnostic: (outcome: 'allowed' | 'denied' | 'unavailable') => void
}

async function sourceOf(
  facts: CallFacts,
  binding: SettlementLogBinding,
  ref: CallKey,
  origin: CallOrigin | undefined,
): Promise<CallSource | undefined> {
  const found = await facts.lookup({ binding, ref })
  if ('view' in found) {
    const actual = found.view.origin
    // The caller cannot substitute the original association; it is only checked, never trusted.
    if (
      origin !== undefined &&
      (origin.session !== actual.session ||
        !tenantIdEquals(origin.tenant, actual.tenant) ||
        origin.run !== actual.run)
    )
      return undefined
    return found.view.source
  }
  if (!('callNotFound' in found)) return undefined
  // Absence inside an authorized Session is still answered from the authoritative log tail.
  const key = encodeModelLogKey({ kind: 'call', call: ref.callId })
  if (!('ok' in key)) return undefined
  try {
    const read = await binding.log.readByKey(binding.session, key.ok)
    return 'tail' in read ? { generation: binding.generation, progress: read.tail } : undefined
  } catch {
    return undefined
  }
}

/** Access is a fresh, awaited decision for every read, wait, settle and cancel. */
export function createDemoCallAccess(host: DemoCallAccessHost): CallAccess {
  return {
    async check(input, admitted) {
      if (host.revoked.aborted || input.binding.session !== input.ref.session) {
        host.diagnostic('unavailable')
        return { unavailable: true }
      }
      const authorized = await host.authorize(input.ref.session)
      if (!('binding' in authorized)) {
        host.diagnostic('denied' in authorized ? 'denied' : 'unavailable')
        return { unavailable: true }
      }
      const binding = authorized.binding
      if (
        binding !== input.binding ||
        binding.currentGeneration() !== binding.generation ||
        host.revoked.aborted
      ) {
        host.diagnostic('unavailable')
        return { unavailable: true }
      }
      const source = await sourceOf(host.facts, binding, input.ref, input.origin)
      if (source === undefined || source.generation !== binding.generation) {
        host.diagnostic('unavailable')
        return { unavailable: true }
      }
      const evidence: CallAccessEvidence = Object.freeze({
        action: input.action,
        ref: input.ref,
        source,
        sourceVersion: DEMO_REFERENCE_SOURCE_VERSION,
        revoked: host.revoked,
      })
      host.diagnostic('allowed')
      return { allowed: await admitted(evidence), evidence }
    },
  }
}
