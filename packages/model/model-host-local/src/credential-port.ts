// The Model credential port over the secret custody of the settings domain (model-contract
// SPEC「凭据引用与解析端口」). Settings keeps the secrets. The port knows, for each provider, the
// credential items it declares, whether the release holds its official layer, and the binding key
// of one item in one scope. It fixes and reads a layer with the contract's own two rules.
import type { ProviderName } from '@omne-harness/model-contract'
import {
  MODEL_SEND,
  readCredentialLayer,
  selectCredentialLayer,
  type CredentialFailure,
  type CredentialItemState,
  type CredentialLayerReading,
  type CredentialPort,
} from '@omne-harness/model-contract/provider'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  SecretBindingKey,
  SecretCustodyManagement,
  SecretCustodyUse,
  SecretScope,
} from '@omne-harness/settings'

/** What the port knows of one provider. The assembly derives it from the provider asset. */
export type CredentialProviderSource = Readonly<{
  /** The credential items the provider body declares. */
  items: readonly string[]
  /** The release holds the provider, and so an official layer can exist. */
  official: boolean
  /** The binding key of one credential item in one scope. */
  keyOf(scope: SecretScope, item: string): SecretBindingKey
}>

export type SecretCredentialPortOptions = Readonly<{
  /** The read face and the use face of the secret custody. The port never writes. */
  custody: Pick<SecretCustodyManagement, 'describe'> & SecretCustodyUse
  providers: ReadonlyMap<ProviderName, CredentialProviderSource>
}>

/**
 * A credential port that reads the secrets of the settings domain. An unknown provider and a purpose
 * other than `model-send` are denied. A custody that refuses or cannot answer gives its own failure.
 */
export function createSecretCredentialPort<P = unknown>(
  options: SecretCredentialPortOptions,
): CredentialPort<P> {
  const { custody, providers } = options

  function reading(
    source: CredentialProviderSource,
    scope: SecretScope,
  ): Outcome<CredentialLayerReading, CredentialFailure> {
    const states = new Map<string, CredentialItemState>()
    for (const item of source.items) {
      const presence = custody.describe(source.keyOf(scope, item))
      if (presence === 'denied' || presence === 'unavailable') return fail({ kind: presence })
      states.set(item, presence.kind === 'unbound' ? 'unbound' : presence.life)
    }
    return succeed(states)
  }

  /** The secret of every item of a layer that `readCredentialLayer` found usable. */
  function secretsOf(
    source: CredentialProviderSource,
    scope: SecretScope,
  ): Outcome<ReadonlyMap<string, string>, CredentialFailure> {
    const secrets = new Map<string, string>()
    for (const item of source.items) {
      const used = custody.use(source.keyOf(scope, item))
      if (used === 'denied' || used === 'unavailable') return fail({ kind: used })
      // The binding changed between the read of its life and its use: no answer for now.
      if (used === 'missing') return fail({ kind: 'unavailable' })
      secrets.set(item, used.value)
    }
    return succeed(secrets)
  }

  return {
    layerOf({ provider, official, access }) {
      const source = providers.get(provider)
      if (source === undefined) return fail({ kind: 'denied' })
      const tenant = reading(source, { layer: 'tenant', tenant: access.tenant })
      if ('failure' in tenant) return tenant
      // The official layer matters only when the tenant holds no item, and only to an official
      // profile of a provider the release holds: a tenant layer is never judged by the other one.
      const holdsTenantItem = [...tenant.ok.values()].some(state => state !== 'unbound')
      let deployment: CredentialLayerReading | null = null
      if (official && source.official && !holdsTenantItem) {
        const read = reading(source, { layer: 'official' })
        if ('failure' in read) return read
        deployment = read.ok
      }
      return selectCredentialLayer({
        items: source.items,
        tenant: tenant.ok,
        official: deployment,
        profileOfficial: official,
      })
    },
    resolve({ provider, layer, purpose, access }) {
      const source = providers.get(provider)
      if (source === undefined || purpose !== MODEL_SEND) return fail({ kind: 'denied' })
      if (layer.layer === 'none')
        return source.items.length === 0 ? succeed(new Map()) : fail({ kind: 'denied' })
      if (layer.layer === 'official' && !source.official) return fail({ kind: 'denied' })
      const scope: SecretScope =
        layer.layer === 'official'
          ? { layer: 'official' }
          : { layer: 'tenant', tenant: access.tenant }
      const read = reading(source, scope)
      if ('failure' in read) return read
      const usable = readCredentialLayer(source.items, read.ok)
      return 'failure' in usable ? usable : secretsOf(source, scope)
    },
  }
}
