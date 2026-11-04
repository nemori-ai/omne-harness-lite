// The fact family of the Agent Journal: the facts, the batch and row shapes, the pure fold, the
// answer derivation and the generic part of decide. See SPEC "事实族与折叠核".
export {
  BATCH_OVERHEAD_BYTES,
  EVENT_OF,
  FACT_KINDS,
  FACT_MAX_BYTES,
  batchBytes,
  bytesOf,
  contentPath,
  decodeBatch,
  decodeRows,
  digestOf,
  encodeBatch,
  factKey,
  refOf,
} from './facts.ts'
export type {
  Attempt,
  AttachmentBasis,
  Batch,
  BatchEnvelope,
  ContentType,
  CursorMember,
  CursorMembers,
  FactBody,
  FactFailure,
  FactKind,
  FactOf,
  FactRow,
  NoContent,
  ParticipationKind,
  ProducerCall,
  PublishedBatch,
  Ref,
  ResultStage,
} from './facts.ts'
export {
  advances,
  emptyExecutionView,
  emptySessionView,
  fold,
  foldAll,
  handoffKey,
  openCalls,
  viewDigest,
  viewText,
} from './fold.ts'
export type {
  AdmissionView,
  AttachmentView,
  BatchView,
  CandidateView,
  ControlView,
  EventView,
  ExecutionView,
  FinishView,
  HandoffView,
  InputView,
  IntentView,
  OperationEntry,
  PassageView,
  RequestView,
  ResultView,
  SessionJournalView,
} from './fold.ts'
export {
  answer,
  answeredRevision,
  batchEvidence,
  batchOf as batchOfOperation,
  receiptOf,
} from './answer.ts'
export type { Answer, Mint } from './answer.ts'
export { batchOf, cursorMoved, cursorOf, keyKnown, movedMembers } from './decide.ts'
export type { BatchRefusal } from './decide.ts'
