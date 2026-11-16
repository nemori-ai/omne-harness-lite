import type { AnswerOf } from '@omne-harness/access-cordis-contract'
import type { SessionDiagnosticsProtocol } from '@omne-harness/session-diagnostics-protocol'

export type SessionDiagnosticsPage = Extract<
  AnswerOf<SessionDiagnosticsProtocol['operations']['read-session-diagnostics']>,
  { outcome: 'succeeded' }
>['body']

export type SessionRunDiagnostic = SessionDiagnosticsPage['runs'][number]
export type SessionDiagnosticGap = SessionDiagnosticsPage['gaps'][number]
export type SessionRunControl = SessionRunDiagnostic['controls'][number]
export type SessionRunAttempts = SessionRunDiagnostic['attempts']
export type SessionFactCount = SessionRunDiagnostic['facts'][number]
export type SessionModelCallDiagnostic = SessionRunDiagnostic['modelCalls'][number]
export type SessionModelAttemptDiagnostic = SessionModelCallDiagnostic['dispatches'][number]
export type SessionToolCallDiagnostic = SessionRunDiagnostic['toolCalls'][number]
export type SessionDiagnosticMilliseconds = SessionModelAttemptDiagnostic['timing']['execution']
export type SessionDiagnosticUnknown = Extract<
  SessionModelCallDiagnostic['call'],
  { kind: 'unknown' }
>
export type SessionCallAccountView = Extract<
  SessionModelAttemptDiagnostic['account'],
  { kind: 'account' }
>
export type SessionRunCause = NonNullable<SessionRunDiagnostic['terminal']>['cause']['structured']
