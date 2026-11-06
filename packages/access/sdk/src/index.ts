export {
  RequestInvalidError,
  createGovernanceClient,
  createSessionClient,
  type CallerResult,
  type ClientOptions,
  type GovernanceClient,
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
