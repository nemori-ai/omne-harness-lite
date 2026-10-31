import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { type CredentialId } from '@omne-harness/model-contract'
import {
  MODEL_SEND,
  sameCredentialHolder,
  type CredentialPresence,
  type CredentialPurpose,
  type CredentialQuery,
  type CredentialResolution,
  type SendFace,
} from '@omne-harness/model-contract/provider'

export type BindingLife = 'active' | 'revoked' | 'unreadable'

export type Binding = {
  readonly id: CredentialId
  readonly tenant: TenantId
  readonly purpose: CredentialPurpose
  readonly secret: string
  readonly life: BindingLife
}

/** What a custodian hands to the judgment: it decides from this snapshot and reads nothing else. */
export type CustodianState = {
  readonly closed: boolean
  readonly factorySecret: string
  readonly bindings: readonly Binding[]
}

// legal-identity has no separate mint check; equality with itself holds only for a minted tenant.
// A copied tenant would otherwise look like a tenant without bindings and be offered the factory secret.
function isMinted(tenant: TenantId): boolean {
  return tenantEquals(tenant, tenant)
}

/**
 * The denials that need no binding: an unminted tenant, a closed store, a purpose other than
 * sending, and for a send an unauthorized face. A custodian can answer these before it reads
 * its storage, so an unreadable store still denies what it would never have served.
 */
export function judgeGate(
  state: Pick<CustodianState, 'closed'>,
  reference: CredentialQuery,
  face?: SendFace,
): { readonly kind: 'denied' } | undefined {
  if (!isMinted(reference.tenant) || state.closed || reference.purpose !== MODEL_SEND)
    return { kind: 'denied' }
  if (face !== undefined && !face.authorized) return { kind: 'denied' }
  return undefined
}

export function judgePresence(
  state: CustodianState,
  reference: CredentialQuery,
): CredentialPresence {
  const gate = judgeGate(state, reference)
  if (gate) return gate
  const binding = state.bindings.find(item => sameCredentialHolder(item, reference))
  return {
    kind: 'known',
    present: binding !== undefined,
    id: reference.id,
    tenant: reference.tenant,
    purpose: binding?.purpose ?? MODEL_SEND,
  }
}

export function judgeResolution(
  state: CustodianState,
  reference: CredentialQuery,
  face: SendFace,
): CredentialResolution {
  const gate = judgeGate(state, reference, face)
  if (gate) return gate
  const binding = state.bindings.find(item => sameCredentialHolder(item, reference))
  if (!binding) return missing(state, reference, face)
  switch (binding.life) {
    case 'revoked':
      return { kind: 'denied' }
    case 'unreadable':
      return { kind: 'unreadable' }
    case 'active':
      return { kind: 'value', scope: 'tenant', value: binding.secret }
    default: {
      const unhandled: never = binding.life
      throw new Error(`unhandled binding life ${String(unhandled)}`)
    }
  }
}

function missing(
  state: CustodianState,
  reference: CredentialQuery,
  face: SendFace,
): CredentialResolution {
  const heldByOther = state.bindings.some(item => item.id === reference.id)
  if (heldByOther) return { kind: 'denied' }
  const tenantHasBinding = state.bindings.some(item => tenantEquals(item.tenant, reference.tenant))
  if (face.official && !tenantHasBinding) {
    // A binding holder that equals nobody could belong to the asking tenant, so "no binding" is unproven.
    if (state.bindings.some(item => !isMinted(item.tenant))) return { kind: 'denied' }
    return { kind: 'value', scope: 'factory', value: state.factorySecret }
  }
  return { kind: 'absent' }
}
