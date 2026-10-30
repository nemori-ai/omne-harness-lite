import type * as T from '@omne-harness/tool-contract'
import type {
  Adoption,
  AgentOperationId,
  CancellationUnknown,
  CardRoundId,
  DurableEvidence,
  ExtensionInvocationMode,
  ExtensionInvocationResult,
  PassageId,
  ToolIntentKey,
} from '@omne-harness/agent-contract'

// Local copies of two conformance-suite types that the memory Journal takes as fixture input.
// `src` does not import another package's `/testing` entry, so the copies live here.
// `tests/host-record.spec-d.ts` keeps each assignable both ways with the suite's type.

/** The qualifications the settlement operations check (SPEC "commitSettlement 的变体"). */
export type SettlementQualification = 'settle' | 'migrate-cancellation' | 'reconcile'

/**
 * One record of the trusted host reads that the double serves to the custody variants of
 * commitSettlement. A fixture registers it under a source evidence; a source that no record
 * answers is unreadable.
 */
export type TestHostRecord =
  | Readonly<{
      /** The late return of an author invocation that started before the cancellation fence. */
      kind: 'legacy-return'
      passage: PassageId
      input: DurableEvidence
      mode: ExtensionInvocationMode
      implementation: Adoption
      /** The proof that the call started before the fence. */
      started: DurableEvidence
      result: ExtensionInvocationResult
      received: DurableEvidence
      custody: DurableEvidence
    }>
  | Readonly<{
      /** The immutable return of an original Tool invoke the host kept. */
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
      /** The result of an original lookup or invalidate of one card round, as the card owner kept it. */
      kind: 'card-reconciliation'
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
