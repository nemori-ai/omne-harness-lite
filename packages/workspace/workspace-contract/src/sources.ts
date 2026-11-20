import type { Access, WorkspaceId } from '@omne-harness/legal-identity'
import type { InstanceId, NotPermitted } from './values.ts'

/** The bounds of one package, set by the category it is of. */
export type SourceLimits = Readonly<{ files: number; fileBytes: number; totalBytes: number }>

/** What one registered category says about where its packages sit in a source root. */
export type SourceLayout = Readonly<{
  category: string
  /** The directory under `.omne` and `.omne.local` that holds one directory per package. */
  namespace: string
  limits: SourceLimits
}>

/** `local` is `.omne.local`, kept out of version control; `shared` is `.omne`. */
export type SourceRoot = 'local' | 'shared'

export type SourceEntry = Readonly<{ path: string; bytes: number; digest: string }>

/** One package as it was read: its files and the digest of them as its version. */
export type SourcePackage = Readonly<{
  category: string
  namespace: string
  name: string
  root: SourceRoot
  version: string
  entries: readonly SourceEntry[]
}>

/** One consistent reading of the source roots of an instance. Recorded once, never changed. */
export type SourceReading = Readonly<{
  workspace: WorkspaceId
  instance: InstanceId
  revision: number
  /** For one category and name, the local package comes before the shared one. */
  packages: readonly SourcePackage[]
}>

/**
 * The reading a key points at. `fresh` is false when this key kept the last reading because a new
 * one could not be made; `reason` says why.
 */
export type SourceAdoption =
  | Readonly<{ kind: 'adopted'; reading: SourceReading; fresh: boolean; reason: string | null }>
  | NotPermitted
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type SourceFileAt = Readonly<{
  category: string
  name: string
  root: SourceRoot
  path: string
  digest: string
}>

/** `changed`: the file is not the one the reading recorded. */
export type SourceFile =
  | Readonly<{ kind: 'bytes'; bytes: Uint8Array }>
  | Readonly<{ kind: 'changed' | 'not-found' }>
  | NotPermitted
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** The source roots of instances, read for a caller that names the key of its reading. */
export interface WorkspaceSources<P> {
  /** Reads once for this key and records it; the same key answers the same reading afterwards. */
  adopt(
    access: Access<P>,
    input: Readonly<{
      workspace: WorkspaceId
      instance: InstanceId
      key: string
      layouts: readonly SourceLayout[]
    }>,
  ): Promise<SourceAdoption>
  /** The reading recorded for the key; `none` when the key has none. */
  adopted(
    access: Access<P>,
    input: Readonly<{ workspace: WorkspaceId; key: string }>,
  ): Promise<SourceAdoption | Readonly<{ kind: 'none' }>>
  /** One file of a package of the reading the key points at, checked against its digest. */
  open(
    access: Access<P>,
    input: Readonly<{ workspace: WorkspaceId; key: string; at: SourceFileAt }>,
  ): Promise<SourceFile>
}

/** `irregular`: something in it is neither a directory nor a regular file. */
export type SourceFilesRead =
  | Readonly<{ kind: 'read'; files: readonly Readonly<{ path: string; bytes: Uint8Array }>[] }>
  | Readonly<{ kind: 'missing' | 'over-limit' | 'linked' | 'irregular' | 'unreadable' }>

export type SourceFileRead =
  | Readonly<{ kind: 'bytes'; bytes: Uint8Array }>
  | Readonly<{ kind: 'missing' | 'over-limit' | 'linked' | 'irregular' | 'unreadable' }>

/**
 * Reads where the files are, at `root` joined with the segments of `path`: a link on the way or
 * inside is never followed, nothing is written, the bounds hold.
 */
export interface SourceFiles {
  /** The directories directly under the path, links left out. Null: no directory is there. */
  directories(root: string, path: readonly string[]): Promise<readonly string[] | null>
  /** Every regular file under the directory, by its path inside it. */
  files(root: string, path: readonly string[], limits: SourceLimits): Promise<SourceFilesRead>
  /** One regular file. */
  file(root: string, path: readonly string[], limit: number): Promise<SourceFileRead>
}

/** How files and packages are digested. Given by whoever reads the versions, not by this group. */
export type SourceDigests = Readonly<{
  file(bytes: Uint8Array): string
  package(entries: readonly Readonly<{ path: string; digest: string }>[]): string
}>
