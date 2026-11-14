import type { TenantId } from '@omne-harness/legal-identity'
import type * as T from '@omne-harness/tool-contract'
import type {
  Adoption,
  AgentExecutionId,
  AgentOperationId,
  CancellationUnknown,
  CardRoundId,
  DurableEvidence,
  ExtensionInvocationMode,
  ExtensionInvocationResult,
  PassageId,
  ToolIntentKey,
} from '@omne-harness/agent-contract'

export type SettlementQualification = 'settle' | 'migrate-cancellation' | 'reconcile'

export type TestHostRecord =
  | Readonly<{
      kind: 'legacy-return'
      tenant: TenantId
      execution: AgentExecutionId
      passage: PassageId
      input: DurableEvidence
      mode: ExtensionInvocationMode
      implementation: Adoption
      started: DurableEvidence
      result: ExtensionInvocationResult
      received: DurableEvidence
      custody: DurableEvidence
    }>
  | Readonly<{
      kind: 'tool-return'
      intent: ToolIntentKey
      request: DurableEvidence
      returned:
        | Readonly<{ kind: 'commit-unknown'; reference: T.ToolInvocationRef }>
        | Readonly<{ kind: 'accepted'; reference: T.ToolInvocationRef; receipt: DurableEvidence }>
      received: DurableEvidence
      custody: DurableEvidence
    }>
  | Readonly<{
      kind: 'card-reconciliation'
      tenant: TenantId
      execution: AgentExecutionId
      passage: PassageId
      round: CardRoundId
      result:
        | Readonly<{
            kind: 'known'
            present: DurableEvidence | null
            lookups: readonly AgentOperationId[]
            invalidate: Readonly<{ operation: AgentOperationId; reason: DurableEvidence }> | null
          }>
        | Readonly<{ kind: 'unknown'; reason: CancellationUnknown['reason'] }>
    }>
