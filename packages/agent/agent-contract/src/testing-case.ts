// Shared parts of the `./testing` entry: the case shape of a conformance suite, the canonical text
// that compares two plain values, and the evidence that a non-durable double writes.
import { createHash } from 'node:crypto'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { DurableEvidence } from './identity.ts'

/**
 * One case of a conformance suite. `run` resolves when the provider keeps the rule of the case
 * and rejects with a `node:assert` AssertionError when it does not. A suite does not depend on a
 * test framework.
 */
export type ConformanceCase = Readonly<{ name: string; run: () => Promise<void> }>

/**
 * The canonical text of a plain data value: object keys sorted, array order kept. Two values with
 * the same text are the same content. A value that is not plain data has no meaning here.
 */
export function canonicalText(value: unknown): string {
  return JSON.stringify(value, (_key, member: unknown) => {
    if (typeof member !== 'object' || member === null || Array.isArray(member)) return member
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(member).sort()) {
      sorted[key] = (member as Readonly<Record<string, unknown>>)[key]
    }
    return sorted
  })
}

/** The text of a tenant that legal-identity minted, for a map key of a double. */
export function tenantText(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('the tenant was not minted by legal-identity')
  return encoded.value
}

/** Evidence that a non-durable double writes for one record. The digest covers `record`. */
export function doubleEvidence(owner: string, record: string, revision: string): DurableEvidence {
  const digest = createHash('sha256').update(record).digest('hex')
  return Object.freeze({ owner, record, revision, digest })
}
