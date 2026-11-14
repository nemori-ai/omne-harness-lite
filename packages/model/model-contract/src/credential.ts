import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { CredentialLayer, ProviderName } from './root.ts'

export const MODEL_SEND = 'model-send'

export type CredentialPurpose = typeof MODEL_SEND

export type CredentialItemState = 'unbound' | 'active' | 'revoked' | 'unreadable'

export type CredentialFailure =
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'incomplete'; missing: readonly string[] }>
  | Readonly<{ kind: 'revoked' }>
  | Readonly<{ kind: 'unreadable' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>

export type CredentialLayerQuery<P> = Readonly<{
  provider: ProviderName
  official: boolean
  access: Access<P>
}>

export type CredentialReference<P> = Readonly<{
  provider: ProviderName
  layer: CredentialLayer
  purpose: CredentialPurpose
  access: Access<P>
}>

export type CredentialResolution = Outcome<ReadonlyMap<string, string>, CredentialFailure>

export type CredentialPort<P = unknown> = {
  layerOf(input: CredentialLayerQuery<P>): Outcome<CredentialLayer, CredentialFailure>
  resolve(reference: CredentialReference<P>): CredentialResolution
}
