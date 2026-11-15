import {
  accountCodec,
  organizationCodec,
  tenant,
  tenantEquals,
  type TenantId,
} from '@omne-harness/legal-identity'
import type {
  SecretBindingKey,
  SecretLife,
  SecretScope,
  SecretTarget,
  SecretText,
} from '@omne-harness/settings'
import { encodeInstant, parseInstant, type Instant } from '@omne-harness/utc-instant'

export type SecretRecord = Readonly<{
  key: SecretBindingKey
  secret: SecretText
  life: SecretLife
  configuredAt: Instant | null
}>

export type SecretState = Readonly<{ bindings: readonly SecretRecord[] }>

export const FILE_VERSION = 2

type StoredScope =
  | Readonly<{ layer: 'official' }>
  | Readonly<{ layer: 'tenant'; tenant: Readonly<{ organization: string; account: string }> }>

type StoredBinding = Readonly<{
  scope: StoredScope
  target: SecretTarget
  purpose: string
  secret: string
  life: SecretLife
  configuredAt?: string
}>

export type StoredVault = Readonly<{
  version: typeof FILE_VERSION
  bindings: readonly StoredBinding[]
}>

export function isRecord(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function fieldOf(value: unknown, key: string): unknown {
  return isRecord(value) ? Reflect.get(value, key) : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function life(value: unknown): SecretLife | undefined {
  return value === 'active' || value === 'revoked' || value === 'unreadable' ? value : undefined
}

function storedSecretText(raw: string): SecretText | undefined {
  return raw === '' ? undefined : (raw as SecretText)
}

function secret(value: unknown): SecretText | undefined {
  return typeof value === 'string' ? storedSecretText(value) : undefined
}

function time(value: unknown): Instant | null | undefined {
  if (value === undefined) return null
  if (typeof value !== 'string') return undefined
  const parsed = parseInstant(value)
  return parsed.ok ? parsed.value : undefined
}

function tenantOf(row: unknown): TenantId | undefined {
  const organization = text(fieldOf(row, 'organization'))
  const account = text(fieldOf(row, 'account'))
  if (organization === undefined || account === undefined) return undefined
  const parsedOrganization = organizationCodec.parse(organization)
  const parsedAccount = accountCodec.parse(account)
  if (!parsedOrganization.ok || !parsedAccount.ok) return undefined
  return tenant(parsedOrganization.value, parsedAccount.value)
}

function scopeOf(row: unknown): SecretScope | undefined {
  const layer = fieldOf(row, 'layer')
  if (layer === 'official') return { layer: 'official' }
  if (layer !== 'tenant') return undefined
  const who = tenantOf(fieldOf(row, 'tenant'))
  return who === undefined ? undefined : { layer: 'tenant', tenant: who }
}

function targetOf(row: unknown): SecretTarget | undefined {
  const owner = text(fieldOf(row, 'owner'))
  const key = text(fieldOf(row, 'key'))
  if (!owner || key === undefined) return undefined
  return { owner, key }
}

function loadV2Binding(row: unknown): SecretRecord | undefined {
  const scope = scopeOf(fieldOf(row, 'scope'))
  const target = targetOf(fieldOf(row, 'target'))
  const purpose = text(fieldOf(row, 'purpose'))
  const value = secret(fieldOf(row, 'secret'))
  const state = life(fieldOf(row, 'life'))
  const configuredAt = time(fieldOf(row, 'configuredAt'))
  if (!scope || !target || !purpose || !value || !state || configuredAt === undefined)
    return undefined
  return { key: { scope, target, purpose }, secret: value, life: state, configuredAt }
}

function loadV2(raw: unknown): SecretState | undefined {
  const rows = fieldOf(raw, 'bindings')
  if (!Array.isArray(rows)) return undefined
  return collect([], rows, loadV2Binding)
}

function collect(
  bindings: SecretRecord[],
  rows: readonly unknown[],
  load: (row: unknown) => SecretRecord | undefined,
): SecretState | undefined {
  for (const row of rows) {
    const parsed = load(row)
    if (!parsed) return undefined
    if (bindings.some(item => sameKey(item.key, parsed.key))) return undefined
    bindings.push(parsed)
  }
  return { bindings }
}

export function loadState(raw: unknown): SecretState | undefined {
  if (!isRecord(raw)) return undefined
  const version = fieldOf(raw, 'version')
  if (version === FILE_VERSION) return loadV2(raw)
  return undefined
}

function storeScope(scope: SecretScope): StoredScope {
  return scope.layer === 'official'
    ? { layer: 'official' }
    : {
        layer: 'tenant',
        tenant: {
          organization: scope.tenant.organization.text,
          account: scope.tenant.account.text,
        },
      }
}

export function storeState(state: SecretState): StoredVault {
  return {
    version: FILE_VERSION,
    bindings: state.bindings.map(item => ({
      scope: storeScope(item.key.scope),
      target: { owner: item.key.target.owner, key: item.key.target.key },
      purpose: item.key.purpose,
      secret: item.secret,
      life: item.life,
      ...(item.configuredAt === null ? {} : { configuredAt: encodeInstant(item.configuredAt) }),
    })),
  }
}

export function sameScope(left: SecretScope, right: SecretScope): boolean {
  if (left.layer === 'official' || right.layer === 'official') return left.layer === right.layer
  return tenantEquals(left.tenant, right.tenant)
}

export function sameKey(left: SecretBindingKey, right: SecretBindingKey): boolean {
  return (
    sameScope(left.scope, right.scope) &&
    left.target.owner === right.target.owner &&
    left.target.key === right.target.key &&
    left.purpose === right.purpose
  )
}

export function isMintedScope(scope: SecretScope): boolean {
  return scope.layer === 'official' || tenantEquals(scope.tenant, scope.tenant)
}
