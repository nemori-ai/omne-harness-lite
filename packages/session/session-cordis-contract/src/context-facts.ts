// The pure types of the two facts that the Session context holder (AD-03) gives to the trusted
// Runtime Context entry: what its own durable facts say about the checkpointed blocks of a scope
// (replay facts), and which session a scope belongs to (scope lookup). Types only: the services
// that carry them are in `./cordis.ts`, and this file imports no Cordis and no adapter.
import type { TenantId } from '@omne-harness/legal-identity'
import type { CommitRef, ContextBlockKey, ScopeRef } from '@omne-harness/runtime-context-contract'
import type { SessionId } from '@omne-harness/session-contract'

/** What the holder's own durable facts say about the checkpointed blocks of one scope. */
export type StepCommittedBlocks =
  | Readonly<{ kind: 'known'; keys: readonly ContextBlockKey[] }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'unknown' }>

/**
 * The holder's facts read from the session log. Only a recovery that finishes asks them.
 * `stepCommittedBlocks` answers the keys of the checkpointed blocks of the scope's final
 * registration that have at least one step commit up to `through`. A block that is registered but
 * has no step commit is not listed: it has no value to restore.
 */
export interface SessionReplayFacts {
  stepCommittedBlocks(scope: ScopeRef, through: CommitRef | null): Promise<StepCommittedBlocks>
}

/**
 * The session that a scope belongs to. The scope text is a one-way digest, so the holder, which
 * minted it, keeps the index. `unknown` is a scope that the holder never minted; `unavailable` is
 * a lookup that could not be answered. Neither is a `known` answer, and no caller reads a missing
 * lookup as a grant.
 */
export type SessionScopeLookupAnswer =
  | Readonly<{
      kind: 'known'
      tenant: TenantId
      session: SessionId
      generation: string
    }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'unavailable' }>

export interface SessionScopeLookup {
  lookup(scope: ScopeRef): Promise<SessionScopeLookupAnswer>
}
