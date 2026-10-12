import type { PreflightInput, PreflightResult } from './preflight.ts'

/** D055: physical maintenance failures are separate from governance failures. */
export type SnapshotFailureKind = 'busy' | 'unavailable' | 'capacity' | 'invalid-data' | 'cancelled'

export class SnapshotFailure extends Error {
  override readonly name = 'SnapshotFailure'
  constructor(
    readonly kind: SnapshotFailureKind,
    options?: { readonly cause?: unknown; readonly residual?: string },
  ) {
    super(`snapshot maintenance: ${kind}`, options)
    this.residual = options?.residual
  }
  /** Local diagnostic only; never a remote result or a data value. */
  readonly residual: string | undefined
}

export interface SnapshotColumn {
  readonly name: string
  readonly type: string
  readonly notNull: boolean
  readonly primaryKeyPosition: number
}

export interface SnapshotIndex {
  readonly name: string
  readonly unique: boolean
  readonly partial: boolean
  /** null denotes an expression rather than a named column. */
  readonly columns: readonly (string | null)[]
  readonly definition: string | null
}

export interface SnapshotForeignKey {
  readonly table: string
  readonly from: readonly string[]
  readonly to: readonly (string | null)[]
  readonly onUpdate: string
  readonly onDelete: string
}

export interface SnapshotTable {
  readonly name: string
  readonly columns: readonly SnapshotColumn[]
  readonly indexes: readonly SnapshotIndex[]
  readonly foreignKeys: readonly SnapshotForeignKey[]
  readonly definition: string
}

export interface SnapshotStructure {
  readonly tables: readonly SnapshotTable[]
  readonly views: readonly string[]
  readonly triggers: readonly string[]
}

/** Borrowed only during use; the provider waits for already-started reads. */
export interface SnapshotView {
  readonly inspection: PreflightInput
  readonly structure: SnapshotStructure
  readonly byteLength: number
  read(offset: number, length: number): Promise<Uint8Array>
}

export type SnapshotCheck = (view: SnapshotView) => Promise<PreflightResult>

export interface SnapshotInput {
  readonly byteLength: number
  readonly chunks: AsyncIterable<Uint8Array>
}

export interface SnapshotInspectionSession {
  /** Run-owned lifetime, including resources obtained by an already-started open after cancellation. */
  ownResource(close: () => void | Promise<void>, isClosed: () => boolean): () => Promise<void>
  readonly cancelled: boolean
  inspect<T>(input: SnapshotInput, use: (view: SnapshotView) => Promise<T>): Promise<T>
}

export interface SnapshotSession extends SnapshotInspectionSession {
  snapshot<T>(use: (view: SnapshotView) => Promise<T>): Promise<T>
}

export interface SnapshotRunOptions {
  readonly signal?: AbortSignal
}

/** One whole operation, including publication and cleanup, occupies the slot. */
export interface SnapshotMaintenance {
  run<T>(fn: (session: SnapshotSession) => Promise<T>, options?: SnapshotRunOptions): Promise<T>
}

/** Offline lifetime: close rejects new work and waits for actual resource release. */
export interface SnapshotInspection {
  run<T>(
    fn: (session: SnapshotInspectionSession) => Promise<T>,
    options?: SnapshotRunOptions,
  ): Promise<T>
  close(): Promise<void>
}
