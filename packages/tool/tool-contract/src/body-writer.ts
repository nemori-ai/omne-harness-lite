import type { ContentReference } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import type { ToolPrimitiveFailure } from './author-context.ts'
import type { CallAccess, DurableEvidence, Mutation, ToolBodyId } from './identity.ts'
import type { ToolStartRecord } from './ports.ts'
import type { ToolBodyRepresentation, ToolFailure } from './results.ts'

/** A body the store sealed and the ledger recorded `sealed`: what a result may reference. */
export type SealedToolBody = Readonly<{
  source: ContentReference
  bodyId: ToolBodyId
  representation: ToolBodyRepresentation
  bodyBytes: string
  custody: DurableEvidence
}>

export type ToolBodyFrame =
  | Readonly<{ kind: 'text'; block: string; text: string; end: boolean }>
  | Readonly<{ kind: 'json-fragment'; text: string }>
  | Readonly<{ kind: 'json-record'; value: JsonValue }>

export type ToolBodyBeginReceipt = Readonly<{
  key: string
  nextSequence: string
  custody: DurableEvidence
}>
export type ToolBodyAppendReceipt = Readonly<{
  nextSequence: string
  custody: DurableEvidence
}>
export type ToolBodyWriterStatus =
  | Readonly<{ kind: 'open'; nextSequence: string; confirmedThrough: string }>
  | Readonly<{ kind: 'sealing'; afterSequence: string }>
  | Readonly<{ kind: 'sealed'; body: SealedToolBody }>
  | Readonly<{ kind: 'failed'; failure: ToolPrimitiveFailure }>

export interface ToolBodyWriter {
  begin(
    key: string,
    representation: ToolBodyRepresentation,
  ): Promise<Outcome<ToolBodyBeginReceipt, ToolPrimitiveFailure>>
  append(
    key: string,
    sequence: string,
    frame: ToolBodyFrame,
  ): Promise<Outcome<ToolBodyAppendReceipt, ToolPrimitiveFailure>>
  seal(key: string, afterSequence: string): Promise<Outcome<SealedToolBody, ToolPrimitiveFailure>>
  inspect(key: string): Promise<Outcome<ToolBodyWriterStatus, ToolPrimitiveFailure>>
}

export type ToolBodyWriteFailure = ToolPrimitiveFailure | Extract<ToolFailure, { kind: 'denied' }>
export type ToolBodyWriteReply<T> = Promise<Outcome<T, ToolBodyWriteFailure>>
export type ToolBodyWriteInput<P> = Mutation<P> &
  Readonly<{
    start: ToolStartRecord
    source: DurableEvidence
  }>
export interface ToolBodyWrites<P> {
  begin(
    input: ToolBodyWriteInput<P> &
      Readonly<{ key: string; representation: ToolBodyRepresentation }>,
  ): ToolBodyWriteReply<ToolBodyBeginReceipt>
  append(
    input: ToolBodyWriteInput<P> &
      Readonly<{ key: string; sequence: string; frame: ToolBodyFrame }>,
  ): ToolBodyWriteReply<ToolBodyAppendReceipt>
  seal(
    input: ToolBodyWriteInput<P> & Readonly<{ key: string; afterSequence: string }>,
  ): ToolBodyWriteReply<SealedToolBody>
  inspect(
    input: CallAccess<P> & Readonly<{ start: ToolStartRecord; key: string }>,
  ): ToolBodyWriteReply<ToolBodyWriterStatus>
}
