import type { ContentReference, MediaFacts } from '@omne-harness/content-block'
import type { ConsumerRef } from '@omne-harness/exchange-refs'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'

export type { ContentReference, MediaFacts }

/** A medium being deleted is the same as none: it has no state to show. */
export type MediaState = 'uploading' | 'staged' | 'held'
export type RowState = MediaState | 'deleting'
export type Holder = ConsumerRef
export type Instant = string

export type Modality = 'image' | 'voice' | 'file'

export type UploadTicket = Readonly<{ upload: string; nextSequence: number; partBytes: number }>
export type Committed = Readonly<{ ref: ContentReference; facts: MediaFacts }>
export type UploadStatus =
  | Readonly<{ kind: 'uploading'; ticket: UploadTicket }>
  | Readonly<{ kind: 'committed'; committed: Committed }>

export type VariantTarget = Readonly<{
  mediaTypes: readonly string[]
  maxBytes: number
  maxWidth: number
  maxHeight: number
}>

export type MediaUnavailable = Readonly<{ kind: 'unavailable'; dependency: string }>
export type MediaUnknown = Readonly<{ kind: 'outcome-unknown' }>
export type MediaReply<T, F = never> = Promise<Outcome<T, F | MediaUnavailable | MediaUnknown>>
export type MediaRead<T, F = never> = Promise<Outcome<T, F | MediaUnavailable>>

/** Another tenant's medium, a medium being deleted and no medium answer the same. */
export type InvalidReference = Readonly<{ kind: 'invalid-reference' }>
export type MaterialUnavailable = Readonly<{ kind: 'material-unavailable' }>
export type UploadNotFound = Readonly<{ kind: 'not-found' }>

export type BeginFailure =
  | Readonly<{ kind: 'too-large'; limit: number }>
  | Readonly<{ kind: 'unsupported-type' }>
  | Readonly<{ kind: 'invalid'; field: 'upload' | 'bytes' }>
export type AppendFailure =
  | UploadNotFound
  | Readonly<{ kind: 'committed' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'gap'; nextSequence: number }>
  | Readonly<{ kind: 'beyond-declared' }>
  | Readonly<{ kind: 'part-too-large'; limit: number }>
export type CommitFailure =
  | UploadNotFound
  | Readonly<{ kind: 'incomplete'; nextSequence: number }>
  | Readonly<{ kind: 'digest-mismatch' }>
  | Readonly<{ kind: 'type-mismatch' }>
  | Readonly<{ kind: 'over-budget' }>
export type AbandonFailure = Readonly<{ kind: 'committed' }>
export type PutFailure =
  | Readonly<{ kind: 'too-large'; limit: number }>
  | Readonly<{ kind: 'unsupported-type' }>
  | Readonly<{ kind: 'type-mismatch' }>
  | Readonly<{ kind: 'over-budget' }>
export type VariantFailure =
  | InvalidReference
  | MaterialUnavailable
  | Readonly<{ kind: 'too-large' }>

export type Opened = Readonly<{
  mediaType: string
  bytes: Uint8Array
  facts: MediaFacts
}>

export interface Uploads {
  begin(input: {
    tenant: TenantId
    upload: string
    mediaType: string
    bytes: number
  }): MediaReply<UploadStatus, BeginFailure>
  append(input: {
    tenant: TenantId
    upload: string
    sequence: number
    part: Uint8Array
  }): MediaReply<Readonly<{ nextSequence: number }>, AppendFailure>
  commit(input: {
    tenant: TenantId
    upload: string
    digest: string
  }): MediaReply<Committed, CommitFailure>
  status(input: { tenant: TenantId; upload: string }): MediaRead<UploadStatus, UploadNotFound>
  abandon(input: { tenant: TenantId; upload: string }): MediaReply<null, AbandonFailure>
}

export interface Custody {
  /** A referrer inside the server stores a product and holds it in one step. */
  put(input: {
    tenant: TenantId
    mediaType: string
    bytes: AsyncIterable<Uint8Array>
    holder: Holder
  }): MediaReply<Committed, PutFailure>
  hold(input: {
    tenant: TenantId
    ref: ContentReference
    holder: Holder
  }): MediaReply<Readonly<{ facts: MediaFacts }>, InvalidReference>
  describe(input: {
    tenant: TenantId
    ref: ContentReference
  }): MediaRead<Readonly<{ state: 'staged' | 'held'; facts: MediaFacts }>, InvalidReference>
  /** Maintenance, for every tenant: expired media first, then what a crash left. */
  sweep(input: { limit: number }): MediaReply<Readonly<{ removed: number; more: boolean }>>
}

export interface Variants {
  /** The original when `target` is null, else a version within the limits of the target. */
  open(input: {
    tenant: TenantId
    ref: ContentReference
    target: VariantTarget | null
  }): MediaRead<Opened, VariantFailure>
}

export interface Reads {
  page(input: {
    tenant: TenantId
    ref: ContentReference
    offset: number
    limit: number
  }): MediaRead<
    Readonly<{ part: Uint8Array; next: number | null }>,
    InvalidReference | MaterialUnavailable
  >
}

export interface Media {
  readonly uploads: Uploads
  readonly custody: Custody
  readonly variants: Variants
  readonly reads: Reads
}
