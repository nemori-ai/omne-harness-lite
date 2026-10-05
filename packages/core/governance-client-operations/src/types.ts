import type { LocalRecord } from '@omne-harness-lite/client-local-state'

export type ReadMode = 'prefer-copy' | 'refresh'
export interface InvokeAction {
  readonly action: 'invoke'
  readonly operation: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly readMode?: ReadMode
}
export type ActionInput =
  | InvokeAction
  | {
      readonly action: 'configure'
      readonly endpoint: string
      readonly trust: LocalRecord['center']['trust']
    }
  | {
      readonly action: 'register' | 'login'
      readonly payload: { readonly loginIdentifier: string; readonly credential: unknown }
    }
  | { readonly action: 'health' }
  | { readonly action: 'logout' }

/** Invoke payloads omit only AI50's two credential fields; runtime Schema enforces slots. */
export type ActionIntent =
  | Exclude<ActionInput, { action: 'register' | 'login' }>
  | {
      readonly action: 'register' | 'login'
      readonly payload: { readonly loginIdentifier: string }
    }
export type TrustSummary =
  | { readonly mode: 'ca'; readonly source: 'system' }
  | { readonly mode: 'ca'; readonly source: 'explicit'; readonly sha256: string }
  | { readonly mode: 'spki'; readonly sha256: string }
export type PreviewIntent =
  | Exclude<ActionIntent, { action: 'configure' }>
  | {
      readonly action: 'configure'
      readonly endpoint: string
      readonly trust: TrustSummary
    }
export interface ActionPreview {
  readonly intent: PreviewIntent
  readonly origin: Origin
  readonly endpoint: string
  readonly source: 'local-selection' | 'verified-center'
}
export type PromptResult =
  | { readonly kind: 'cancelled' }
  | {
      readonly kind: 'continue'
      readonly secrets:
        | Readonly<Record<string, never>>
        | { readonly credential: unknown }
        | { readonly currentCredential: unknown; readonly newCredential: unknown }
    }
export type InputPrompt = (preview: ActionPreview, signal: AbortSignal) => Promise<PromptResult>

export interface PublicExchange {
  readonly operation: string
  readonly reply: { readonly result: unknown } | { readonly failure: string }
}
export interface Origin {
  readonly centerId: string | null
  readonly accountId: string | null
  readonly loginStateHandle: string | null
  readonly expectedTenant?: { readonly organization: string; readonly account: string }
}
export type AdmissionReason =
  | 'not-configured'
  | 'not-logged-in'
  | 'selection-changed'
  | 'busy'
  | 'invalid-input'
  | 'reenter-required'
  | 'local-unavailable'
  | 'invalid-record'
  | 'unsupported-format'
  | 'identity-unavailable'
  | 'center-mismatch'
  | 'defect'
export interface RemoteObservation {
  readonly status: 'not-attempted' | 'success' | 'rejected' | 'unavailable' | 'unknown'
  readonly stage: 'none' | 'health' | 'identity' | 'operation'
  /** Only the target governance request, not preparatory health/identity traffic. */
  readonly sendAttempted: boolean
  readonly reply?: PublicExchange
  readonly answer?: 'version-mismatch' | 'login-state-rejected' | 'invalid-input' | 'unavailable'
  readonly transportFailure?:
    | 'connection'
    | 'trust'
    | 'timeout'
    | 'cancelled'
    | 'response-framing'
    | 'response-limit'
    | 'response-invalid'
  readonly health?: {
    readonly reachable: true
    readonly centerId: string
    readonly version: string
  }
}
export interface LocalSettlement {
  readonly status:
    'not-requested' | 'installed' | 'conflict' | 'not-installed' | 'unconfirmed' | 'defect'
  readonly reason?: 'invalid-input' | 'invalid-record' | 'unsupported-format' | 'unavailable'
  readonly recovery?: {
    readonly observation:
      'visible-this-operation' | 'visible-other-record' | 'not-seen' | 'different-store' | 'unknown'
    readonly current?: Omit<Origin, 'expectedTenant'> & { readonly revision: number }
  }
}
export type DefectStage =
  | 'input'
  | 'local-read'
  | 'health'
  | 'identity'
  | 'operation'
  | 'settlement'
  | 'recovery'
  | 'output'
export interface ActionReport {
  readonly format: 'governance-client/1'
  readonly actionId: string
  readonly action: ActionInput['action'] | 'invalid'
  readonly operation: string | null
  readonly origin: Origin
  readonly admission: { readonly status: 'admitted' | 'blocked'; readonly reason?: AdmissionReason }
  readonly remote: RemoteObservation
  readonly local: LocalSettlement
  readonly view: {
    readonly source: 'none' | 'online' | 'copy'
    readonly acquiredAt?: string
    readonly data?: PublicExchange
    readonly query?: {
      readonly operation: string
      readonly payload: Readonly<Record<string, unknown>>
    }
    readonly tenant?: { readonly organization: string; readonly account: string }
  }
  readonly use: 'active' | 'reenter-required' | 'ended'
  readonly defect?: { readonly stage: DefectStage; readonly code: 'internal-defect' }
}
export interface GovernanceUse {
  run(input: unknown): Promise<ActionReport>
  runPrepared(intent: unknown, prompt: InputPrompt): Promise<ActionReport>
  close(): Promise<void>
}
export type OpenUseOutcome =
  | { readonly kind: 'use'; readonly use: GovernanceUse; readonly origin: Origin }
  | { readonly kind: 'blocked'; readonly reason: AdmissionReason }
export interface GovernanceClientOperations {
  runAction(input: unknown): Promise<ActionReport>
  runPrepared(intent: unknown, prompt: InputPrompt): Promise<ActionReport>
  openUse(): Promise<OpenUseOutcome>
  close(): Promise<void>
}
export class ClientUseUsageDefect extends Error {
  override readonly name = 'ClientUseUsageDefect'
  constructor(readonly reason: 'closed' | 'invalid-use') {
    super(`governance-client-operations: ${reason}`)
  }
}
/** Observe a single generation's original close attempt before its allocation. */
export interface ClientCloseObservation {
  observe(attempt: Promise<void>): void
}
