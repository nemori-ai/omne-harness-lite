import type { DurableEvidence } from '@omne-harness/agent-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type {
  SessionControlEvidence,
  SessionId,
  SessionLogConsequence,
} from '@omne-harness/session-contract'
import type { DomainRef, SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'
import { readEvents, readerOf, type Reader } from './journal-read.ts'

export type InterpretableEvent = Readonly<{
  sequence: string
  source: DurableEvidence
  consequences: readonly SessionLogConsequence[] | null
  control: SessionControlEvidence | null
}>

export type ExecutionInterpretation = Readonly<{
  revision: string
  head: DurableEvidence
  emittedThrough: string
  events: readonly InterpretableEvent[]
}>

export type InterpretationRead =
  | Readonly<{ kind: 'read'; execution: ExecutionInterpretation | null }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

type DomainResolution =
  | Readonly<{ kind: 'ready'; domain: DomainRef }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export async function resolveDomain(
  lookup: TenantDomainLookup,
  tenant: string,
): Promise<DomainResolution> {
  let found
  try {
    found = await lookup.lookup({ tenant })
  } catch (error) {
    return { kind: 'unavailable', diagnostic: `the tenant domain lookup threw: ${String(error)}` }
  }
  if (found.kind === 'ready') return { kind: 'ready', domain: found.domain }
  return {
    kind: 'unavailable',
    diagnostic:
      found.kind === 'unregistered' ? 'the tenant has no transaction domain' : found.diagnostic,
  }
}

export type JournalStateSource = Readonly<{
  storage: SqlStorage
  tenantDomainLookup: TenantDomainLookup
}>

type Resolved = Readonly<{ domain: DomainRef; tenant: string; read: Reader }>

export async function resolvedOf(
  options: JournalStateSource,
  tenant: TenantId,
): Promise<Resolved | Readonly<{ kind: 'unavailable'; diagnostic: string }>> {
  const text = tenantCodec.encode(tenant)
  if (!text.ok)
    return { kind: 'unavailable', diagnostic: 'the tenant was not minted by legal-identity' }
  const resolved = await resolveDomain(options.tenantDomainLookup, text.value)
  if (resolved.kind === 'unavailable') return resolved
  return {
    domain: resolved.domain,
    tenant: text.value,
    read: readerOf(options.storage, resolved.domain),
  }
}

export async function readExecutionInterpretation(
  options: JournalStateSource,
  target: Readonly<{ tenant: TenantId; session: SessionId; execution: string; after: string }>,
): Promise<InterpretationRead> {
  const resolved = await resolvedOf(options, target.tenant)
  if ('kind' in resolved) return resolved
  const read = await readEvents(
    resolved.read,
    { tenant: resolved.tenant, session: target.session },
    target.execution,
    target.after,
  )
  if (read.kind === 'absent') return { kind: 'read', execution: null }
  if (read.kind === 'unavailable') return read
  return {
    kind: 'read',
    execution: {
      revision: read.revision,
      head: read.receipt as unknown as DurableEvidence,
      emittedThrough: read.emittedThrough,
      events: read.events.map(event => ({
        sequence: event.sequence,
        source: event.source as unknown as DurableEvidence,
        consequences: event.consequences as unknown as readonly SessionLogConsequence[] | null,
        control: event.control as unknown as SessionControlEvidence | null,
      })),
    },
  }
}
