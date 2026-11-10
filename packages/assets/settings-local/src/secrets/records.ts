// The disk form of the secret vault and its reading. Version 2 is what this code writes. A file
// without a version is the vault the Model host wrote before custody moved here; it is read into
// the same bindings and rewritten as version 2 on the first write. The reading refuses a file
// that does not fit either shape: the whole file is then `corrupt`, nothing is repaired. A stored
// secret is taken as the file holds it: the boundary that wrote it checked it then (the Model host
// asked only for a non-empty string), and the consumer of the binding gets back the same bytes.
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

/** One binding as the vault keeps it in memory: the key, the secret, its life and its time. */
export type SecretRecord = Readonly<{
  key: SecretBindingKey
  secret: SecretText
  life: SecretLife
  configuredAt: Instant | null
}>

export type SecretState = Readonly<{ bindings: readonly SecretRecord[] }>

/** The version this code writes. */
export const FILE_VERSION = 2

/**
 * How the pre-version file maps into bindings. That file was the Model host's vault: its factory
 * secret becomes the official binding of the Model factory target, and each row becomes a tenant
 * binding of the Model target named by the row's credential id; the purpose is the one that file
 * always held. The Model host names the same target on its side.
 */
export const V1_MODEL_OWNER = 'model'
export const V1_MODEL_PURPOSE = 'model-send'
export const V1_MODEL_FACTORY_KEY = 'factory default'

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

/**
 * The secret as the file holds it. Only the reading of a stored record makes a `SecretText` this
 * way: a non-empty string is accepted as it is, without the rules `parseSecretText` applies to new
 * text. An older writer may have stored whitespace around the text, a control character or a
 * longer text, and the binding's consumer needs those bytes back, not a `corrupt` vault.
 */
function storedSecretText(raw: string): SecretText | undefined {
  return raw === '' ? undefined : (raw as SecretText)
}

function secret(value: unknown): SecretText | undefined {
  return typeof value === 'string' ? storedSecretText(value) : undefined
}

/** Absent is an old row without a time. Present but not an instant text is corrupt: `undefined`. */
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

function loadV1Binding(row: unknown): SecretRecord | undefined {
  const id = text(fieldOf(row, 'id'))
  const who = tenantOf(fieldOf(row, 'tenant'))
  const value = secret(fieldOf(row, 'secret'))
  const state = life(fieldOf(row, 'life'))
  const configuredAt = time(fieldOf(row, 'configuredAt'))
  if (!id || !who || !value || !state || configuredAt === undefined) return undefined
  if (fieldOf(row, 'purpose') !== V1_MODEL_PURPOSE) return undefined
  return {
    key: {
      scope: { layer: 'tenant', tenant: who },
      target: { owner: V1_MODEL_OWNER, key: id },
      purpose: V1_MODEL_PURPOSE,
    },
    secret: value,
    life: state,
    configuredAt,
  }
}

function loadV1(raw: unknown): SecretState | undefined {
  const closed = fieldOf(raw, 'closed')
  const factorySecret = text(fieldOf(raw, 'factorySecret'))
  const rows = fieldOf(raw, 'bindings')
  if (typeof closed !== 'boolean' || factorySecret === undefined || !Array.isArray(rows))
    return undefined
  const bindings: SecretRecord[] = []
  if (factorySecret !== '') {
    // An empty factory secret is no deployment default, so no binding.
    const value = secret(factorySecret)
    if (!value) return undefined
    bindings.push({
      key: {
        scope: { layer: 'official' },
        target: { owner: V1_MODEL_OWNER, key: V1_MODEL_FACTORY_KEY },
        purpose: V1_MODEL_PURPOSE,
      },
      secret: value,
      life: 'active',
      configuredAt: null,
    })
  }
  return collect(bindings, rows, loadV1Binding)
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

/** Reads a parsed file. `undefined` is a file this code cannot read as a vault: corrupt. */
export function loadState(raw: unknown): SecretState | undefined {
  if (!isRecord(raw)) return undefined
  const version = fieldOf(raw, 'version')
  if (version === undefined) return loadV1(raw)
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

// legal-identity has no separate mint check; equality with itself holds only for a minted tenant.
// A copied tenant matches no stored row, and a write under it would re-mint it from text on the
// next read, so every face refuses it before the lock or the file is touched.
export function isMintedScope(scope: SecretScope): boolean {
  return scope.layer === 'official' || tenantEquals(scope.tenant, scope.tenant)
}
