import type { TenantId } from '@omne-harness/legal-identity'
import type { AttemptId, DurableEvidence, InputId, RunId, SessionId } from './identity.ts'
import type { InputBatch } from './values.ts'
import type { SessionLogConsequence } from './projection.ts'

/** A provider-authenticated common-log root, distinct from every domain revision. */
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
export type SessionFactBoundary = Readonly<{
  sequence: string
  source: DurableEvidence
  kinds: readonly SessionLogConsequence['kind'][]
}>
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
export type SessionHistoryReads = Readonly<{
  root: SessionLogRoot
  scope: SessionInputScope
  admissions: readonly InputAdmissionPage[]
  prefixes: readonly SessionExecutionPrefix[]
  attempts: readonly SessionAttemptRecord[]
  taken: readonly SessionTakenRecord[]
}>
