import type { DurableEvidence, RunId, SessionAccess, SessionOperationId } from './identity.ts'
import type { Message } from '@omne-harness/message'
import type { ProducerFact } from './faces.ts'
import type { ProducerRef } from './values.ts'
import type { BackgroundCallLabel, BackgroundCallSource } from './background-calls.ts'
import type { SessionLogObservation } from './projection.ts'

export type SessionEntriesChannel = 'model-received' | 'tool-received'

export type SessionEntriesBoundary = Readonly<{
  execution: string
  channel: SessionEntriesChannel
  revision: string
  executionEvidence: DurableEvidence
  count: string
}>

export type SessionEntriesInterpretation =
  | Extract<ProducerFact, { kind: 'execution' | 'account' }>
  | Readonly<{
      kind: 'backgrounded'
      producer: ProducerRef
      source: DurableEvidence
      label: BackgroundCallLabel
      how: BackgroundCallSource
    }>
  | Readonly<{
      kind: 'background-outcome'
      producer: ProducerRef
      result: string
      reminder: Message
      source: DurableEvidence
    }>
  | Readonly<{ kind: 'observed' }>

export type SessionEntriesItem = Readonly<{
  ordinal: string
  key: string
  fact: DurableEvidence
  interpretation: readonly SessionEntriesInterpretation[]
}>

export type SessionEntriesObservation = Omit<SessionAccess<never>, 'principal'> &
  Readonly<{
    run: RunId
    execution: string
    channel: SessionEntriesChannel
    operation: SessionOperationId
    after: string
    through: string
    boundary: SessionEntriesBoundary
    items: readonly SessionEntriesItem[]
  }>

export type SessionEntriesProgress = Readonly<{
  run: RunId
  execution: string
  channel: SessionEntriesChannel
  through: string
  interpreted: DurableEvidence
}>

export type SessionEntriesStart =
  | Readonly<{ kind: 'initial' }>
  | Readonly<{ kind: 'saved'; progress: SessionEntriesProgress }>

export type SessionEntriesReceipt = Readonly<{
  operation: SessionOperationId
  through: string
  interpreted: DurableEvidence
}>

export type SessionLogCommitObservation = SessionLogObservation &
  Readonly<{
    operation: SessionOperationId
    executionEvidence: DurableEvidence
  }>

export type SessionLogReceipt = Readonly<{
  operation: SessionOperationId
  execution: string
  readThrough: string
  interpreted: DurableEvidence
  recovered: boolean
}>
