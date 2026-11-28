import type { CallAccount } from '@omne-harness/call-account'
import type { ResultPart } from './call-surface.ts'
import type { LiveFrame } from './live-call.ts'
import type { ModelInvocationRef } from './reference.ts'
import type { Settlement } from './result.ts'
import type { ConsumerRef, DispatchId, ResultVersion } from './root.ts'

export type ModelDeliveryKey =
  | Readonly<{
      kind: 'result'
      reference: ModelInvocationRef
      result: ResultVersion
    }>
  | Readonly<{
      kind: 'account'
      reference: ModelInvocationRef
      dispatch: DispatchId
      revision: CallAccount['revision']
    }>
  | Readonly<{ kind: 'live'; reference: ModelInvocationRef; from: number; to: number }>

export type ModelAccountSnapshot = Readonly<{
  dispatch: DispatchId
  account: CallAccount | null
}>

export type ModelDelivery =
  | Readonly<{
      kind: 'result'
      key: Extract<ModelDeliveryKey, { kind: 'result' }>
      consumer: ConsumerRef
      settlement: Settlement
      parts: readonly ResultPart[]
      accounts: readonly ModelAccountSnapshot[]
    }>
  | Readonly<{
      kind: 'account'
      key: Extract<ModelDeliveryKey, { kind: 'account' }>
      consumer: ConsumerRef
      account: CallAccount
    }>
  | Readonly<{
      kind: 'live'
      key: Extract<ModelDeliveryKey, { kind: 'live' }>
      consumer: ConsumerRef
      frames: readonly LiveFrame[]
    }>
