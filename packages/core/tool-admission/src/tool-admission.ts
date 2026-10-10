import type { ToolCallBlock, JsonNumber } from '@omne-harness-lite/content-blocks'
import type { DecisionCardDraft, ToolDefinitionRef } from '@omne-harness-lite/loop-extension'
import type { SessionAccess, SessionScope } from '@omne-harness-lite/session-tenancy'
import type { AdmissionDenialCode } from '@omne-harness-lite/content-blocks'
export type SessionRunMode = 'never' | 'auto_permission' | 'bypass-permissions'
export type ExecuteTier = 'forbid' | 'auto' | 'ask'
export type EffectiveExecutionPermission =
  | { readonly value: ExecuteTier; readonly from: 'factory' | 'organization' | 'tenant' }
  | { readonly value: 'ask'; readonly from: 'workspace' }
const grantsBrand: unique symbol = Symbol('tool-authorization-context')
declare const tokenBrand: unique symbol
export interface AuthorizationContext {
  readonly [grantsBrand]: true
}
/** An explicit absence of additional grants. This does not authorize an execution. */
export function emptyAuthorizationContext(): AuthorizationContext {
  return Object.freeze({ [grantsBrand]: true as const })
}
/** Encoded durable conclusion reference, validated by the owner decoder; not a bearer grant. */
export type AdmissionToken = string & { readonly [tokenBrand]: true }
export type AdmissionAnswer = 'deny' | 'allow_once' | 'allow_session' | 'allow_tenant' | 'declined'
export type AdmissionInput = {
  readonly call: Extract<ToolCallBlock, { readonly arguments: unknown }>
  readonly definition: ToolDefinitionRef
  readonly grants: AuthorizationContext
  readonly runMode: SessionRunMode
  readonly parent?: { readonly permission: ExecuteTier; readonly runMode: SessionRunMode }
  readonly answer?: AdmissionAnswer
} & (
  | {
      readonly effectivePermission: EffectiveExecutionPermission
      readonly tenantAutoWritable: boolean
    }
  | { readonly effectivePermission: 'not_in_composition'; readonly tenantAutoWritable?: never }
)
export type AdmissionResult =
  | { readonly kind: 'allow'; readonly token: AdmissionToken }
  | { readonly kind: 'deny'; readonly reason: AdmissionDenialCode }
  | { readonly kind: 'ask'; readonly card: DecisionCardDraft }
export interface AdmissionJudgment {
  readonly admit: (batch: readonly [AdmissionInput, ...AdmissionInput[]]) => Promise<
    | {
        readonly kind: 'decisions'
        readonly results: readonly [AdmissionResult, ...AdmissionResult[]]
      }
    | {
        readonly kind: 'failed'
        readonly reason: 'invalidInput' | 'modeUnknown' | 'parentNarrower' | 'unavailable'
      }
  >
}
export interface ToolAdmissionOperations {
  /** Only a pass in the pinned official runner chain can obtain a judgment binding. */
  readonly forPass: (
    access: SessionAccess,
    scope: SessionScope,
    pass: string,
  ) => Promise<
    | { readonly kind: 'bound'; readonly judgment: AdmissionJudgment }
    | {
        readonly kind: 'rejected'
        readonly reason: 'invalidInput' | 'notAuthorized' | 'passUnavailable' | 'unavailable'
      }
  >
  readonly verifyToken: (
    access: SessionAccess,
    scope: SessionScope,
    token: AdmissionToken,
    call: ToolCallBlock,
  ) => Promise<
    | {
        readonly kind: 'valid'
        readonly checked: {
          readonly scope: SessionScope
          readonly ownerGeneration: string
          readonly tail: JsonNumber
        }
      }
    | {
        readonly kind: 'invalid'
        readonly reason: 'call_mismatch' | 'arguments_changed' | 'not_admitted' | 'run_ended'
      }
    | { readonly kind: 'failed'; readonly reason: 'invalidInput' | 'notAuthorized' | 'unavailable' }
  >
}
