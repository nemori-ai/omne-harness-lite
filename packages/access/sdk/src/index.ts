export {
  RequestInvalidError,
  createGovernanceClient,
  createHitlClient,
  createSessionClient,
  type CallerResult,
  type ClientOptions,
  type GovernanceClient,
  type HitlClient,
  type PublicResponse,
  type SessionClient,
} from './client.ts'
export { createHttpTransport, type HttpTransportOptions } from './http-transport.ts'
export { parseTenantText, tenantText, type TenantId } from './tenant.ts'
// The identity text codecs of the public contract, passed through. A caller needs them to build
// the identity fields of a request, for example `targetLoginId`.
export {
  encodeAccountIdText,
  encodeLoginStateIdText,
  encodeOrganizationIdText,
  readAccountIdText,
  readLoginStateIdText,
  readOrganizationIdText,
  type AccountId,
  type LoginStateId,
  type OrganizationId,
} from '@omne-harness/public-contract'
export type { GovernanceTransport, TransportReport } from './transport.ts'
export { userTextMessage, type UserMessage } from './user-message.ts'
// The request shapes a caller builds. The SDK encodes and reads them, so the caller needs no codec.
export type {
  GovernanceCodecLimits,
  GovernanceRequest,
  ProofInput,
  SessionOperation,
  SessionRequest,
} from '@omne-harness/public-contract'
// HITL 请求与卡片视图的形状，原样转出。SDK 只在公开契约读过响应之后才交出 `body`，所以调用者按
// 这些类型读成功的正文。
export type {
  HitlCard,
  HitlCardDelivery,
  HitlCardFilter,
  HitlCardItem,
  HitlCardOrigin,
  HitlCardPage,
  HitlCardRef,
  HitlCardState,
  HitlDecision,
  HitlDecisionRef,
  HitlLimitedBody,
  HitlOperation,
  HitlOption,
  HitlOriginKind,
  HitlQuestion,
  HitlReply,
  HitlReplyResult,
  HitlReplySubmission,
  HitlRequest,
  HitlRequestBodies,
  HitlSubmissionRef,
  HitlSuccessBodies,
} from '@omne-harness/public-contract'
// The diagnostics page of `read-session-diagnostics`, passed through. The SDK hands the body over
// only after the contract read it, so a caller reads it in these shapes.
export type {
  SessionAdoptionRef,
  SessionCallAccountView,
  SessionDiagnosticGap,
  SessionDiagnosticGapReason,
  SessionDiagnosticGapSource,
  SessionDiagnosticInstant,
  SessionDiagnosticMilliseconds,
  SessionDiagnosticsPage,
  SessionDiagnosticUnknown,
  SessionFactCount,
  SessionModelAttemptDiagnostic,
  SessionModelCallDiagnostic,
  SessionRunAttempts,
  SessionRunCause,
  SessionRunControl,
  SessionRunDiagnostic,
  SessionRunTerminal,
  SessionToolCallDiagnostic,
  SessionToolDiagnosticEntry,
} from '@omne-harness/public-contract'
