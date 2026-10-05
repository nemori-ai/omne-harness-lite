import type { AttachmentRef, JsonValue } from '@omne-harness-lite/content-blocks'
import type { ExecutionRef, SelectedTool, ToolImplementationOperations } from './tool-execution.ts'
import type {
  SessionAccess,
  SessionScope,
  SessionAccessOperations,
} from '@omne-harness-lite/session-tenancy'
import type { ToolResult } from '@omne-harness-lite/tool-definition'
import type {
  RecoveryAccess,
  ResourceRecoveryAuthority,
} from '@omne-harness-lite/execution-environments'
import type { SessionLogBackingOperations } from '@omne-harness-lite/session-log'
import type { ToolActionHistoryOperations } from '@omne-harness-lite/tool-admission'

export type ResultStoreFailure = {
  readonly kind: 'rejected'
  readonly reason:
    | 'invalidInput'
    | 'notAuthorized'
    | 'notFound'
    | 'storageUnavailable'
    | 'undeclaredStorage'
    | 'conflict'
    | 'receiptUnknown'
    | 'ownerStopped'
}
export interface StoredToolResult {
  readonly ref: ExecutionRef
  /** Immutable normalized author result. Any offload.raw inline bytes have become references. */
  readonly result: ToolResult
  readonly raw?: AttachmentRef
}
export interface ToolResultReadOperations {
  readonly readResult: (
    access: SessionAccess,
    ref: ExecutionRef,
  ) => Promise<{ readonly kind: 'found'; readonly value: StoredToolResult } | ResultStoreFailure>
  readonly readBytes: (
    access: SessionAccess,
    scope: SessionScope,
    reference: AttachmentRef,
  ) => Promise<{ readonly kind: 'read'; readonly bytes: Uint8Array } | ResultStoreFailure>
}
/** Acquired for one admitted execution; tools do not receive arbitrary put-for-another-call. */
export interface ToolResultWriter {
  readonly storeRaw: (
    bytes: Uint8Array,
    mediaType: string,
  ) => Promise<{ readonly kind: 'stored'; readonly reference: AttachmentRef } | ResultStoreFailure>
  readonly putAttachment: (
    itemKey: string,
    bytes: Uint8Array,
    mediaType: string,
    name?: string,
  ) => Promise<{ readonly kind: 'stored'; readonly reference: AttachmentRef } | ResultStoreFailure>
  readonly recordResult: (
    value: StoredToolResult,
  ) => Promise<'recorded' | 'duplicate' | ResultStoreFailure>
}
export interface ToolResultStorageOperations extends ToolResultReadOperations {
  readonly bindWriter: (
    access: SessionAccess,
    ref: ExecutionRef,
    declaredStorage: string,
  ) => Promise<{ readonly kind: 'bound'; readonly writer: ToolResultWriter } | ResultStoreFailure>
  readonly available: (
    access: SessionAccess,
    scope: SessionScope,
    declaredStorage: string,
  ) => Promise<
    | { readonly kind: 'available'; readonly storage: string; readonly readerTool: string }
    | ResultStoreFailure
  >
  /** Only confirmed terminal results with an existing delivery obligation; no new business read. */
  readonly readForDelivery: (
    access: RecoveryAccess,
    ref: ExecutionRef,
  ) => Promise<{ readonly kind: 'found'; readonly value: StoredToolResult } | ResultStoreFailure>
  /** reference must be a member of that call's confirmed result, not an arbitrary known ref. */
  readonly readDeliveryBytes: (
    access: RecoveryAccess,
    ref: ExecutionRef,
    reference: AttachmentRef,
  ) => Promise<{ readonly kind: 'read'; readonly bytes: Uint8Array } | ResultStoreFailure>
}
export interface ResultStoreConfig {
  readonly directory: string
  readonly storage: string
  readonly maxInlineBytes: number
}
export interface OffloadPolicyConfig {
  readonly maxResultBytes: number
  readonly fallbackBytes: number
  readonly summarizer: string | null
}
export interface ResultStorageEvidence {
  readonly reference: AttachmentRef
  readonly digest: string
  readonly scope: SessionScope
  readonly metadata: JsonValue
}

/** Trusted construction ports. They are not plugin configuration or tool dependencies. */
export interface ToolResultStorageDependencies {
  readonly authorization: SessionAccessOperations
  readonly backing: SessionLogBackingOperations
  readonly history: ToolActionHistoryOperations
  readonly recoveryAuthority: ResourceRecoveryAuthority
  readonly reader?: {
    readonly selected: SelectedTool
    readonly implementations: ToolImplementationOperations
  }
}
export interface ToolResultStorageInstance {
  readonly operations: ToolResultStorageOperations
  readonly close: () => Promise<void>
}
