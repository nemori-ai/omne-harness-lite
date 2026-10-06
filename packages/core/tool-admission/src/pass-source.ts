import type { SessionAccess, SessionScope } from '@omne-harness-lite/session-tenancy'
import type { AdmissionInput } from './tool-admission.ts'

export const OFFICIAL_ADMISSION_NAME = 'omne-official:admission-judgment'

/** Captured after preceding rewrites, only for the active official admission round. */
export interface AdmissionPassRecord {
  readonly inputs: readonly [AdmissionInput, ...AdmissionInput[]]
  readonly finalKeys: readonly [string, ...string[]]
  readonly isActive: () => boolean
}

/** Read-only trusted runner boundary. Callers cannot register or manufacture a pass here. */
export interface ToolAdmissionPassSourceOperations {
  readonly read: (
    access: SessionAccess,
    scope: SessionScope,
    pass: string,
  ) => Promise<
    | { readonly kind: 'found'; readonly record: AdmissionPassRecord }
    | {
        readonly kind: 'rejected'
        readonly reason: 'invalidInput' | 'notAuthorized' | 'passUnavailable' | 'unavailable'
      }
  >
}
