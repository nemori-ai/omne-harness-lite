import { AssertionError } from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { AgentEvent, CommandReceipt } from './execution.ts'
import type { Adoption, Authority, DurableEvidence } from './identity.ts'
import type { AgentJournalEntry } from './receiving.ts'

export type ConformanceCase =
  | Readonly<{ name: string; run: () => Promise<void> }>
  | Readonly<{ name: string; uncovered: string; run: () => Promise<never> }>

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

export const DOUBLE_EVENT_SCHEMA: Adoption = Object.freeze({
  owner: 'double',
  name: 'agent-event',
  revision: '1',
  digest: 'double:agent-event',
})

export type ProjectingExecution = Readonly<{
  authority: Authority
  ended: boolean
  events: AgentEvent[]
}>

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

export function tenantText(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('the tenant was not minted by legal-identity')
  return encoded.value
}

export function doubleEvidence(owner: string, record: string, revision: string): DurableEvidence {
  const digest = createHash('sha256').update(record).digest('hex')
  return Object.freeze({ owner, record, revision, digest })
}
