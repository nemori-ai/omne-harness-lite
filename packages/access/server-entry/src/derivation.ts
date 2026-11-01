// The identities this entry derives from the caller's own identifiers (handoff「派生身份」, SPEC
// 「SessionOperationId 的派生规则」). Operation identities use Session's `deriveIngressOperation`;
// the session and input identities and the login-entry digest take the SHA-256 of the JSON text of
// an array, as the handoff fixes. No time, random number or `messageId` enters any identity.
import { createHash } from 'node:crypto'
import {
  loginStateCodec,
  tenantCodec,
  type LoginStateId,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  INGRESS_FAMILIES,
  deriveIngressOperation,
  type DurableEvidence,
  type SessionOperationId,
} from '@omne-harness/session-contract'

function sha256Hex(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

/** The tenant text of a minted tenant. Throws TypeError for an unminted value: a caller bug, not an input. */
export function tenantTextOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('server-entry: tenant is not a minted TenantId')
  return encoded.value
}

export function loginTextOf(login: LoginStateId): string {
  const encoded = loginStateCodec.encode(login)
  if (!encoded.ok) throw new TypeError('server-entry: login is not a minted LoginStateId')
  return encoded.value
}

/** The session identity text: 64 lowercase hexadecimal characters. */
export function sessionIdentity(tenantText: string, createCallId: string): string {
  return sha256Hex(['session-public/1:session', tenantText, createCallId])
}

export function inputIdentity(tenantText: string, sessionText: string, inputId: string): string {
  return sha256Hex(['session-public/1:input', tenantText, sessionText, inputId])
}

export function createOperation(tenantText: string, createCallId: string): SessionOperationId {
  return deriveIngressOperation(INGRESS_FAMILIES.create, [tenantText, createCallId])
}

export function acceptOperation(
  tenantText: string,
  sessionText: string,
  acceptId: string,
): SessionOperationId {
  return deriveIngressOperation(INGRESS_FAMILIES.accept, [tenantText, sessionText, acceptId])
}

export function controlOperation(
  loginText: string,
  tenantText: string,
  sessionText: string,
  controlId: string,
): SessionOperationId {
  return deriveIngressOperation(INGRESS_FAMILIES.control, [
    loginText,
    tenantText,
    sessionText,
    controlId,
  ])
}

/** The login-entry evidence an ordinary input carries as its origin (handoff「普通输入的来源与登录门」). */
export function loginEntryOrigin(accountText: string, loginText: string): DurableEvidence {
  return {
    owner: 'login-entry',
    record: loginText,
    revision: '1',
    digest: sha256Hex(['login-entry', accountText, loginText]),
  }
}
