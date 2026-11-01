import type { TenantId } from '@omne-harness/legal-identity'
import type {
  AuthorityDecision,
  HolderDecision,
  RuntimeContextAuthority,
  RuntimeContextTrust,
  ScopeBindingSource,
} from '../index.js'

/**
 * The four sources a trusted assembly can invalidate. Each control makes every earlier answer that
 * depended on its source stale at once; no later answer revives an earlier one.
 */
export type RuntimeContextTrustControls = Readonly<{
  /** The identity and purpose authorization of the caller is revoked. */
  revokeAuthorization(): void
  /** The original work or progression eligibility is revoked. */
  revokeWork(): void
  /** A Request Context source registration generation is replaced. */
  advanceRequestGeneration(): void
  /** The bridge itself is unloaded or replaced. */
  advanceBridgeGeneration(): void
}>

/**
 * What the trust conformance suite needs from an implementation. The suite owns the original ports
 * and hands them to `create`; the returned trust must use exactly those ports.
 */
export interface RuntimeContextTrustFixture<P = unknown> {
  create(
    input: Readonly<{ authority: RuntimeContextAuthority<P>; bindings: ScopeBindingSource }>,
  ): Readonly<{ trust: RuntimeContextTrust<P>; controls: RuntimeContextTrustControls }>
  tenant: TenantId
  otherTenant: TenantId
  principal: P
}

/** The three faces of the authority port. */
export type RuntimeContextTrustFace = 'holder' | 'producer' | 'reader'

/**
 * Which sources the answer of each face depends on. A control makes stale exactly the earlier
 * answers of the faces listed for its source; the answers of every other face stay current.
 * Authorization and the bridge reach every face. The work eligibility reaches the holder and the
 * reader. A Request Context source registration reaches the producer and the reader.
 */
export const RUNTIME_CONTEXT_TRUST_DEPENDENCIES = {
  revokeAuthorization: ['holder', 'producer', 'reader'],
  revokeWork: ['holder', 'reader'],
  advanceRequestGeneration: ['producer', 'reader'],
  advanceBridgeGeneration: ['holder', 'producer', 'reader'],
} as const satisfies Record<keyof RuntimeContextTrustControls, readonly RuntimeContextTrustFace[]>

/** The fixed double of the bridge. It keeps monotonic in-process generations and nothing durable. */
export type TestRuntimeContextTrust<P> = Readonly<{
  trust: RuntimeContextTrust<P>
  controls: RuntimeContextTrustControls
  durability: 'none'
}>

/**
 * A test double of the current bridge for the two original ports. For every call it captures the
 * generations its face depends on (`RUNTIME_CONTEXT_TRUST_DEPENDENCIES`) before the first await,
 * asks the original port, and keeps the original answer's branch. An authorized answer stays
 * current only while the original `current()` and all those captured generations hold. Bindings pass through unchanged. Not for production: nothing here is
 * durable, and the generations are not shared with any real revocation writer.
 */
export function createTestRuntimeContextTrust<P>(
  input: RuntimeContextTrust<P>,
): TestRuntimeContextTrust<P> {
  const generation = { authorization: 0, work: 0, request: 0, bridge: 0 }
  const sources = {
    authorization: 'revokeAuthorization',
    work: 'revokeWork',
    request: 'advanceRequestGeneration',
    bridge: 'advanceBridgeGeneration',
  } as const
  function capture(face: RuntimeContextTrustFace): () => boolean {
    const seen = { ...generation }
    const watched = (Object.keys(sources) as (keyof typeof sources)[]).filter(source =>
      (RUNTIME_CONTEXT_TRUST_DEPENDENCIES[sources[source]] as readonly string[]).includes(face),
    )
    return () => watched.every(source => seen[source] === generation[source])
  }
  function bridged<D extends AuthorityDecision<P> | HolderDecision<P>>(
    decision: D,
    live: () => boolean,
  ): D {
    if (decision.kind !== 'authorized') return decision
    const original = decision.current
    return { ...decision, current: () => original() && live() }
  }
  const { authority } = input
  return {
    trust: {
      authority: {
        async holder(principal, action) {
          const live = capture('holder')
          return bridged(await authority.holder(principal, action), live)
        },
        async producer(principal, action) {
          const live = capture('producer')
          return bridged(await authority.producer(principal, action), live)
        },
        async reader(principal, eligibility) {
          const live = capture('reader')
          return bridged(await authority.reader(principal, eligibility), live)
        },
      },
      bindings: input.bindings,
    },
    controls: {
      revokeAuthorization: () => void generation.authorization++,
      revokeWork: () => void generation.work++,
      advanceRequestGeneration: () => void generation.request++,
      advanceBridgeGeneration: () => void generation.bridge++,
    },
    durability: 'none',
  }
}
