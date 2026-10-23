# @omne-harness/model-cordis-contract 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

### `ModelConverterAuthority`

```ts
interface ModelConverterAuthority<P> {
    check(input: ModelConverterRegistrationInput<P>): Outcome<void, ModelRegistrationFailure>;
}
```

### `ModelConverterRegistration`

```ts
type ModelConverterRegistration = Readonly<{
    token: string;
    release(): Promise<Readonly<{
        removed: boolean;
        failure?: Extract<ModelRegistrationFailure, {
            kind: 'unavailable';
        }>;
    }>>;
}>;
```

### `ModelConverterRegistrationInput`

```ts
type ModelConverterRegistrationInput<P> = Readonly<{
    key: ConverterKey;
    converter: ModelConverter<P>;
    adoption: Adoption;
    authority: DurableEvidence;
    release?(): Promise<void>;
}>;
```

### `ModelPublication`

```ts
type ModelPublication = Extract<Awaited<ReturnType<ModelInstanceHost<never>['publish']>>, {
    ok: unknown;
}>['ok'];
```

### `ModelPublicationAuthority`

```ts
interface ModelPublicationAuthority<P> {
    check(input: ModelRegistrationInput<P>): Outcome<void, ModelRegistrationFailure>;
}
```

### `ModelRegistration`

```ts
type ModelRegistration = Readonly<{
    receipt: ModelPublication;
    release(): Promise<Readonly<{
        removed: boolean;
    }>>;
}>;
```

### `ModelRegistrationFailure`

```ts
type ModelRegistrationFailure = Readonly<{
    kind: 'denied' | 'stale-publication' | 'conflict';
}> | Readonly<{
    kind: 'invalid';
    reason: string;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
```

### `ModelRegistrationInput`

```ts
type ModelRegistrationInput<P> = Readonly<{
    publication: Parameters<ModelInstanceHost<P>['publish']>;
    authority: DurableEvidence;
}>;
```

## 入口 `./cordis`

### `ModelClockService`

```ts
abstract class ModelClockService extends Service implements ModelClock {
    static readonly provide = "modelClock";
    constructor(ctx: CordisContext);
    abstract readonly now: ModelClock['now'];
    abstract readonly waitUntil: ModelClock['waitUntil'];
}
```

### `ModelCommandsService`

```ts
abstract class ModelCommandsService<P> extends Service implements ModelCommands<P> {
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
```

### `ModelConverterAuthority`

```ts
interface ModelConverterAuthority<P> {
    check(input: ModelConverterRegistrationInput<P>): Outcome<void, ModelRegistrationFailure>;
}
```

### `ModelConverterAuthorityService`

```ts
abstract class ModelConverterAuthorityService<P> extends Service implements ModelConverterAuthority<P> {
    static readonly provide = "modelConverterAuthority";
    constructor(ctx: CordisContext);
    abstract readonly check: ModelConverterAuthority<P>['check'];
}
```

### `ModelConverterRegistration`

```ts
type ModelConverterRegistration = Readonly<{
    token: string;
    release(): Promise<Readonly<{
        removed: boolean;
        failure?: Extract<ModelRegistrationFailure, {
            kind: 'unavailable';
        }>;
    }>>;
}>;
```

### `ModelConverterRegistrationInput`

```ts
type ModelConverterRegistrationInput<P> = Readonly<{
    key: ConverterKey;
    converter: ModelConverter<P>;
    adoption: Adoption;
    authority: DurableEvidence;
    release?(): Promise<void>;
}>;
```

### `ModelConvertersService`

```ts
class ModelConvertersService<P> extends Service implements ModelConverterCatalog<P> {
    static readonly provide = "modelConverters";
    readonly acquire: ModelConverterCatalog<P>['acquire'];
    readonly register: (input: ModelConverterRegistrationInput<P>) => Promise<Outcome<ModelConverterRegistration, ModelRegistrationFailure>>;
    constructor(ctx: CordisContext, authority: ModelConverterAuthority<P>);
}
```

### `ModelCredentialService`

```ts
abstract class ModelCredentialService extends Service implements CredentialPort {
    static readonly provide = "modelCredential";
    constructor(ctx: CordisContext);
    abstract readonly present: CredentialPort['present'];
    abstract readonly resolve: CredentialPort['resolve'];
}
```

### `ModelDiagnosticsService`

```ts
abstract class ModelDiagnosticsService<P> extends Service implements ModelDiagnostics<P> {
    static readonly provide = "modelDiagnostics";
    constructor(ctx: CordisContext);
    abstract readonly list: ModelDiagnostics<P>['list'];
}
```

### `ModelHostAuthorityService`

```ts
abstract class ModelHostAuthorityService<P> extends Service implements ModelHostAuthority<P> {
    static readonly provide = "modelHostAuthority";
    constructor(ctx: CordisContext);
    abstract readonly resolve: ModelHostAuthority<P>['resolve'];
}
```

### `ModelInstanceHostService`

```ts
abstract class ModelInstanceHostService<P> extends Service implements ModelInstanceHost<P> {
    static readonly provide = "modelInstanceHost";
    constructor(ctx: CordisContext);
    abstract readonly schedule: ModelInstanceHost<P>['schedule'];
    abstract readonly publish: ModelInstanceHost<P>['publish'];
    abstract readonly withdraw: ModelInstanceHost<P>['withdraw'];
    abstract readonly directory: ModelInstanceHost<P>['directory'];
}
```

### `ModelInstancesService`

```ts
class ModelInstancesService<P> extends Service implements ModelInstanceDirectory<P> {
    static readonly provide = "modelInstances";
    readonly connect: ModelInstanceDirectory<P>['connect'];
    readonly register: (input: ModelRegistrationInput<P>) => Promise<Outcome<ModelRegistration, ModelRegistrationFailure>>;
    constructor(ctx: CordisContext, authority: ModelPublicationAuthority<P>);
}
```

### `ModelMessageConversionService`

```ts
abstract class ModelMessageConversionService<P> extends Service implements ModelMessageConversion<P> {
    static readonly provide = "modelMessageConversion";
    constructor(ctx: CordisContext);
    abstract readonly prepare: ModelMessageConversion<P>['prepare'];
}
```

### `ModelProfileMaintenanceService`

```ts
abstract class ModelProfileMaintenanceService<P> extends Service implements ModelProfileMaintenance<P> {
    static readonly provide = "modelProfileMaintenance";
    constructor(ctx: CordisContext);
    abstract readonly change: ModelProfileMaintenance<P>['change'];
    abstract readonly inspect: ModelProfileMaintenance<P>['inspect'];
}
```

### `ModelProfilesService`

```ts
abstract class ModelProfilesService<P> extends Service implements ModelProfiles<P> {
    static readonly provide = "modelProfiles";
    constructor(ctx: CordisContext);
    abstract readonly list: ModelProfiles<P>['list'];
    abstract readonly resolve: ModelProfiles<P>['resolve'];
}
```

### `ModelPublication`

```ts
type ModelPublication = Extract<Awaited<ReturnType<ModelInstanceHost<never>['publish']>>, {
    ok: unknown;
}>['ok'];
```

### `ModelPublicationAuthority`

```ts
interface ModelPublicationAuthority<P> {
    check(input: ModelRegistrationInput<P>): Outcome<void, ModelRegistrationFailure>;
}
```

### `ModelPublicationAuthorityService`

```ts
abstract class ModelPublicationAuthorityService<P> extends Service implements ModelPublicationAuthority<P> {
    static readonly provide = "modelPublicationAuthority";
    constructor(ctx: CordisContext);
    abstract readonly check: ModelPublicationAuthority<P>['check'];
}
```

### `ModelRegistration`

```ts
type ModelRegistration = Readonly<{
    receipt: ModelPublication;
    release(): Promise<Readonly<{
        removed: boolean;
    }>>;
}>;
```

### `ModelRegistrationFailure`

```ts
type ModelRegistrationFailure = Readonly<{
    kind: 'denied' | 'stale-publication' | 'conflict';
}> | Readonly<{
    kind: 'invalid';
    reason: string;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
```

### `ModelRegistrationInput`

```ts
type ModelRegistrationInput<P> = Readonly<{
    publication: Parameters<ModelInstanceHost<P>['publish']>;
    authority: DurableEvidence;
}>;
```

### `ModelRequestPreparationService`

```ts
abstract class ModelRequestPreparationService<P> extends Service implements ModelRequestPreparation<P> {
    static readonly provide = "modelRequestPreparation";
    constructor(ctx: CordisContext);
    abstract readonly prepare: ModelRequestPreparation<P>['prepare'];
}
```

### `ModelRetryPolicyService`

```ts
abstract class ModelRetryPolicyService<P> extends Service implements ModelRetryPolicy<P> {
    static readonly provide = "modelRetryPolicy";
    constructor(ctx: CordisContext);
    abstract readonly decide: ModelRetryPolicy<P>['decide'];
    abstract readonly inspect: ModelRetryPolicy<P>['inspect'];
}
```

### `ModelRuntimeService`

```ts
abstract class ModelRuntimeService<P> extends Service implements ModelRuntime<P> {
    static readonly provide = "modelRuntime";
    constructor(ctx: CordisContext);
    abstract readonly calls: ModelRuntime<P>['calls'];
    abstract readonly consumption: ModelRuntime<P>['consumption'];
    abstract readonly instances: ModelRuntime<P>['instances'];
}
```

### `ModelSendBoundaryService`

```ts
abstract class ModelSendBoundaryService<P> extends Service implements ModelSendBoundary<P> {
    static readonly provide = "modelSendBoundary";
    constructor(ctx: CordisContext);
    abstract readonly send: ModelSendBoundary<P>['send'];
}
```

### `modelClockKey`

```ts
const modelClockKey = "modelClock";
```

### `modelCommandsKey`

```ts
const modelCommandsKey = "modelCommands";
```

### `modelConverterAuthorityKey`

```ts
const modelConverterAuthorityKey = "modelConverterAuthority";
```

### `modelConvertersKey`

```ts
const modelConvertersKey = "modelConverters";
```

### `modelCredentialKey`

```ts
const modelCredentialKey = "modelCredential";
```

### `modelDiagnosticsKey`

```ts
const modelDiagnosticsKey = "modelDiagnostics";
```

### `modelHostAuthorityKey`

```ts
const modelHostAuthorityKey = "modelHostAuthority";
```

### `modelInstanceHostKey`

```ts
const modelInstanceHostKey = "modelInstanceHost";
```

### `modelInstancesKey`

```ts
const modelInstancesKey = "modelInstances";
```

### `modelMessageConversionKey`

```ts
const modelMessageConversionKey = "modelMessageConversion";
```

### `modelProfileMaintenanceKey`

```ts
const modelProfileMaintenanceKey = "modelProfileMaintenance";
```

### `modelProfilesKey`

```ts
const modelProfilesKey = "modelProfiles";
```

### `modelPublicationAuthorityKey`

```ts
const modelPublicationAuthorityKey = "modelPublicationAuthority";
```

### `modelRequestPreparationKey`

```ts
const modelRequestPreparationKey = "modelRequestPreparation";
```

### `modelRetryPolicyKey`

```ts
const modelRetryPolicyKey = "modelRetryPolicy";
```

### `modelRuntimeKey`

```ts
const modelRuntimeKey = "modelRuntime";
```

### `modelSendBoundaryKey`

```ts
const modelSendBoundaryKey = "modelSendBoundary";
```

## 内部引用

（无）

## 模块扩充 `@deepseek-ai/cordis`

### `Context`

```ts
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
```

### `Events`

```ts
interface Events {
    'model-cordis-contract/call-changed'(tenant: TenantId, call: ModelCallId, revision: Revision): void;
}
```
