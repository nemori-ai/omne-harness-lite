import type { SnapshotInspectionSession, SnapshotView } from '@omne-harness-lite/storage'
import type { Metadata } from './backup-data.ts'
import type { BackupInputFile } from './input.ts'

export interface PhysicalInput {
  readonly size: number
  read(offset: number, length: number): Promise<Uint8Array>
  stable(): Promise<void>
  sync(): Promise<void>
}
export interface Directory {
  readonly path: string
  stable(): Promise<void>
  confirm(): Promise<void>
}
export interface Output {
  readonly path: string
  write(bytes: Uint8Array): Promise<void>
  sync(): Promise<void>
}
export interface NameReader {
  read(): Promise<string | null>
}
export interface FileEffects {
  useInput<T>(
    path: string,
    session: SnapshotInspectionSession,
    work: (input: PhysicalInput) => Promise<T>,
  ): Promise<T>
  useDirectory<T>(
    path: string,
    session: SnapshotInspectionSession,
    privateOnly: boolean,
    work: (directory: Directory) => Promise<T>,
  ): Promise<T>
  useTemporary<T>(
    root: string,
    session: SnapshotInspectionSession,
    work: (output: Output) => Promise<T>,
    cleanupFailed: (error: unknown, path: string) => never,
  ): Promise<T>
  withNames<T>(
    path: string,
    session: SnapshotInspectionSession,
    work: (reader: NameReader) => Promise<T>,
  ): Promise<T>
  isPlainFile(path: string): Promise<boolean>
  link(temporary: string, destination: string): Promise<void>
  mkdir(path: string): Promise<void>
  space(path: string): Promise<{ bavail: number; bsize: number }>
}
export interface BackupCodec {
  header(input: PhysicalInput): Promise<{ metadata: Metadata; dataOffset: number }>
  bytes(metadata: Metadata): Uint8Array
}
export interface Digest {
  update(bytes: Uint8Array): void
  hex(): string
}
export interface MaintenanceEffects {
  readonly files: FileEffects
  readonly codec: BackupCodec
  readonly digestFactory: () => Digest
  readonly backupName: () => string
  readonly readCenter: (view: SnapshotView) => Promise<string>
  readonly useBackup: <T>(
    path: string,
    session: SnapshotInspectionSession,
    work: (input: BackupInputFile) => Promise<T>,
  ) => Promise<T>
}
