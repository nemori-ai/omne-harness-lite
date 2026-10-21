import {
  describeFacility,
  type FacilityDescriptor,
  type FacilityRequest,
  type FacilityResult,
} from '../facility.ts'

/** Opaque object identity. A host provider puts device and inode in it; a sandbox its own token. */
export type ObjectToken = { readonly token: string }
export type HandleGeneration = { readonly object: ObjectToken; readonly generation: string }
/** Metadata version: an observation condition, not a permission and not an external CAS. */
export type FileVersion = string

export type FileRequest<P> = FacilityRequest<P> & {
  /** An explicit absolute path on the host; relative to the granted root where a file limit is claimed. */
  readonly path: string
  /** The object the authorization named; for a target that does not exist, its parent directory. */
  readonly named: ObjectToken | null
}

export type FileIdentity = {
  readonly object: ObjectToken
  readonly handle: HandleGeneration
  readonly version: FileVersion
}

export type FileInformation = FileIdentity & {
  /** Only `stat` can report `symlink`; content operations refuse a final symbolic link. */
  readonly type: 'file' | 'directory' | 'symlink'
  readonly sizeBytes: number
  readonly modifiedMs: number
}

export type FileTarget = { readonly path: string; readonly named: ObjectToken | null }

export type FileBatchRef = { readonly id: string; readonly generation: string }

export type FileBatchOutcome = {
  readonly batch: FileBatchRef
  readonly published: readonly string[]
} & (
  | { readonly kind: 'committed' }
  | {
      readonly kind: 'unknown'
      readonly reason: 'effectUnknown' | 'conflict' | 'closed' | 'unavailable'
    }
)

export type FileBatchRecognition = {
  readonly batch: FileBatchRef
  readonly state: 'complete' | 'partial' | 'interrupted' | 'conflict' | 'pending'
  /** Paths with a durable publication receipt. */
  readonly published: readonly string[]
  /** Paths whose current bytes match the staged bytes. A match is not a receipt. */
  readonly matchingPrepared: readonly string[]
  readonly conflicting: readonly string[]
}

export interface FileSystemFacility<P> {
  read(
    request: FileRequest<P> & { readonly offsetBytes?: number; readonly limitBytes?: number },
  ): Promise<
    FacilityResult<
      FileIdentity & {
        readonly bytes: Uint8Array
        readonly nextOffsetBytes: number
        readonly eof: boolean
      }
    >
  >
  stat(request: FileRequest<P>): Promise<FacilityResult<FileInformation>>
  write(
    request: FileRequest<P> & {
      readonly bytes: Uint8Array
      readonly mode: 'create' | 'replace'
      readonly expectedVersion?: FileVersion
    },
  ): Promise<FacilityResult<FileIdentity>>
  close(
    request: FileRequest<P> & { readonly handle: HandleGeneration },
  ): Promise<FacilityResult<{ readonly handle: HandleGeneration }>>

  list(request: FileRequest<P> & { readonly offset?: number; readonly limit?: number }): Promise<
    FacilityResult<{
      readonly directory: FileIdentity
      readonly entries: readonly FileInformation[]
      readonly nextOffset?: number
    }>
  >
  search(
    request: FileRequest<P> & {
      readonly pattern: Uint8Array
      readonly match: 'name' | 'content'
      readonly recursive: boolean
      readonly offset?: number
      readonly limit?: number
    },
  ): Promise<
    FacilityResult<{
      readonly root: FileIdentity
      readonly hits: readonly {
        readonly path: string
        readonly object: ObjectToken
        readonly offsetBytes?: number
      }[]
      readonly nextOffset?: number
      readonly truncated: boolean
    }>
  >
  /** `named` is the parent directory; with `parents`, the nearest existing ancestor. */
  mkdir(
    request: FileRequest<P> & { readonly parents: boolean },
  ): Promise<FacilityResult<FileIdentity>>
  remove(
    request: FileRequest<P> & {
      readonly recursive: boolean
      readonly expectedVersion?: FileVersion
    },
  ): Promise<FacilityResult<{ readonly removed: ObjectToken }>>
  move(
    request: FileRequest<P> & {
      readonly target: FileTarget
      readonly replace: boolean
      readonly expectedVersion?: FileVersion
    },
  ): Promise<FacilityResult<{ readonly source: ObjectToken; readonly target: FileIdentity }>>
  copy(
    request: FileRequest<P> & {
      readonly target: FileTarget
      readonly replace: boolean
      readonly expectedVersion?: FileVersion
    },
  ): Promise<FacilityResult<{ readonly source: ObjectToken; readonly target: FileIdentity }>>

  /** Stages every entry, then publishes each path on its own. No multi-path atomic commit. */
  commitBatch(
    request: FacilityRequest<P> & {
      readonly entries: readonly {
        readonly path: string
        readonly named: ObjectToken | null
        readonly bytes: Uint8Array
        readonly expectedVersion: FileVersion | null
      }[]
    },
  ): Promise<FacilityResult<FileBatchOutcome>>
  /** Reads the manifest, targets and receipts only. It does not publish, roll back or overwrite. */
  recoverBatch(
    request: FacilityRequest<P> & { readonly batch: FileBatchRef },
  ): Promise<FacilityResult<FileBatchRecognition>>
}

declare module '../facility.ts' {
  interface EnvironmentFacilities {
    files: FileSystemFacility<unknown>
  }
}

export const filesFacility: FacilityDescriptor<'files'> = describeFacility('files', {
  read: 'guarded',
  stat: 'guarded',
  write: 'guarded',
  close: 'guarded',
  list: 'guarded',
  search: 'guarded',
  mkdir: 'guarded',
  remove: 'guarded',
  move: 'guarded',
  copy: 'guarded',
  commitBatch: 'guarded',
  recoverBatch: 'guarded',
})
