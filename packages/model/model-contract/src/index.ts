// The root entry of the Model contract package. It does not import Cordis, a provider or Model.
// Every chapter file is re-exported as types, except the credential chapter, which also carries
// the MODEL_SEND constant. The runtime values are exported by name from their leaf files: the
// identity decoders, comparators and constants, the credential decoder and comparator,
// deriveGuardControlOperation, the delivery judge, and the replay declaration and projection functions.
export type * from './root.ts'
export type * from './result.ts'
export type * from './result-delivery-values.ts'
export type * from './result-delivery.ts'
export type * from './result-delivery-judge.ts'
export { judgeModelDelivery } from './result-delivery-judge.ts'
export type * from './model-stream-values.ts'
export { diffModelStream, applyModelStreamDelta } from './model-stream-values.ts'
export type * from './call-surface.ts'
export type * from './provider.ts'
export type * from './profile.ts'
export type * from './conversion.ts'
export type * from './tokenizer.ts'
export type * from './driver.ts'
export type * from './profile-source.ts'
export type * from './diagnostics.ts'
export type * from './consumer-owner.ts'
export * from './credential.ts'
export { decodeCredentialId, sameCredentialHolder } from './credential-values.ts'
export {
  MODEL_IDENTITY_MAX_LENGTH,
  MODEL_IDENTITY_PREFIXES,
  compareOutputCursors,
  compareRevisions,
  decodeDispatchId,
  decodeModelCallId,
  decodeModelDiagnosticCursor,
  decodeModelDiagnosticId,
  decodeModelInstanceId,
  decodeModelOperationId,
  decodeOutputCursor,
  decodeReadId,
  decodeResultVersion,
  decodeRevision,
} from './identity-values.ts'
export { deriveGuardControlOperation } from './guard-control.ts'

export type * from './reference.ts'
export {
  MODEL_REFERENCE_MAX_LENGTH,
  encodeModelInvocationRef,
  encodeModelOperationRef,
  decodeModelInvocationRef,
  decodeModelOperationRef,
  resolveModelInvocationRef,
  resolveModelOperationRef,
} from './reference.ts'

export type { ModelAdmitCandidate, ModelInputRejection } from './judge-request.ts'
export { judgeFixedModelRequest, judgeAdmit, MODEL_INPUT_LIMITS } from './judge-request.ts'
export { continuedMessages, judgeReplayDeclaration, projectReplay } from './replay-values.ts'
