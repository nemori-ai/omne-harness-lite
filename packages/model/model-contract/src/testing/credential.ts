import { tenantEquals } from '@omne-harness/legal-identity'
import {
  MODEL_SEND,
  type CredentialPort,
  type CredentialQuery,
  type CredentialReference,
  type CredentialResolution,
} from '../credential.ts'
import { sameCredentialHolder } from '../credential-values.ts'
import type { CredentialConformanceControls } from '../conformance/credential-types.ts'

export type ScriptedCredentialPortOptions = Readonly<{ factorySecret: string }>
export type ScriptedCredentialPort<P = unknown> = Readonly<{
  port: CredentialPort<P>
  controls: CredentialConformanceControls
}>

export function createScriptedCredentialPort<P = unknown>(
  options: ScriptedCredentialPortOptions,
): ScriptedCredentialPort<P> {
  type Binding = CredentialReference &
    Readonly<{
      secret: string
      life: 'active' | 'revoked' | 'unreadable'
    }>
  let bindings: Binding[] = []
  let closed = false
  let unavailable = false

  function gate(query: CredentialQuery): 'denied' | 'unavailable' | undefined {
    if (closed || query.purpose !== MODEL_SEND || !tenantEquals(query.tenant, query.tenant)) {
      return 'denied'
    }
    return unavailable ? 'unavailable' : undefined
  }

  function presence(query: CredentialQuery, qualified: boolean) {
    const refusal = gate(query)
    if (refusal) return { kind: refusal }
    const bound = bindings.some(binding => sameCredentialHolder(binding, query))
    if (qualified && !bound && bindings.some(binding => binding.id === query.id)) {
      return { kind: 'denied' } as const
    }
    return {
      kind: 'known',
      present: bound,
      id: query.id,
      tenant: query.tenant,
      purpose: MODEL_SEND,
    } as const
  }

  function resolution(query: CredentialQuery, official: boolean): CredentialResolution {
    const refusal = gate(query)
    if (refusal) return { kind: refusal }
    const binding = bindings.find(item => sameCredentialHolder(item, query))
    if (binding) {
      switch (binding.life) {
        case 'active':
          return { kind: 'value', scope: 'tenant', value: binding.secret }
        case 'revoked':
          return { kind: 'denied' }
        case 'unreadable':
          return { kind: 'unreadable' }
      }
    }
    if (bindings.some(item => item.id === query.id)) return { kind: 'denied' }
    const tenantHasBinding = bindings.some(item => tenantEquals(item.tenant, query.tenant))
    return official && !tenantHasBinding
      ? { kind: 'value', scope: 'factory', value: options.factorySecret }
      : { kind: 'absent' }
  }

  function change(reference: CredentialReference, update: (binding: Binding) => Binding) {
    bindings = bindings.map(binding =>
      sameCredentialHolder(binding, reference) ? update(binding) : binding,
    )
  }

  return {
    port: {
      present: query => presence(query, false),
      resolve: (query, face) =>
        face.authorized ? resolution(query, face.official) : { kind: 'denied' },
      presentFor: query => presence({ ...query, tenant: query.access.tenant }, true),
      resolveFor: query => resolution({ ...query, tenant: query.access.tenant }, query.official),
    },
    controls: {
      bind(reference, secret) {
        if (!tenantEquals(reference.tenant, reference.tenant))
          throw new TypeError('invalid binding tenant')
        bindings = [
          ...bindings.filter(binding => !sameCredentialHolder(binding, reference)),
          { ...reference, secret, life: 'active' },
        ]
      },
      rotate: (reference, secret) => change(reference, binding => ({ ...binding, secret })),
      revoke: reference => change(reference, binding => ({ ...binding, life: 'revoked' })),
      markUnreadable: reference =>
        change(reference, binding =>
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
