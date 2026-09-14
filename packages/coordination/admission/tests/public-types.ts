import type { Diagnostics } from '@omne-harness-lite/diagnostics'
import type {
  CloseResult,
  CommitResult,
  Position,
  PreparedCommit,
  PreparedOperation,
  Receipt,
  RecordWriter,
  UseBinding,
  Watermark,
} from '@omne-harness-lite/records'
import type { OpaqueId, OperationRef } from '@omne-harness-lite/work-data'
import { createAdmissionCoordinator } from '../dist/index.js'
import type {
  AdmissionCompletion,
  AdmissionCoordinator,
  AdmissionFailure,
  AdmissionHost,
  AdmissionResult,
  CompositionKind,
  CoordinatorStatus,
  ExactUse,
  ExactUseIssuer,
  GateFrame,
  OwnerPublication,
  PendingAdmission,
  PreparedAdmission,
  ReleaseResult,
} from '../dist/index.js'

type EveryPublicType = [
  AdmissionCompletion,
  AdmissionCoordinator,
  AdmissionFailure,
  AdmissionHost,
  AdmissionResult,
  CompositionKind,
  CoordinatorStatus,
  ExactUse,
  ExactUseIssuer,
  GateFrame,
  OwnerPublication,
  PendingAdmission,
  PreparedAdmission,
  ReleaseResult,
]

const everyPublicTypeCompiles: EveryPublicType | undefined = undefined
void everyPublicTypeCompiles

const factory: (writer: RecordWriter, diagnostics: Diagnostics) => AdmissionHost =
  createAdmissionCoordinator
void factory

declare const frame: GateFrame
declare const preparedOperation: PreparedOperation
declare const preparedCommit: PreparedCommit
declare const position: Position
declare const receipt: Receipt
declare const commitResult: CommitResult
declare const closeResult: CloseResult
declare const watermark: Watermark
declare const operation: OperationRef
declare const binding: UseBinding
declare const diagnosticId: OpaqueId

const currentFrame: boolean = (undefined as unknown as AdmissionCoordinator).isCurrentFrame(frame)
void currentFrame

void [
  frame,
  preparedOperation,
  preparedCommit,
  position,
  receipt,
  commitResult,
  closeResult,
  watermark,
  operation,
  binding,
  diagnosticId,
]

// @ts-expect-error frames are opaque and issued only for one active coordinator entry
const forgedFrame: GateFrame = {}
void forgedFrame

// @ts-expect-error exact uses are opaque handles issued by an owner-bound issuer
const forgedUse: ExactUse = {
  binding,
  retainAt: () => undefined,
  release: async () => ({ status: 'released' }),
}
void forgedUse

const returnsVoid = (_position: Position, _frame: GateFrame): void => {}
const invalidPublication: OwnerPublication = {
  owner: 'owner',
  // @ts-expect-error publication callbacks must return strictly undefined, not void
  publishLogical: returnsVoid,
  publishDurable: () => undefined,
}
void invalidPublication
