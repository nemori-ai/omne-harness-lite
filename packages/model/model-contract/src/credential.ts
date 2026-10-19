// Declarations of the public-api chapter "凭据引用与解析端口".
import type { TenantId } from '@omne-harness/legal-identity'
import type { Identity } from './root.ts'

export const MODEL_SEND = 'model-send'

export type CredentialId = Identity<'ModelCredentialId'>
export type CredentialPurpose = typeof MODEL_SEND
export type CredentialReference = Readonly<{
  id: CredentialId
  tenant: TenantId
  purpose: CredentialPurpose
}>
export type CredentialQuery = Readonly<{
  id: CredentialId
  tenant: TenantId
  purpose: string
}>
export type SendFace = Readonly<{
  authorized: boolean
  official: boolean
}>
export type CredentialPresence =
  | Readonly<{
      kind: 'known'
      present: boolean
      id: CredentialId
      tenant: TenantId
      purpose: CredentialPurpose
    }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>
export type CredentialResolution =
  | Readonly<{ kind: 'value'; scope: 'tenant' | 'factory'; value: string }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unreadable' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>
export type CredentialPort = {
  present(reference: CredentialQuery): CredentialPresence
  resolve(reference: CredentialQuery, face: SendFace): CredentialResolution
}
