import type { TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef, ContextBlockKey, CommitRef, ProducerRef } from './shared.js'
import type {
  RegistrationChange,
  EligibilityId,
  Eligibility,
  EligibilityMaterial,
} from './registration.js'
import type { CommitInput } from './operations.js'
import type { ReplayRef, ReplayMaterial, ReplayPrevious, AppliedCommit } from './replay.js'

export type ScopeBinding =
  | Readonly<{ kind: 'bound'; tenant: TenantId }>
  | Readonly<{ kind: 'unbound' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'unknown' }>

export interface ScopeBindingSource {
  lookup(scope: ScopeRef): Promise<ScopeBinding>
}

/** `current()` is a required synchronous premise sharing one serial boundary with revocation and the
 * final commit; the answer is valid only within this action, and a stored `true` does not satisfy it. */
export type AuthorityDecision<P> =
  | Readonly<{ kind: 'authorized'; principal: P; current(): boolean }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'unknown' }>

export type OrdinaryHolderAction<P = unknown> =
  | Readonly<{ kind: 'prepare'; change: RegistrationChange }>
  | Readonly<{ kind: 'commit'; input: CommitInput }>
  | Readonly<{ kind: 'issue'; material: EligibilityMaterial<P> }>
  | Readonly<{ kind: 'revoke'; eligibility: EligibilityId }>

export type BeginReplayAction = Readonly<{
  kind: 'begin-replay'
  scope: ScopeRef
  tenant: TenantId
  through: CommitRef | null
  supersedes: ReplayRef | null
  previous: ReplayPrevious
}>

export type FinishReplayAction = Readonly<{
  kind: 'finish-replay'
  scope: ScopeRef
  tenant: TenantId
  replay: ReplayRef
  through: CommitRef | null
  material: ReplayMaterial
  previous: ReplayPrevious
  appliedCommits: readonly AppliedCommit[]
}>

export type HolderAction<P = unknown> =
  | OrdinaryHolderAction<P>
  | BeginReplayAction
  | FinishReplayAction

export type HolderDecision<P> =
  | AuthorityDecision<P>
  | Readonly<{ kind: 'invalid'; reason: 'checkpoint-conflict' | 'replay-incomplete' }>

export type ProducerAction =
  | Readonly<{ kind: 'register'; tenant: TenantId; key: ContextBlockKey; producer: ProducerRef }>
  | Readonly<{
      kind: 'publish' | 'invalidate' | 'supply'
      scope: ScopeRef
      tenant: TenantId
      key: ContextBlockKey
      producer: ProducerRef
    }>
  | Readonly<{
      kind: 'invalidate-tenant'
      tenant: TenantId
      key: ContextBlockKey
      producer: ProducerRef
    }>

export interface RuntimeContextAuthority<P> {
  holder(principal: P, action: HolderAction<P>): Promise<HolderDecision<P>>
  producer(principal: P, action: ProducerAction): Promise<AuthorityDecision<P>>
  reader(principal: P, eligibility: Eligibility<P>): Promise<AuthorityDecision<P>>
}

export type CheckCause = 'authority' | 'scope-binding' | 'replay'
export type CheckUnavailable = Readonly<{ kind: 'unavailable'; cause: CheckCause }>
export type CheckUnknown = Readonly<{ kind: 'unknown'; cause: CheckCause }>
