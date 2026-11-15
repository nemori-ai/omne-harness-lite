import type { Access } from '@omne-harness/legal-identity'

export type { Adoption, ConsumerRef, DurableEvidence } from '@omne-harness/exchange-refs'

declare const sessionIdentity: unique symbol
export type SessionIdentity<K extends string> = string & { readonly [sessionIdentity]: K }
export type SessionId = SessionIdentity<'SessionId'>
export type RunId = SessionIdentity<'RunId'>
export type AttemptId = SessionIdentity<'AttemptId'>
export type InputId = SessionIdentity<'SessionInputId'>
export type BatchId = SessionIdentity<'SessionBatchId'>
export type SessionOperationId = SessionIdentity<'SessionOperationId'>
export type TodoItemId = SessionIdentity<'TodoItemId'>
export type SessionRevision = SessionIdentity<'SessionRevision'>
export type ConsumptionId = SessionIdentity<'SessionConsumptionId'>
export type EntryId = SessionIdentity<'SessionEntryId'>
export type ResidentKey = SessionIdentity<'ResidentKey'>

export type AgentInstanceRef = Readonly<{ owner: 'agent'; id: string }>
export type SessionCallerClass = 'intake' | 'coordinator' | 'maintainer' | 'reader'

export type SessionAccess<P> = Access<P> & Readonly<{ session: SessionId }>
export type Mutation<P> = SessionAccess<P> & Readonly<{ operation: SessionOperationId }>
export type AdvanceRef = Readonly<{ run: RunId; attempt: AttemptId; instance: AgentInstanceRef }>
