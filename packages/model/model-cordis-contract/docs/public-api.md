<a id="model-cordis-公开定义候选"></a>
# Model Cordis 公开定义

根与 ./cordis 已由模板建立，均为空导出。以下是已接受的唯一服务与登记形状，不是现有可导入接口。领域类型由[纯契约](../../model-contract/docs/public-api.md)拥有，登记行为由[SPEC](../SPEC.md)拥有。

## 服务定义与入口

```ts
import { Context, Service } from '@deepseek-ai/cordis'
import type { ModelRuntime, ModelDirectory, ModelInstanceHost, DurableEvidence, ModelCommands, ModelSendBoundary, ModelRetryPolicy,
  ModelClock, ModelProfiles, ModelProfileMaintenance, ModelRequestPreparation,
  ModelMessageConversion, ModelConverterCatalog, ModelConverter, ConverterKey, Adoption,
  ModelHostAuthority, ModelCallId, Revision, ModelDiagnostics } from '@omne-harness/model-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/kernel-basis'

/** @owner packages/model/model-cordis-contract */
export abstract class ModelRuntimeService<P> extends Service implements ModelRuntime<P> {
  static readonly provide = 'modelRuntime'
  constructor(ctx: Context) { super(ctx, ModelRuntimeService.provide) }
  abstract readonly calls: ModelRuntime<P>['calls']
  abstract readonly consumption: ModelRuntime<P>['consumption']
  abstract readonly instances: ModelRuntime<P>['instances']
}
export const modelRuntimeKey = ModelRuntimeService.provide

export type ModelPublication = Extract<Awaited<ReturnType<ModelInstanceHost<never>['publish']>>, { ok: unknown }>['ok']
export type ModelRegistrationInput<P> = Readonly<{
  publication: Parameters<ModelInstanceHost<P>['publish']>
  authority: DurableEvidence
}>
export type ModelRegistrationFailure =
  | Readonly<{ kind: 'denied' | 'stale-publication' | 'conflict' }>
  | Readonly<{ kind: 'invalid'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
export type ModelRegistration = Readonly<{
  receipt: ModelPublication
  release(): Promise<Readonly<{ removed: boolean }>>
}>
export interface ModelPublicationAuthority<P> {
  check(input: ModelRegistrationInput<P>): Outcome<void, ModelRegistrationFailure>
}
/** @owner packages/model/model-cordis-contract */
export declare class ModelInstancesService<P> extends Service implements ModelDirectory<P> {
  static readonly provide = 'modelInstances'
  constructor(ctx: Context, authority: ModelPublicationAuthority<P>)
  readonly connect: ModelDirectory<P>['connect']
  register(input: ModelRegistrationInput<P>): Promise<Outcome<ModelRegistration, ModelRegistrationFailure>>
}
export const modelInstancesKey = ModelInstancesService.provide
```

其余服务键与端口对应见[Cordis 主题](cordis.md#依赖与定义拥有者)。真正源码接管后本页只导航到实际声明，不并存两套签名。

## 完整服务定义与类型增补

以下声明与上节属于同一设计入口。方法采用索引类型，不复制领域签名。

```ts
/** @owner packages/model/model-cordis-contract */
export abstract class ModelCommandsService<P> extends Service implements ModelCommands<P> {
  static readonly provide = 'modelCommands'
  constructor(ctx: Context) { super(ctx, ModelCommandsService.provide) }
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
  constructor(ctx: Context) { super(ctx, ModelSendBoundaryService.provide) }
  abstract readonly send: ModelSendBoundary<P>['send']
}
export const modelSendBoundaryKey = ModelSendBoundaryService.provide
/** @owner packages/model/model-cordis-contract */
export abstract class ModelRetryPolicyService<P> extends Service implements ModelRetryPolicy<P> {
  static readonly provide = 'modelRetryPolicy'
  constructor(ctx: Context) { super(ctx, ModelRetryPolicyService.provide) }
  abstract readonly decide: ModelRetryPolicy<P>['decide']
  abstract readonly inspect: ModelRetryPolicy<P>['inspect']
}
export const modelRetryPolicyKey = ModelRetryPolicyService.provide
/** @owner packages/model/model-cordis-contract */
export abstract class ModelInstanceHostService<P> extends Service implements ModelInstanceHost<P> {
  static readonly provide = 'modelInstanceHost'
  constructor(ctx: Context) { super(ctx, ModelInstanceHostService.provide) }
  abstract readonly schedule: ModelInstanceHost<P>['schedule']
  abstract readonly publish: ModelInstanceHost<P>['publish']
  abstract readonly withdraw: ModelInstanceHost<P>['withdraw']
  abstract readonly directory: ModelInstanceHost<P>['directory']
}
export const modelInstanceHostKey = ModelInstanceHostService.provide
/** @owner packages/model/model-cordis-contract */
export abstract class ModelClockService extends Service implements ModelClock {
  static readonly provide = 'modelClock'
  constructor(ctx: Context) { super(ctx, ModelClockService.provide) }
  abstract readonly now: ModelClock['now']
  abstract readonly waitUntil: ModelClock['waitUntil']
}
export const modelClockKey = ModelClockService.provide
/** @owner packages/model/model-cordis-contract */
export abstract class ModelProfilesService<P> extends Service implements ModelProfiles<P> {
  static readonly provide = 'modelProfiles'
  constructor(ctx: Context) { super(ctx, ModelProfilesService.provide) }
  abstract readonly list: ModelProfiles<P>['list']
  abstract readonly resolve: ModelProfiles<P>['resolve']
}
export const modelProfilesKey = ModelProfilesService.provide
/** @owner packages/model/model-cordis-contract */
export abstract class ModelProfileMaintenanceService<P> extends Service implements ModelProfileMaintenance<P> {
  static readonly provide = 'modelProfileMaintenance'
  constructor(ctx: Context) { super(ctx, ModelProfileMaintenanceService.provide) }
  abstract readonly change: ModelProfileMaintenance<P>['change']
  abstract readonly inspect: ModelProfileMaintenance<P>['inspect']
}
export const modelProfileMaintenanceKey = ModelProfileMaintenanceService.provide
/** @owner packages/model/model-cordis-contract */
export abstract class ModelRequestPreparationService<P> extends Service implements ModelRequestPreparation<P> {
  static readonly provide = 'modelRequestPreparation'
  constructor(ctx: Context) { super(ctx, ModelRequestPreparationService.provide) }
  abstract readonly prepare: ModelRequestPreparation<P>['prepare']
}
export const modelRequestPreparationKey = ModelRequestPreparationService.provide
/** @owner packages/model/model-cordis-contract */
export abstract class ModelMessageConversionService<P> extends Service implements ModelMessageConversion<P> {
  static readonly provide = 'modelMessageConversion'
  constructor(ctx: Context) { super(ctx, ModelMessageConversionService.provide) }
  abstract readonly prepare: ModelMessageConversion<P>['prepare']
}
export const modelMessageConversionKey = ModelMessageConversionService.provide
/** @owner packages/model/model-cordis-contract */
export abstract class ModelHostAuthorityService<P> extends Service implements ModelHostAuthority<P> {
  static readonly provide = 'modelHostAuthority'
  constructor(ctx: Context) { super(ctx, ModelHostAuthorityService.provide) }
  abstract readonly resolve: ModelHostAuthority<P>['resolve']
}
export const modelHostAuthorityKey = ModelHostAuthorityService.provide
/** @owner packages/model/model-cordis-contract */
export abstract class ModelPublicationAuthorityService<P> extends Service implements ModelPublicationAuthority<P> {
  static readonly provide = 'modelPublicationAuthority'
  constructor(ctx: Context) { super(ctx, ModelPublicationAuthorityService.provide) }
  abstract readonly check: ModelPublicationAuthority<P>['check']
}
export const modelPublicationAuthorityKey = ModelPublicationAuthorityService.provide
export type ModelConverterRegistrationInput<P> = Readonly<{
  key: ConverterKey; converter: ModelConverter<P>; adoption: Adoption; authority: DurableEvidence
}>
export interface ModelConverterAuthority<P> {
  check(input: ModelConverterRegistrationInput<P>): Outcome<void, ModelRegistrationFailure>
}
export type ModelConverterRegistration = Readonly<{
  token: string; release(): Promise<Readonly<{ removed: boolean }>>
}>
/** @owner packages/model/model-cordis-contract */
export abstract class ModelConverterAuthorityService<P> extends Service implements ModelConverterAuthority<P> {
  static readonly provide = 'modelConverterAuthority'
  constructor(ctx: Context) { super(ctx, ModelConverterAuthorityService.provide) }
  abstract readonly check: ModelConverterAuthority<P>['check']
}
export const modelConverterAuthorityKey = ModelConverterAuthorityService.provide
/** @owner packages/model/model-cordis-contract */
export declare class ModelConvertersService<P> extends Service implements ModelConverterCatalog<P> {
  static readonly provide = 'modelConverters'
  constructor(ctx: Context, authority: ModelConverterAuthority<P>)
  readonly acquire: ModelConverterCatalog<P>['acquire']
  register(input: ModelConverterRegistrationInput<P>): Promise<Outcome<ModelConverterRegistration, ModelRegistrationFailure>>
}
export const modelConvertersKey = ModelConvertersService.provide

/** @owner packages/model/model-cordis-contract */
export abstract class ModelDiagnosticsService<P> extends Service implements ModelDiagnostics<P> {
  static readonly provide = 'modelDiagnostics'
  constructor(ctx: Context) { super(ctx, ModelDiagnosticsService.provide) }
  abstract readonly list: ModelDiagnostics<P>['list']
}
export const modelDiagnosticsKey = ModelDiagnosticsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    modelDiagnostics: ModelDiagnosticsService<unknown>
    modelRuntime: ModelRuntimeService<unknown>
    modelCommands: ModelCommandsService<unknown>
    modelSendBoundary: ModelSendBoundaryService<unknown>
    modelRetryPolicy: ModelRetryPolicyService<unknown>
    modelInstanceHost: ModelInstanceHostService<unknown>
    modelClock: ModelClockService
    modelProfiles: ModelProfilesService<unknown>
    modelProfileMaintenance: ModelProfileMaintenanceService<unknown>
    modelRequestPreparation: ModelRequestPreparationService<unknown>
    modelMessageConversion: ModelMessageConversionService<unknown>
    modelHostAuthority: ModelHostAuthorityService<unknown>
    modelPublicationAuthority: ModelPublicationAuthorityService<unknown>
    modelConverters: ModelConvertersService<unknown>
    modelInstances: ModelInstancesService<unknown>
    modelConverterAuthority: ModelConverterAuthorityService<unknown>
  }
  interface Events {
    /**
     * @mode parallel
     * @param tenant Explicit tenant identity.
     * @param call Original model call identity.
     * @param revision Committed revision to query.
     */
    'model-cordis-contract/call-changed'(tenant: TenantId, call: ModelCallId, revision: Revision): void
  }
}
```

Context 以 unknown 表达边界输入，可信身份适配器在进入领域操作前校验主体。不能把类型断言当认证。框架定义根入口没有这些值导出。转换登记资格、同键冲突和退休资源见 [SPEC](../SPEC.md#转换目录的登记与资源)。
