import type { TenantId } from '@omne-harness/legal-identity'
import type { CommitRef, ContextBlockKey, ScopeRef } from '@omne-harness/runtime-context-contract'
import type { SessionId } from '@omne-harness/session-contract'

export type StepCommittedBlocks =
  | Readonly<{ kind: 'known'; keys: readonly ContextBlockKey[] }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'unknown' }>

export interface SessionReplayFacts {
  stepCommittedBlocks(scope: ScopeRef, through: CommitRef | null): Promise<StepCommittedBlocks>
}

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
