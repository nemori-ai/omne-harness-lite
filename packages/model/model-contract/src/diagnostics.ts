import type { Adoption, CallAccess, DispatchId, Identity, ModelCallId, Revision } from './root.ts'
import type { DurableEvidence, ModelFault, Reply } from './result.ts'
import type { ConnectRetryReason, DispatchInstants } from './call-surface.ts'

export type ModelDiagnosticId = Identity<'ModelDiagnosticId'>
export type ModelDiagnosticCursor = Identity<'ModelDiagnosticCursor'>
export type ModelDuration =
  | Readonly<{ kind: 'known'; milliseconds: string }>
  | Readonly<{ kind: 'unknown' }>
export type ModelAttemptDiagnostic = Readonly<{
  id: ModelDiagnosticId
  call: ModelCallId
  dispatch: DispatchId
  revision: Revision
  adapter: Adoption
  send: 'not-sent' | 'sent' | 'unknown'
  firstContent: 'none-proven' | 'observed' | 'uncertain'
  outcome:
    | Readonly<{ kind: 'pending' }>
    | Readonly<{ kind: 'completed'; reason: 'stop' | 'limit' | 'tool-suggestions' }>
    | Readonly<{ kind: 'interrupted' }>
    | Readonly<{ kind: 'failed'; cause: ModelFault['cause']; upstreamStatus: string | null }>
  instants: DispatchInstants
  /** Each span is known only when both of its moments were kept and the later is not before the earlier. */
  timing: Readonly<{
    materialize: ModelDuration
    sendToResponse: ModelDuration
    sendToFirstContent: ModelDuration
    execution: ModelDuration
  }>
  connectRetries: readonly ConnectRetryReason[]
}>
export type ModelDiagnosticsPage = Readonly<{
  entries: readonly ModelAttemptDiagnostic[]
  next: ModelDiagnosticCursor | null
  snapshot: DurableEvidence
  retention: Adoption
  coverage: 'complete-through-snapshot' | 'expired-prefix'
}>
export interface ModelDiagnostics<P> {
  list(
    input: CallAccess<P> &
      Readonly<{
        after: ModelDiagnosticCursor | null
        limit: number
      }>,
  ): Reply<ModelDiagnosticsPage>
}
