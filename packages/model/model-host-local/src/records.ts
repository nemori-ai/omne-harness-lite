import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import type { Binding, BindingLife, CustodianState } from '@omne-harness/model'
import {
  MODEL_SEND,
  decodeCredentialId,
  type CredentialPurpose,
} from '@omne-harness/model-contract'

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
    bindings: state.bindings.map(item => ({
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
  const id = decodeCredentialId(stored.id)
  const organization = organizationCodec.parse(stored.organization)
  const account = accountCodec.parse(stored.account)
  if (!('ok' in id) || !organization.ok || !account.ok) return undefined
  return {
    id: id.ok,
    tenant: tenant(organization.value, account.value),
    purpose: MODEL_SEND,
    secret: stored.secret,
    life: stored.life,
  }
}

function storedRow(row: unknown):
  | {
      readonly id: string
      readonly secret: string
      readonly organization: string
      readonly account: string
      readonly life: BindingLife
    }
  | undefined {
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
