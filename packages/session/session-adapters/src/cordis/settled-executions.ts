import { randomUUID } from 'node:crypto'
import type {
  AgentExecutionId,
  AgentJournal,
  DurableEvidence,
  ExecutionRevision,
} from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { succeed } from '@omne-harness/operation-result'
import type { SessionId } from '@omne-harness/session-contract'
import {
  EXECUTION_RECORD_HANDLERS,
  decodeExecutionRecordRetired,
  decodeExecutionSweepReply,
  executionRecordSweepFacts,
} from '@omne-harness/session-storage-sql/participants'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import { commitJournal, type GenerationMemory, type JournalCombination } from '../journal-commit.ts'
import type { SessionJournalView } from '../journal/index.ts'
import { SharedMap } from '../journal/shared-map.ts'
import { readerOf, type OperationRead } from './journal-read.ts'

export type TenantSweepOptions = Readonly<{
  storage: SqlStorage
  combination: JournalCombination
  generations: GenerationMemory
  published?:
    | ((tenant: TenantId, session: SessionId, execution: AgentExecutionId) => void)
    | undefined
}>

export function createTenantSweep(
  options: TenantSweepOptions,
): (tenant: TenantId, tenantText: string, domain: DomainRef) => Promise<void> {
  const opened = new Map<string, Promise<void>>()

  async function sweep(tenant: TenantId, tenantText: string, domain: DomainRef): Promise<boolean> {
    const output = await readerOf(options.storage, domain)(EXECUTION_RECORD_HANDLERS.retired, {
      tenant: tenantText,
    })
    const retired = output.kind === 'read' ? decodeExecutionRecordRetired(output.output) : null
    if (retired === null) return false
    for (const { session, execution } of retired.waiting)
      try {
        options.published?.(tenant, session as SessionId, execution as AgentExecutionId)
      } catch {}
    if (!retired.settled) return true
    const outcome = await commitJournal({
      storage: options.storage,
      domain,
      combination: options.combination,
      operation: `sweep_${randomUUID()}`,
      recall: 'never',
      commands: [executionRecordSweepFacts(tenant)],
      generations: options.generations,
    })
    if (outcome.kind !== 'committed') return false
    const entry = outcome.receipt.responses.find(item => item.participant === 'execution-record')
    return entry !== undefined && decodeExecutionSweepReply(entry.reply).kind === 'swept'
  }

  return async (tenant, tenantText, domain) => {
    let open = opened.get(tenantText)
    if (open === undefined) {
      open = sweep(tenant, tenantText, domain).then(done => {
        if (!done) opened.delete(tenantText)
      })
      opened.set(tenantText, open)
    }
    await open
  }
}

export type SettledBook = {
  view: SessionJournalView
  readonly full: Readonly<{ delete(key: string): unknown }>
  readonly loaded: Set<string>
  readonly settled: Set<string>
  readonly origins: Readonly<{ keys(): Iterable<string>; delete(key: string): unknown }>
}

export function forget(book: SettledBook, execution: string): void {
  book.full.delete(execution)
  book.loaded.delete(execution)
  book.settled.add(execution)
  for (const key of book.origins.keys())
    if (key.startsWith(`${execution}\0`)) book.origins.delete(key)
}

export function evict(book: SettledBook, execution: AgentExecutionId): void {
  const executions = new SharedMap(book.view.executions)
  executions.delete(execution)
  book.view = { ...book.view, executions }
  forget(book, execution)
}

type Query<P> = AgentJournal<P>['query']

export function reclaimedCommit<P>(
  input: Parameters<Query<P>>[0],
  found: Extract<OperationRead, { kind: 'reclaimed' }>,
): Awaited<ReturnType<Query<P>>> | null {
  if (found.published !== found.tombstone.settled) return null
  return succeed({
    kind: 'committed',
    receipt: {
      operation: input.operation,
      execution: input.execution,
      revision: found.tombstone.revision as ExecutionRevision,
      evidence: found.tombstone.receipt as unknown as DurableEvidence,
      state: 'applied',
    },
  })
}
