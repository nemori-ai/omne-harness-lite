// The values of the two named controls (`cancelRun`, `stopCall`), the saved model selection and
// the in-transaction lookups that the controls read (SPEC「XC-MODELSEL」「XC-INTERRUPT」). The
// shapes only: the rules are in `decide-control.ts` and in the SPEC.
import type { DurableEvidence, RunId, SessionRevision } from './identity.ts'
import type { ControlProgress, ProducerRef, RunTerminal } from './values.ts'
import type { SessionOperationId } from './identity.ts'

/** The saved choice of a model route. `basis` is the original adoption evidence, not a call permit. */
export type SavedModelSelection = Readonly<{ name: string; basis: DurableEvidence }>
export type SessionModelSelection = Readonly<{
  selection: SavedModelSelection
  /** The Session revision of this consistent read. It may be later than the commit of the selection. */
  revision: SessionRevision
  /** The commit that saved the current selection: the creation or a `session.model-selected` batch. */
  source: DurableEvidence
}>

/** The narrow projection of the first committed SE19 that ends a call. Cost, output and effects stay with the producer. */
export type SessionCallTerminal = Readonly<{
  producer: ProducerRef
  version: string
  outcome: 'completed' | 'failed' | 'interrupted' | 'unavailable' | 'no-response'
  /** The original source of the owner, taken from the source that the committed SE19 saved. */
  source: DurableEvidence
  /** The original receipt evidence of the Session commit that carries that SE19. */
  recorded: DurableEvidence
}>
export type SessionControlAnswer<T> =
  | Readonly<{ kind: 'requested'; progress: ControlProgress }>
  | Readonly<{ kind: 'ended'; terminal: T }>
  | Readonly<{ kind: 'not-found' }>
export type SessionControlReceipt<T> = Readonly<{
  operation: SessionOperationId
  source: DurableEvidence
  answer: SessionControlAnswer<T>
}>
export type ControlOperationResolution =
  | Readonly<{
      kind: 'committed'
      receipt: SessionControlReceipt<RunTerminal | SessionCallTerminal>
    }>
  | Readonly<{ kind: 'not-committed'; exclusion: DurableEvidence }>
  | Readonly<{ kind: 'attempt-rejected'; original: 'unknown'; reason: string }>
  | Readonly<{ kind: 'unknown' }>

/** Filled by the same-root authoritative read inside the commit transaction (`DecideReads.calls`). */
export type SessionCallLookup =
  | Readonly<{
      kind: 'bound'
      producer: ProducerRef
      /** The original receipt evidence of the Session commit that holds the SE18. */
      bound: DurableEvidence
      /** The first committed SE19 that records the call as ended; null when there is none. */
      terminal: SessionCallTerminal | null
    }>
  | Readonly<{ kind: 'absent'; producer: ProducerRef; covered: SessionRevision }>

/** Filled by the same-root authoritative read inside the commit transaction (`DecideReads.runs`). */
export type SessionRunLookup =
  | Readonly<{
      kind: 'bound'
      run: RunId
      /** The original receipt evidence of the commit that started the Run. */
      bound: DurableEvidence
      /** The only terminal of the Run; null while the Run is active. */
      terminal: RunTerminal | null
    }>
  | Readonly<{ kind: 'absent'; run: RunId; covered: SessionRevision }>
