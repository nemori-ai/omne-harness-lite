import type { DurableEvidence, RunId, SessionRevision } from './identity.ts'
import type { ControlProgress, ProducerRef, RunTerminal } from './values.ts'
import type { SessionOperationId } from './identity.ts'

const EFFORTS = ['low', 'medium', 'high', 'xhigh'] as const

export function validSelectionEffort(effort: unknown): boolean {
  return effort === undefined || EFFORTS.some(value => value === effort)
}

export type SavedModelSelection = Readonly<{
  name: string
  reasoningEffort?: (typeof EFFORTS)[number]
  basis: DurableEvidence
}>
export type SessionModelSelection = Readonly<{
  selection: SavedModelSelection
  revision: SessionRevision
  source: DurableEvidence
}>

export type SessionCallTerminal = Readonly<{
  producer: ProducerRef
  version: string
  outcome: 'completed' | 'failed' | 'interrupted' | 'unavailable' | 'no-response'
  source: DurableEvidence
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

export type SessionCallLookup =
  | Readonly<{
      kind: 'bound'
      producer: ProducerRef
      bound: DurableEvidence
      terminal: SessionCallTerminal | null
    }>
  | Readonly<{ kind: 'absent'; producer: ProducerRef; covered: SessionRevision }>

export type SessionRunLookup =
  | Readonly<{
      kind: 'bound'
      run: RunId
      bound: DurableEvidence
      terminal: RunTerminal | null
    }>
  | Readonly<{ kind: 'absent'; run: RunId; covered: SessionRevision }>
