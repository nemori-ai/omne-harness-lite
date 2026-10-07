import type { FacilityFailure } from './facilities.ts'
export type FileVersion = string
export interface FileReadRequest {
  readonly path: string
  readonly offsetBytes?: number
  readonly limitBytes?: number
}
export interface FileReadResult {
  readonly kind: 'read'
  readonly path: string
  readonly data: Uint8Array
  readonly offsetBytes: number
  readonly nextOffsetBytes: number
  readonly eof: boolean
  readonly version: FileVersion
}
export interface FileWriteRequest {
  readonly path: string
  readonly data: Uint8Array
  readonly mode: 'create' | 'replace'
  readonly expectedVersion?: FileVersion
}
export interface FileInformation {
  readonly path: string
  readonly type: 'file' | 'directory' | 'symlink'
  readonly sizeBytes: number
  readonly modifiedMs: number
  /** Metadata identity only. This is not an atomic external-write guard. */
  readonly version: FileVersion
}
export interface FileListRequest {
  readonly path: string
  readonly offset?: number
  readonly limit?: number
}
export interface FileSearchRequest {
  readonly path: string
  readonly pattern: string
  readonly match: 'name' | 'content'
  readonly recursive: boolean
  readonly offset?: number
  readonly limit?: number
}
export interface FileSearchHit {
  readonly path: string
  readonly offsetBytes?: number
}
export interface FileTransferRequest {
  readonly source: string
  readonly target: string
  readonly replace: boolean
  readonly expectedVersion?: FileVersion
}
export interface FileRemoveRequest {
  readonly path: string
  readonly recursive: boolean
  readonly expectedVersion?: FileVersion
}
export interface FileMkdirRequest {
  readonly path: string
  readonly parents: boolean
}
export interface FileBatchEntry {
  readonly path: string
  readonly data: Uint8Array
  readonly expectedVersion: FileVersion | null
}
export interface FileBatchReference {
  readonly id: string
  readonly generation: string
}
export type FileBatchResult = {
  readonly batch: FileBatchReference
  /** Acknowledged publication, never proof that external readers saw an atomic batch. */
  readonly published: readonly string[]
} & (
  | { readonly kind: 'committed' }
  | {
      readonly kind: 'unknown'
      readonly reason: 'effectUnknown' | 'conflict' | 'closed' | 'unavailable'
    }
)
export interface FileBatchRecognition {
  readonly kind: 'recognized'
  readonly batch: FileBatchReference
  readonly state: 'complete' | 'partial' | 'interrupted' | 'conflict' | 'pending'
  /** Targets which currently match prepared bytes, distinguished from durable publication receipts. */
  readonly matchingPrepared: readonly string[]
  readonly published: readonly string[]
  readonly conflicting: readonly string[]
}
export interface FileFacility {
  readonly read: (request: FileReadRequest) => Promise<FileReadResult | FacilityFailure>
  readonly write: (
    request: FileWriteRequest,
  ) => Promise<
    | { readonly kind: 'written'; readonly path: string; readonly version: FileVersion }
    | FileBatchResult
    | FacilityFailure
  >
  readonly stat: (
    path: string,
  ) => Promise<{ readonly kind: 'stat'; readonly value: FileInformation } | FacilityFailure>
  readonly list: (request: FileListRequest) => Promise<
    | {
        readonly kind: 'listed'
        readonly values: readonly FileInformation[]
        readonly nextOffset?: number
      }
    | FacilityFailure
  >
  readonly search: (request: FileSearchRequest) => Promise<
    | {
        readonly kind: 'found'
        readonly values: readonly FileSearchHit[]
        readonly nextOffset?: number
        readonly truncated: boolean
      }
    | FacilityFailure
  >
  readonly move: (
    request: FileTransferRequest,
  ) => Promise<
    { readonly kind: 'moved'; readonly source: string; readonly target: string } | FacilityFailure
  >
  readonly copy: (
    request: FileTransferRequest,
  ) => Promise<
    { readonly kind: 'copied'; readonly source: string; readonly target: string } | FacilityFailure
  >
  readonly remove: (
    request: FileRemoveRequest,
  ) => Promise<{ readonly kind: 'removed'; readonly path: string } | FacilityFailure>
  readonly mkdir: (
    request: FileMkdirRequest,
  ) => Promise<{ readonly kind: 'created'; readonly path: string } | FacilityFailure>
  readonly commitBatch: (request: {
    readonly entries: readonly FileBatchEntry[]
  }) => Promise<FileBatchResult | FacilityFailure>
  /** Recognition is read-only for target paths. It does not continue or roll back a batch. */
  readonly recoverBatch: (
    batch: FileBatchReference,
  ) => Promise<FileBatchRecognition | FacilityFailure>
}
