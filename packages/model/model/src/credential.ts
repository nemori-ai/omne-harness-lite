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

export type CredentialQuery = {
  readonly id: CredentialId
  readonly tenant: TenantId
  readonly purpose: string
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
  present(reference: CredentialQuery): Presence
  resolve(reference: CredentialQuery, face: SendFace): Resolution
  diagnostics(): readonly Diagnostic[]
}

type BindingLife = 'active' | 'revoked' | 'unreadable'

type Binding = {
  readonly id: CredentialId
  readonly tenant: TenantId
  readonly purpose: CredentialPurpose
  readonly secret: string
  readonly life: BindingLife
}

export type CustodianState = {
  readonly closed: boolean
  readonly factorySecret: string
  readonly bindings: readonly Binding[]
}

export function sameHolder(
  item: { readonly id: CredentialId; readonly tenant: TenantId },
  reference: CredentialQuery,
): boolean {
  return item.id === reference.id && tenantEquals(item.tenant, reference.tenant)
}

export function credentialId(value: string): CredentialId | undefined {
  if (value.length === 0 || value.includes(' ')) return undefined
  return value as CredentialId
}

export function present(state: CustodianState, reference: CredentialQuery): Presence {
  if (state.closed || reference.purpose !== MODEL_SEND) return { kind: 'denied' }
  const binding = state.bindings.find((item) => sameHolder(item, reference))
  return {
    kind: 'known',
    present: binding !== undefined,
    id: reference.id,
    tenant: reference.tenant,
    purpose: binding?.purpose ?? MODEL_SEND,
  }
}

export function resolve(
  state: CustodianState,
  reference: CredentialQuery,
  face: SendFace,
): Resolution {
  if (state.closed || !face.authorized || reference.purpose !== MODEL_SEND) return { kind: 'denied' }
  const binding = state.bindings.find((item) => sameHolder(item, reference))
  if (!binding) return missing(state, reference, face)
  if (binding.life === 'revoked') return { kind: 'denied' }
  if (binding.life === 'unreadable') return { kind: 'unreadable' }
  return { kind: 'value', scope: 'tenant', value: binding.secret }
}

function missing(state: CustodianState, reference: CredentialQuery, face: SendFace): Resolution {
  const heldByOther = state.bindings.some((item) => item.id === reference.id)
  if (heldByOther) return { kind: 'denied' }
  const tenantHasBinding = state.bindings.some((item) => tenantEquals(item.tenant, reference.tenant))
  if (face.official && !tenantHasBinding) {
    return { kind: 'value', scope: 'factory', value: state.factorySecret }
  }
  return { kind: 'absent' }
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
  readonly life: BindingLife
}

export type StoredCustodian = {
  readonly closed: boolean
  readonly factorySecret: string
  readonly bindings: readonly StoredBinding[]
}

export function loadState(raw: unknown): CustodianState | undefined {
  const body = record(raw)
  if (!body) return undefined
  const factorySecret = text(body.factorySecret)
  if (typeof body.closed !== 'boolean' || factorySecret === undefined) return undefined
  if (!Array.isArray(body.bindings)) return undefined
  const bindings: Binding[] = []
  for (const row of body.bindings) {
    const parsed = loadBinding(row)
    if (!parsed) return undefined
    bindings.push(parsed)
  }
  return { closed: body.closed, factorySecret, bindings }
}

export function storeState(state: CustodianState): StoredCustodian {
  return {
    closed: false,
    factorySecret: state.factorySecret,
    bindings: state.bindings.map((item) => ({
      id: item.id,
      tenant: { organization: item.tenant.organization.text, account: item.tenant.account.text },
      purpose: item.purpose,
      secret: item.secret,
      life: item.life,
    })),
  }
}

function loadBinding(row: unknown): Binding | undefined {
  const item = record(row)
  const tenantRow = item ? record(item.tenant) : undefined
  if (!item || !tenantRow) return undefined
  const idText = text(item.id)
  const secret = text(item.secret)
  const organizationText = text(tenantRow.organization)
  const accountText = text(tenantRow.account)
  const life = bindingLife(item.life)
  if (!idText || secret === undefined || item.purpose !== MODEL_SEND || !life) return undefined
  if (!organizationText || !accountText) return undefined
  const id = credentialId(idText)
  const organization = organizationCodec.parse(organizationText)
  const account = accountCodec.parse(accountText)
  if (!id || !organization.ok || !account.ok) return undefined
  return {
    id,
    tenant: tenant(organization.value, account.value),
    purpose: MODEL_SEND,
    secret,
    life,
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function bindingLife(value: unknown): BindingLife | undefined {
  if (value === 'active' || value === 'revoked' || value === 'unreadable') return value
  return undefined
}
