import type {
  AgentConclusion,
  AgentOperationId,
  Authority,
  CommandReceipt,
  DurableEvidence,
  ExecutionRevision,
} from '@omne-harness/agent-contract'
import { decodeExecutionRevision } from '@omne-harness/agent-contract'
import type { PublishedBatch, Ref } from './facts.ts'
import type { SessionJournalView } from './fold.ts'

export type Answer =
  | Readonly<{ kind: 'receipt'; receipt: CommandReceipt }>
  | Readonly<{ kind: 'authority'; receipt: CommandReceipt; authority: Authority }>
  | Readonly<{ kind: 'detached'; handoff: DurableEvidence }>
  | Readonly<{
      kind: 'received'
      receipt: CommandReceipt
      custody: Ref
      saved: DurableEvidence
    }>
  | Readonly<{ kind: 'obligations'; receipt: CommandReceipt; obligations: DurableEvidence }>
  | Readonly<{
      kind: 'ended'
      receipt: CommandReceipt
      conclusion: AgentConclusion
      disposition: DurableEvidence
    }>
  | Readonly<{
      kind: 'settlement'
      receipt: CommandReceipt
      record: Ref
      evidence: DurableEvidence
    }>

export type Mint = Readonly<{ owner: string; session: string }>

function revisionOf(value: number): ExecutionRevision {
  const decoded = decodeExecutionRevision(String(value))
  if ('failure' in decoded) throw new Error(`the fold produced an invalid revision ${value}`)
  return decoded.ok
}

export function batchEvidence(
  mint: Mint,
  batch: PublishedBatch,
  revision: number,
): DurableEvidence {
  return {
    owner: mint.owner,
    record: `${mint.session}/${batch.execution}/pub/${batch.pub}`,
    revision: String(revision),
    digest: batch.envelope.digest,
  }
}

export function answeredRevision(view: SessionJournalView, batch: PublishedBatch): number {
  return view.ops.get(batch.envelope.op)?.revision ?? batch.envelope.rev
}

export function receiptOf(
  mint: Mint,
  view: SessionJournalView,
  batch: PublishedBatch,
): CommandReceipt {
  const recalled = batch.facts.find(fact => fact.kind === 'op.recognized' && fact.recalls === true)
  const entry = recalled?.kind === 'op.recognized' ? view.ops.get(recalled.target) : undefined
  if (recalled?.kind === 'op.recognized' && entry !== undefined)
    return {
      operation: recalled.target,
      execution: batch.execution,
      revision: revisionOf(entry.revision),
      evidence: batchEvidence(
        mint,
        {
          execution: batch.execution,
          pub: entry.pub,
          envelope: { digest: entry.digest },
        } as PublishedBatch,
        entry.revision,
      ),
      state: 'applied',
    }
  const revision = answeredRevision(view, batch)
  return {
    operation: batch.envelope.op,
    execution: batch.execution,
    revision: revisionOf(revision),
    evidence: batchEvidence(mint, batch, revision),
    state: 'applied',
  }
}

export function answer(mint: Mint, view: SessionJournalView, batch: PublishedBatch): Answer {
  const receipt = receiptOf(mint, view, batch)
  for (const fact of batch.facts) {
    switch (fact.kind) {
      case 'exec.attached':
        return { kind: 'authority', receipt, authority: fact.authority }
      case 'exec.detached':
        return { kind: 'detached', handoff: fact.handoff }
      case 'result.received':
        return { kind: 'received', receipt, custody: fact.custody, saved: fact.saved }
      case 'finish.obligations':
        return { kind: 'obligations', receipt, obligations: fact.evidence }
      case 'finish.ended':
        return {
          kind: 'ended',
          receipt,
          conclusion: fact.conclusion,
          disposition: fact.disposition,
        }
      case 'settlement.recorded':
        return { kind: 'settlement', receipt, record: fact.record, evidence: fact.evidence }
      default:
        break
    }
  }
  return { kind: 'receipt', receipt }
}

export function operationState(
  view: SessionJournalView,
  operation: AgentOperationId,
): 'committed' | 'excluded' | 'unknown' {
  if (view.ops.has(operation)) return 'committed'
  if (view.excluded.has(operation)) return 'excluded'
  return 'unknown'
}

export function batchOf(
  view: SessionJournalView,
  operation: AgentOperationId,
  read: (pub: number) => PublishedBatch | undefined,
): PublishedBatch | null {
  const entry = view.ops.get(operation)
  if (entry === undefined) return null
  return read(entry.pub) ?? null
}
