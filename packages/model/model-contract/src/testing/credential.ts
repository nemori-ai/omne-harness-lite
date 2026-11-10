// The scripted credential port: a credential provider in memory over the providers the test names.
// It fixes and reads layers with the contract's own rule, so a test of a consumer sees the answers
// every real provider must give.
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  MODEL_SEND,
  type CredentialFailure,
  type CredentialItemState,
  type CredentialPort,
} from '../credential.ts'
import { readCredentialLayer, selectCredentialLayer } from '../credential-values.ts'
import type {
  CredentialConformanceControls,
  CredentialTarget,
} from '../conformance/credential-types.ts'
import type { ProviderName } from '../root.ts'

/** A provider the scripted port knows: its credential items and whether the release holds it. */
export type ScriptedCredentialProvider = Readonly<{ items: readonly string[]; official: boolean }>

export type ScriptedCredentialPortOptions = Readonly<{
  providers: ReadonlyMap<ProviderName, ScriptedCredentialProvider>
}>
export type ScriptedCredentialPort<P = unknown> = Readonly<{
  port: CredentialPort<P>
  controls: CredentialConformanceControls
}>

type Binding = CredentialTarget &
  Readonly<{ secret: string; life: Exclude<CredentialItemState, 'unbound'> }>

function sameTarget(left: CredentialTarget, right: CredentialTarget): boolean {
  if (left.provider !== right.provider || left.item !== right.item) return false
  if (left.scope.layer === 'official') return right.scope.layer === 'official'
  return right.scope.layer === 'tenant' && tenantEquals(left.scope.tenant, right.scope.tenant)
}

export function createScriptedCredentialPort<P = unknown>(
  options: ScriptedCredentialPortOptions,
): ScriptedCredentialPort<P> {
  let bindings: Binding[] = []
  let closed = false
  let unavailable = false

  function gate(tenant: TenantId): CredentialFailure | undefined {
    // legal-identity has no separate mint check; equality with itself holds only for a minted tenant.
    if (closed || !tenantEquals(tenant, tenant)) return { kind: 'denied' }
    return unavailable ? { kind: 'unavailable' } : undefined
  }

  function reading(provider: ProviderName, scope: CredentialTarget['scope']) {
    const states = new Map<string, CredentialItemState>()
    for (const binding of bindings)
      if (sameTarget(binding, { provider, item: binding.item, scope }))
        states.set(binding.item, binding.life)
    return states
  }

  function change(target: CredentialTarget, update: (binding: Binding) => Binding) {
    bindings = bindings.map(binding => (sameTarget(binding, target) ? update(binding) : binding))
  }

  return {
    port: {
      layerOf({ provider, official, access }) {
        const refusal = gate(access.tenant)
        if (refusal) return fail(refusal)
        const known = options.providers.get(provider)
        if (known === undefined) return fail({ kind: 'denied' })
        return selectCredentialLayer({
          items: known.items,
          tenant: reading(provider, { layer: 'tenant', tenant: access.tenant }),
          official: known.official ? reading(provider, { layer: 'official' }) : null,
          profileOfficial: official,
        })
      },
      resolve({ provider, layer, purpose, access }) {
        const refusal = gate(access.tenant)
        if (refusal) return fail(refusal)
        const known = options.providers.get(provider)
        if (known === undefined || purpose !== MODEL_SEND) return fail({ kind: 'denied' })
        if (layer.layer === 'none')
          return known.items.length === 0 ? succeed(new Map()) : fail({ kind: 'denied' })
        if (layer.layer === 'official' && !known.official) return fail({ kind: 'denied' })
        const scope: CredentialTarget['scope'] =
          layer.layer === 'official' ? layer : { layer: 'tenant', tenant: access.tenant }
        const read = readCredentialLayer(known.items, reading(provider, scope))
        if (!('ok' in read)) return read
        const secrets = new Map<string, string>()
        for (const binding of bindings)
          if (sameTarget(binding, { provider, item: binding.item, scope }))
            secrets.set(binding.item, binding.secret)
        return succeed(secrets)
      },
    },
    controls: {
      bind(target, secret) {
        if (
          target.scope.layer === 'tenant' &&
          !tenantEquals(target.scope.tenant, target.scope.tenant)
        )
          throw new TypeError('invalid binding tenant')
        bindings = [
          ...bindings.filter(binding => !sameTarget(binding, target)),
          { ...target, secret, life: 'active' },
        ]
      },
      unbind(target) {
        bindings = bindings.filter(binding => !sameTarget(binding, target))
      },
      rotate: (target, secret) => change(target, binding => ({ ...binding, secret })),
      revoke: target => change(target, binding => ({ ...binding, life: 'revoked' })),
      markUnreadable: target =>
        change(target, binding =>
          binding.life === 'active' ? { ...binding, life: 'unreadable' } : binding,
        ),
      setUnavailable(value) {
        unavailable = value
      },
      close() {
        closed = true
      },
    },
  }
}
