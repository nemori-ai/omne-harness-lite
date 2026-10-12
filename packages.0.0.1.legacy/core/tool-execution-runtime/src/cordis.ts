import { Context, Service } from '@deepseek-ai/cordis'
import type {
  ToolRuntimeRegistryOperations,
  ToolRuntimeOperations,
  ToolImplementationOperations,
  ToolResultStorageOperations,
  ToolRuntimeStartupOperations,
} from './index.ts'

/** @contract capability.tool-execution-runtime */
export abstract class ToolRuntimeRegistryService
  extends Service
  implements ToolRuntimeRegistryOperations
{
  static readonly provide = 'toolRuntimeRegistry'
  constructor(ctx: Context) {
    super(ctx, ToolRuntimeRegistryService.provide)
  }
  abstract submit(
    ...args: Parameters<ToolRuntimeRegistryOperations['submit']>
  ): ReturnType<ToolRuntimeRegistryOperations['submit']>
  abstract acquire(
    ...args: Parameters<ToolRuntimeOperations['acquire']>
  ): ReturnType<ToolRuntimeOperations['acquire']>
  abstract stop(
    ...args: Parameters<ToolRuntimeOperations['stop']>
  ): ReturnType<ToolRuntimeOperations['stop']>
  abstract answer(
    ...args: Parameters<ToolRuntimeOperations['answer']>
  ): ReturnType<ToolRuntimeOperations['answer']>
  /** Effect belongs to the calling plugin; the disposer withdraws this exact generation. */
  abstract register(
    ...args: Parameters<ToolRuntimeRegistryOperations['register']>
  ): ReturnType<ToolRuntimeRegistryOperations['register']>
}
export const TOOL_RUNTIME_REGISTRY = ToolRuntimeRegistryService.provide

/** @contract capability.tool-execution-runtime */
export abstract class ToolImplementationsService
  extends Service
  implements ToolImplementationOperations
{
  static readonly provide = 'toolImplementations'
  constructor(ctx: Context) {
    super(ctx, ToolImplementationsService.provide)
  }
  abstract register(
    ...args: Parameters<ToolImplementationOperations['register']>
  ): ReturnType<ToolImplementationOperations['register']>
  abstract acquire(
    ...args: Parameters<ToolImplementationOperations['acquire']>
  ): ReturnType<ToolImplementationOperations['acquire']>
}
export const TOOL_IMPLEMENTATIONS = ToolImplementationsService.provide

/** @contract capability.tool-execution-runtime */
export abstract class ToolResultsService extends Service implements ToolResultStorageOperations {
  static readonly provide = 'toolResults'
  constructor(ctx: Context) {
    super(ctx, ToolResultsService.provide)
  }
  abstract readResult(
    ...args: Parameters<ToolResultStorageOperations['readResult']>
  ): ReturnType<ToolResultStorageOperations['readResult']>
  abstract readBytes(
    ...args: Parameters<ToolResultStorageOperations['readBytes']>
  ): ReturnType<ToolResultStorageOperations['readBytes']>
  abstract bindWriter(
    ...args: Parameters<ToolResultStorageOperations['bindWriter']>
  ): ReturnType<ToolResultStorageOperations['bindWriter']>
  abstract available(
    ...args: Parameters<ToolResultStorageOperations['available']>
  ): ReturnType<ToolResultStorageOperations['available']>
  abstract readForDelivery(
    ...args: Parameters<ToolResultStorageOperations['readForDelivery']>
  ): ReturnType<ToolResultStorageOperations['readForDelivery']>
  abstract readDeliveryBytes(
    ...args: Parameters<ToolResultStorageOperations['readDeliveryBytes']>
  ): ReturnType<ToolResultStorageOperations['readDeliveryBytes']>
}
export const TOOL_RESULTS = ToolResultsService.provide

/** @owner packages/core/tool-execution-runtime */
export abstract class ToolRuntimeStartupService
  extends Service
  implements ToolRuntimeStartupOperations
{
  static readonly provide = 'toolRuntimeStartup' as const
  constructor(ctx: Context) {
    super(ctx, ToolRuntimeStartupService.provide)
  }
  abstract start: ToolRuntimeStartupOperations['start']
  abstract retainClose: ToolRuntimeStartupOperations['retainClose']
}
export const TOOL_RUNTIME_STARTUP = ToolRuntimeStartupService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    toolRuntimeStartup: ToolRuntimeStartupService
    toolRuntimeRegistry: ToolRuntimeRegistryService
    toolImplementations: ToolImplementationsService
    toolResults: ToolResultsService
  }
  interface Events {
    /** @mode emit Wake hint only. Query through current authorization. */
    'tool-execution-runtime/cache-invalidated'(): void
  }
}
