import type { TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef, ContextBlockKey, CommitRef, ProducerRef } from './shared.js'
import type { RegistrationChange, EligibilityId, Eligibility, EligibilityMaterial } from './registration.js'
import type { CommitInput } from './operations.js'
import type { ReplayRef, ReplayMaterial, ReplayPrevious, AppliedCommit } from './replay.js'

/** What the trusted binding source knows about one scope. A scope never changes tenant. */
export type ScopeBinding =
  | Readonly<{ kind: 'bound'; tenant: TenantId }>
  | Readonly<{ kind: 'unbound' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'unknown' }>

/** Needed port: the trusted source of scope-to-tenant bindings. A rebuilt source keeps the original binding. */
export interface ScopeBindingSource {
  lookup(scope: ScopeRef): Promise<ScopeBinding>
}

/**
 * The answer of an authority port for one action. `current()` is a REQUIRED synchronous premise:
 * the adapter shares one serial boundary with revocation and the caller's final commit, and the
 * answer is valid only within this action. A stored `true` does not satisfy it.
 */
export type AuthorityDecision<P> =
  | Readonly<{ kind: 'authorized'; principal: P; current(): boolean }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'unknown' }>

/** Ordinary holder actions. Every target is the operation's own captured input. */
export type OrdinaryHolderAction<P = unknown> =
  | Readonly<{ kind: 'prepare'; change: RegistrationChange }>
  | Readonly<{ kind: 'commit'; input: CommitInput }>
  | Readonly<{ kind: 'issue'; material: EligibilityMaterial<P> }>
  | Readonly<{ kind: 'revoke'; eligibility: EligibilityId }>

/** The holder confirms `through` does not go back and the supersession holds (RC-09). */
export type BeginReplayAction = Readonly<{
  kind: 'begin-replay'
  scope: ScopeRef
  tenant: TenantId
  through: CommitRef | null
  supersedes: ReplayRef | null
  previous: ReplayPrevious
}>

/** The holder confirms the material covers `through` and every fact this instance already knows (RC-09). */
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

export type HolderAction<P = unknown> = OrdinaryHolderAction<P> | BeginReplayAction | FinishReplayAction

/**
 * `invalid` is valid only for the two replay actions, after the target authorization is confirmed.
 * Returned for an ordinary action it is a protocol violation and reads as `unknown`.
 */
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

/** Needed port: decides holder, producer and reader actions. It issues no identity. */
export interface RuntimeContextAuthority<P> {
  holder(principal: P, action: HolderAction<P>): Promise<HolderDecision<P>>
  producer(principal: P, action: ProducerAction): Promise<AuthorityDecision<P>>
  reader(principal: P, eligibility: Eligibility<P>): Promise<AuthorityDecision<P>>
}

/** Which check could not give a result. */
export type CheckCause = 'authority' | 'scope-binding' | 'replay'
/** The check could not give success this time; nothing was installed. */
export type CheckUnavailable = Readonly<{ kind: 'unavailable'; cause: CheckCause }>
/** The check result is unknown; nothing was installed. */
export type CheckUnknown = Readonly<{ kind: 'unknown'; cause: CheckCause }>
