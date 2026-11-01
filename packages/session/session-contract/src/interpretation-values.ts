// The values of the same-log entries interpretation (SPEC「entries 解释的范围证明与提交口」). Only
// the shapes and the commit port signature are here; the pure check and the provider steps are the
// work of the next segment. No Agent, Model or Tool type appears.
import type { DurableEvidence, RunId, SessionAccess, SessionOperationId } from './identity.ts'
import type { ProducerFact } from './faces.ts'

export type SessionEntriesChannel = 'model-received' | 'tool-received'

/** The channel boundary of the same-root `load`: the head revision and the channel entry count. */
export type SessionEntriesBoundary = Readonly<{
  execution: string
  channel: SessionEntriesChannel
  revision: string
  executionEvidence: DurableEvidence
  /** Non-negative decimal. */
  count: string
}>

/** A producer fact that the adapter normalized from one Agent entry, or `observed` for no consequence. */
export type SessionEntriesInterpretation =
  | Extract<ProducerFact, { kind: 'execution' | 'account' }>
  | Readonly<{ kind: 'observed' }>

export type SessionEntriesItem = Readonly<{
  /** The ordinal inside the channel, positive decimal. */
  ordinal: string
  /** The canonical text of the delivery key of the producer. */
  key: string
  fact: DurableEvidence
  /** Non-empty. `observed` appears alone. */
  interpretation: readonly SessionEntriesInterpretation[]
}>

export type SessionEntriesObservation = Omit<SessionAccess<never>, 'principal'> &
  Readonly<{
    run: RunId
    execution: string
    channel: SessionEntriesChannel
    operation: SessionOperationId
    /** The range is (after, through]. `after` equals the saved progress of the channel. */
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
  /** The original receipt evidence of the Session commit that set `through`. */
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
