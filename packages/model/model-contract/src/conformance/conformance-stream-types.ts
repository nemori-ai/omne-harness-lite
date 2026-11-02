import type { Access } from '@omne-harness/legal-identity'
import type { StreamRef } from '@omne-harness/stream-arrival'
import type {
  ModelStreamObservation,
  ModelStreamReferences,
  ModelStreamSelection,
} from '../model-stream.ts'
import type { ModelStreamSnapshot } from '../model-stream-values.ts'
import type { ModelInvocationRef } from '../reference.ts'

/** Test operations complete only after their effect is visible to the public ports. */
export type ModelStreamConformanceControls<P> = Readonly<{
  /** Atomically confirms state and target for the subject's original invocation. */
  confirm(selection: ModelStreamSelection): void | Promise<void>
  withdrawTarget(): void | Promise<void>
  publish(snapshot: ModelStreamSnapshot): void | Promise<void>
  advance(snapshot: ModelStreamSnapshot): void | Promise<void>
  retire(ref: StreamRef): void | Promise<void>
  closeSource(ref: StreamRef): void | Promise<void>
  setAccess(access: Access<P>, decision: 'allow' | 'deny' | 'unavailable'): void | Promise<void>
  /** Changes availability of the confirmation source read by current. */
  setSource(state: 'available' | 'unavailable'): void | Promise<void>
  /** Holds the next current call after qualification and before its protected output. */
  holdCurrent(): Readonly<{ reached: Promise<void>; release(): void }>
  /** Overflows the initial stream observer's bounded queue without retiring the publication. */
  overflow(): void | Promise<void>
  /**
   * Arms one confirmation at the next snapshot/subscription boundary. An indivisible
   * boundary may serialize it immediately before or after registration. Do not wait for
   * the first frame to be consumed before confirming it.
   */
  commitOnObserve(snapshot: ModelStreamSnapshot): void | Promise<void>
}>

/** Each factory call starts with no accepted invocation and no published streams. */
export type ModelStreamConformanceSubject<P> = Readonly<{
  references: ModelStreamReferences<P>
  observation: ModelStreamObservation<P>
  access: Access<P>
  otherAccess: Access<P>
  reference: ModelInvocationRef
  wrongAdmission: ModelInvocationRef
  unknownReference: ModelInvocationRef
  wrongProducer: StreamRef
  /**
   * All values belong to reference and access. Next and stateOnly each follow initial.
   * StateOnly preserves output cursor and blocks, but advances state revision.
   * Settled retains the initial ref. Successor uses a different ref of the same invocation.
   * Sealed is a valid snapshot. ChangedSealed advances its cursors but changes a sealed block.
   */
  snapshots: Readonly<{
    initial: ModelStreamSnapshot
    next: ModelStreamSnapshot
    stateOnly: ModelStreamSnapshot
    settled: ModelStreamSnapshot
    successor: ModelStreamSnapshot
    sealed: ModelStreamSnapshot
    changedSealed: ModelStreamSnapshot
  }>
  controls: ModelStreamConformanceControls<P>
  /** Releases held calls and every observation, including calls that timed out. */
  dispose(): void | Promise<void>
}>

export type ModelStreamConformanceInput<P> = Readonly<{
  subject(): ModelStreamConformanceSubject<P> | Promise<ModelStreamConformanceSubject<P>>
  /** Positive finite upper bound for factory, each operation, and cleanup, in milliseconds. */
  waitMs: number
}>

export type ModelStreamConformanceResult = Readonly<{
  obligation: string
  status: 'pass' | 'fail'
  /** Fixed safe diagnostic. Subject exceptions and payloads are never included. */
  detail: string
}>

export type ModelStreamConformanceReport = Readonly<{
  ok: boolean
  results: readonly ModelStreamConformanceResult[]
}>
