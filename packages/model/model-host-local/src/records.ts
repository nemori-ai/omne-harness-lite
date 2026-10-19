import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import type { Binding, BindingLife, CustodianState } from '@omne-harness/model'
import {
  MODEL_SEND,
  decodeCredentialId,
  type CredentialPurpose,
} from '@omne-harness/model-contract'
import { fieldOf } from './fields.ts'

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
  const closed = fieldOf(raw, 'closed')
  const factorySecret = text(fieldOf(raw, 'factorySecret'))
  const rows = fieldOf(raw, 'bindings')
  if (typeof closed !== 'boolean' || factorySecret === undefined) return undefined
  if (!Array.isArray(rows)) return undefined
  const bindings: Binding[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const parsed = loadBinding(row)
    if (!parsed) return undefined
    const key = `${parsed.id}:${parsed.tenant.organization.text}:${parsed.tenant.account.text}:${parsed.purpose}`
    if (seen.has(key)) return undefined
    seen.add(key)
    bindings.push(parsed)
  }
  return { closed, factorySecret, bindings }
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
  const tenantRow = fieldOf(row, 'tenant')
  const id = text(fieldOf(row, 'id'))
  const secret = text(fieldOf(row, 'secret'))
  const organization = text(fieldOf(tenantRow, 'organization'))
  const account = text(fieldOf(tenantRow, 'account'))
  const life = bindingLife(fieldOf(row, 'life'))
  if (!id || secret === undefined || fieldOf(row, 'purpose') !== MODEL_SEND || !life)
    return undefined
  if (!organization || !account) return undefined
  return { id, secret, organization, account, life }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function bindingLife(value: unknown): BindingLife | undefined {
  if (value === 'active' || value === 'revoked' || value === 'unreadable') return value
  return undefined
}
