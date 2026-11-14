import type { Outcome } from '@omne-harness/operation-result'
import type {
  FixedModelRequest,
  ModelCallId,
  ModelFailure,
  ModelOperationId,
} from '@omne-harness/model-contract'
import type { BindingBase, CallDocument, TenantDocuments } from './types.ts'

export type CommandWrite = Readonly<{
  operation: ModelOperationId
  expected: CallDocument | undefined
  call: CallDocument | undefined
  binding: BindingBase
  body?: FixedModelRequest
}>

export type RunScope = Readonly<{
  tenant: string
  call?: ModelCallId
  operation?: ModelOperationId
}>

export type PendingPage = Readonly<{ calls: readonly ModelCallId[]; next: string | null }>

export interface ModelCommandStorage {
  run<T>(work: () => Outcome<T, ModelFailure>, scope?: RunScope): Promise<Outcome<T, ModelFailure>>
  documents(tenant: string): TenantDocuments
  held(): number
  readBody(
    tenant: string,
    call: ModelCallId,
  ): Promise<Outcome<FixedModelRequest | null, ModelFailure>>
  commit(tenant: string, write: CommandWrite): 'committed' | 'unknown'
  publish(tenant: string, call: CallDocument): void
  pending?(
    tenant: string,
    after: string | null,
    limit: number,
  ): Promise<Outcome<PendingPage, ModelFailure>>
}
