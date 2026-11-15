// The family texts session-public/1:session and session-public/1:input are in the log: changing them gives another session for the same message.
import { createHash } from 'node:crypto'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  INGRESS_FAMILIES,
  deriveIngressOperation,
  type DurableEvidence,
  type SessionOperationId,
} from '@omne-harness/session-contract'

function sha256Hex(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

export function tenantTextOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('session-access: tenant is not a minted TenantId')
  return encoded.value
}

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

export function loginEntryOrigin(accountText: string, loginText: string): DurableEvidence {
  return {
    owner: 'login-entry',
    record: loginText,
    revision: '1',
    digest: sha256Hex(['login-entry', accountText, loginText]),
  }
}
