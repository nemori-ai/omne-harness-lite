import type { CommandReceipt, DurableEvidence } from '@omne-harness/agent-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { SessionControlEvidence, SessionLogConsequence } from '@omne-harness/session-contract'
import type { ExecutionBoundaryRecord } from '@omne-harness/session-storage-sql/participants'
import { controlEventEvidence } from '../testing/control.ts'
import { HistoryFailure } from '../testing/history-failure.ts'
import { captureEventOriginal, normalizeAgentEvent } from '../testing/history.ts'
import type { MemoryExecution } from '../testing/journal.ts'
import type { CommonRoot } from '../testing/root.ts'
import { JOURNAL_PROVIDER } from './journal-publication.ts'
import type { EventProjection } from './journal-batch.ts'

// What a write records for each event it appended: Session's reading of it, and the boundaries of
// the executions it changed.

export type Fault = (diagnostic: string) => void

export function readOrNull<T>(what: string, fault: Fault | undefined, read: () => T): T | null {
  try {
    return read()
  } catch (error) {
    if (error instanceof HistoryFailure) return null
    if (error instanceof TypeError) {
      fault?.(`${what} read past a ${error.name}: ${error.message}`)
      return null
    }
    throw error
  }
}

function consequencesOf(
  root: CommonRoot,
  execution: MemoryExecution,
  event: MemoryExecution['events'][number],
  fault: Fault | undefined,
): readonly SessionLogConsequence[] | null {
  return readOrNull(`the consequences of ${execution.id}/${event.sequence}`, fault, () =>
    normalizeAgentEvent(root, execution, event),
  )
}

function deferredOf(
  root: CommonRoot,
  execution: MemoryExecution,
  event: MemoryExecution['events'][number],
  fault: Fault | undefined,
): SessionControlEvidence | null {
  if (event.body.kind !== 'control') return null
  return readOrNull(`the control evidence of ${execution.id}/${event.sequence}`, fault, () =>
    controlEventEvidence(root, execution, event),
  )
}

function placeholderHead(execution: MemoryExecution): DurableEvidence {
  return {
    owner: JOURNAL_PROVIDER,
    record: `${execution.id}/head`,
    revision: String(execution.revision),
    digest: 'unknown',
  }
}

const projected = (value: unknown): JsonValue =>
  value === null || value === undefined ? null : (JSON.parse(JSON.stringify(value)) as JsonValue)

export function projectionOf(
  root: CommonRoot,
  execution: MemoryExecution,
  event: MemoryExecution['events'][number],
  fault: Fault | undefined,
): EventProjection {
  const consequences = consequencesOf(root, execution, event, fault)
  const control = consequences === null ? deferredOf(root, execution, event, fault) : null
  return {
    sequence: event.sequence,
    source: event.cause,
    kinds: control !== null ? ['deferred'] : (consequences?.map(item => item.kind) ?? []),
    consequences: projected(consequences),
    control: projected(control),
    ...(event.body.kind === 'input-taken' ? { batch: projected(event.body.batch) } : {}),
  }
}

export function boundariesOf(
  changed: readonly MemoryExecution[],
  receipt: CommandReceipt | null,
): ExecutionBoundaryRecord[] {
  return changed.map(execution => {
    const head = receipt?.execution === execution.id ? receipt.evidence : null
    const last = execution.events.at(-1)
    return {
      execution: execution.id,
      revision: String(execution.revision),
      receipt: head ?? placeholderHead(execution),
      emittedThrough: String(execution.events.length),
      ended:
        last !== undefined && last.body.kind === 'ended'
          ? { sequence: last.sequence, source: last.cause }
          : null,
    }
  })
}

export function captureFresh(
  root: CommonRoot,
  execution: string,
  receipt: CommandReceipt,
  fault: Fault | undefined,
): void {
  const found = [...root.agent.executions.values()].find(item => item.id === execution)
  if (found === undefined) return
  const old = root.agent.indexedEvents.get(execution) ?? 0
  for (const event of found.events.slice(old))
    readOrNull(`the original of ${execution}/${event.sequence}`, fault, () =>
      captureEventOriginal(root, found, event, receipt),
    )
  root.agent.indexedEvents.set(execution, found.events.length)
}
