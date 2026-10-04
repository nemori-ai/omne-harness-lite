import { Context, Service } from '@deepseek-ai/cordis'
import type { ModelTransportService as Operations0, ModelTransportSupport as Operations1, ModelInputMeters as Operations2, ModelRetrySample as Operations3, DevelopmentTransportTls as Operations4 } from './index.ts'

/** @contract capability.model-request-runtime */
export abstract class ModelTransportService extends Service implements Operations0 {
  static readonly provide = 'modelTransport'
  constructor(ctx: Context) { super(ctx, ModelTransportService.provide) }
  abstract clearReuseScope(...args: Parameters<Operations0['clearReuseScope']>): ReturnType<Operations0['clearReuseScope']>
  abstract diagnostics(...args: Parameters<Operations0['diagnostics']>): ReturnType<Operations0['diagnostics']>
  abstract registerAdaptation(...args: Parameters<Operations0['registerAdaptation']>): ReturnType<Operations0['registerAdaptation']>
  abstract acquire(...args: Parameters<Operations0['acquire']>): ReturnType<Operations0['acquire']>
  abstract retire(...args: Parameters<Operations0['retire']>): ReturnType<Operations0['retire']>
  abstract close(...args: Parameters<Operations0['close']>): ReturnType<Operations0['close']>
  abstract inspect(...args: Parameters<Operations0['inspect']>): ReturnType<Operations0['inspect']>
  abstract readonly closed: Operations0['closed']
}
export const MODEL_TRANSPORT = ModelTransportService.provide

/** @contract capability.model-request-runtime */
export abstract class ModelTransportSupportService extends Service implements Operations1 {
  static readonly provide = 'modelTransportSupport'
  constructor(ctx: Context) { super(ctx, ModelTransportSupportService.provide) }
  abstract readonly imageCodec?: Exclude<Operations1['imageCodec'], undefined>
  abstract readonly retirementSchedule: Operations1['retirementSchedule']
  abstract readonly onDiagnostic?: Exclude<Operations1['onDiagnostic'], undefined>
  abstract readonly registryDiagnostics?: Exclude<Operations1['registryDiagnostics'], undefined>
}
export const MODEL_TRANSPORT_SUPPORT = ModelTransportSupportService.provide

/** @contract capability.model-request-runtime */
export abstract class ModelInputMetersService extends Service implements Operations2 {
  static readonly provide = 'modelInputMeters'
  constructor(ctx: Context) { super(ctx, ModelInputMetersService.provide) }
  abstract select(...args: Parameters<Operations2['select']>): ReturnType<Operations2['select']>
}
export const MODEL_INPUT_METERS = ModelInputMetersService.provide

/** @contract capability.model-request-runtime */
export abstract class ModelRetrySampleService extends Service implements Operations3 {
  static readonly provide = 'modelRetrySample'
  constructor(ctx: Context) { super(ctx, ModelRetrySampleService.provide) }
  abstract sample(...args: Parameters<Operations3['sample']>): ReturnType<Operations3['sample']>
}
export const MODEL_RETRY_SAMPLE = ModelRetrySampleService.provide

/** @contract capability.model-request-runtime */
export abstract class DevelopmentTransportTlsService extends Service implements Operations4 {
  static readonly provide = 'developmentTransportTls'
  constructor(ctx: Context) { super(ctx, DevelopmentTransportTlsService.provide) }
  abstract readCa(...args: Parameters<Operations4['readCa']>): ReturnType<Operations4['readCa']>
}
export const DEVELOPMENT_TRANSPORT_TLS = DevelopmentTransportTlsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    modelTransport: ModelTransportService
    modelTransportSupport: ModelTransportSupportService
    modelInputMeters: ModelInputMetersService
    modelRetrySample: ModelRetrySampleService
    developmentTransportTls: DevelopmentTransportTlsService
  }
}
