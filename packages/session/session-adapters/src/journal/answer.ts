import type {
  AgentConclusion,
  Authority,
  CommandReceipt,
  DurableEvidence,
  ExecutionRevision,
} from '@omne-harness/agent-contract'
import { decodeExecutionRevision } from '@omne-harness/agent-contract'
import type { PublishedBatch, Ref } from './facts.ts'
import type { SessionJournalView, Stamp } from './view.ts'

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

// The batch a receipt names, read from its batch evidence: what a recognition of it records.
export function stampOfReceipt(receipt: CommandReceipt): Stamp | undefined {
  const found = /\/pub\/(\d+)$/u.exec(receipt.evidence.record)
  if (found === null) return undefined
  return {
    op: receipt.operation,
    digest: receipt.evidence.digest,
    pub: Number(found[1]),
    revision: Number(receipt.revision),
  }
}

// The revision a batch answers: the recognized operation's, else the one its envelope reached (an
// envelope without one is answered just after it landed, at the revision of the view).
export function answeredRevision(view: SessionJournalView, batch: PublishedBatch): number {
  const recognition = batch.facts.find(fact => fact.kind === 'op.recognized')
  if (recognition?.kind === 'op.recognized') return recognition.at.revision
  if (batch.envelope.rev >= 1) return batch.envelope.rev
  return view.executions.get(batch.execution)?.revision ?? 0
}

export function receiptOf(
  mint: Mint,
  view: SessionJournalView,
  batch: PublishedBatch,
): CommandReceipt {
  const recalled = batch.facts.find(fact => fact.kind === 'op.recognized' && fact.recalls === true)
  if (recalled?.kind === 'op.recognized') {
    const { at } = recalled
    return {
      operation: recalled.target,
      execution: batch.execution,
      revision: revisionOf(at.revision),
      evidence: batchEvidence(
        mint,
        {
          execution: batch.execution,
          pub: at.pub,
          envelope: { digest: at.digest },
        } as PublishedBatch,
        at.revision,
      ),
      state: 'applied',
    }
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
