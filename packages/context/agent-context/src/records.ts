// The records that agent-context mints: durable evidence whose `record` is a self-describing key.
// A key names the tenant, the scope, the execution and the execution attachment it belongs to, the
// instance that minted it, and a sequence number. Any instance can read the key; only the minting
// instance holds the material that the key points to.
import { createHash } from 'node:crypto'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { Adoption, DurableEvidence } from '@omne-harness/request-context-contract'

/** Canonical data text: object keys sorted, array order kept, undefined members left out. */
export function canonical(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value)
    .filter(([, member]) => member !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, member]) => `${JSON.stringify(name)}:${canonical(member)}`)
    .join(',')}}`
}

export function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('base64url')
}

/** The tenant as text, or null for a tenant that legal-identity did not mint. */
export function tenantText(tenant: TenantId): string | null {
  const encoded = tenantCodec.encode(tenant)
  return encoded.ok ? encoded.value : null
}

export type RecordKind =
  | 'read-source'
  | 'read-coverage'
  | 'preparation'
  | 'coverage'
  | 'budget'
  | 'original'
  | 'plan'
  | 'step'
  | 'transition'

/** What a record key says about itself. */
export type RecordKey = Readonly<{
  kind: RecordKind
  tenant: string
  scope: string
  execution: string
  attachment: string
  instance: string
  sequence: number
}>

const KINDS: readonly RecordKind[] = [
  'read-source',
  'read-coverage',
  'preparation',
  'coverage',
  'budget',
  'original',
  'plan',
  'step',
  'transition',
]
const TEXT_FIELDS = ['tenant', 'scope', 'execution', 'attachment', 'instance'] as const

/** The owner text of the evidence that one adoption identity mints. */
export function ownerText(owner: Adoption): string {
  return `agent-context:${canonical(owner)}`
}

export function mintRecord(owner: Adoption, key: RecordKey, content: unknown): DurableEvidence {
  return {
    owner: ownerText(owner),
    record: canonical(key),
    revision: '1',
    digest: digest(content),
  }
}

function isKind(value: unknown): value is RecordKind {
  return KINDS.some(kind => kind === value)
}

/**
 * Reads the key of evidence that this owner minted. Evidence of another owner, or a record that is
 * not a key, gives null: such evidence is not ours to interpret.
 */
export function readRecord(owner: Adoption, evidence: DurableEvidence): RecordKey | null {
  if (evidence.owner !== ownerText(owner)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(evidence.record)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const fields = new Map<string, unknown>(Object.entries(parsed))
  if (fields.size !== TEXT_FIELDS.length + 2) return null
  const kind = fields.get('kind')
  const sequence = fields.get('sequence')
  if (!isKind(kind) || typeof sequence !== 'number' || !Number.isSafeInteger(sequence)) return null
  const text = (name: (typeof TEXT_FIELDS)[number]) => {
    const value = fields.get(name)
    return typeof value === 'string' ? value : null
  }
  const [tenant, scope, execution, attachment, instance] = TEXT_FIELDS.map(text)
  if (!tenant || !scope || !execution || !attachment || !instance) return null
  return { kind, tenant, scope, execution, attachment, instance, sequence }
}
