import type { Access, WorkspaceId } from '@omne-harness/legal-identity'
import type { InstanceId, NotPermitted } from './values.ts'

export type SourceLimits = Readonly<{ files: number; fileBytes: number; totalBytes: number }>

export type SourceLayout = Readonly<{
  category: string
  namespace: string
  limits: SourceLimits
}>

/** `local` is `.omne.local`, kept out of version control; `shared` is `.omne`. */
export type SourceRoot = 'local' | 'shared'

export type SourceEntry = Readonly<{ path: string; bytes: number; digest: string }>

export type SourcePackage = Readonly<{
  category: string
  namespace: string
  name: string
  root: SourceRoot
  version: string
  entries: readonly SourceEntry[]
}>

/** One consistent reading, recorded once and never changed; for one name, the local one first. */
export type SourceReading = Readonly<{
  workspace: WorkspaceId
  instance: InstanceId
  revision: number
  packages: readonly SourcePackage[]
}>

/** The reading a key points at. Not `fresh`: it kept the last one, and `reason` says why. */
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

export type SourceFile =
  | Readonly<{ kind: 'bytes'; bytes: Uint8Array }>
  | Readonly<{ kind: 'changed' | 'not-found' }>
  | NotPermitted
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface WorkspaceSources<P> {
  /** Reads once for a key of the caller's and records it; the key answers that reading afterwards. */
  adopt(
    access: Access<P>,
    input: Readonly<{
      workspace: WorkspaceId
      instance: InstanceId
      key: string
      layouts: readonly SourceLayout[]
    }>,
  ): Promise<SourceAdoption>
  adopted(
    access: Access<P>,
    input: Readonly<{ key: string }>,
  ): Promise<SourceAdoption | Readonly<{ kind: 'none' }>>
  open(access: Access<P>, input: Readonly<{ key: string; at: SourceFileAt }>): Promise<SourceFile>
}

export type SourceFilesRead =
  | Readonly<{ kind: 'read'; files: readonly Readonly<{ path: string; bytes: Uint8Array }>[] }>
  | Readonly<{ kind: 'missing' | 'over-limit' | 'linked' | 'irregular' | 'unreadable' }>

export type SourceFileRead =
  | Readonly<{ kind: 'bytes'; bytes: Uint8Array }>
  | Readonly<{ kind: 'missing' | 'over-limit' | 'linked' | 'irregular' | 'unreadable' }>

/** No link is followed, nothing is written; `directories` answers null where no directory is. */
export interface SourceFiles {
  directories(root: string, path: readonly string[]): Promise<readonly string[] | null>
  files(root: string, path: readonly string[], limits: SourceLimits): Promise<SourceFilesRead>
  file(root: string, path: readonly string[], limit: number): Promise<SourceFileRead>
}

/** How files and packages are digested. Given by whoever reads the versions, not by this group. */
export type SourceDigests = Readonly<{
  file(bytes: Uint8Array): string
  package(entries: readonly Readonly<{ path: string; digest: string }>[]): string
}>
