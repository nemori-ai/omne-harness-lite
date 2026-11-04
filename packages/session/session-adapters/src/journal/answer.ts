// The answer of a Journal operation is a function of its own batch (R2-D292, F4): no answer is
// stored. A retry with the same input finds the batch through the operation index and derives the
// same answer; a recognition answers with the revision of the batch it recognized. The evidence of a
// receipt is minted from the batch's coordinates, never read back from a row.
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

/** What one batch answers, by the kind of command that appended it. */
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

/** Where the batch evidence is minted from: the owner name and the session text. */
export type Mint = Readonly<{ owner: string; session: string }>

function revisionOf(value: number): ExecutionRevision {
  const decoded = decodeExecutionRevision(String(value))
  if ('failure' in decoded) throw new Error(`the fold produced an invalid revision ${value}`)
  return decoded.ok
}

/** The evidence of one batch: its coordinates and digest, the same every time it is minted. */
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

/**
 * The revision a batch's answer names: the view's index entry for the operation, which holds the
 * recognized batch's revision for a recognition; or, before the batch is indexed, the envelope.
 */
export function answeredRevision(view: SessionJournalView, batch: PublishedBatch): number {
  return view.ops.get(batch.envelope.op)?.revision ?? batch.envelope.rev
}

/** The receipt of one batch: applied, at the revision the batch answers. */
export function receiptOf(
  mint: Mint,
  view: SessionJournalView,
  batch: PublishedBatch,
): CommandReceipt {
  const revision = answeredRevision(view, batch)
  return {
    operation: batch.envelope.op,
    execution: batch.execution,
    revision: revisionOf(revision),
    evidence: batchEvidence(mint, batch, revision),
    state: 'applied',
  }
}

/**
 * Derives the answer of a batch from the batch alone and the index of the view it was folded into
 * (the table of R2-D292 "原操作认回"). The kind of answer follows the facts the batch carries:
 * an attachment answers the authority, a detach the handoff, a reception the custody and saved, an
 * issue of obligations its evidence, an end the conclusion, a settlement its record; every other
 * batch answers its receipt.
 */
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

/** The batch of an operation, by the index, or null when the operation wrote none. */
export function batchOf(
  view: SessionJournalView,
  operation: AgentOperationId,
  read: (pub: number) => PublishedBatch | undefined,
): PublishedBatch | null {
  const entry = view.ops.get(operation)
  if (entry === undefined) return null
  return read(entry.pub) ?? null
}
