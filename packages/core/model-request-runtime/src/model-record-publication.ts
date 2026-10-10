import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { ModelCallCreatedPayload, ModelCallPayloadRef } from '@omne-harness-lite/messages'
import type { PendingModelResponse } from '@omne-harness-lite/model-response'
import type { AppendResult, OwnedLogEntry } from '@omne-harness-lite/session-log'
import type {
  RuntimeCloseResult,
  ServiceInvalidInput,
  ServiceUnavailable,
} from './service-types.ts'
import type {
  SettlementLogBinding,
  SettlementOwner,
  SettlementRegistration,
  SettlementTask,
} from './settlement-types.ts'

export type ModelCallContentValue =
  | { readonly kind: 'created'; readonly value: ModelCallCreatedPayload }
  | { readonly kind: 'reply_ready'; readonly value: PendingModelResponse }

export interface ModelCallPublishPermit {
  readonly release: () => Promise<RuntimeCloseResult>
}

export interface ModelCallContentWriter {
  readonly put: (input: {
    readonly binding: SettlementLogBinding
    readonly locator: string
    readonly version: string
    readonly content: ModelCallContentValue
  }) => Promise<
    | { readonly ref: ModelCallPayloadRef; readonly permit: ModelCallPublishPermit }
    | ServiceInvalidInput
    | ServiceUnavailable
  >
}

export interface ModelCallPublicationInput {
  readonly binding: SettlementLogBinding
  readonly owner: SettlementOwner
  readonly concurrent: JsonNumber
  readonly read: <T>(
    operation: (registration: SettlementRegistration) => Promise<T>,
  ) => Promise<{ readonly ok: T } | ServiceUnavailable>
  readonly contentStore: ModelCallContentWriter
  readonly content: ModelCallContentValue
  readonly locator: string
  readonly version: string
  readonly at: string
  readonly retainUnknown: (
    registration: SettlementRegistration,
    task: SettlementTask<AppendResult>,
    permit: ModelCallPublishPermit,
    entry: OwnedLogEntry,
  ) => void
  readonly trackTask?: (task: SettlementTask<AppendResult>) => () => void
}

export type ModelCallPublication = (
  input: ModelCallPublicationInput,
) => Promise<{ readonly published: true } | ServiceUnavailable>
