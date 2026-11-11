// Declarations of the public-api chapter "凭据引用与解析端口". A supplier sends with the credential
// items its model provider declares, all read from one layer: the calling tenant's own or the
// official one. The layer is fixed when the request is prepared; the values are read when it is
// sent. A reference names the provider and the layer; the tenant comes from the caller's access.
import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { CredentialLayer, ProviderName } from './root.ts'

export const MODEL_SEND = 'model-send'

export type CredentialPurpose = typeof MODEL_SEND

/** The state of one credential item in one layer, as the custody reports it. */
export type CredentialItemState = 'unbound' | 'active' | 'revoked' | 'unreadable'

/**
 * Why no layer can be fixed, or why the fixed layer gives no values. `missing`: no layer holds the
 * items. `incomplete`: the layer holds some items but not the listed ones. `revoked` and
 * `unreadable`: an item of the layer is revoked or cannot be read. `denied`: the caller may not use
 * this credential. `unavailable`: the custody cannot answer now.
 */
export type CredentialFailure =
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'incomplete'; missing: readonly string[] }>
  | Readonly<{ kind: 'revoked' }>
  | Readonly<{ kind: 'unreadable' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>

/** The question of a preparation: which layer this provider's credential comes from. */
export type CredentialLayerQuery<P> = Readonly<{
  provider: ProviderName
  /** The profile is an official profile: only then may the official layer serve. */
  official: boolean
  access: Access<P>
}>

/** The question of a send: the values of the fixed layer, for the caller's tenant. */
export type CredentialReference<P> = Readonly<{
  provider: ProviderName
  layer: CredentialLayer
  purpose: CredentialPurpose
  access: Access<P>
}>

/** The values of every credential item of the layer, by item; empty for the layer `none`. */
export type CredentialResolution = Outcome<ReadonlyMap<string, string>, CredentialFailure>

export type CredentialPort<P = unknown> = {
  layerOf(input: CredentialLayerQuery<P>): Outcome<CredentialLayer, CredentialFailure>
  resolve(reference: CredentialReference<P>): CredentialResolution
}
