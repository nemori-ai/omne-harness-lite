import { createHash } from 'node:crypto'
import type {
  AgentExecutionId,
  AgentJournalEntries,
  Failure,
  JournalEntryItem,
} from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  DurableEvidence,
  RunId,
  SessionEntriesChannel,
  SessionEntriesItem,
  SessionEntriesObservation,
  SessionEntriesProgress,
  SessionEntriesStart,
  SessionId,
  SessionOperationId,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { canonical } from '../testing/canonical.ts'

const ENTRY_PAGE = 256

export type WindowItem<E> = Readonly<{ sequence: string; entry: E }>

export async function entriesAfter<P>(
  read: AgentJournalEntries<P>['read'],
  input: Readonly<{ principal: P; tenant: TenantId; execution: AgentExecutionId }>,
  position: string | null,
): Promise<Outcome<readonly JournalEntryItem[], Failure>> {
  const found: JournalEntryItem[] = []
  let after = position
  for (;;) {
    const page = await read({ ...input, after, limit: ENTRY_PAGE })
    if ('failure' in page) return page
    found.push(...page.ok.items)
    if (page.ok.caughtUp) return succeed(found)
    after = page.ok.next
  }
}

export function savedProgress(
  work: WorkSnapshot,
  run: RunId,
  execution: string,
  channel: SessionEntriesChannel,
): SessionEntriesProgress | undefined {
  return work.entriesProgress?.find(
    item => item.run === run && item.execution === execution && item.channel === channel,
  )
}

export const progressOf = (saved: SessionEntriesProgress | undefined) =>
  saved === undefined ? null : { through: saved.through, interpreted: saved.interpreted }

export type EntriesBatch<E> = Readonly<{
  owner: string
  tag: string
  tenant: TenantId
  tenantText: string
  session: SessionId
  run: RunId
  execution: string
  channel: SessionEntriesChannel
  revision: string
  saved: SessionEntriesProgress | undefined
  window: readonly WindowItem<E>[]
  items: readonly SessionEntriesItem[]
}>

// The head a round read is the revision it was taken at and the channel entries after the saved
// position; the entries before that position were attested by the commits that saved it.
export function entriesBatch<E>(
  batch: EntriesBatch<E>,
): Readonly<{ observation: SessionEntriesObservation; start: SessionEntriesStart }> {
  const { tenantText, execution, revision, saved, window, items } = batch
  const after = BigInt(saved?.through ?? '0')
  const from = saved?.position ?? null
  const digest = createHash('sha256')
    .update(canonical([tenantText, execution, revision, from, window.map(item => item.entry)]))
    .digest('hex')
  const executionEvidence: DurableEvidence = {
    owner: batch.owner,
    record: execution,
    revision,
    digest,
  }
  const range = {
    session: batch.session,
    run: batch.run,
    execution,
    channel: batch.channel,
    after: after.toString(),
    through: (after + BigInt(items.length)).toString(),
    position: window[items.length - 1]!.sequence,
    boundary: {
      execution,
      channel: batch.channel,
      revision,
      executionEvidence,
      count: (after + BigInt(window.length)).toString(),
    },
    items,
  } satisfies Omit<SessionEntriesObservation, 'operation' | 'tenant'>
  const operation = createHash('sha256')
    .update(canonical([`${batch.tag}/1`, tenantText, range]))
    .digest('hex')
  return {
    observation: {
      ...range,
      tenant: batch.tenant,
      operation: `${batch.tag}_${operation}` as SessionOperationId,
    },
    start: saved === undefined ? { kind: 'initial' } : { kind: 'saved', progress: saved },
  }
}
