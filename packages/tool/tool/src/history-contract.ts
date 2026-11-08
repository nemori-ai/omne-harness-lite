import type {
  Adoption,
  Attachment,
  DurableEvidence,
  RawOutput,
  Reply,
  ToolCallId,
  ToolOperationId,
  ToolResultVersion,
  ToolRevision,
  ToolBodyId,
} from '@omne-harness/tool-contract'
import type {
  CallAccess,
  Mutation,
  ToolContentReader,
  ToolMaterialFingerprint,
  ToolMaterialInstant,
} from '@omne-harness/tool-contract/provider'
import type { BodyPolicy } from './result-offloading.ts'
export interface ToolHistoryAuthority<P> {
  qualify(input: CallAccess<P>): Reply<void>
}
export type HistoricalTextInterpretation = Readonly<{
  tool: Adoption
  rawCodec: RawOutput['codec']
  source: Attachment
  interpretation: Adoption
  representation: Readonly<{ kind: 'text'; codec: Adoption }>
  basis: DurableEvidence
}>
export type HistoricalSourceFingerprint = Readonly<{
  format: 'tool-ledger-pre-w3'
  tenant: CallAccess<unknown>['tenant']
  call: ToolCallId
  revision: ToolRevision
  keys: readonly string[]
  value: ToolMaterialFingerprint
}>
export type HistoricalQuarantineReason =
  | 'ownership'
  | 'encoding'
  | 'in-flight'
  | 'pending-handoff'
  | 'unsupported-format'
export type HistoricalPreview =
  | Readonly<{ kind: 'current' }>
  | Readonly<{ kind: 'quarantined'; reason: HistoricalQuarantineReason }>
  | Readonly<{
      kind: 'ready'
      source: HistoricalSourceFingerprint
      results: readonly Readonly<{
        result: ToolResultVersion
        body: 'none' | 'finite-text'
        retainedCopies: number
        releasedCopies: number
      }>[]
    }>
export type HistoricalMigrationProgress = Readonly<{
  operation: ToolOperationId
  source: HistoricalSourceFingerprint
}> &
  (
    | Readonly<{ kind: 'preparing' | 'abandoning' }>
    | Readonly<{ kind: 'abandoned'; receipt: DurableEvidence }>
    | Readonly<{
        kind: 'published' | 'cleaned'
        receipt: DurableEvidence
        activatedAt: ToolMaterialInstant
      }>
  )
export interface ToolHistoryMigration<P> {
  preview(
    input: CallAccess<P> &
      Readonly<{
        interpretations: readonly HistoricalTextInterpretation[]
      }>,
  ): Reply<HistoricalPreview>
  apply(
    input: Mutation<P> &
      Readonly<{
        source: HistoricalSourceFingerprint
        interpretations: readonly HistoricalTextInterpretation[]
      }>,
  ): Reply<HistoricalMigrationProgress>
  inspect(input: Mutation<P>): Reply<HistoricalMigrationProgress>
  abandon(input: Mutation<P>): Reply<HistoricalMigrationProgress>
}

// The provider proves ownership using its manifest, not the external Attachment address.
export type HistoricalOwnedCopy = Readonly<{
  tenant: CallAccess<unknown>['tenant']
  call: ToolCallId
  operation: ToolOperationId
  kind: 'raw' | 'retain'
  inputDigest: string
  bytes: string
  chunks: string
  sha256: string
  seal: string
  answer: ToolMaterialFingerprint
  source: Attachment | null
  custody: DurableEvidence
}>
export interface ToolHistoryCopies<P> {
  inventory(input: CallAccess<P>): Reply<
    Readonly<{
      copies: readonly HistoricalOwnedCopy[]
      unsealed: readonly ToolOperationId[]
    }>
  >
  cleanup(
    input: Mutation<P> &
      Readonly<{
        copy: HistoricalOwnedCopy
        publication: DurableEvidence
        expected: ToolRevision
      }>,
  ): Reply<Readonly<{ kind: 'pending' }> | Readonly<{ kind: 'deleted'; receipt: DurableEvidence }>>
}
export type HistoricalSourceReader<P> = Pick<ToolContentReader<P>, 'read'>

export type HistoricalBodyAlias = Readonly<{
  tenant: CallAccess<unknown>['tenant']
  call: ToolCallId
  result: ToolResultVersion
  bodyId: ToolBodyId
  source: Attachment
  migration: ToolOperationId
  basis: DurableEvidence
}>
export type HistoryMigrationRecord = Readonly<{
  operation: ToolOperationId
  source: HistoricalSourceFingerprint
  input: ToolMaterialFingerprint
  interpretations: readonly HistoricalTextInterpretation[]
  policies: readonly Readonly<{ result: ToolResultVersion; policy: BodyPolicy }>[]
  cleanup: readonly HistoricalOwnedCopy[]
  progress: HistoricalMigrationProgress
}>
