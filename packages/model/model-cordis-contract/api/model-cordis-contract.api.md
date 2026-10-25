# @omne-harness/model-cordis-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `ModelConverterAuthority` · `registration.d.ts`
- `ModelConverterRegistration` · `registration.d.ts`
- `ModelConverterRegistrationInput` · `registration.d.ts`
- `ModelPublication` · `registration.d.ts`
- `ModelPublicationAuthority` · `registration.d.ts`
- `ModelRegistration` · `registration.d.ts`
- `ModelRegistrationFailure` · `registration.d.ts`
- `ModelRegistrationInput` · `registration.d.ts`

## 入口 `./cordis` · `cordis.d.ts`

- `ModelClockService` · `cordis.d.ts`
- `ModelCommandsService` · `cordis.d.ts`
- `ModelConverterAuthority` · `registration.d.ts`
- `ModelConverterAuthorityService` · `cordis.d.ts`
- `ModelConverterRegistration` · `registration.d.ts`
- `ModelConverterRegistrationInput` · `registration.d.ts`
- `ModelConvertersService` · `converters.d.ts`
- `ModelCredentialService` · `cordis.d.ts`
- `ModelDiagnosticsService` · `cordis.d.ts`
- `ModelHostAuthorityService` · `cordis.d.ts`
- `ModelInstanceHostService` · `cordis.d.ts`
- `ModelInstancesService` · `instances.d.ts`
- `ModelMessageConversionService` · `cordis.d.ts`
- `ModelProfileMaintenanceService` · `cordis.d.ts`
- `ModelProfilesService` · `cordis.d.ts`
- `ModelPublication` · `registration.d.ts`
- `ModelPublicationAuthority` · `registration.d.ts`
- `ModelPublicationAuthorityService` · `cordis.d.ts`
- `ModelRegistration` · `registration.d.ts`
- `ModelRegistrationFailure` · `registration.d.ts`
- `ModelRegistrationInput` · `registration.d.ts`
- `ModelRequestPreparationService` · `cordis.d.ts`
- `ModelRetryPolicyService` · `cordis.d.ts`
- `ModelRuntimeService` · `cordis.d.ts`
- `ModelSendBoundaryService` · `cordis.d.ts`
- `modelClockKey` · `cordis.d.ts`
- `modelCommandsKey` · `cordis.d.ts`
- `modelConverterAuthorityKey` · `cordis.d.ts`
- `modelConvertersKey` · `converters.d.ts`
- `modelCredentialKey` · `cordis.d.ts`
- `modelDiagnosticsKey` · `cordis.d.ts`
- `modelHostAuthorityKey` · `cordis.d.ts`
- `modelInstanceHostKey` · `cordis.d.ts`
- `modelInstancesKey` · `instances.d.ts`
- `modelMessageConversionKey` · `cordis.d.ts`
- `modelProfileMaintenanceKey` · `cordis.d.ts`
- `modelProfilesKey` · `cordis.d.ts`
- `modelPublicationAuthorityKey` · `cordis.d.ts`
- `modelRequestPreparationKey` · `cordis.d.ts`
- `modelRetryPolicyKey` · `cordis.d.ts`
- `modelRuntimeKey` · `cordis.d.ts`
- `modelSendBoundaryKey` · `cordis.d.ts`

## 声明文件 `converters.d.ts`

```ts
import { Service, type Context as CordisContext } from '@deepseek-ai/cordis';
import type { ModelConverterCatalog } from '@omne-harness/model-contract';
import { type Outcome } from '@omne-harness/operation-result';
import type { ModelConverterAuthority, ModelConverterRegistration, ModelConverterRegistrationInput, ModelRegistrationFailure } from './registration.ts';
export declare class ModelConvertersService<P> extends Service implements ModelConverterCatalog<P> {
    static readonly provide = "modelConverters";
    readonly acquire: ModelConverterCatalog<P>['acquire'];
    readonly register: (input: ModelConverterRegistrationInput<P>) => Promise<Outcome<ModelConverterRegistration, ModelRegistrationFailure>>;
    constructor(ctx: CordisContext, authority: ModelConverterAuthority<P>);
}
export declare const modelConvertersKey = "modelConverters";
```

## 声明文件 `cordis.d.ts`

```ts
import { Service, type Context as CordisContext } from '@deepseek-ai/cordis';
import type { TenantId } from '@omne-harness/legal-identity';
import type { CredentialPort, ModelCallId, ModelClock, ModelCommands, ModelDiagnostics, ModelHostAuthority, ModelInstanceHost, ModelMessageConversion, ModelProfileMaintenance, ModelProfiles, ModelRequestPreparation, ModelRetryPolicy, ModelRuntime, ModelSendBoundary, Revision } from '@omne-harness/model-contract';
import type { ModelConvertersService } from './converters.ts';
import type { ModelInstancesService } from './instances.ts';
import type { ModelConverterAuthority, ModelPublicationAuthority } from './registration.ts';
export { ModelConvertersService, modelConvertersKey } from './converters.ts';
export { ModelInstancesService, modelInstancesKey } from './instances.ts';
export type { ModelConverterAuthority, ModelConverterRegistration, ModelConverterRegistrationInput, ModelPublication, ModelPublicationAuthority, ModelRegistration, ModelRegistrationFailure, ModelRegistrationInput, } from './registration.ts';
export declare abstract class ModelCredentialService extends Service implements CredentialPort {
    static readonly provide = "modelCredential";
    constructor(ctx: CordisContext);
    abstract readonly present: CredentialPort['present'];
    abstract readonly resolve: CredentialPort['resolve'];
}
export declare const modelCredentialKey = "modelCredential";
export declare abstract class ModelRuntimeService<P> extends Service implements ModelRuntime<P> {
    static readonly provide = "modelRuntime";
    constructor(ctx: CordisContext);
    abstract readonly calls: ModelRuntime<P>['calls'];
    abstract readonly consumption: ModelRuntime<P>['consumption'];
    abstract readonly instances: ModelRuntime<P>['instances'];
}
export declare const modelRuntimeKey = "modelRuntime";
export declare abstract class ModelCommandsService<P> extends Service implements ModelCommands<P> {
    static readonly provide = "modelCommands";
    constructor(ctx: CordisContext);
    abstract readonly admit: ModelCommands<P>['admit'];
    abstract readonly recall: ModelCommands<P>['recall'];
    abstract readonly scanPending: ModelCommands<P>['scanPending'];
    abstract readonly loadRecovery: ModelCommands<P>['loadRecovery'];
    abstract readonly claim: ModelCommands<P>['claim'];
    abstract readonly prepareDispatch: ModelCommands<P>['prepareDispatch'];
    abstract readonly recordMaterialization: ModelCommands<P>['recordMaterialization'];
    abstract readonly recordSend: ModelCommands<P>['recordSend'];
    abstract readonly openReceiveWindow: ModelCommands<P>['openReceiveWindow'];
    abstract readonly preserve: ModelCommands<P>['preserve'];
    abstract readonly recordLateFact: ModelCommands<P>['recordLateFact'];
    abstract readonly prepareRetry: ModelCommands<P>['prepareRetry'];
    abstract readonly decideRetry: ModelCommands<P>['decideRetry'];
    abstract readonly settle: ModelCommands<P>['settle'];
    abstract readonly control: ModelCommands<P>['control'];
    abstract readonly acquireRead: ModelCommands<P>['acquireRead'];
    abstract readonly nextRead: ModelCommands<P>['nextRead'];
    abstract readonly endRead: ModelCommands<P>['endRead'];
    abstract readonly handoff: ModelCommands<P>['handoff'];
    abstract readonly advanceCleanup: ModelCommands<P>['advanceCleanup'];
    abstract readonly query: ModelCommands<P>['query'];
    abstract readonly dispatches: ModelCommands<P>['dispatches'];
}
export declare const modelCommandsKey = "modelCommands";
export declare abstract class ModelSendBoundaryService<P> extends Service implements ModelSendBoundary<P> {
    static readonly provide = "modelSendBoundary";
    constructor(ctx: CordisContext);
    abstract readonly send: ModelSendBoundary<P>['send'];
}
export declare const modelSendBoundaryKey = "modelSendBoundary";
export declare abstract class ModelInstanceHostService<P> extends Service implements ModelInstanceHost<P> {
    static readonly provide = "modelInstanceHost";
    constructor(ctx: CordisContext);
    abstract readonly schedule: ModelInstanceHost<P>['schedule'];
    abstract readonly publish: ModelInstanceHost<P>['publish'];
    abstract readonly withdraw: ModelInstanceHost<P>['withdraw'];
    abstract readonly directory: ModelInstanceHost<P>['directory'];
}
export declare const modelInstanceHostKey = "modelInstanceHost";
export declare abstract class ModelPublicationAuthorityService<P> extends Service implements ModelPublicationAuthority<P> {
    static readonly provide = "modelPublicationAuthority";
    constructor(ctx: CordisContext);
    abstract readonly check: ModelPublicationAuthority<P>['check'];
}
export declare const modelPublicationAuthorityKey = "modelPublicationAuthority";
export declare abstract class ModelRetryPolicyService<P> extends Service implements ModelRetryPolicy<P> {
    static readonly provide = "modelRetryPolicy";
    constructor(ctx: CordisContext);
    abstract readonly decide: ModelRetryPolicy<P>['decide'];
    abstract readonly inspect: ModelRetryPolicy<P>['inspect'];
}
export declare const modelRetryPolicyKey = "modelRetryPolicy";
export declare abstract class ModelClockService extends Service implements ModelClock {
    static readonly provide = "modelClock";
    constructor(ctx: CordisContext);
    abstract readonly now: ModelClock['now'];
    abstract readonly waitUntil: ModelClock['waitUntil'];
}
export declare const modelClockKey = "modelClock";
export declare abstract class ModelProfilesService<P> extends Service implements ModelProfiles<P> {
    static readonly provide = "modelProfiles";
    constructor(ctx: CordisContext);
    abstract readonly list: ModelProfiles<P>['list'];
    abstract readonly resolve: ModelProfiles<P>['resolve'];
}
export declare const modelProfilesKey = "modelProfiles";
export declare abstract class ModelProfileMaintenanceService<P> extends Service implements ModelProfileMaintenance<P> {
    static readonly provide = "modelProfileMaintenance";
    constructor(ctx: CordisContext);
    abstract readonly change: ModelProfileMaintenance<P>['change'];
    abstract readonly inspect: ModelProfileMaintenance<P>['inspect'];
}
export declare const modelProfileMaintenanceKey = "modelProfileMaintenance";
export declare abstract class ModelRequestPreparationService<P> extends Service implements ModelRequestPreparation<P> {
    static readonly provide = "modelRequestPreparation";
    constructor(ctx: CordisContext);
    abstract readonly prepare: ModelRequestPreparation<P>['prepare'];
}
export declare const modelRequestPreparationKey = "modelRequestPreparation";
export declare abstract class ModelMessageConversionService<P> extends Service implements ModelMessageConversion<P> {
    static readonly provide = "modelMessageConversion";
    constructor(ctx: CordisContext);
    abstract readonly prepare: ModelMessageConversion<P>['prepare'];
}
export declare const modelMessageConversionKey = "modelMessageConversion";
export declare abstract class ModelHostAuthorityService<P> extends Service implements ModelHostAuthority<P> {
    static readonly provide = "modelHostAuthority";
    constructor(ctx: CordisContext);
    abstract readonly resolve: ModelHostAuthority<P>['resolve'];
}
export declare const modelHostAuthorityKey = "modelHostAuthority";
export declare abstract class ModelConverterAuthorityService<P> extends Service implements ModelConverterAuthority<P> {
    static readonly provide = "modelConverterAuthority";
    constructor(ctx: CordisContext);
    abstract readonly check: ModelConverterAuthority<P>['check'];
}
export declare const modelConverterAuthorityKey = "modelConverterAuthority";
export declare abstract class ModelDiagnosticsService<P> extends Service implements ModelDiagnostics<P> {
    static readonly provide = "modelDiagnostics";
    constructor(ctx: CordisContext);
    abstract readonly list: ModelDiagnostics<P>['list'];
}
export declare const modelDiagnosticsKey = "modelDiagnostics";
declare module '@deepseek-ai/cordis' {
    interface Context {
        modelDiagnostics: ModelDiagnosticsService<unknown>;
        modelRuntime: ModelRuntimeService<unknown>;
        modelCommands: ModelCommandsService<unknown>;
        modelSendBoundary: ModelSendBoundaryService<unknown>;
        modelInstanceHost: ModelInstanceHostService<unknown>;
        modelPublicationAuthority: ModelPublicationAuthorityService<unknown>;
        modelRetryPolicy: ModelRetryPolicyService<unknown>;
        modelClock: ModelClockService;
        modelProfiles: ModelProfilesService<unknown>;
        modelProfileMaintenance: ModelProfileMaintenanceService<unknown>;
        modelRequestPreparation: ModelRequestPreparationService<unknown>;
        modelMessageConversion: ModelMessageConversionService<unknown>;
        modelHostAuthority: ModelHostAuthorityService<unknown>;
        modelConverterAuthority: ModelConverterAuthorityService<unknown>;
        modelConverters: ModelConvertersService<unknown>;
        modelInstances: ModelInstancesService<unknown>;
        modelCredential?: ModelCredentialService;
    }
    interface Events {
        'model-cordis-contract/call-changed'(tenant: TenantId, call: ModelCallId, revision: Revision): void;
    }
}
```

## 声明文件 `index.d.ts`

```ts
export type { ModelConverterAuthority, ModelConverterRegistration, ModelConverterRegistrationInput, ModelPublication, ModelPublicationAuthority, ModelRegistration, ModelRegistrationFailure, ModelRegistrationInput, } from './registration.ts';
```

## 声明文件 `instances.d.ts`

```ts
import { Service, type Context as CordisContext } from '@deepseek-ai/cordis';
import type { ModelInstanceDirectory } from '@omne-harness/model-contract';
import { type Outcome } from '@omne-harness/operation-result';
import type { ModelPublicationAuthority, ModelRegistration, ModelRegistrationFailure, ModelRegistrationInput } from './registration.ts';
export declare class ModelInstancesService<P> extends Service implements ModelInstanceDirectory<P> {
    static readonly provide = "modelInstances";
    readonly connect: ModelInstanceDirectory<P>['connect'];
    readonly register: (input: ModelRegistrationInput<P>) => Promise<Outcome<ModelRegistration, ModelRegistrationFailure>>;
    constructor(ctx: CordisContext, authority: ModelPublicationAuthority<P>);
}
export declare const modelInstancesKey = "modelInstances";
```

## 声明文件 `registration.d.ts`

```ts
import type { Adoption, ConverterKey, DurableEvidence, ModelConverter, ModelInstanceHost } from '@omne-harness/model-contract';
import type { Outcome } from '@omne-harness/operation-result';
export type ModelRegistrationFailure = Readonly<{
    kind: 'denied' | 'stale-publication' | 'conflict';
}> | Readonly<{
    kind: 'invalid';
    reason: string;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export type ModelPublication = Extract<Awaited<ReturnType<ModelInstanceHost<never>['publish']>>, {
    ok: unknown;
}>['ok'];
export type ModelRegistrationInput<P> = Readonly<{
    publication: Parameters<ModelInstanceHost<P>['publish']>;
    authority: DurableEvidence;
}>;
export type ModelRegistration = Readonly<{
    receipt: ModelPublication;
    release(): Promise<Readonly<{
        removed: boolean;
    }>>;
}>;
export interface ModelPublicationAuthority<P> {
    check(input: ModelRegistrationInput<P>): Outcome<void, ModelRegistrationFailure>;
}
export type ModelConverterRegistrationInput<P> = Readonly<{
    key: ConverterKey;
    converter: ModelConverter<P>;
    adoption: Adoption;
    authority: DurableEvidence;
    release?(): Promise<void>;
}>;
export interface ModelConverterAuthority<P> {
    check(input: ModelConverterRegistrationInput<P>): Outcome<void, ModelRegistrationFailure>;
}
export type ModelConverterRegistration = Readonly<{
    token: string;
    release(): Promise<Readonly<{
        removed: boolean;
        failure?: Extract<ModelRegistrationFailure, {
            kind: 'unavailable';
        }>;
    }>>;
}>;
```
