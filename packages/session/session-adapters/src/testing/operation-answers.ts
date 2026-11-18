import type {
  AgentExecutionId,
  AgentOperationId,
  CommandReceipt,
  Failure,
} from '@omne-harness/agent-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Answer, Stamp } from '../journal/index.ts'
import { answerRef, itemText, needClosed, peekClosed } from './closed-items.ts'
import type { Attempt, OperationRecord } from './journal.ts'
import { JOURNAL_OWNER, operationText, revisionOf } from './journal-values.ts'
import type { CommonRoot } from './root.ts'

// What the core answers a repeat of an operation from: the record of its own write, else the answer
// the operation left closed in the store.

type Agent = CommonRoot['agent']
type Answered = Extract<OperationRecord, { kind: 'committed' | 'rejected' }>
type Operation = Readonly<{
  tenant: TenantId
  execution: AgentExecutionId
  operation: AgentOperationId
}>

const keyOf = (input: Operation): string | undefined => {
  const text = tenantCodec.encode(input.tenant)
  return text.ok ? operationText(text.value, input.execution, input.operation) : undefined
}

// A write treats an answer it has not read as none and leaves the repeat to the store; a read that
// must know asks with need.
export function operationAnswer(
  agent: Agent,
  input: Operation,
  need = false,
): Answered | undefined {
  const at = keyOf(input)
  const held = at === undefined ? undefined : agent.operations.get(at)
  if (held?.kind === 'committed' || held?.kind === 'rejected') return held
  const ref = answerRef(input.execution, input.operation)
  return ((need ? needClosed(agent, ref) : peekClosed(agent, ref)) ?? undefined) as
    | Answered
    | undefined
}

export function fixAnswer(agent: Agent, at: string, input: Operation, record: Answered): void {
  agent.operations.set(at, record)
  agent.closed.set(itemText(answerRef(input.execution, input.operation)), record)
}

export function recognizedAnswer<R>(
  agent: Agent,
  input: Operation,
  key: string,
): Outcome<R, Failure> | undefined {
  const record = operationAnswer(agent, input)
  if (record === undefined) return undefined
  const conflict = { kind: 'conflict' as const, operation: input.operation }
  if (record.key !== key) return fail(conflict)
  return record.kind === 'rejected'
    ? fail(structuredClone(record.failure))
    : succeed(structuredClone(record.value) as R)
}

export function reachedStamp(
  agent: Agent,
  execution: AgentExecutionId,
  revision: number,
): Stamp | undefined {
  const held = agent.view.executions.get(execution)?.reached.get(revision)
  if (held !== undefined) return held
  const ref = { execution, family: 'reached', item: String(revision) }
  return (needClosed(agent, ref) ?? undefined) as Stamp | undefined
}

export function receiptIn(derived: Answer): CommandReceipt {
  if (!('receipt' in derived)) throw new TypeError(`a ${derived.kind} answer carries no receipt`)
  return derived.receipt
}

// A batch that recognizes the operation which reached a revision, answered from its receipt.
export function recognitionOf<R>(
  target: Stamp | undefined,
  revision: number,
  value: (receipt: CommandReceipt) => R,
  receiptState: CommandReceipt['state'] = 'applied',
): Attempt<R> {
  if (target === undefined)
    return {
      kind: 'answer',
      value: fail({
        kind: 'unavailable',
        owner: JOURNAL_OWNER,
        diagnostic: `the fact recognized at revision ${String(revision)} is not in the folded view`,
      }),
    }
  return {
    kind: 'batch',
    facts: [
      {
        kind: 'op.recognized',
        target: target.op,
        at: { pub: target.pub, digest: target.digest, revision: target.revision },
      },
    ],
    blobs: [],
    kinds: [],
    derive: derived => {
      const receipt = receiptIn(derived)
      if (receipt.revision !== revisionOf(revision))
        throw new TypeError('a recognition answered another revision than the recognized fact')
      return value(receipt)
    },
    project: () => {},
    receiptState,
  }
}

export function recognitionBatch(
  target: Stamp | undefined,
  revision: number,
  receiptState: CommandReceipt['state'],
): Attempt<CommandReceipt> {
  return recognitionOf(target, revision, receipt => receipt, receiptState)
}
