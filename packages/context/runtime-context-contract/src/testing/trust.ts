import type { TenantId } from '@omne-harness/legal-identity'
import type {
  AuthorityDecision,
  HolderDecision,
  RuntimeContextAuthority,
  RuntimeContextTrust,
  ScopeBindingSource,
} from '../index.js'

export type RuntimeContextTrustControls = Readonly<{
  revokeAuthorization(): void
  revokeWork(): void
  advanceRequestGeneration(): void
  advanceBridgeGeneration(): void
}>

export interface RuntimeContextTrustFixture<P = unknown> {
  create(
    input: Readonly<{ authority: RuntimeContextAuthority<P>; bindings: ScopeBindingSource }>,
  ): Readonly<{ trust: RuntimeContextTrust<P>; controls: RuntimeContextTrustControls }>
  tenant: TenantId
  otherTenant: TenantId
  principal: P
}

export type RuntimeContextTrustFace = 'holder' | 'producer' | 'reader'

export const RUNTIME_CONTEXT_TRUST_DEPENDENCIES = {
  revokeAuthorization: ['holder', 'producer', 'reader'],
  revokeWork: ['holder', 'reader'],
  advanceRequestGeneration: ['producer', 'reader'],
  advanceBridgeGeneration: ['holder', 'producer', 'reader'],
} as const satisfies Record<keyof RuntimeContextTrustControls, readonly RuntimeContextTrustFace[]>

export type TestRuntimeContextTrust<P> = Readonly<{
  trust: RuntimeContextTrust<P>
  controls: RuntimeContextTrustControls
  durability: 'none'
}>

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
