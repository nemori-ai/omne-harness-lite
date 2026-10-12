import type {
  AcknowledgedCallFacts,
  AcknowledgedCallView,
  CallAccess,
  CallKey,
} from './reference-types.ts'
import type {
  CurrentHistoryReaders,
  ModelFailureSource,
  ModelRuntimeOperations,
  RuntimeCloseResult,
  RuntimeSessionAccess,
  ServiceUnavailable,
} from './service-types.ts'
import type { LocalCallResponsibility } from './call-state.ts'
import type { ModelCallContentStore } from './model-call-facts.ts'
import type { SessionModelSelectionFactory } from './session-selection-types.ts'
import type {
  SettlementLogBinding,
  SettlementOwner,
  SettlementRegistration,
} from './settlement-types.ts'
import type { AfterModelCallFailureSubject } from '@omne-harness-lite/loop-extension'
import type { ModelResponse } from '@omne-harness-lite/model-response'
import type { SourceToken } from '@omne-harness-lite/session-log'

export type SessionModelReadMethods = Pick<
  ModelRuntimeOperations,
  | 'legalTargets'
  | 'displayList'
  | 'effectiveModel'
  | 'selectModel'
  | 'readAttempts'
  | 'canDispatchAgain'
>

export interface SessionModelReadHost {
  readonly sessions: RuntimeSessionAccess
  readonly callAccess: CallAccess
  readonly history: Pick<CurrentHistoryReaders, 'call' | 'failure'>
  readonly selectionFactory: SessionModelSelectionFactory
  readonly local: (key: CallKey) => {
    readonly responsibility: LocalCallResponsibility | undefined
    readonly usable: () => boolean
  }
}

export interface SessionModelReadInput extends SessionModelReadHost {
  readonly content: Pick<ModelCallContentStore, 'read'>
  readonly custody?: {
    readonly view: (
      binding: SettlementLogBinding,
      facts: AcknowledgedCallFacts,
    ) => Promise<AcknowledgedCallView | ServiceUnavailable>
    readonly close?: () => Promise<RuntimeCloseResult>
  }
}

export interface SessionModelReads {
  readonly methods: SessionModelReadMethods
  readonly project: (input: SessionModelReadHost) => SessionModelReads
  readonly close: () => Promise<RuntimeCloseResult>
}
export type SessionModelReadFactory = (input: SessionModelReadInput) => SessionModelReads

export interface SessionModelFailureReadInput {
  readonly binding: SettlementLogBinding
  readonly registration: SettlementRegistration
  readonly callId: CallKey['callId']
  readonly response: ModelResponse
  readonly history: Pick<CurrentHistoryReaders, 'call' | 'failure'>
  readonly owner: SettlementOwner
  readonly consume?: {
    readonly usable: () => boolean
    readonly retain: (source: ModelFailureSource) => void
    readonly forget: (source: ModelFailureSource) => void
  }
}
export type SessionModelFailureReadResult =
  | ServiceUnavailable
  | {
      readonly subject: AfterModelCallFailureSubject
      readonly source?: ModelFailureSource
    }
export type SessionModelSourceCapture = (input: {
  readonly binding: SettlementLogBinding
  readonly registration: SettlementRegistration
}) => Promise<{ readonly source: SourceToken } | ServiceUnavailable>
