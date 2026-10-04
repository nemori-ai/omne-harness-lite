import type { TenantId } from '@omne-harness-lite/identity-values'
import type { SessionRef } from '@omne-harness-lite/messages'

export interface SessionScope { readonly tenant: TenantId; readonly session: SessionRef }
export type AccessOperation =
  | 'context.read' | 'context.configure' | 'context.publish'
  | 'tool.submit' | 'tool.read' | 'tool.stop' | 'tool.answer'
  | 'environment.describe' | 'environment.acquire' | 'result.read' | 'run.advance'
  | 'session.log.coordinate'
export type Consumer = 'model' | 'tool' | 'extension' | 'coordinator' | 'source'
declare const accessBrand: unique symbol
/** A live binding. A cast, serialized object, or copied brand is never sufficient proof. */
export interface SessionAccess { readonly [accessBrand]: true }
export interface AccessIdentity {
  readonly binding: string
  readonly principal: string
  /** Proven by the trusted ingress; independent of context consumer role. */
  readonly principalKind: 'human' | 'system' | 'agent'
  readonly scope: SessionScope
  readonly consumer: Consumer
  readonly contextKeys: readonly string[]
}
export type AccessDecision =
  | { readonly kind: 'authorized'; readonly identity: AccessIdentity }
  | { readonly kind: 'rejected'; readonly reason: 'invalidInput' | 'notAuthorized' | 'unavailable' | 'ownerStopped' }
export interface SessionAccessOperations {
  /** Checks issuer membership, revocation, current tenant/session authority and operation. */
  readonly authorize: (access: SessionAccess, scope: SessionScope, operation: AccessOperation) => Promise<AccessDecision>
}
/** Private bootstrap return, NOT a Cordis service or a tool dependency. */
export interface SessionAccessIssuer {
  /** The factory supplies authenticated ingress and current authority readers. */
  readonly issue: (request: {
    readonly principal: string
    readonly principalKind: 'human' | 'system' | 'agent'
    readonly scope: SessionScope
    readonly consumer: Consumer
    readonly contextKeys: readonly string[]
    readonly operations: readonly AccessOperation[]
  }) => Promise<{ readonly kind: 'issued'; readonly access: SessionAccess } | Exclude<AccessDecision, {kind: 'authorized'}>>
  readonly revoke: (access: SessionAccess) => void
}

/** Application-provided current authority check; this does not issue bindings. */
export interface SessionAccessAuthorityOperations {
  readonly check: (identity: AccessIdentity, operation: AccessOperation) => Promise<AccessDecision>
}
