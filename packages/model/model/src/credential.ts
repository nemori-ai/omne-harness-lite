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
  const seen = new Set<string>()
  for (const row of body.bindings) {
    const parsed = loadBinding(row)
    if (!parsed) return undefined
    const key = `${parsed.id}:${parsed.tenant.organization.text}:${parsed.tenant.account.text}:${parsed.purpose}`
    if (seen.has(key)) return undefined
    seen.add(key)
    bindings.push(parsed)
  }
  return { closed: body.closed, factorySecret, bindings }
}

export function storeState(state: CustodianState): StoredCustodian {
  return {
    // A process close stays in memory. The next open reads the bindings.
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
  const stored = storedRow(row)
  if (!stored) return undefined
  const id = credentialId(stored.id)
  const organization = organizationCodec.parse(stored.organization)
  const account = accountCodec.parse(stored.account)
  if (!id || !organization.ok || !account.ok) return undefined
  return {
    id,
    tenant: tenant(organization.value, account.value),
    purpose: MODEL_SEND,
    secret: stored.secret,
    life: stored.life,
  }
}

function storedRow(row: unknown): {
  readonly id: string
  readonly secret: string
  readonly organization: string
  readonly account: string
  readonly life: BindingLife
} | undefined {
  const item = record(row)
  const tenantRow = item ? record(item.tenant) : undefined
  if (!item || !tenantRow) return undefined
  const id = text(item.id)
  const secret = text(item.secret)
  const organization = text(tenantRow.organization)
  const account = text(tenantRow.account)
  const life = bindingLife(item.life)
  if (!id || secret === undefined || item.purpose !== MODEL_SEND || !life) return undefined
  if (!organization || !account) return undefined
  return { id, secret, organization, account, life }
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
