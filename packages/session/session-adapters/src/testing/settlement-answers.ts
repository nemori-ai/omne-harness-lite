import type {
  AgentOperationId,
  CandidateSupersession,
  CommandReceipt,
  SettlementResult,
} from '@omne-harness/agent-contract'
import type { BlobStore } from '../journal/decide.ts'
import { refOf, type Ref } from '../journal/facts.ts'
import type { ExecutionView } from '../journal/view.ts'
import {
  candidateOfView,
  routeOfView,
  settlementBlock,
  settlementOfFact,
  type FinishingRecords,
  type RecordedSettlement,
} from './journal-finishing.ts'
import type { AnswerKeeping } from './operation-answers.ts'

// A settlement answer as the Journal keeps it for a repeat. The candidate and the settlement record
// are records the Journal already holds, so the answer names them: it does not grow with the work.
type KeptSettlement =
  | Readonly<{
      kind: 'establish-cancellation'
      receipt: CommandReceipt
      candidate: AgentOperationId
      supersession: CandidateSupersession | null
    }>
  | Readonly<{ kind: RecordedSettlement['kind']; receipt: CommandReceipt; record: Ref }>

function keptSettlement(result: SettlementResult): KeptSettlement {
  if (result.kind !== 'establish-cancellation')
    return { kind: result.kind, receipt: result.receipt, record: refOf(settlementBlock(result)) }
  const { kind, receipt, candidate, supersession } = result
  return { kind, receipt, candidate: candidate.candidate, supersession }
}

type Held = Readonly<{
  records: FinishingRecords | undefined
  view: ExecutionView
  blobs: BlobStore
}>

function settlementOfKept(kept: KeptSettlement, held: Held): SettlementResult {
  const { records, view, blobs } = held
  if (records === undefined)
    throw new TypeError('a settlement was answered for an execution the Journal does not hold')
  if (kept.kind !== 'establish-cancellation')
    return settlementOfFact(kept.record, kept.receipt, records, blobs)
  const candidate = view.finish.candidates.find(item => item.candidate === kept.candidate)
  if (candidate === undefined)
    throw new TypeError(`the Journal holds no candidate ${kept.candidate} an answer names`)
  const route = routeOfView(candidate, blobs)
  if (route.kind !== 'cancellation')
    throw new TypeError('an established cancellation names a cancellation route')
  const { kind, receipt, supersession } = kept
  return { kind, receipt, candidate: candidateOfView(candidate, blobs), route, supersession }
}

// How commitSettlement keeps its answers, over the records of the execution as they are read now.
export const settlementKeeping = (held: () => Held): AnswerKeeping<SettlementResult> => ({
  keep: keptSettlement,
  restore: kept => settlementOfKept(kept as KeptSettlement, held()),
})
