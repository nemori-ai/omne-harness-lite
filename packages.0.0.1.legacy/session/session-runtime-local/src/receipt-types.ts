import type { AtomicStorage, StorageUnit } from '@omne-harness-lite/storage'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type {
  CoordinationAuthority,
  OperationRef,
  Receipt,
} from '@omne-harness-lite/session-runtime'
import type { LogAuthority, SessionLogParticipant } from '@omne-harness-lite/session-log'

export interface ReceiptPolicy {
  readonly maxRecords: number
  readonly maxRecordBytes: number
}
/** Trusted construction: authorization uses the supplied unit and the original operation identity. */
export interface ReceiptOptions {
  readonly storage: AtomicStorage
  readonly tenant: TenantId
  readonly policy: ReceiptPolicy
  readonly authority: {
    readonly authorize: (
      unit: StorageUnit,
      authority: CoordinationAuthority,
      operation: OperationRef,
      mode: 'read' | 'write',
    ) => Promise<{ readonly kind: 'authorized' } | { readonly failure: 'denied' | 'unavailable' }>
  }
  readonly log: SessionLogParticipant
  readonly logAuthority: LogAuthority
  readonly isOpen: () => boolean
}
export type ReceiptFailure = {
  readonly failure: 'invalidInput' | 'denied' | 'unavailable' | 'identityConflict'
}
/** Stages only. The coordinator pairs the original fact and state in this unit before committing. */
export interface LocalOperationReceipts {
  readonly readIn: (
    unit: StorageUnit,
    authority: CoordinationAuthority,
    operation: OperationRef,
  ) => Promise<
    | { readonly kind: 'present'; readonly semanticDigest: string; readonly receipt: Receipt }
    | { readonly kind: 'absent' }
    | ReceiptFailure
  >
  readonly stageIn: (
    unit: StorageUnit,
    authority: CoordinationAuthority,
    semanticDigest: string,
    receipt: Receipt,
  ) => Promise<{ readonly kind: 'staged'; readonly receipt: Receipt } | ReceiptFailure>
}
