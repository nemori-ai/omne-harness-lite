import { createHash } from 'node:crypto'
import {
  decodeExecutionAttachmentId,
  decodeExecutionRevision,
  decodeInputBatchId,
  type AgentExecutionId,
  type AgentOperationId,
  type DurableEvidence,
  type ExecutionAttachmentId,
  type ExecutionRevision,
  type InputBatchId,
} from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import { canonical } from './canonical.ts'

export const JOURNAL_OWNER = 'session-memory-journal'
export const RECEIVED_MATERIAL = 'received-material'
export const PRESERVED_MATERIAL = 'material'

// The execution a material source of this journal names; undefined for any other source.
function materialExecution(source: DurableEvidence): string | undefined {
  try {
    const parts: unknown = JSON.parse(source.record)
    if (!Array.isArray(parts) || typeof parts[2] !== 'string') return undefined
    if (parts[1] !== RECEIVED_MATERIAL && parts[1] !== PRESERVED_MATERIAL) return undefined
    const owner: unknown = JSON.parse(parts[2])
    return Array.isArray(owner) && typeof owner[1] === 'string' ? owner[1] : undefined
  } catch {
    return undefined
  }
}

// The execution an input is for: the one it names, or the one that keeps the material it reads.
export function targetOf(input: object): unknown {
  const { execution, source } = input as { execution?: unknown; source?: DurableEvidence }
  return execution ?? (source === undefined ? undefined : materialExecution(source))
}

// An access that names the execution a delivery is for, when the delivery names one.
export const named = (
  input: Readonly<{ access: { tenant: TenantId }; execution?: AgentExecutionId }>,
) =>
  input.execution === undefined ? input.access : { ...input.access, execution: input.execution }

export function semanticKey(method: string, input: object): string {
  const rest = Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== 'principal' && key !== 'tenant'),
  )
  return `${method}:sha256:${createHash('sha256').update(canonical(rest)).digest('hex')}`
}

export function openKey(input: Readonly<{ runtime: object }>): string {
  const runtime = Object.fromEntries(
    Object.entries(input.runtime).filter(([key]) => key !== 'instance'),
  )
  return semanticKey('open', { ...input, runtime })
}

function minted<T>(decoded: Outcome<T, unknown>, text: string): T {
  if ('failure' in decoded) throw new Error(`memory Journal minted an invalid identity: ${text}`)
  return decoded.ok
}

export function revisionOf(value: number): ExecutionRevision {
  const text = String(value)
  return minted(decodeExecutionRevision(text), text)
}

export function attachmentIdOf(execution: string, ordinal: number): ExecutionAttachmentId {
  const text = `${execution}/attachment/${ordinal}`
  return minted(decodeExecutionAttachmentId(text), text)
}

export function batchIdOf(execution: string, from: number, to: number): InputBatchId {
  const text = `${execution}/batch/${from}-${to}`
  return minted(decodeInputBatchId(text), text)
}

export function batchRangeOf(
  execution: string,
  id: InputBatchId,
): Readonly<{ from: number; to: number }> | undefined {
  const named = /\/batch\/(0|[1-9][0-9]*)-(0|[1-9][0-9]*)$/u.exec(String(id))
  if (named === null) return undefined
  const from = Number(named[1])
  const to = Number(named[2])
  return from <= to && batchIdOf(execution, from, to) === id ? { from, to } : undefined
}

export function journalEvidence(record: string, revision: number): DurableEvidence {
  return {
    owner: JOURNAL_OWNER,
    record,
    revision: String(revision),
    digest: `memory:${record}@${revision}`,
  }
}

export function sequenceOf(text: string | null): number | undefined {
  if (text === null) return 0
  if (!/^(0|[1-9]\d*)$/u.test(text)) return undefined
  const value = Number(text)
  return Number.isSafeInteger(value) ? value : undefined
}

export function frozenSet<T>(values: Iterable<T>): ReadonlySet<T> {
  const inner = new Set(values)
  const view: ReadonlySet<T> = {
    get size() {
      return inner.size
    },
    has: value => inner.has(value),
    forEach(callback, thisArg?: unknown) {
      inner.forEach(value => callback.call(thisArg, value, value, view))
    },
    entries: () => inner.entries(),
    keys: () => inner.keys(),
    values: () => inner.values(),
    [Symbol.iterator]: () => inner.values(),
  }
  return Object.freeze(view)
}

export function completeEvidence(value: unknown): value is DurableEvidence {
  return (
    typeof value === 'object' &&
    value !== null &&
    ['owner', 'record', 'revision', 'digest'].every(
      key =>
        key in value &&
        typeof value[key as keyof typeof value] === 'string' &&
        String(value[key as keyof typeof value]).length > 0,
    )
  )
}

export function operationText(
  tenant: string,
  execution: AgentExecutionId,
  operation: AgentOperationId,
): string {
  return JSON.stringify([tenant, execution, operation])
}
