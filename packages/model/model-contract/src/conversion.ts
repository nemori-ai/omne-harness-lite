// Declarations of the public-api chapter "消息转换".
import type { Outcome } from '@omne-harness/operation-result'
import type { ContentBlock } from '@omne-harness/content-block'
import type { Access } from './root.ts'
import type { DurableEvidence, ModelFailure, Reply } from './result.ts'
import type { ModelModality } from './profile.ts'
import type { Adoption } from './root.ts'

export type ConverterKey =
  | Readonly<{ kind: 'media-type'; mediaType: string }>
  | Readonly<{ kind: 'modality'; modality: ModelModality }>
export type ConvertedContent = Readonly<{
  original: ContentBlock
  derived: readonly [ContentBlock, ...ContentBlock[]]
  transcript: string
  converter: Adoption
}>
export type ConversionResult =
  | Readonly<{
      kind: 'unchanged'
      original: ContentBlock
      reason: 'human-only' | 'text' | 'no-converter'
    }>
  | Readonly<{ kind: 'deferred'; original: ContentBlock; source: DurableEvidence }>
  | Readonly<{ kind: 'converted'; value: ConvertedContent }>
export type ConversionFailure = ModelFailure | Readonly<{ kind: 'cancelled' }>
export type ConversionReply<T> = Promise<Outcome<T, ConversionFailure>>
export interface ModelConverter<P> {
  readonly adoption: Adoption
  convert(
    input: Access<P> &
      Readonly<{
        original: ContentBlock
        source: DurableEvidence
        signal: AbortSignal
      }>,
  ): ConversionReply<ConvertedContent>
}
export type ConverterLookup<P> =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'selected'; converter: ModelConverter<P>; release(): Promise<void> }>
export interface ModelConverterCatalog<P> {
  acquire(
    input: Readonly<{ mediaType: string; modality: ModelModality | null }>,
  ): Reply<ConverterLookup<P>>
}
export interface ModelMessageConversion<P> {
  prepare(
    input: Access<P> &
      Readonly<{
        original: ContentBlock
        source: DurableEvidence
        origin: 'inbound' | 'model-output' | 'tool-output'
        signal: AbortSignal
      }>,
  ): ConversionReply<ConversionResult>
}
