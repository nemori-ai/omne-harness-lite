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

export type CredentialProviderSource = Readonly<{
  items: readonly string[]
  official: boolean
  keyOf(scope: SecretScope, item: string): SecretBindingKey
}>

export type SecretCredentialPortOptions = Readonly<{
  custody: Pick<SecretCustodyManagement, 'describe'> & SecretCustodyUse
  providers: ReadonlyMap<ProviderName, CredentialProviderSource>
}>

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

  function secretsOf(
    source: CredentialProviderSource,
    scope: SecretScope,
  ): Outcome<ReadonlyMap<string, string>, CredentialFailure> {
    const secrets = new Map<string, string>()
    for (const item of source.items) {
      const used = custody.use(source.keyOf(scope, item))
      if (used === 'denied' || used === 'unavailable') return fail({ kind: used })
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
