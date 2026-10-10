import type {
  CallKey,
  ModelCallAcknowledgedRecord,
  ModelCallPayloadRef,
} from '@omne-harness-lite/messages'
import type { ModelCallContentValue } from './model-record-publication.ts'
import type { InvocationPolicy } from './invocation-types.ts'
import type { CallAccess } from './reference-types.ts'
import type {
  RetainedCallReadView,
  AcknowledgedCallFacts,
  ModelCallCleanupResult,
} from './reference-types.ts'
import type {
  RuntimeSessionAccess,
  CurrentHistoryReaders,
  RuntimeCloseResult,
  ServiceInvalidInput,
  ServiceUnavailable,
  ServiceCallNotFound,
  ModelRuntimeOperations,
} from './service-types.ts'
import type {
  SettlementLogBinding,
  SettlementContention,
  SettlementScheduler,
  SettlementDiagnostic,
} from './settlement-types.ts'

type ContentKey = { readonly binding: SettlementLogBinding; readonly call: CallKey['callId'] }
type Refusal = ServiceInvalidInput | ServiceUnavailable

/** The original content owner fixes one batch under its retention lock. It does not read logs. */
export interface ModelAcknowledgementContent {
  readonly read: (
    input: ContentKey & { readonly ref: ModelCallPayloadRef },
  ) => Promise<{ readonly content: ModelCallContentValue } | Refusal>
  readonly retention: (input: ContentKey) => Promise<
    | {
        readonly phase: 'retained' | 'retiring' | 'acknowledged' | 'released' | null
        readonly publishers: number
      }
    | ServiceUnavailable
  >
  readonly prepareAcknowledgement: (
    input: ContentKey & {
      readonly payloads: readonly ModelCallPayloadRef[]
      readonly build: (
        contents: readonly ModelCallContentValue[],
      ) => { readonly record: ModelCallAcknowledgedRecord } | Refusal
    },
  ) => Promise<
    | {
        readonly record: ModelCallAcknowledgedRecord
        readonly phase: 'retiring' | 'acknowledged' | 'released'
      }
    | Refusal
  >
  readonly withdrawAcknowledgement: (
    input: ContentKey & { readonly record: ModelCallAcknowledgedRecord },
  ) => Promise<{ readonly phase: 'retained' } | Refusal>
}

export interface SessionModelAcknowledgementHost {
  readonly sessions: RuntimeSessionAccess
  readonly history: Pick<CurrentHistoryReaders, 'call'>
  readonly callAccess: CallAccess
  readonly lookup: (input: {
    readonly binding: SettlementLogBinding
    readonly ref: CallKey
  }) => Promise<
    | { readonly view: RetainedCallReadView }
    | { readonly acknowledged: AcknowledgedCallFacts }
    | ServiceCallNotFound
    | ServiceUnavailable
  >
}

export interface SessionModelAcknowledgementInput extends SessionModelAcknowledgementHost {
  readonly content: ModelAcknowledgementContent
  readonly cleanup: (input: {
    readonly binding: SettlementLogBinding
    readonly ref: CallKey
    readonly record: ModelCallAcknowledgedRecord
  }) => Promise<ModelCallCleanupResult | { readonly contradicted: true }>
  readonly settlementContention: SettlementContention
  readonly settlementScheduler: SettlementScheduler
  readonly policy: Pick<InvocationPolicy, 'now'> & {
    readonly diagnostic: (
      event: Parameters<InvocationPolicy['diagnostic']>[0] | SettlementDiagnostic,
    ) => void
  }
}

export interface SessionModelAcknowledgement {
  readonly acknowledgeCall: ModelRuntimeOperations['acknowledgeCall']
  /** Replace host inputs; retain this owner's original content, readers and unknown writers. */
  readonly project: (
    host: SessionModelAcknowledgementHost,
  ) => Pick<ModelRuntimeOperations, 'acknowledgeCall'>
  readonly close: () => Promise<RuntimeCloseResult>
}
export type SessionModelAcknowledgementFactory = (
  input: SessionModelAcknowledgementInput,
) => SessionModelAcknowledgement
