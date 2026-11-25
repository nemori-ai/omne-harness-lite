import { heldPoint } from '@omne-harness/assets'
import { Service, type Context as CordisContext } from '@deepseek-ai/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  ConsumerRef,
  ModelCallId,
  ModelDiagnostics,
  ModelDispatchFacts,
  ModelPreparationResources,
  ModelResultReceiver,
  ModelRuntime,
  ModelStreamReferences,
  ModelStreamObservation,
  Revision,
} from '@omne-harness/model-contract'
import type {
  CredentialPort,
  ModelClock,
  ModelCommands,
  ModelHostAuthority,
  ModelInstanceHost,
  ModelMediaSource,
  ModelPreferencesPort,
  ModelProfileMaintenance,
  ModelProfiles,
  ModelRequestPreparation,
  ModelRetryPolicy,
  ModelSendBoundary,
} from '@omne-harness/model-contract/provider'
import type { ModelInstancesService } from './instances.ts'
import { createModelResultReceiverTable, type ModelResultReceiverTable } from './receivers.ts'
import type { ModelPublicationAuthority } from './registration.ts'

export { ModelInstancesService, modelInstancesKey } from './instances.ts'
export { ModelResultReceiverConflictError, createModelResultReceiverTable } from './receivers.ts'
export type { ModelResultReceiverTable } from './receivers.ts'
export type {
  ModelPublication,
  ModelPublicationAuthority,
  ModelRegistration,
  ModelRegistrationFailure,
  ModelRegistrationInput,
} from './registration.ts'

/**
 * The credential seam. Neither method checks who calls it: the `access` and the `official` fact
 * are reported by the caller, so assembly must hand this service only to a trusted preparation
 * and send boundary. An implementation must not keep its port or secret custody on the instance:
 * every property of the instance is reachable by any plugin that can read `ctx.modelCredential`.
 * @owner packages/model/model-cordis-contract
 */
export abstract class ModelCredentialService<P = unknown>
  extends Service
  implements CredentialPort<P>
{
  static readonly provide = 'modelCredential'

  constructor(ctx: CordisContext) {
    super(ctx, ModelCredentialService.provide)
  }

  abstract readonly layerOf: CredentialPort<P>['layerOf']
  abstract readonly resolve: CredentialPort<P>['resolve']
}
export const modelCredentialKey = ModelCredentialService.provide

export abstract class ModelPreferencesService<P = unknown>
  extends Service
  implements ModelPreferencesPort<P>
{
  static readonly provide = 'modelPreferences'

  constructor(ctx: CordisContext) {
    super(ctx, ModelPreferencesService.provide)
  }

  abstract readonly read: ModelPreferencesPort<P>['read']
}
export const modelPreferencesKey = ModelPreferencesService.provide

/**
 * The media seam of the send stage: read at each send, absent when no owner of media is installed.
 * @owner packages/model/model-cordis-contract
 */
export abstract class ModelMediaSourceService<P = unknown>
  extends Service
  implements ModelMediaSource<P>
{
  static readonly provide = 'modelMediaSource'

  constructor(ctx: CordisContext) {
    super(ctx, ModelMediaSourceService.provide)
  }

  abstract readonly open: ModelMediaSource<P>['open']
}
export const modelMediaSourceKey = ModelMediaSourceService.provide

/** @owner packages/model/model-cordis-contract */
export abstract class ModelStreamReferencesService<P>
  extends Service
  implements ModelStreamReferences<P>
{
  static readonly provide = 'modelStreamReferences'

  constructor(ctx: CordisContext) {
    super(ctx, ModelStreamReferencesService.provide)
  }

  abstract readonly current: ModelStreamReferences<P>['current']
}
export const modelStreamReferencesKey = ModelStreamReferencesService.provide

/** @owner packages/model/model-cordis-contract */
export abstract class ModelStreamObservationService<P>
  extends Service
  implements ModelStreamObservation<P>
{
  static readonly provide = 'modelStreamObservation'

  constructor(ctx: CordisContext) {
    super(ctx, ModelStreamObservationService.provide)
  }

  abstract readonly observe: ModelStreamObservation<P>['observe']
}
export const modelStreamObservationKey = ModelStreamObservationService.provide

/**
 * The runtime service. Besides the three abstract members of the root interface it carries one
 * concrete method, `registerResultReceiver`, for the consumer of results. The registration is an
 * effect of the calling plugin's fiber and ends with it. The table is the provider's: it creates
 * one with `createModelResultReceiverTable`, passes it to `super`, and resolves receivers from it
 * in its push stage. The table is in the constructor's closure and not on the instance, because
 * every property of the instance is reachable by any plugin that can read `ctx.modelRuntime`. A
 * provider that passes no table gets a private one that nothing can resolve from. The table holds
 * for one process only: how a push target is reached across processes is not defined here.
 * @owner packages/model/model-cordis-contract
 */
export abstract class ModelRuntimeService<P> extends Service implements ModelRuntime<P> {
  static readonly provide = 'modelRuntime'

  readonly registerResultReceiver: (
    owner: ConsumerRef['owner'],
    receiver: ModelResultReceiver<P>,
  ) => () => void

  constructor(
    ctx: CordisContext,
    receivers: ModelResultReceiverTable<P> = createModelResultReceiverTable<P>(),
  ) {
    super(ctx, ModelRuntimeService.provide)
    this.registerResultReceiver = function (this: ModelRuntimeService<P>, owner, receiver) {
      return receivers.register(this.ctx, owner, receiver)
    }
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
  abstract readonly loadOrigin: ModelCommands<P>['loadOrigin']
  abstract readonly loadRequest: ModelCommands<P>['loadRequest']
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
  abstract readonly abandon: ModelCommands<P>['abandon']
  abstract readonly confirmAccount: ModelCommands<P>['confirmAccount']
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

/**
 * The metering leases of request preparation. The request assembler takes a lease for a profile
 * before it plans and meters each candidate, and gives it back. It is a key of its own, not a
 * member of `modelRequestPreparation`: one seam, one definition. The provider of
 * `modelRequestPreparation` provides it on the same plugin fiber, so the leases and `prepare` live
 * and end together and read the same call facts.
 * @owner packages/model/model-cordis-contract
 */
export abstract class ModelPreparationResourcesService<P>
  extends Service
  implements ModelPreparationResources<P>
{
  static readonly provide = 'modelPreparationResources'

  constructor(ctx: CordisContext) {
    super(ctx, ModelPreparationResourcesService.provide)
  }

  abstract acquire(
    ...args: Parameters<ModelPreparationResources<P>['acquire']>
  ): ReturnType<ModelPreparationResources<P>['acquire']>
}
export const modelPreparationResourcesKey = ModelPreparationResourcesService.provide

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
export abstract class ModelDiagnosticsService<P> extends Service implements ModelDiagnostics<P> {
  static readonly provide = 'modelDiagnostics'

  constructor(ctx: CordisContext) {
    super(ctx, ModelDiagnosticsService.provide)
  }

  abstract readonly list: ModelDiagnostics<P>['list']
}
export const modelDiagnosticsKey = ModelDiagnosticsService.provide

/** @owner packages/model/model-cordis-contract */
export abstract class ModelDispatchFactsService<P>
  extends Service
  implements ModelDispatchFacts<P>
{
  static readonly provide = 'modelDispatchFacts'

  constructor(ctx: CordisContext) {
    super(ctx, ModelDispatchFactsService.provide)
  }

  abstract readonly list: ModelDispatchFacts<P>['list']
}
export const modelDispatchFactsKey = ModelDispatchFactsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    modelDiagnostics: ModelDiagnosticsService<unknown>
    modelDispatchFacts: ModelDispatchFactsService<unknown>
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
    modelPreparationResources: ModelPreparationResourcesService<unknown>
    modelHostAuthority: ModelHostAuthorityService<unknown>
    modelInstances: ModelInstancesService<unknown>
    modelStreamReferences?: ModelStreamReferencesService<unknown>
    modelStreamObservation?: ModelStreamObservationService<unknown>
    modelCredential?: ModelCredentialService
    modelMediaSource?: ModelMediaSourceService
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

/** The point of the category: each layer's held definitions are its items. */
export const modelProvidersPoint = heldPoint({
  name: 'model.providers',
  key: 'the provider name',
  summary: 'The model provider definitions each layer holds, by name.',
})
