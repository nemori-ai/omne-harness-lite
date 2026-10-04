import { Context, Service } from '@deepseek-ai/cordis'
import type { RuntimeContextOperations, ContextSourceRegistrations } from './index.ts'

/** @owner packages/core/runtime-context */
export abstract class RuntimeContextService extends Service implements RuntimeContextOperations, ContextSourceRegistrations {
  static readonly provide = 'runtimeContext'
  constructor(ctx: Context) { super(ctx, RuntimeContextService.provide) }
  abstract bind(...args: Parameters<RuntimeContextOperations['bind']>): ReturnType<RuntimeContextOperations['bind']>
  abstract registrations(...args: Parameters<RuntimeContextOperations['registrations']>): ReturnType<RuntimeContextOperations['registrations']>
  abstract register(...args: Parameters<RuntimeContextOperations['register']>): ReturnType<RuntimeContextOperations['register']>
  abstract update(...args: Parameters<RuntimeContextOperations['update']>): ReturnType<RuntimeContextOperations['update']>
  abstract remove(...args: Parameters<RuntimeContextOperations['remove']>): ReturnType<RuntimeContextOperations['remove']>
  abstract registerSource(...args: Parameters<ContextSourceRegistrations['registerSource']>): ReturnType<ContextSourceRegistrations['registerSource']>
}
export const RUNTIME_CONTEXT = RuntimeContextService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    runtimeContext: RuntimeContextService
  }
  interface Events {
    /** @mode emit Wake hint only. Query through current authorization. */
    'runtime-context/cache-invalidated'(): void
  }
}
