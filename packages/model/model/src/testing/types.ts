import type {
  ExecutionRef,
  ModelConsumerOwnerDeclaration,
} from '@omne-harness/model-contract/provider'
import type { ModelOperationId } from '@omne-harness/model-contract'
import {
  MODEL_WRITE_METHODS,
  type CommandAction,
  type CommandResource,
  type ModelCommandsAuthority,
  type ModelCommandsCoreOptions,
  type ModelCommandsEvidence,
  type ModelCommandsLimits,
  type ModelSendSource,
  type ModelWriteMethod,
  type ResultPaging,
} from '../commands/types.ts'

// The memory commands use the shared core's ports and options unchanged.
export type { EvidenceContext, ResultPaging } from '../commands/types.ts'
export type MemoryAction = CommandAction
export type MemoryResource = CommandResource
export type MemoryModelAuthority<P> = ModelCommandsAuthority<P>
export type MemoryModelEvidence = ModelCommandsEvidence
export type MemoryModelLimits = ModelCommandsLimits
export type MemoryModelCommandsOptions<P> = ModelCommandsCoreOptions<P>
export const MEMORY_WRITE_METHODS = MODEL_WRITE_METHODS
export type MemoryWriteMethod = ModelWriteMethod
export type UnknownInjection = Pick<ExecutionRef, 'tenant' | 'call'> &
  Readonly<{
    operation: ModelOperationId
    method: MemoryWriteMethod
    effect: 'applied' | 'not-applied'
  }>
export interface MemoryModelControl {
  configureResultPaging(input: Pick<ExecutionRef, 'tenant' | 'call'> & ResultPaging): void
  injectUnknown(input: UnknownInjection): void
  reveal(
    input: Pick<UnknownInjection, 'tenant' | 'call' | 'operation'> &
      Readonly<{ result: 'committed' | 'rolled-back' | 'not-committed' }>,
  ): void
  replaceOwners(owners: readonly ModelConsumerOwnerDeclaration[]): void
  setCleanupFailure(
    input: Pick<ExecutionRef, 'tenant' | 'call'> & Readonly<{ diagnostic: string | null }>,
  ): void
}

/** Explicit trusted assembly registration. current runs inside MemoryState's synchronous fence. */
export type MemorySendSource<P> = ModelSendSource<P>
