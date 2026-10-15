import {
  accountCodec,
  organizationCodec,
  tenant,
  tenantEquals,
  type TenantId,
} from '@omne-harness/legal-identity'

export const MODEL_SEND = 'model-send'

export type CredentialPurpose = typeof MODEL_SEND

declare const credentialIdBrand: unique symbol

export type CredentialId = string & { readonly [credentialIdBrand]: true }

export type CredentialReference = {
  readonly id: CredentialId
  readonly tenant: TenantId
  readonly purpose: CredentialPurpose
}

export type SendFace = {
  readonly authorized: boolean
  readonly official: boolean
}

export type Presence =
  | {
      readonly kind: 'known'
      readonly present: boolean
      readonly id: CredentialId
      readonly tenant: TenantId
      readonly purpose: CredentialPurpose
    }
  | { readonly kind: 'denied' }
  | { readonly kind: 'unavailable' }

export type Resolution =
  | { readonly kind: 'value'; readonly scope: 'tenant' | 'factory'; readonly value: string }
  | { readonly kind: 'absent' }
  | { readonly kind: 'unreadable' }
  | { readonly kind: 'denied' }
  | { readonly kind: 'unavailable' }

export type Diagnostic = {
  readonly stage: 'resolve'
  readonly outcome: Resolution['kind']
  readonly tenantMatch: boolean
}

export type CredentialPort = {
  present(reference: CredentialReference): Presence
  resolve(reference: CredentialReference, face: SendFace): Resolution
  diagnostics(): readonly Diagnostic[]
}

type Binding = {
  readonly id: CredentialId
  readonly tenant: TenantId
  readonly purpose: CredentialPurpose
  readonly secret: string
  readonly revoked: boolean
  readonly unreadable: boolean
}

export type CustodianState = {
  readonly closed: boolean
  readonly factorySecret: string
  readonly bindings: readonly Binding[]
}

export function credentialId(value: string): CredentialId | undefined {
  if (value.length === 0 || value.includes(' ')) return undefined
  return value as CredentialId
}

export function present(state: CustodianState, reference: CredentialReference): Presence {
  if (state.closed) return { kind: 'denied' }
  const binding = state.bindings.find(
    (item) => item.id === reference.id && tenantEquals(item.tenant, reference.tenant),
  )
  return {
    kind: 'known',
    present: binding !== undefined && !binding.revoked,
    id: reference.id,
    tenant: reference.tenant,
    purpose: reference.purpose,
  }
}

export function resolve(
  state: CustodianState,
  reference: CredentialReference,
  face: SendFace,
): Resolution {
  if (state.closed || !face.authorized || reference.purpose !== MODEL_SEND) return { kind: 'denied' }
  const binding = state.bindings.find((item) => item.id === reference.id)
  if (!binding) {
    const tenantHasBinding = state.bindings.some((item) =>
      tenantEquals(item.tenant, reference.tenant),
    )
    if (face.official && !tenantHasBinding) {
      return { kind: 'value', scope: 'factory', value: state.factorySecret }
    }
    return { kind: 'absent' }
  }
  if (
    !tenantEquals(binding.tenant, reference.tenant) ||
    binding.purpose !== reference.purpose ||
    binding.revoked
  ) {
    return { kind: 'denied' }
  }
  if (binding.unreadable) return { kind: 'unreadable' }
  return { kind: 'value', scope: 'tenant', value: binding.secret }
}

export type StoredTenant = {
  readonly organization: string
  readonly account: string
}

export type StoredBinding = {
  readonly id: string
  readonly tenant: StoredTenant
  readonly purpose: CredentialPurpose
  readonly secret: string
  readonly revoked: boolean
  readonly unreadable: boolean
}

export type StoredCustodian = {
  readonly closed: boolean
  readonly factorySecret: string
  readonly bindings: readonly StoredBinding[]
}

export function loadState(raw: unknown): CustodianState | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const body = raw as Partial<StoredCustodian>
  if (typeof body.closed !== 'boolean' || typeof body.factorySecret !== 'string') return undefined
  if (!Array.isArray(body.bindings)) return undefined
  const bindings: Binding[] = []
  for (const row of body.bindings) {
    const parsed = loadBinding(row)
    if (!parsed) return undefined
    bindings.push(parsed)
  }
  return { closed: body.closed, factorySecret: body.factorySecret, bindings }
}

export function storeState(state: CustodianState): StoredCustodian {
  return {
    closed: state.closed,
    factorySecret: state.factorySecret,
    bindings: state.bindings.map((item) => ({
      id: item.id,
      tenant: { organization: item.tenant.organization.text, account: item.tenant.account.text },
      purpose: item.purpose,
      secret: item.secret,
      revoked: item.revoked,
      unreadable: item.unreadable,
    })),
  }
}

function loadBinding(row: unknown): Binding | undefined {
  if (!row || typeof row !== 'object') return undefined
  const item = row as Partial<StoredBinding>
  if (typeof item.id !== 'string' || item.purpose !== MODEL_SEND) return undefined
  if (typeof item.secret !== 'string' || typeof item.revoked !== 'boolean') return undefined
  if (typeof item.unreadable !== 'boolean' || !item.tenant) return undefined
  const id = credentialId(item.id)
  const organization = organizationCodec.parse(item.tenant.organization)
  const account = accountCodec.parse(item.tenant.account)
  if (!id || !organization.ok || !account.ok) return undefined
  return {
    id,
    tenant: tenant(organization.value, account.value),
    purpose: item.purpose,
    secret: item.secret,
    revoked: item.revoked,
    unreadable: item.unreadable,
  }
}
