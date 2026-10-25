// Branded Session identities, the access inputs and the three exchange values. `Access<P>` has one
// definition in legal-identity (J51); Session's access adds the session and is named
// `SessionAccess`. `Adoption`, `DurableEvidence` and `ConsumerRef` have one definition in
// exchange-refs and are re-exported as they are.
import type { Access } from '@omne-harness/legal-identity'

export type { Adoption, ConsumerRef, DurableEvidence } from '@omne-harness/exchange-refs'

declare const sessionIdentity: unique symbol
export type SessionIdentity<K extends string> = string & { readonly [sessionIdentity]: K }
export type SessionId = SessionIdentity<'SessionId'>
export type RunId = SessionIdentity<'RunId'>
/** Deterministic encoding of (run, ordinal). Derived from the log, never stored on its own. */
export type AttemptId = SessionIdentity<'AttemptId'>
export type InputId = SessionIdentity<'SessionInputId'>
/** Encoded Agent input-batch identity. */
export type BatchId = SessionIdentity<'SessionBatchId'>
export type SessionOperationId = SessionIdentity<'SessionOperationId'>
export type SessionRevision = SessionIdentity<'SessionRevision'>
/** Encoded Agent consumption identity. */
export type ConsumptionId = SessionIdentity<'SessionConsumptionId'>
/** Crosses the boundary encoded as the message package's RecordEntryRef. */
export type EntryId = SessionIdentity<'SessionEntryId'>
/** Registration key of one resident-tool contribution, minted by Tool. Only session-adapters parses it. */
export type ResidentKey = SessionIdentity<'ResidentKey'>

export type AgentInstanceRef = Readonly<{ owner: 'agent'; id: string }>
export type SessionCallerClass = 'intake' | 'coordinator' | 'maintainer' | 'reader'

/** The access of one caller to one session: the principal, the tenant that decides, and the session. */
export type SessionAccess<P> = Access<P> & Readonly<{ session: SessionId }>
export type Mutation<P> = SessionAccess<P> & Readonly<{ operation: SessionOperationId }>
export type AdvanceRef = Readonly<{ run: RunId; attempt: AttemptId; instance: AgentInstanceRef }>
