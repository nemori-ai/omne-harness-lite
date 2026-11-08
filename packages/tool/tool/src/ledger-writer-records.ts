import type { DurableEvidence, ToolOperationId, ToolStartRecord } from '@omne-harness/tool-contract'
import type {
  ToolBodyFrame,
  ToolBodyWriterStatus,
  ToolMaterialSeal,
} from '@omne-harness/tool-contract/provider'
import type { BodyPolicy } from './result-offloading.ts'

export type WriterScopeRecord = Readonly<{
  start: ToolStartRecord
  bufferBytes: number
  bufferItems: number
  maxMetadataBytes: number
  metadataBytes: number
  stagedBytes: number
  stagedItems: number
  state:
    | Readonly<{ kind: 'open' }>
    | Readonly<{
        kind: 'closed'
        operation: ToolOperationId
        exit: 'returned' | 'failed'
        source: DurableEvidence
        custody: DurableEvidence
      }>
}>

export type WriterRecord = Readonly<{
  id: string
  key: string
  start: ToolStartRecord
  operation: ToolOperationId
  source: DurableEvidence
  inputDigest: string
  custody: DurableEvidence
  policy: BodyPolicy
  nextSequence: string
  bodyBytes: number
  metadataBytes: number
  state:
    | Readonly<{ kind: 'open' }>
    | Readonly<{
        kind: 'sealing'
        operation: ToolOperationId
        afterSequence: string
        source: DurableEvidence
      }>
    | Readonly<{
        kind: 'sealed'
        operation: ToolOperationId
        afterSequence: string
        source: DurableEvidence
        body: Extract<ToolBodyWriterStatus, { kind: 'sealed' }>['body']
      }>
    | Extract<ToolBodyWriterStatus, { kind: 'failed' }>
}>

export type WriterAppendRecord = Readonly<{
  id: string
  writer: string
  sequence: string
  operation: ToolOperationId
  source: DurableEvidence
  inputDigest: string
  frame: Omit<Extract<ToolBodyFrame, { kind: 'text' }>, 'text'>
  bodyBytes: number
  metadataBytes: number
  stagedBytes: number
  state:
    | Readonly<{ kind: 'staged'; payload: Extract<ToolBodyFrame, { kind: 'text' }> }>
    | Readonly<{ kind: 'retained'; seal: ToolMaterialSeal; custody: DurableEvidence }>
    | Readonly<{ kind: 'abandoned'; basis: DurableEvidence }>
}>
