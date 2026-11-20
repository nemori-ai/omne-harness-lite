import type { Outcome } from '@omne-harness/operation-result'
import type { Holder, Instant, MediaFacts, RowState, VariantTarget } from './values.ts'

export type PortFailure =
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
export type PortReply<T, F = never> = Promise<Outcome<T, F | PortFailure>>

/** An object store: one segmented write per key; after `seal` the object is durable and fixed. */
export interface ByteStore {
  readonly name: string
  begin(key: string): PortReply<Readonly<{ write: string }>, Readonly<{ kind: 'invalid-key' }>>
  append(
    write: string,
    sequence: number,
    part: Uint8Array,
  ): PortReply<null, Readonly<{ kind: 'no-write' }>>
  /** Joins segments 0 to `parts - 1`; sealing a sealed write answers the same size. */
  seal(
    write: string,
    parts: number,
  ): PortReply<Readonly<{ bytes: number }>, Readonly<{ kind: 'no-write' } | { kind: 'gap' }>>
  open(
    key: string,
    range?: Readonly<{ offset: number; length: number }>,
  ): PortReply<AsyncIterable<Uint8Array>, Readonly<{ kind: 'not-found' }>>
  remove(key: string): PortReply<null>
  abort(write: string): PortReply<null>
}

export type MediaRow = Readonly<{
  key: string
  tenant: string
  storage: string
  state: RowState
  mediaType: string
  bytes: number
  digest: string | null
  facts: MediaFacts | null
  write: string | null
  nextSequence: number
  received: number
  parts: readonly string[]
  expiresAt: Instant | null
  holders: readonly Holder[]
}>

export type NewRow = Readonly<{
  key: string
  tenant: string
  storage: string
  mediaType: string
  bytes: number
  upload: string | null
  expiresAt: Instant
}>

export type Staging = Readonly<{
  key: string
  tenant: string
  mediaType: string
  bytes: number
  digest: string
  facts: MediaFacts
  expiresAt: Instant
  holder: Holder | null
}>

/** The metadata of media: every operation is one transaction and carries its own condition. */
export interface MediaIndex {
  insertUploading(row: NewRow): PortReply<null, Readonly<{ kind: 'exists'; row: MediaRow }>>
  attachWrite(key: string, write: string): PortReply<null, Readonly<{ kind: 'not-uploading' }>>
  readUpload(tenant: string, upload: string): PortReply<MediaRow, Readonly<{ kind: 'not-found' }>>
  advance(input: {
    key: string
    sequence: number
    digest: string
    bytes: number
  }): PortReply<Readonly<{ nextSequence: number }>, Readonly<{ kind: 'stale' }>>
  /** Stages a row, or merges it into the live row of the same tenant and digest. */
  stageOrMerge(
    staging: Staging,
  ): PortReply<
    Readonly<{ kind: 'staged'; row: MediaRow } | { kind: 'merged'; row: MediaRow }>,
    Readonly<{ kind: 'not-uploading' }>
  >
  holdIfLive(input: {
    key: string
    tenant: string
    holder: Holder
  }): PortReply<MediaRow, Readonly<{ kind: 'not-live' }>>
  readLive(key: string, tenant: string): PortReply<MediaRow, Readonly<{ kind: 'not-found' }>>
  markDeleting(key: string): PortReply<Readonly<{ marked: boolean }>>
  /** Marks deleting the uploading and staged rows whose time is over, in the same write. */
  markDeletingIfExpired(input: { now: Instant; limit: number }): PortReply<readonly MediaRow[]>
  listDeleting(limit: number): PortReply<readonly MediaRow[]>
  dropRow(key: string): PortReply<null>
}

export type Probe = Readonly<{ mediaType: string; widthPixels: number; heightPixels: number }>

export interface ImageCodec {
  probe(
    bytes: Uint8Array,
  ): Promise<Outcome<Probe, Readonly<{ kind: 'not-image' | 'unsupported' | 'over-budget' }>>>
  fit(
    bytes: Uint8Array,
    target: VariantTarget,
  ): Promise<
    Outcome<
      Readonly<{ mediaType: string; bytes: Uint8Array; widthPixels: number; heightPixels: number }>,
      Readonly<{ kind: 'cannot-fit' | 'not-image' }>
    >
  >
}

export interface MediaClock {
  now(): Instant
}
