import type { TenantId } from '@omne-harness-lite/identity-values'
import type {
  AccessIdentity,
  AccessOperation,
  Consumer,
  SessionAccessAuthorityOperations,
  SessionAccessIssuer,
  SessionAccessOperations,
} from '@omne-harness-lite/session-tenancy'

/** Only the authenticated ingress/owned assembly supplies this construction. Never a client body. */
export interface LocalSessionAccessOptions {
  readonly tenant: TenantId
  readonly principal: Pick<AccessIdentity, 'principal' | 'principalKind'>
  readonly authority: SessionAccessAuthorityOperations
  readonly consumers: readonly Consumer[]
  readonly operations: readonly AccessOperation[]
  readonly policy: { readonly maxBindings: number; readonly maxContextKeys: number }
}
export interface LocalSessionAccess {
  readonly operations: SessionAccessOperations
  /** Private bootstrap return. Do not publish it as a Cordis service or a protocol operation. */
  readonly issuer: SessionAccessIssuer
  /** Stops new issue/use calls and drains admitted checks. Borrowed authority stays open. */
  readonly close: () => Promise<void>
}
