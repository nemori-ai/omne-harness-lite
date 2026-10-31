// Shared parts of the `./testing` entry: the case shape of a conformance suite, the canonical text
// that compares two plain values, the evidence that a non-durable double writes, and the rule by
// which a double projects a written entry as its `entry` event.
import { AssertionError } from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { AgentEvent, CommandReceipt } from './execution.ts'
import type { Adoption, Authority, DurableEvidence } from './identity.ts'
import type { AgentJournalEntry } from './receiving.ts'

/**
 * One case of a conformance suite. `run` resolves when the provider keeps the rule of the case
 * and rejects with a `node:assert` AssertionError when it does not. A suite does not depend on a
 * test framework.
 *
 * A case the fixture cannot drive, because it lacks an optional control the case needs, carries
 * `uncovered`. It proves nothing about the provider: a runner reports it as not covered, and its
 * `run` always rejects, so a runner that ignores the field shows red instead of a silent pass.
 */
export type ConformanceCase =
  | Readonly<{ name: string; run: () => Promise<void> }>
  | Readonly<{ name: string; uncovered: string; run: () => Promise<never> }>

/** The case of a rule that the fixture cannot drive because it lacks `capability`. */
export function uncoveredCase(name: string, capability: string): ConformanceCase {
  const uncovered = `uncovered: the fixture has no ${capability}`
  return {
    name,
    uncovered,
    run: async () => {
      throw new AssertionError({ message: uncovered })
    },
  }
}

/**
 * The schema of every event a double allocates. A double fixes it when it is created, before any
 * execution exists, so every event of every execution carries the same one (SPEC "事件身份与序号").
 * A provider declares its own.
 */
export const DOUBLE_EVENT_SCHEMA: Adoption = Object.freeze({
  owner: 'double',
  name: 'agent-event',
  revision: '1',
  digest: 'double:agent-event',
})

/** The part of a double's execution record that the projection of an entry reads and writes. */
export type ProjectingExecution = Readonly<{
  /** The latest established attachment, also when it has been detached. */
  authority: Authority
  ended: boolean
  events: AgentEvent[]
}>

/**
 * Projects a written entry as one `entry` event of the same write (SPEC "日志条目" 6): the next
 * sequence, the latest established attachment, the schema of the double, and the evidence of the
 * receipt as cause. After the end the entry is written alone: ended stays the last event.
 */
export function projectEntryEvent(
  execution: ProjectingExecution,
  entry: AgentJournalEntry,
  receipt: CommandReceipt,
): void {
  if (execution.ended) return
  execution.events.push({
    execution: receipt.execution,
    sequence: String(execution.events.length + 1),
    executionAttachment: execution.authority.executionAttachment,
    schema: DOUBLE_EVENT_SCHEMA,
    cause: receipt.evidence,
    body: { kind: 'entry', entry: structuredClone(entry) },
  })
}

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
