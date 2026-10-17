import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import {
  MODEL_SEND,
  sameCredentialHolder,
  type CredentialId,
  type CredentialPresence,
  type CredentialPurpose,
  type CredentialQuery,
  type CredentialResolution,
  type SendFace,
} from '@omne-harness/model-contract'

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

export function judgePresence(
  state: CustodianState,
  reference: CredentialQuery,
): CredentialPresence {
  if (state.closed || reference.purpose !== MODEL_SEND) return { kind: 'denied' }
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
  if (state.closed || !face.authorized || reference.purpose !== MODEL_SEND)
    return { kind: 'denied' }
  const binding = state.bindings.find(item => sameCredentialHolder(item, reference))
  if (!binding) return missing(state, reference, face)
  if (binding.life === 'revoked') return { kind: 'denied' }
  if (binding.life === 'unreadable') return { kind: 'unreadable' }
  return { kind: 'value', scope: 'tenant', value: binding.secret }
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
    return { kind: 'value', scope: 'factory', value: state.factorySecret }
  }
  return { kind: 'absent' }
}
