// Compile-time checks of the `./cordis` augmentation. Each `@ts-expect-error` names the diagnostic
// that the accepted types must produce.
import type { Context, Events } from '@deepseek-ai/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  ModelCallId,
  ModelConverterCatalog,
  ModelDirectory,
  ModelOperationId,
  ModelSendBoundary,
  Revision,
  SendResult,
  TransportFact,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { expectTypeOf, it } from 'vitest'
import {
  modelClockKey,
  modelCommandsKey,
  modelConverterAuthorityKey,
  modelConvertersKey,
  modelDiagnosticsKey,
  modelHostAuthorityKey,
  modelInstanceHostKey,
  modelInstancesKey,
  modelMessageConversionKey,
  modelProfileMaintenanceKey,
  modelProfilesKey,
  modelPublicationAuthorityKey,
  modelRequestPreparationKey,
  modelRetryPolicyKey,
  modelRuntimeKey,
  modelSendBoundaryKey,
  type ModelClockService,
  type ModelCommandsService,
  type ModelConverterAuthorityService,
  type ModelConverterRegistration,
  type ModelConverterRegistrationInput,
  type ModelConvertersService,
  type ModelDiagnosticsService,
  type ModelHostAuthorityService,
  type ModelInstanceHostService,
  type ModelInstancesService,
  type ModelMessageConversionService,
  type ModelProfileMaintenanceService,
  type ModelProfilesService,
  type ModelPublicationAuthorityService,
  type ModelRegistration,
  type ModelRegistrationFailure,
  type ModelRegistrationInput,
  type ModelRequestPreparationService,
  type ModelRetryPolicyService,
  type ModelRuntimeService,
  type ModelSendBoundaryService,
} from '@omne-harness/model-cordis-contract/cordis'

declare const ctx: Context
declare const tenant: TenantId
declare const call: ModelCallId
declare const operation: ModelOperationId
declare const revision: Revision

it('types the injected Model services on the context', () => {
  expectTypeOf(ctx.modelClock).toEqualTypeOf<ModelClockService>()
  expectTypeOf(ctx.modelProfiles).toEqualTypeOf<ModelProfilesService<unknown>>()
  expectTypeOf(ctx.modelProfileMaintenance).toEqualTypeOf<ModelProfileMaintenanceService<unknown>>()
  expectTypeOf(ctx.modelRequestPreparation).toEqualTypeOf<ModelRequestPreparationService<unknown>>()
  expectTypeOf(ctx.modelMessageConversion).toEqualTypeOf<ModelMessageConversionService<unknown>>()
  expectTypeOf(ctx.modelHostAuthority).toEqualTypeOf<ModelHostAuthorityService<unknown>>()
  expectTypeOf(ctx.modelConverterAuthority).toEqualTypeOf<ModelConverterAuthorityService<unknown>>()
  expectTypeOf(ctx.modelDiagnostics).toEqualTypeOf<ModelDiagnosticsService<unknown>>()
  expectTypeOf(ctx.modelRetryPolicy).toEqualTypeOf<ModelRetryPolicyService<unknown>>()
  expectTypeOf(ctx.modelConverters).toEqualTypeOf<ModelConvertersService<unknown>>()
  expectTypeOf(ctx.modelRuntime).toEqualTypeOf<ModelRuntimeService<unknown>>()
  expectTypeOf(ctx.modelCommands).toEqualTypeOf<ModelCommandsService<unknown>>()
  expectTypeOf(ctx.modelSendBoundary).toEqualTypeOf<ModelSendBoundaryService<unknown>>()
  expectTypeOf<ModelSendBoundaryService<unknown>['send']>().toEqualTypeOf<
    ModelSendBoundary<unknown>['send']
  >()
  expectTypeOf(ctx.modelSendBoundary.send).returns.toEqualTypeOf<Promise<SendResult>>()
  expectTypeOf<Extract<SendResult, { kind: 'started' }>>().toEqualTypeOf<
    Readonly<{ kind: 'started'; window: string; facts: AsyncIterable<TransportFact> }>
  >()
  expectTypeOf(ctx.modelInstanceHost).toEqualTypeOf<ModelInstanceHostService<unknown>>()
  expectTypeOf(ctx.modelInstances).toEqualTypeOf<ModelInstancesService<unknown>>()
  expectTypeOf(ctx.modelPublicationAuthority).toEqualTypeOf<
    ModelPublicationAuthorityService<unknown>
  >()
})

it('gives the converter catalog the catalog operation of the contract and a registration of its own', () => {
  expectTypeOf<ModelConvertersService<string>['acquire']>().toEqualTypeOf<
    ModelConverterCatalog<string>['acquire']
  >()
  expectTypeOf<ModelConvertersService<string>['register']>().toEqualTypeOf<
    (
      input: ModelConverterRegistrationInput<string>,
    ) => Promise<Outcome<ModelConverterRegistration, ModelRegistrationFailure>>
  >()
})

it('gives the instance directory the directory operation of the contract and a registration of its own', () => {
  expectTypeOf<ModelInstancesService<string>['connect']>().toEqualTypeOf<
    ModelDirectory<string>['connect']
  >()
  expectTypeOf<ModelInstancesService<string>['register']>().toEqualTypeOf<
    (
      input: ModelRegistrationInput<string>,
    ) => Promise<Outcome<ModelRegistration, ModelRegistrationFailure>>
  >()
})

it('types each key constant as the literal that names its context member', () => {
  expectTypeOf<typeof modelClockKey>().toEqualTypeOf<'modelClock'>()
  expectTypeOf<typeof modelProfilesKey>().toEqualTypeOf<'modelProfiles'>()
  expectTypeOf<typeof modelProfileMaintenanceKey>().toEqualTypeOf<'modelProfileMaintenance'>()
  expectTypeOf<typeof modelRequestPreparationKey>().toEqualTypeOf<'modelRequestPreparation'>()
  expectTypeOf<typeof modelMessageConversionKey>().toEqualTypeOf<'modelMessageConversion'>()
  expectTypeOf<typeof modelHostAuthorityKey>().toEqualTypeOf<'modelHostAuthority'>()
  expectTypeOf<typeof modelConverterAuthorityKey>().toEqualTypeOf<'modelConverterAuthority'>()
  expectTypeOf<typeof modelConvertersKey>().toEqualTypeOf<'modelConverters'>()
  expectTypeOf<typeof modelDiagnosticsKey>().toEqualTypeOf<'modelDiagnostics'>()
  expectTypeOf<typeof modelRetryPolicyKey>().toEqualTypeOf<'modelRetryPolicy'>()
  expectTypeOf<typeof modelRuntimeKey>().toEqualTypeOf<'modelRuntime'>()
  expectTypeOf<typeof modelCommandsKey>().toEqualTypeOf<'modelCommands'>()
  expectTypeOf<typeof modelSendBoundaryKey>().toEqualTypeOf<'modelSendBoundary'>()
  expectTypeOf<typeof modelInstanceHostKey>().toEqualTypeOf<'modelInstanceHost'>()
  expectTypeOf<typeof modelInstancesKey>().toEqualTypeOf<'modelInstances'>()
  expectTypeOf<typeof modelPublicationAuthorityKey>().toEqualTypeOf<'modelPublicationAuthority'>()
})

it('carries only tenant, call and revision on model-cordis-contract/call-changed', () => {
  expectTypeOf<Parameters<Events['model-cordis-contract/call-changed']>>().toEqualTypeOf<
    [tenant: TenantId, call: ModelCallId, revision: Revision]
  >()
  void ctx.parallel('model-cordis-contract/call-changed', tenant, call, revision)
  // @ts-expect-error TS2769: No overload matches, because 'ModelOperationId' is not assignable to parameter 'call' of type 'ModelCallId'.
  void ctx.parallel('model-cordis-contract/call-changed', tenant, operation, revision)
})
