import { Context, Service } from '@deepseek-ai/cordis'
import type {
  ModelTransportService as Operations0,
  ModelTransportSupport as Operations1,
  ModelInputMeters as Operations2,
  ModelRetrySample as Operations3,
  DevelopmentTransportTls as Operations4,
} from './index.ts'

/** @contract capability.model-request-runtime */
export abstract class ModelTransportService extends Service implements Operations0 {
  static readonly provide = 'modelTransport'
  constructor(ctx: Context) {
    super(ctx, ModelTransportService.provide)
  }
  abstract clearReuseScope(
    ...args: Parameters<Operations0['clearReuseScope']>
  ): ReturnType<Operations0['clearReuseScope']>
  abstract diagnostics(
    ...args: Parameters<Operations0['diagnostics']>
  ): ReturnType<Operations0['diagnostics']>
  abstract registerAdaptation(
    ...args: Parameters<Operations0['registerAdaptation']>
  ): ReturnType<Operations0['registerAdaptation']>
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
  constructor(ctx: Context) {
    super(ctx, ModelTransportSupportService.provide)
  }
  abstract readonly imageCodec?: Exclude<Operations1['imageCodec'], undefined>
  abstract readonly retirementSchedule: Operations1['retirementSchedule']
  abstract readonly onDiagnostic?: Exclude<Operations1['onDiagnostic'], undefined>
  abstract readonly registryDiagnostics?: Exclude<Operations1['registryDiagnostics'], undefined>
}
export const MODEL_TRANSPORT_SUPPORT = ModelTransportSupportService.provide

/** @contract capability.model-request-runtime */
export abstract class ModelInputMetersService extends Service implements Operations2 {
  static readonly provide = 'modelInputMeters'
  constructor(ctx: Context) {
    super(ctx, ModelInputMetersService.provide)
  }
  abstract select(...args: Parameters<Operations2['select']>): ReturnType<Operations2['select']>
}
export const MODEL_INPUT_METERS = ModelInputMetersService.provide

/** @contract capability.model-request-runtime */
export abstract class ModelRetrySampleService extends Service implements Operations3 {
  static readonly provide = 'modelRetrySample'
  constructor(ctx: Context) {
    super(ctx, ModelRetrySampleService.provide)
  }
  abstract sample(...args: Parameters<Operations3['sample']>): ReturnType<Operations3['sample']>
}
export const MODEL_RETRY_SAMPLE = ModelRetrySampleService.provide

/** @contract capability.model-request-runtime */
export abstract class DevelopmentTransportTlsService extends Service implements Operations4 {
  static readonly provide = 'developmentTransportTls'
  constructor(ctx: Context) {
    super(ctx, DevelopmentTransportTlsService.provide)
  }
  abstract readCa(...args: Parameters<Operations4['readCa']>): ReturnType<Operations4['readCa']>
}
export const DEVELOPMENT_TRANSPORT_TLS = DevelopmentTransportTlsService.provide

import type {
  ModelRuntimeOperations as Operations,
  ModelRuntimeHostInputOperations,
  ModelRuntimeExecutionSupport,
  SettlementCoordinatorFactory,
  FailureConsumption,
  DispatchInput,
  DispatchResult,
  DispatchAgainInput,
  DispatchAgainResult,
  ReadAttemptsResult,
} from './index.ts'
import type { CallKey } from '@omne-harness-lite/messages'

/** @contract capability.model-request-runtime */
export abstract class ModelRuntimeService extends Service implements Operations {
  static readonly provide = 'modelRuntime'
  constructor(ctx: Context) {
    super(ctx, ModelRuntimeService.provide)
  }
  abstract acquireCall(
    ...args: Parameters<Operations['acquireCall']>
  ): ReturnType<Operations['acquireCall']>
  abstract legalTargets(
    ...args: Parameters<Operations['legalTargets']>
  ): ReturnType<Operations['legalTargets']>
  abstract displayList(
    ...args: Parameters<Operations['displayList']>
  ): ReturnType<Operations['displayList']>
  abstract effectiveModel(
    ...args: Parameters<Operations['effectiveModel']>
  ): ReturnType<Operations['effectiveModel']>
  abstract selectModel(
    ...args: Parameters<Operations['selectModel']>
  ): ReturnType<Operations['selectModel']>
  abstract openCall(...args: Parameters<Operations['openCall']>): ReturnType<Operations['openCall']>
  abstract dispatch(input: DispatchInput): Promise<DispatchResult>
  abstract dispatch(
    input: DispatchInput,
    options: { readonly consumeFailure: true },
  ): Promise<FailureConsumption<DispatchResult>>
  abstract dispatchAgain(input: DispatchAgainInput): Promise<DispatchAgainResult>
  abstract dispatchAgain(
    input: DispatchAgainInput,
    options: { readonly consumeFailure: true },
  ): Promise<FailureConsumption<DispatchAgainResult>>
  abstract interrupt(
    ...args: Parameters<Operations['interrupt']>
  ): ReturnType<Operations['interrupt']>
  abstract releaseCall(
    ...args: Parameters<Operations['releaseCall']>
  ): ReturnType<Operations['releaseCall']>
  abstract reconcile(
    ...args: Parameters<Operations['reconcile']>
  ): ReturnType<Operations['reconcile']>
  abstract readAttempts(input: CallKey): Promise<ReadAttemptsResult>
  abstract readAttempts(
    input: CallKey,
    options: { readonly consumeFailure: true },
  ): Promise<FailureConsumption<ReadAttemptsResult>>
  abstract settleReply(
    ...args: Parameters<Operations['settleReply']>
  ): ReturnType<Operations['settleReply']>
  abstract canDispatchAgain(
    ...args: Parameters<Operations['canDispatchAgain']>
  ): ReturnType<Operations['canDispatchAgain']>
  abstract acknowledgeCall(
    ...args: Parameters<Operations['acknowledgeCall']>
  ): ReturnType<Operations['acknowledgeCall']>
}
export const MODEL_RUNTIME_SERVICE = ModelRuntimeService.provide
/** @contract capability.model-request-runtime */
export abstract class ModelRuntimeHostInputsService
  extends Service
  implements ModelRuntimeHostInputOperations
{
  static readonly provide = 'modelRuntimeHostInputs'
  constructor(ctx: Context) {
    super(ctx, ModelRuntimeHostInputsService.provide)
  }
  abstract capture(): ReturnType<ModelRuntimeHostInputOperations['capture']>
}
export const MODEL_RUNTIME_HOST_INPUTS = ModelRuntimeHostInputsService.provide
/** @contract capability.model-request-runtime */
export abstract class ModelRuntimeExecutionSupportService
  extends Service
  implements ModelRuntimeExecutionSupport
{
  static readonly provide = 'modelRuntimeExecutionSupport'
  constructor(ctx: Context) {
    super(ctx, ModelRuntimeExecutionSupportService.provide)
  }
  abstract readonly settlementContention: ModelRuntimeExecutionSupport['settlementContention']
  abstract readonly settlementScheduler: ModelRuntimeExecutionSupport['settlementScheduler']
  abstract readonly policy: ModelRuntimeExecutionSupport['policy']
  abstract readonly acknowledgementCleanup: ModelRuntimeExecutionSupport['acknowledgementCleanup']
  abstract readonly diagnostic: ModelRuntimeExecutionSupport['diagnostic']
  abstract readonly diagnosticCollector?: Exclude<
    ModelRuntimeExecutionSupport['diagnosticCollector'],
    undefined
  >
}
export const MODEL_RUNTIME_EXECUTION_SUPPORT = ModelRuntimeExecutionSupportService.provide

/** Trusted construction face. It does not grant log or execution authority.
 * @contract capability.model-request-runtime
 */
export abstract class SettlementCoordinatorFactoryService
  extends Service
  implements SettlementCoordinatorFactory
{
  static readonly provide = 'modelSettlementFactory'
  constructor(ctx: Context) {
    super(ctx, SettlementCoordinatorFactoryService.provide)
  }
  abstract readonly create: SettlementCoordinatorFactory['create']
}
export const MODEL_SETTLEMENT_FACTORY = SettlementCoordinatorFactoryService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    modelSettlementFactory: SettlementCoordinatorFactoryService
    modelRuntime: ModelRuntimeService
    modelRuntimeHostInputs: ModelRuntimeHostInputsService
    modelRuntimeExecutionSupport: ModelRuntimeExecutionSupportService
    modelTransport: ModelTransportService
    modelTransportSupport: ModelTransportSupportService
    modelInputMeters: ModelInputMetersService
    modelRetrySample: ModelRetrySampleService
    developmentTransportTls: DevelopmentTransportTlsService
  }
}
