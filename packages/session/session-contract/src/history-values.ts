import type { TenantId } from '@omne-harness/legal-identity'
import type { AttemptId, DurableEvidence, InputId, RunId, SessionId } from './identity.ts'
import type { InputBatch, ProducerRef } from './values.ts'
import type { ConsumptionId } from './identity.ts'
import type { SessionLogConsequence } from './projection.ts'
import type { SessionControlOrigin } from './control-normalization.ts'

export type SessionLogRoot = Readonly<{
  tenant: TenantId
  session: SessionId
  position: string
  source: DurableEvidence
}>
export type InputAdmissionMember = Readonly<{
  ordinal: string
  run: RunId
  execution: string
  operation: string
  accepted: DurableEvidence
  attempt: AttemptId
}>
export type InputAdmissionBoundary = Readonly<{
  input: InputId
  directory: string
  version: string
  count: string
  members: readonly InputAdmissionMember[]
  source: DurableEvidence
}>
export type SessionFactKind = SessionLogConsequence['kind'] | 'deferred'
export type SessionFactBoundary = Readonly<{
  sequence: string
  source: DurableEvidence
  kinds: readonly SessionFactKind[]
}>
export const isDeferredFact = (kinds: readonly SessionFactKind[]): boolean =>
  kinds.length === 1 && kinds[0] === 'deferred'
export type ExecutionHistoryBoundary = Readonly<{
  run: RunId
  execution: string
  started: DurableEvidence
  revision: string
  executionEvidence: DurableEvidence
  emittedThrough: string
  readThrough: string
  interpreted: DurableEvidence | null
  ended: Readonly<{ sequence: string; source: DurableEvidence }> | null
  facts: readonly SessionFactBoundary[]
}>
export type SessionBatchRecord = Readonly<{
  run: RunId
  execution: string
  sequence: string
  source: DurableEvidence
  batch: InputBatch
}>
export type SessionAttemptRecord = Readonly<{
  run: RunId
  attempt: AttemptId
  execution: string
  ordinal: string
  started: DurableEvidence
  grant?: DurableEvidence
}>
export type SessionTakenRecord = SessionBatchRecord & Readonly<{ commit: DurableEvidence }>
export type SessionHistoryIndex = Readonly<{
  root: SessionLogRoot
  inputs: readonly InputAdmissionBoundary[]
  executions: readonly ExecutionHistoryBoundary[]
  attempts: readonly SessionAttemptRecord[]
  batches: readonly SessionBatchRecord[]
  taken: readonly SessionTakenRecord[]
}>
export type SessionInputScope = Readonly<{
  kind: 'pending' | 'selected'
  inputs: readonly InputId[]
}>
export type SessionInputAdmission = InputAdmissionMember &
  Readonly<{
    runStarted: DurableEvidence
    attemptStarted: DurableEvidence
    attachment: string
    grant: DurableEvidence
  }>
export type InputAdmissionPage = Readonly<{
  input: InputId
  directory: string
  version: string
  offset: string
  next: string | null
  records: readonly SessionInputAdmission[]
}>
export type SessionPrefixFact = Readonly<{
  sequence: string
  source: DurableEvidence
  consequences: readonly SessionLogConsequence[]
}>
export type SessionExecutionPrefix = Readonly<{
  execution: string
  run: RunId
  after: string
  through: string
  facts: readonly SessionPrefixFact[]
}>
// A call that Agent records past the interpreted position register or associate; Session has not read it into its state yet.
export type SessionUninterpretedCall = Readonly<{
  execution: string
  sequence: string
  consumption: ConsumptionId
  producer: ProducerRef | null
}>
export type SessionHistoryReads = Readonly<{
  root: SessionLogRoot
  scope: SessionInputScope
  admissions: readonly InputAdmissionPage[]
  prefixes: readonly SessionExecutionPrefix[]
  attempts: readonly SessionAttemptRecord[]
  taken: readonly SessionTakenRecord[]
  controls?: readonly SessionControlOrigin[]
  uninterpreted: readonly SessionUninterpretedCall[]
}>
