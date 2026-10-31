import { Service, type Context as CordisContext } from '@deepseek-ai/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  ModelCallId,
  ModelDiagnostics,
  ModelRuntime,
  Revision,
} from '@omne-harness/model-contract'
import type {
  CredentialPort,
  ModelClock,
  ModelCommands,
  ModelHostAuthority,
  ModelInstanceHost,
  ModelMessageConversion,
  ModelProfileMaintenance,
  ModelProfiles,
  ModelRequestPreparation,
  ModelRetryPolicy,
  ModelSendBoundary,
} from '@omne-harness/model-contract/provider'
import type { ModelConvertersService } from './converters.ts'
import type { ModelInstancesService } from './instances.ts'
import type { ModelConverterAuthority, ModelPublicationAuthority } from './registration.ts'

export { ModelConvertersService, modelConvertersKey } from './converters.ts'
export { ModelInstancesService, modelInstancesKey } from './instances.ts'
export type {
  ModelConverterAuthority,
  ModelConverterRegistration,
  ModelConverterRegistrationInput,
  ModelPublication,
  ModelPublicationAuthority,
  ModelRegistration,
  ModelRegistrationFailure,
  ModelRegistrationInput,
} from './registration.ts'

/**
 * The credential seam. `resolve` does not check who calls it: `face` and the tenant in the
 * reference are reported by the caller, so assembly must hand this service only to a trusted send
 * boundary. An implementation must not keep its port or custodian on the instance: every property
 * of the instance is reachable by any plugin that can read `ctx.modelCredential`.
 * @owner packages/model/model-cordis-contract
 */
export abstract class ModelCredentialService extends Service implements CredentialPort {
  static readonly provide = 'modelCredential'

  constructor(ctx: CordisContext) {
    super(ctx, ModelCredentialService.provide)
  }

  abstract readonly present: CredentialPort['present']
  abstract readonly resolve: CredentialPort['resolve']
}
export const modelCredentialKey = ModelCredentialService.provide

/** @owner packages/model/model-cordis-contract */
export abstract class ModelRuntimeService<P> extends Service implements ModelRuntime<P> {
  static readonly provide = 'modelRuntime'

  constructor(ctx: CordisContext) {
    super(ctx, ModelRuntimeService.provide)
  }

  abstract readonly calls: ModelRuntime<P>['calls']
  abstract readonly consumption: ModelRuntime<P>['consumption']
  abstract readonly instances: ModelRuntime<P>['instances']
}
export const modelRuntimeKey = ModelRuntimeService.provide

/** @owner packages/model/model-cordis-contract */
export abstract class ModelCommandsService<P> extends Service implements ModelCommands<P> {
  static readonly provide = 'modelCommands'

  constructor(ctx: CordisContext) {
    super(ctx, ModelCommandsService.provide)
  }

  abstract readonly admit: ModelCommands<P>['admit']
  abstract readonly recall: ModelCommands<P>['recall']
  abstract readonly scanPending: ModelCommands<P>['scanPending']
  abstract readonly loadRecovery: ModelCommands<P>['loadRecovery']
  abstract readonly claim: ModelCommands<P>['claim']
  abstract readonly prepareDispatch: ModelCommands<P>['prepareDispatch']
  abstract readonly recordMaterialization: ModelCommands<P>['recordMaterialization']
  abstract readonly recordSend: ModelCommands<P>['recordSend']
  abstract readonly openReceiveWindow: ModelCommands<P>['openReceiveWindow']
  abstract readonly preserve: ModelCommands<P>['preserve']
  abstract readonly recordLateFact: ModelCommands<P>['recordLateFact']
  abstract readonly prepareRetry: ModelCommands<P>['prepareRetry']
  abstract readonly decideRetry: ModelCommands<P>['decideRetry']
  abstract readonly settle: ModelCommands<P>['settle']
  abstract readonly control: ModelCommands<P>['control']
  abstract readonly acquireRead: ModelCommands<P>['acquireRead']
  abstract readonly nextRead: ModelCommands<P>['nextRead']
  abstract readonly endRead: ModelCommands<P>['endRead']
  abstract readonly handoff: ModelCommands<P>['handoff']
  abstract readonly advanceCleanup: ModelCommands<P>['advanceCleanup']
  abstract readonly query: ModelCommands<P>['query']
  abstract readonly dispatches: ModelCommands<P>['dispatches']
}
export const modelCommandsKey = ModelCommandsService.provide

/** @owner packages/model/model-cordis-contract */
export abstract class ModelSendBoundaryService<P> extends Service implements ModelSendBoundary<P> {
  static readonly provide = 'modelSendBoundary'

  constructor(ctx: CordisContext) {
    super(ctx, ModelSendBoundaryService.provide)
  }

  abstract readonly send: ModelSendBoundary<P>['send']
}
export const modelSendBoundaryKey = ModelSendBoundaryService.provide

/** @owner packages/model/model-cordis-contract */
export abstract class ModelInstanceHostService<P> extends Service implements ModelInstanceHost<P> {
  static readonly provide = 'modelInstanceHost'

  constructor(ctx: CordisContext) {
    super(ctx, ModelInstanceHostService.provide)
  }

  abstract readonly schedule: ModelInstanceHost<P>['schedule']
  abstract readonly publish: ModelInstanceHost<P>['publish']
  abstract readonly withdraw: ModelInstanceHost<P>['withdraw']
  abstract readonly directory: ModelInstanceHost<P>['directory']
}
export const modelInstanceHostKey = ModelInstanceHostService.provide

/** @owner packages/model/model-cordis-contract */
export abstract class ModelPublicationAuthorityService<P>
  extends Service
  implements ModelPublicationAuthority<P>
{
  static readonly provide = 'modelPublicationAuthority'

  constructor(ctx: CordisContext) {
    super(ctx, ModelPublicationAuthorityService.provide)
  }

  abstract readonly check: ModelPublicationAuthority<P>['check']
}
export const modelPublicationAuthorityKey = ModelPublicationAuthorityService.provide

/** @owner packages/model/model-cordis-contract */
export abstract class ModelRetryPolicyService<P> extends Service implements ModelRetryPolicy<P> {
  static readonly provide = 'modelRetryPolicy'

  constructor(ctx: CordisContext) {
    super(ctx, ModelRetryPolicyService.provide)
  }

  abstract readonly decide: ModelRetryPolicy<P>['decide']
  abstract readonly inspect: ModelRetryPolicy<P>['inspect']
}
export const modelRetryPolicyKey = ModelRetryPolicyService.provide

/** @owner packages/model/model-cordis-contract */
export abstract class ModelClockService extends Service implements ModelClock {
  static readonly provide = 'modelClock'

  constructor(ctx: CordisContext) {
    super(ctx, ModelClockService.provide)
  }

  abstract readonly now: ModelClock['now']
  abstract readonly waitUntil: ModelClock['waitUntil']
}
export const modelClockKey = ModelClockService.provide

/** @owner packages/model/model-cordis-contract */
export abstract class ModelProfilesService<P> extends Service implements ModelProfiles<P> {
  static readonly provide = 'modelProfiles'

  constructor(ctx: CordisContext) {
    super(ctx, ModelProfilesService.provide)
  }

  abstract readonly list: ModelProfiles<P>['list']
  abstract readonly resolve: ModelProfiles<P>['resolve']
}
export const modelProfilesKey = ModelProfilesService.provide

/** @owner packages/model/model-cordis-contract */
export abstract class ModelProfileMaintenanceService<P>
  extends Service
  implements ModelProfileMaintenance<P>
{
  static readonly provide = 'modelProfileMaintenance'

  constructor(ctx: CordisContext) {
    super(ctx, ModelProfileMaintenanceService.provide)
  }

  abstract readonly change: ModelProfileMaintenance<P>['change']
  abstract readonly inspect: ModelProfileMaintenance<P>['inspect']
}
export const modelProfileMaintenanceKey = ModelProfileMaintenanceService.provide

/** @owner packages/model/model-cordis-contract */
export abstract class ModelRequestPreparationService<P>
  extends Service
  implements ModelRequestPreparation<P>
{
  static readonly provide = 'modelRequestPreparation'

  constructor(ctx: CordisContext) {
    super(ctx, ModelRequestPreparationService.provide)
  }

  abstract readonly prepare: ModelRequestPreparation<P>['prepare']
}
export const modelRequestPreparationKey = ModelRequestPreparationService.provide

/** @owner packages/model/model-cordis-contract */
export abstract class ModelMessageConversionService<P>
  extends Service
  implements ModelMessageConversion<P>
{
  static readonly provide = 'modelMessageConversion'

  constructor(ctx: CordisContext) {
    super(ctx, ModelMessageConversionService.provide)
  }

  abstract readonly prepare: ModelMessageConversion<P>['prepare']
}
export const modelMessageConversionKey = ModelMessageConversionService.provide

/** @owner packages/model/model-cordis-contract */
export abstract class ModelHostAuthorityService<P>
  extends Service
  implements ModelHostAuthority<P>
{
  static readonly provide = 'modelHostAuthority'

  constructor(ctx: CordisContext) {
    super(ctx, ModelHostAuthorityService.provide)
  }

  abstract readonly resolve: ModelHostAuthority<P>['resolve']
}
export const modelHostAuthorityKey = ModelHostAuthorityService.provide

/** @owner packages/model/model-cordis-contract */
export abstract class ModelConverterAuthorityService<P>
  extends Service
  implements ModelConverterAuthority<P>
{
  static readonly provide = 'modelConverterAuthority'

  constructor(ctx: CordisContext) {
    super(ctx, ModelConverterAuthorityService.provide)
  }

  abstract readonly check: ModelConverterAuthority<P>['check']
}
export const modelConverterAuthorityKey = ModelConverterAuthorityService.provide

/** @owner packages/model/model-cordis-contract */
export abstract class ModelDiagnosticsService<P> extends Service implements ModelDiagnostics<P> {
  static readonly provide = 'modelDiagnostics'

  constructor(ctx: CordisContext) {
    super(ctx, ModelDiagnosticsService.provide)
  }

  abstract readonly list: ModelDiagnostics<P>['list']
}
export const modelDiagnosticsKey = ModelDiagnosticsService.provide

declare module '@deepseek-ai/cordis' {
  // The trusted identity adapter of an assembly narrows the principal type. Providers still
  // check every input at run time.
  interface Context {
    modelDiagnostics: ModelDiagnosticsService<unknown>
    modelRuntime: ModelRuntimeService<unknown>
    modelCommands: ModelCommandsService<unknown>
    modelSendBoundary: ModelSendBoundaryService<unknown>
    modelInstanceHost: ModelInstanceHostService<unknown>
    modelPublicationAuthority: ModelPublicationAuthorityService<unknown>
    modelRetryPolicy: ModelRetryPolicyService<unknown>
    modelClock: ModelClockService
    modelProfiles: ModelProfilesService<unknown>
    modelProfileMaintenance: ModelProfileMaintenanceService<unknown>
    modelRequestPreparation: ModelRequestPreparationService<unknown>
    modelMessageConversion: ModelMessageConversionService<unknown>
    modelHostAuthority: ModelHostAuthorityService<unknown>
    modelConverterAuthority: ModelConverterAuthorityService<unknown>
    modelConverters: ModelConvertersService<unknown>
    modelInstances: ModelInstancesService<unknown>
    modelCredential?: ModelCredentialService
  }
  interface Events {
    /**
     * A committed change of one model call, announced as `model-cordis-contract/call-changed`.
     *
     * @mode parallel
     * @param tenant Explicit tenant identity.
     * @param call Original model call identity.
     * @param revision Committed revision to query.
     */
    'model-cordis-contract/call-changed'(
      tenant: TenantId,
      call: ModelCallId,
      revision: Revision,
    ): void
  }
}
