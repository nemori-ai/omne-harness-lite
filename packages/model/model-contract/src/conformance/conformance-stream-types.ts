import type { Access } from '@omne-harness/legal-identity'
import type { StreamRef } from '@omne-harness/stream-arrival'
import type {
  ModelStreamObservation,
  ModelStreamReferences,
  ModelStreamSelection,
} from '../model-stream.ts'
import type { ModelStreamSnapshot } from '../model-stream-values.ts'
import type { ModelInvocationRef } from '../reference.ts'

export type ModelStreamConformanceControls<P> = Readonly<{
  confirm(selection: ModelStreamSelection): void | Promise<void>
  withdrawTarget(): void | Promise<void>
  publish(snapshot: ModelStreamSnapshot): void | Promise<void>
  advance(snapshot: ModelStreamSnapshot): void | Promise<void>
  retire(ref: StreamRef): void | Promise<void>
  closeSource(ref: StreamRef): void | Promise<void>
  setAccess(access: Access<P>, decision: 'allow' | 'deny' | 'unavailable'): void | Promise<void>
  setSource(state: 'available' | 'unavailable'): void | Promise<void>
  holdCurrent(): Readonly<{ reached: Promise<void>; release(): void }>
  overflow(): void | Promise<void>
  commitOnObserve(snapshot: ModelStreamSnapshot): void | Promise<void>
}>

export type ModelStreamConformanceSubject<P> = Readonly<{
  references: ModelStreamReferences<P>
  observation: ModelStreamObservation<P>
  access: Access<P>
  otherAccess: Access<P>
  reference: ModelInvocationRef
  wrongAdmission: ModelInvocationRef
  unknownReference: ModelInvocationRef
  wrongProducer: StreamRef
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
  dispose(): void | Promise<void>
}>

export type ModelStreamConformanceInput<P> = Readonly<{
  subject(): ModelStreamConformanceSubject<P> | Promise<ModelStreamConformanceSubject<P>>
  waitMs: number
}>

export type ModelStreamConformanceResult = Readonly<{
  obligation: string
  status: 'pass' | 'fail'
  detail: string
}>

export type ModelStreamConformanceReport = Readonly<{
  ok: boolean
  results: readonly ModelStreamConformanceResult[]
}>
