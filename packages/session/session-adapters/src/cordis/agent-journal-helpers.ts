import {
  type Book,
  OWNER,
  type Settled,
  type Scratch,
  type Written,
  fetchNamed,
  listedDigests,
  projectionContext,
  refsIn,
  unavailable,
} from './agent-journal-base.ts'
import { checkpointOf } from '../journal/decide.ts'
import { keepCurrentExecution } from './journal-current-read.ts'
import { createHash } from 'node:crypto'
import type {
  AgentExecutionId,
  AgentOperationId,
  CommandReceipt,
  Failure,
} from '@omne-harness/agent-contract'
import { fail } from '@omne-harness/operation-result'
import { type ExecutionAdmissionRecord } from '@omne-harness/session-storage-sql/participants'
import { type ParticipationKind } from '../journal/index.ts'
import { operationText, type MemoryExecution } from '../testing/journal.ts'
import { type CommonRoot, type JournalCell } from '../testing/root.ts'
import { blobRowDigest, factDigestOf } from './journal-batch.ts'
import { type ProjectedRecords } from '../testing/journal-records.ts'
import { type Reader } from './journal-read.ts'
import { attemptOfGrant } from './attempt-grant.ts'

// Helpers of the Session log Journal that read none of its state.

export function putBack<P>(book: Book<P>, cell: JournalCell<P>): void {
  if (book.held.size === 0) return
  cell.mutate(() => {
    const root = cell.state()
    for (const [at, held] of book.held) {
      if (held.custody !== null) {
        const found = [...root.agent.executions].find(([, item]) => item.id === held.execution)
        if (found !== undefined) {
          const [key, execution] = found
          const custodyAttempts = new Map(execution.custodyAttempts)
          custodyAttempts.set(held.operation, held.custody)
          root.agent.executions.set(key, { ...execution, custodyAttempts })
        }
      }
      if (root.agent.operations.has(at)) continue
      if (held.standing === 'unknown') {
        root.agent.operations.set(at, {
          kind: 'pending',
          key: held.key,
          tenant: book.tenant,
          execution: held.execution,
          operation: held.operation,
          run: () => undefined,
        })
        continue
      }
      const record = `${cell.namespace}/${held.execution}/excluded/${held.operation}/dropped`
      root.agent.operations.set(at, {
        kind: 'excluded',
        key: held.key,
        execution: held.execution,
        operation: held.operation,
        reason: 'dropped',
        evidence: {
          owner: OWNER,
          record,
          revision: '0',
          digest: `sha256:${createHash('sha256').update(record).digest('hex')}`,
        },
      })
    }
    cell.touch()
  })
}

export function retainCurrent<P>(book: Book<P>): void {
  const context = projectionContext(
    book.tenant,
    book.tenantText,
    book.session,
    book.blobs,
    book.parsed,
  )
  const executions = new Map(
    [...book.view.executions].map(([id, view]) => [
      id,
      keepCurrentExecution(
        view,
        view.cursor.step === undefined ? undefined : checkpointOf(view, context.blobs),
      ),
    ]),
  )
  book.view = {
    head: book.view.head,
    executions,
    ops: new Map([...executions.values()].flatMap(view => [...view.ops])),
    excluded: new Map([...executions.values()].flatMap(view => [...view.excluded])),
  }
  if (book.held.size > 0) return
  const needed = new Set([...refsIn(book.view)].map(blobRowDigest))
  for (const row of needed) {
    const payload = book.blobs.get(row)
    if (payload === undefined) continue
    const parsed = book.parsed.get(factDigestOf(row)) ?? (JSON.parse(payload) as unknown)
    for (const ref of refsIn(parsed)) needed.add(blobRowDigest(ref))
    for (const ref of listedDigests(payload)) needed.add(blobRowDigest(ref))
  }
  for (const row of book.blobs.keys()) if (!needed.has(row)) book.blobs.delete(row)
  for (const digest of book.parsed.keys())
    if (!needed.has(blobRowDigest(digest))) book.parsed.delete(digest)
}

export function restore<P>(
  book: Book<P>,
  cell: JournalCell<P>,
  records: ProjectedRecords,
  replace = false,
): void {
  cell.mutate(() => {
    const root = cell.state()
    if (replace) {
      for (const value of Object.values(root.agent)) if (value instanceof Map) value.clear()
      for (const value of Object.values(root.receiving)) value.clear()
      root.agent.jointFacts = []
    }
    const into = <K, V>(target: Map<K, V>, source: ReadonlyMap<K, V>) => {
      for (const [key, value] of source) target.set(key, value)
    }
    root.agent.view = book.view
    root.agent.log = []
    for (const [digest, value] of book.parsed) root.agent.blobs.set(digest, value)
    into(root.agent.executions, records.executions)
    into(root.agent.operations, records.operations)
    into(root.agent.eventReceipts, records.fragments.eventReceipts)
    into(root.agent.pendingEvents, records.fragments.pendingEvents)
    into(root.agent.callOrigins, records.fragments.callOrigins)
    into(root.agent.human, records.fragments.human)
    into(root.agent.indexedEvents, records.fragments.indexedEvents)
    for (const name of Object.keys(records.receiving) as (keyof CommonRoot['receiving'])[])
      into(
        root.receiving[name] as Map<unknown, unknown>,
        records.receiving[name] as Map<unknown, unknown>,
      )
    cell.touch()
  })
}

export function admissionsOf(
  written: Written,
  own: MemoryExecution | undefined,
  receipt: CommandReceipt | null,
  scratch: Scratch,
): ExecutionAdmissionRecord[] {
  if ((written.method !== 'open' && written.method !== 'submit') || own === undefined) return []
  if (receipt === null) return []
  const check = scratch.checks[0]
  const input =
    check?.kind === 'open'
      ? check.initial.input
      : check?.kind === 'submit'
        ? check.value.input
        : null
  const attachment = own.attachments.at(-1)
  if (input === null || attachment === undefined) return []
  const original = attemptOfGrant(
    scratch.snapshot?.historyIndex?.attempts,
    own.id,
    attachment.grant,
  )
  return [
    {
      input,
      execution: own.id,
      operation: written.operation ?? '',
      accepted: receipt.evidence,
      grant: check?.kind === 'open' ? check.grant : receipt.evidence,
      attachment: attachment.authority.executionAttachment,
      ...(original === undefined ? {} : { attempt: original.attempt }),
    },
  ]
}

export function hold<P>(
  book: Book<P>,
  after: CommonRoot,
  written: Written,
  operation: AgentOperationId,
  storageOperation: string,
  attempt: number,
): void {
  if (written.execution === null) return
  const at = operationText(book.tenantText, written.execution as AgentExecutionId, operation)
  const record = after.agent.operations.get(at)
  if (record === undefined) return
  const execution = [...after.agent.executions.values()].find(item => item.id === written.execution)
  book.held.set(at, {
    execution: written.execution as AgentExecutionId,
    operation,
    key: record.key,
    storageOperation,
    attempt,
    custody: execution?.custodyAttempts.get(operation) ?? null,
    standing: 'unknown',
  })
}

export function kindsOf(scratch: Scratch): ParticipationKind[] {
  const kinds: ParticipationKind[] = []
  for (const command of scratch.commands)
    switch (command.kind) {
      case 'recordMessage':
        kinds.push('message')
        break
      case 'commitDerived':
        kinds.push('context-transition')
        break
      case 'preserveResult':
        kinds.push('custody')
        break
      case 'completeConsumption':
        kinds.push('processed')
        break
      default:
        break
    }
  return kinds
}

export async function fetchBlobs<P>(book: Book<P>, read: Reader): Promise<Failure | null> {
  const missing = await fetchNamed(read, book.tenantText, book.view.executions.values(), book.blobs)
  return missing === null
    ? null
    : unavailable(`the content block ${missing} of the Agent records is not readable`)
}

export function nameless<T>(what: string): Settled<T> {
  return {
    kind: 'answer',
    value: fail(unavailable(`${what} of a write without an Agent operation`)),
  }
}
