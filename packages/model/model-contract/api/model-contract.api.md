# @omne-harness/model-contract 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

### `Access`

```ts
type Access<P> = Readonly<{
    principal: P;
    tenant: TenantId;
}>;
```

### `AckInput`

```ts
type AckInput<P> = Mutation<P> & Readonly<{
    result: ResultVersion;
    evidence: Handoff;
}>;
```

### `AckReceipt`

```ts
type AckReceipt = Readonly<{
    call: ModelCallId;
    result: ResultVersion;
    custody: Extract<CustodyState, {
        kind: 'acknowledged';
    }>;
}>;
```

### `ActorRef`

```ts
type ActorRef = Readonly<{
    owner: string;
    subject: string;
    revision: string;
}>;
```

### `Admission`

```ts
type Admission = Readonly<{
    call: ModelCallId;
    revision: Revision;
    recovered: boolean;
    reference: ModelInvocationRef;
}>;
```

### `Admit`

```ts
type Admit<P> = Mutation<P> & Readonly<{
    request: FixedModelRequest;
    consumer: ConsumerRef;
    capacity: ResultCapacity;
}>;
```

### `Adoption`

```ts
type Adoption = Readonly<{
    owner: string;
    name: string;
    revision: string;
    digest: string;
}>;
```

### `AssembledModelInput`

```ts
type AssembledModelInput = Readonly<{
    system: readonly ContentBlock[];
    messages: readonly Message[];
    tools: readonly ToolDeclaration[];
    toolChoice: FixedModelRequest['toolChoice'];
    parameters: readonly Parameter[];
    replay?: 'off';
    representation: Adoption;
    source: Adoption;
}>;
```

### `BudgetCheck`

```ts
type BudgetCheck = Readonly<{
    supplier: Adoption;
    metric: 'input-tokens' | LimitMetric;
    subject: string;
    measurement: Measurement;
    limit: string;
    constraint: Readonly<{
        profile: Adoption;
        upstream: UpstreamLimit;
    }>;
}>;
```

### `CallAccess`

```ts
type CallAccess<P> = Access<P> & Readonly<{
    call: ModelCallId;
}>;
```

### `CallAccountReport`

```ts
type CallAccountReport = Omit<CallAccount, 'subject' | 'receipt'>;
```

### `CallState`

```ts
type CallState = Readonly<{
    call: ModelCallId;
    revision: Revision;
    consumer: ConsumerRef;
    control: ControlState;
    custody: CustodyState;
}> & (Readonly<{
    phase: 'accepted';
}> | Readonly<{
    phase: 'running';
    dispatch: DispatchId;
    firstContent: 'none-proven' | 'observed' | 'uncertain';
}> | Readonly<{
    phase: 'retry-decision';
    dispatch: DispatchId;
}> | Readonly<{
    phase: 'settled';
    settlement: Settlement;
}>);
```

### `CommitQuery`

```ts
type CommitQuery<T> = Readonly<{
    kind: 'committed';
    value: T;
}> | Readonly<{
    kind: 'rolled-back';
}> | Readonly<{
    kind: 'unknown';
}> | Readonly<{
    kind: 'not-committed';
}>;
```

### `ConsumerRef`

```ts
type ConsumerRef = Readonly<{
    owner: string;
    work: string;
    position: string;
    purpose: string;
}>;
```

### `ContextLimits`

```ts
type ContextLimits = Readonly<{
    window: TokenLimit;
    input: TokenLimit | null;
    output: TokenLimit;
    compactionTriggerPercent: string;
}>;
```

### `ControlState`

```ts
type ControlState = Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'requested';
    operation: ModelOperationId;
    propagation: 'pending' | 'sent' | 'unavailable';
    upstream: 'unknown' | 'stopped' | 'completed';
}>;
```

### `ConversionFailure`

```ts
type ConversionFailure = ModelFailure | Readonly<{
    kind: 'cancelled';
}>;
```

### `ConversionReply`

```ts
type ConversionReply<T> = Promise<Outcome<T, ConversionFailure>>;
```

### `ConversionResult`

```ts
type ConversionResult = Readonly<{
    kind: 'unchanged';
    original: ContentBlock;
    reason: 'human-only' | 'text' | 'no-converter';
}> | Readonly<{
    kind: 'deferred';
    original: ContentBlock;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'converted';
    value: ConvertedContent;
}>;
```

### `ConvertedContent`

```ts
type ConvertedContent = Readonly<{
    original: ContentBlock;
    derived: readonly [
        ContentBlock,
        ...ContentBlock[]
    ];
    transcript: string;
    converter: Adoption;
}>;
```

### `ConverterKey`

```ts
type ConverterKey = Readonly<{
    kind: 'media-type';
    mediaType: string;
}> | Readonly<{
    kind: 'modality';
    modality: Modality;
}>;
```

### `ConverterLookup`

```ts
type ConverterLookup<P> = Readonly<{
    kind: 'absent';
}> | Readonly<{
    kind: 'selected';
    converter: ModelConverter<P>;
    release(): Promise<void>;
}>;
```

### `CredentialId`

```ts
type CredentialId = Identity<'ModelCredentialId'>;
```

### `CredentialPort`

```ts
type CredentialPort = {
    present(reference: CredentialQuery): CredentialPresence;
    resolve(reference: CredentialQuery, face: SendFace): CredentialResolution;
};
```

### `CredentialPresence`

```ts
type CredentialPresence = Readonly<{
    kind: 'known';
    present: boolean;
    id: CredentialId;
    tenant: TenantId;
    purpose: CredentialPurpose;
}> | Readonly<{
    kind: 'denied';
}> | Readonly<{
    kind: 'unavailable';
}>;
```

### `CredentialPurpose`

```ts
type CredentialPurpose = typeof MODEL_SEND;
```

### `CredentialQuery`

```ts
type CredentialQuery = Readonly<{
    id: CredentialId;
    tenant: TenantId;
    purpose: string;
}>;
```

### `CredentialReference`

```ts
type CredentialReference = Readonly<{
    id: CredentialId;
    tenant: TenantId;
    purpose: CredentialPurpose;
}>;
```

### `CredentialResolution`

```ts
type CredentialResolution = Readonly<{
    kind: 'value';
    scope: 'tenant' | 'factory';
    value: string;
}> | Readonly<{
    kind: 'absent';
}> | Readonly<{
    kind: 'unreadable';
}> | Readonly<{
    kind: 'denied';
}> | Readonly<{
    kind: 'unavailable';
}>;
```

### `CustodyState`

```ts
type CustodyState = Readonly<{
    kind: 'producer';
}> | Readonly<{
    kind: 'acknowledged';
    operation: ModelOperationId;
    receipt: DurableEvidence;
    cleanup: 'pending' | 'running' | 'blocked' | 'released';
    diagnostic: string | null;
}>;
```

### `DispatchId`

```ts
type DispatchId = Identity<'ModelDispatchId'>;
```

### `DispatchPlan`

```ts
type DispatchPlan = Readonly<{
    dispatch: DispatchId;
    supplier: Supplier;
    policyDecision: DurableEvidence | null;
}>;
```

### `DispatchRecord`

```ts
type DispatchRecord = Readonly<{
    dispatch: DispatchId;
    supplier: Supplier;
    intent: ModelOperationId;
    send: 'prepared' | 'started' | 'unknown' | 'not-sent';
    firstContent: 'none-proven' | 'observed' | 'uncertain';
    terminal: Termination | null;
    account: CallAccount | null;
    materialization: Readonly<{
        receipt: MaterializationReceipt;
        source: DurableEvidence;
    }> | null;
}>;
```

### `DurableEvidence`

```ts
type DurableEvidence = Readonly<{
    owner: string;
    record: string;
    revision: string;
    digest: string;
}>;
```

### `ExecutionRef`

```ts
type ExecutionRef = Readonly<{
    tenant: TenantId;
    call: ModelCallId;
    instance: ModelInstanceId;
    generation: string;
}>;
```

### `FixedModelRequest`

```ts
type FixedModelRequest = Readonly<{
    profile: Adoption;
    suppliers: readonly [
        Supplier,
        ...Supplier[]
    ];
    fallback: boolean;
    retryPolicy: Adoption;
    parameters: readonly Parameter[];
    system: readonly ContentBlock[];
    messages: readonly Message[];
    tools: readonly ToolDeclaration[];
    toolChoice: 'none' | 'auto' | 'required' | Readonly<{
        name: string;
    }>;
    replay?: 'off';
    declarations: readonly [
        ReplayDeclaration,
        ...ReplayDeclaration[]
    ];
    representation: Adoption;
    parameterAdoptions: readonly ParameterAdoption[];
    source: Adoption;
}>;
```

### `ForeignThinking`

```ts
type ForeignThinking = 'omit' | 'text' | 'adapter';
```

### `GrowingContentKind`

```ts
type GrowingContentKind = 'text' | 'thinking' | 'tool-arguments' | 'voice';
```

### `Handoff`

```ts
type Handoff = Readonly<{
    kind: 'processed';
    completion: DurableEvidence;
}> | Readonly<{
    kind: 'retained';
    custody: DurableEvidence;
}>;
```

### `Identity`

```ts
type Identity<K extends string> = string & {
    readonly [identity]: K;
};
```

### `IndependentModelFact`

```ts
type IndependentModelFact = TransportFact | Readonly<{
    kind: 'not-started';
    reason: 'cancelled';
}> | Readonly<{
    kind: 'not-started';
    reason: 'rejected';
    failure: TransportFailure;
}>;
```

### `LateDispatchFact`

```ts
type LateDispatchFact = Readonly<{
    kind: 'account';
    event: string;
    value: CallAccountReport;
}> | Readonly<{
    kind: 'terminal';
    event: string;
    actual: Termination;
}>;
```

### `LimitMetric`

```ts
type LimitMetric = 'image-bytes' | 'image-count' | 'request-bytes' | 'voice-bytes' | 'voice-duration-ms';
```

### `LiveRoute`

```ts
type LiveRoute<P> = Readonly<{
    kind: 'live';
    handle: ModelHandle<P>;
}> | Readonly<{
    kind: 'no-live-route';
}>;
```

### `Lookup`

```ts
type Lookup = Readonly<{
    kind: 'found';
    state: CallState;
}> | Readonly<{
    kind: 'not-accepted';
    operation: ModelOperationId;
}>;
```

### `MODEL_IDENTITY_MAX_LENGTH`

```ts
const MODEL_IDENTITY_MAX_LENGTH = 256;
```

### `MODEL_IDENTITY_PREFIXES`

```ts
const MODEL_IDENTITY_PREFIXES: Readonly<{
    ModelCallId: 'mcall_';
    ModelDispatchId: 'mdisp_';
    ModelInstanceId: 'minst_';
    ModelOperationId: 'mop_';
    ModelResultVersion: 'mrver_';
    ModelReadId: 'mread_';
    ModelDiagnosticId: 'mdiag_';
    ModelDiagnosticCursor: 'mdcur_';
}>;
```

### `MODEL_INPUT_LIMITS`

```ts
const MODEL_INPUT_LIMITS: Readonly<{
    maxNodes: 100000;
    maxDepth: 64;
    maxStringLength: 8388608;
    maxTotalStringLength: 16777216;
    maxArrayLength: 16384;
    maxObjectMembers: 64;
    maxKeyLength: 128;
}>;
```

### `MODEL_REFERENCE_MAX_LENGTH`

```ts
const MODEL_REFERENCE_MAX_LENGTH = 1024;
```

### `MODEL_SEND`

```ts
const MODEL_SEND = "model-send";
```

### `MaterializationReceipt`

```ts
type MaterializationReceipt = Readonly<{
    supplier: Adoption;
    representation: Adoption;
    payloadDigest: string;
}>;
```

### `MaterializedTransport`

```ts
interface MaterializedTransport {
    readonly receipt: MaterializationReceipt;
    start(signal: AbortSignal): AsyncIterable<TransportFact>;
    close(): Promise<void>;
}
```

### `Measurement`

```ts
type Measurement = Readonly<{
    kind: 'exact' | 'upper-bound';
    amount: string;
    method: Adoption;
}> | Readonly<{
    kind: 'estimate';
    amount: string;
    margin: string;
    method: Adoption;
    marginSource: Adoption;
}>;
```

### `MediaMeasurementFact`

```ts
type MediaMeasurementFact = Readonly<{
    reference: ContentReference;
    bytes: string;
    mediaType: string;
}> & (Readonly<{
    kind: 'image';
    widthPixels: string;
    heightPixels: string;
}> | Readonly<{
    kind: 'voice';
    durationMs: string;
    sampleRate: string;
    channels: string;
}> | Readonly<{
    kind: 'file';
}>);
```

### `MeterRepresentation`

```ts
type MeterRepresentation = Readonly<{
    adoption: Adoption;
    tokenInput: JsonValue;
    media: readonly MediaMeasurementFact[];
}> & (Readonly<{
    kind: 'pending-media';
    references: readonly [
        ContentReference,
        ...ContentReference[]
    ];
}> | Readonly<{
    kind: 'materialized';
    requestBytes: string;
}>);
```

### `ModalityRequirement`

```ts
type ModalityRequirement = Readonly<{
    modalities: readonly [
        Modality,
        ...Modality[]
    ];
    source: DurableEvidence;
}>;
```

### `ModelAdmitCandidate`

```ts
type ModelAdmitCandidate<P> = Access<P> & Readonly<{
    call: unknown;
    operation: unknown;
    request: unknown;
    consumer: unknown;
    capacity: unknown;
}>;
```

### `ModelAttemptDiagnostic`

```ts
type ModelAttemptDiagnostic = Readonly<{
    id: ModelDiagnosticId;
    call: ModelCallId;
    dispatch: DispatchId;
    revision: Revision;
    adapter: Adoption;
    send: 'not-sent' | 'sent' | 'unknown';
    firstContent: 'none-proven' | 'observed' | 'uncertain';
    outcome: Readonly<{
        kind: 'pending';
    }> | Readonly<{
        kind: 'completed';
        reason: 'stop' | 'limit' | 'tool-suggestions';
    }> | Readonly<{
        kind: 'interrupted';
    }> | Readonly<{
        kind: 'failed';
        cause: ModelFault['cause'];
        upstreamStatus: string | null;
    }>;
    timing: Readonly<{
        materialize: ModelDuration;
        sendToFirstContent: ModelDuration;
        execution: ModelDuration;
    }>;
}>;
```

### `ModelBindingFailure`

```ts
type ModelBindingFailure = Readonly<{
    kind: 'conflict';
}> | Extract<ModelFailure, {
    kind: 'invalid' | 'unavailable';
}>;
```

### `ModelBlock`

```ts
type ModelBlock = ContentBlock | ToolSuggestion | ReasoningStatePart;
```

### `ModelCallId`

```ts
type ModelCallId = Identity<'ModelCallId'>;
```

### `ModelCalls`

```ts
interface ModelCalls<P> {
    admit(input: Admit<P>): Reply<Admission>;
    inspect(input: ModelReferenceAccess<P>): Reply<Lookup>;
    dispatches(input: CallAccess<P>): Reply<readonly DispatchRecord[]>;
    cancel(input: Mutation<P>): Reply<ControlState>;
}
```

### `ModelChoices`

```ts
type ModelChoices = Readonly<{
    choices: readonly ProfileResolution[];
    selected: Readonly<{
        route: string;
        resolution: ProfileResolution;
    }> | null;
    source: DurableEvidence;
}>;
```

### `ModelClock`

```ts
interface ModelClock {
    now(): string;
    waitUntil(instant: string, signal: AbortSignal): Promise<'elapsed' | 'cancelled'>;
}
```

### `ModelCommands`

```ts
interface ModelCommands<P> {
    admit(input: Admit<P>): Reply<Admission>;
    recall(input: CallAccess<P> & Readonly<{
        admission: ModelOperationId;
    }>): Reply<Lookup>;
    scanPending(input: Access<P> & Readonly<{
        after: string | null;
        limit: number;
    }>): Reply<Readonly<{
        calls: readonly ModelCallId[];
        next: string | null;
    }>>;
    loadRecovery(input: CallAccess<P>): Reply<RecoveryRecord>;
    claim(input: CallAccess<P> & Readonly<{
        instance: ModelInstanceId;
        operation: ModelOperationId;
        continuity: DurableEvidence;
    }>): Reply<ExecutionRef>;
    prepareDispatch(input: WriteContext & DispatchPlan): Reply<Revision>;
    recordMaterialization(input: WriteContext & Readonly<{
        dispatch: DispatchId;
        receipt: MaterializationReceipt;
    }>): Reply<Readonly<{
        revision: Revision;
        source: DurableEvidence;
    }>>;
    recordSend(input: WriteContext & Readonly<{
        dispatch: DispatchId;
        state: 'started' | 'unknown' | 'not-sent';
    }>): Reply<Revision>;
    openReceiveWindow(input: WriteContext & Readonly<{
        dispatch: DispatchId;
        window: string;
    }>): Reply<Revision>;
    preserve(input: WriteContext & Readonly<{
        dispatch: DispatchId;
        window: string;
        facts: readonly TransportFact[];
    }>): Reply<Snapshot>;
    recordLateFact(input: Access<P> & Readonly<{
        call: ModelCallId;
        dispatch: DispatchId;
        operation: ModelOperationId;
        source: DurableEvidence;
        fact: LateDispatchFact;
    }>): Reply<Readonly<{
        revision: Revision;
        recovered: boolean;
    }>>;
    prepareRetry(input: WriteContext & Readonly<{
        dispatch: DispatchId;
    }>): Reply<RetryPosition>;
    decideRetry(input: WriteContext & Readonly<{
        position: RetryPosition;
        decision: RetryDecision;
        source: DurableEvidence;
    }>): Reply<Revision>;
    settle(input: WriteContext & Readonly<{
        termination: Termination;
    }>): Reply<Settlement>;
    control(input: Mutation<P>): Reply<ControlState>;
    acquireRead(input: Mutation<P> & Readonly<{
        result: ResultVersion;
    }>): Reply<ReadStart>;
    nextRead(input: CallAccess<P> & Readonly<{
        read: ReadId;
        after: string;
    }>): Reply<ReadState>;
    endRead(input: CallAccess<P> & Readonly<{
        read: ReadId;
    }>): Reply<ReadState>;
    handoff(input: AckInput<P>): Reply<AckReceipt>;
    advanceCleanup(input: ExecutionRef & Readonly<{
        operation: ModelOperationId;
    }>): Reply<CustodyState>;
    query(input: CallAccess<P> & Readonly<{
        operation: ModelOperationId;
    }>): Reply<CommitQuery<Readonly<{
        revision: Revision;
    }>>>;
    dispatches(input: CallAccess<P>): Reply<readonly DispatchRecord[]>;
}
```

### `ModelConsumerOwnerDeclaration`

```ts
type ModelConsumerOwnerDeclaration = Readonly<{
    consumerOwner: string;
    work: Readonly<{
        kind: 'guarded';
        participant: Adoption;
    }> | Readonly<{
        kind: 'exempt';
    }>;
    evidence: Adoption;
}>;
```

### `ModelConsumption`

```ts
interface ModelConsumption<P> {
    beginRead(input: ModelReferenceAccess<P> & Readonly<{
        operation: ModelOperationId;
        result: ResultVersion;
    }>): Reply<ReadStart>;
    readNext(input: CallAccess<P> & Readonly<{
        read: ReadId;
        after: string;
    }>): Reply<ReadState>;
    closeRead(input: CallAccess<P> & Readonly<{
        read: ReadId;
    }>): Reply<ReadState>;
    acknowledge(input: AckInput<P>): Reply<AckReceipt>;
}
```

### `ModelContentAuthority`

```ts
interface ModelContentAuthority<P> {
    check(input: Parameters<ModelMessageConversion<P>['prepare']>[0]): ConversionReply<Readonly<{
        treatment: 'human-only' | 'text' | 'tool-ref' | 'convertible';
    }>>;
}
```

### `ModelConverter`

```ts
interface ModelConverter<P> {
    readonly adoption: Adoption;
    convert(input: Access<P> & Readonly<{
        original: ContentBlock;
        source: DurableEvidence;
        signal: AbortSignal;
    }>): ConversionReply<ConvertedContent>;
}
```

### `ModelConverterCatalog`

```ts
interface ModelConverterCatalog<P> {
    acquire(input: Readonly<{
        mediaType: string;
        modality: Modality | null;
    }>): Reply<ConverterLookup<P>>;
}
```

### `ModelCountingBasis`

```ts
type ModelCountingBasis = Readonly<{
    supplier: ProfileSupplier;
    meter: Adoption;
    tokenization: Readonly<{
        kind: 'local';
        definition: TokenizerDefinition;
    }> | Readonly<{
        kind: 'not-used';
        method: Adoption;
    }>;
    prompt: Readonly<{
        kind: 'declared-template';
        template: Adoption;
    }> | Readonly<{
        kind: 'provider-private';
        estimation: Adoption;
    }>;
    projection: Adoption;
    mediaTransform: Adoption;
    replay: Adoption;
    evidence: Adoption;
}>;
```

### `ModelDiagnosticCursor`

```ts
type ModelDiagnosticCursor = Identity<'ModelDiagnosticCursor'>;
```

### `ModelDiagnosticId`

```ts
type ModelDiagnosticId = Identity<'ModelDiagnosticId'>;
```

### `ModelDiagnostics`

```ts
interface ModelDiagnostics<P> {
    list(input: CallAccess<P> & Readonly<{
        after: ModelDiagnosticCursor | null;
        limit: number;
    }>): Reply<ModelDiagnosticsPage>;
}
```

### `ModelDiagnosticsPage`

```ts
type ModelDiagnosticsPage = Readonly<{
    entries: readonly ModelAttemptDiagnostic[];
    next: ModelDiagnosticCursor | null;
    snapshot: DurableEvidence;
    retention: Adoption;
    coverage: 'complete-through-snapshot' | 'expired-prefix';
}>;
```

### `ModelDirectory`

```ts
interface ModelDirectory<P> {
    connect(input: ModelReferenceAccess<P>): Reply<LiveRoute<P>>;
}
```

### `ModelDriveInput`

```ts
type ModelDriveInput<P> = CallAccess<P> & Readonly<{
    instance: ModelInstanceId;
    operation: ModelOperationId;
    continuity: DurableEvidence;
}>;
```

### `ModelDriver`

```ts
interface ModelDriver<P> {
    drive(input: ModelDriveInput<P>, signal: AbortSignal): Reply<void>;
}
```

### `ModelDriverBinding`

```ts
interface ModelDriverBinding {
    close(): Reply<void>;
}
```

### `ModelDriverHost`

```ts
interface ModelDriverHost<P> extends ModelInstanceHost<P> {
    bind(driver: ModelDriver<P>): Promise<Outcome<ModelDriverBinding, ModelBindingFailure>>;
}
```

### `ModelDuration`

```ts
type ModelDuration = Readonly<{
    kind: 'known';
    milliseconds: string;
}> | Readonly<{
    kind: 'unknown';
}>;
```

### `ModelFailure`

```ts
type ModelFailure = Readonly<{
    kind: 'denied';
    action: string;
}> | Readonly<{
    kind: 'invalid';
    field: string;
    reason: string;
}> | Readonly<{
    kind: 'unsupported';
    field: string;
    adapter: Adoption;
}> | Readonly<{
    kind: 'conflict';
    operation: ModelOperationId;
    revision: Revision;
}> | Readonly<{
    kind: 'capacity';
    required: ResultCapacity;
}> | Readonly<{
    kind: 'unavailable';
    dependency: string;
    diagnostic: string;
}> | Readonly<{
    kind: 'commit-unknown';
    operation: ModelOperationId;
}> | Readonly<{
    kind: 'stale-instance';
    instance: ModelInstanceId;
}> | Readonly<{
    kind: 'not-settled';
}> | Readonly<{
    kind: 'handoff-invalid';
    reason: string;
}>;
```

### `ModelFault`

```ts
type ModelFault = Readonly<{
    diagnostic: string;
    upstreamStatus: string | null;
}> & (Readonly<{
    cause: Exclude<ModelFaultCause, 'input-over-limit' | 'replay-rejected'>;
    replayCarried?: true;
}> | Readonly<{
    cause: 'replay-rejected';
    replayCarried: true;
}> | Readonly<{
    cause: 'input-over-limit';
    reported: Readonly<{
        metric: OverLimitMetric | null;
        limit: string | null;
        actual: string | null;
    }>;
    replayCarried?: true;
}>);
```

### `ModelFaultCause`

```ts
type ModelFaultCause = 'profile-withdrawn' | 'excluded' | 'modality' | 'credential' | 'input-rejected' | 'input-over-limit' | 'replay-rejected' | 'upstream-unavailable' | 'stream-lost' | 'runtime-lost' | 'persistence' | 'policy-unavailable' | 'upstream-protocol' | 'unclassified';
```

### `ModelHandle`

```ts
interface ModelHandle<P> {
    readonly instance: ModelInstanceId;
    observe(input: Access<P> & Readonly<{
        signal: AbortSignal;
    }>): AsyncIterable<Observation>;
}
```

### `ModelHostAuthority`

```ts
interface ModelHostAuthority<P> {
    resolve(input: Readonly<{
        tenant: TenantId;
        call: ModelCallId;
    }>): Reply<ModelDriveInput<P>>;
}
```

### `ModelIdentityKey`

```ts
type ModelIdentityKey = 'ModelCallId' | 'ModelDispatchId' | 'ModelInstanceId' | 'ModelOperationId' | 'ModelReadId' | 'ModelDiagnosticId' | 'ModelDiagnosticCursor' | 'ModelRevision' | 'ModelResultVersion' | 'ModelOutputCursor' | 'ModelCredentialId';
```

### `ModelIdentityRejection`

```ts
type ModelIdentityRejection<K extends ModelIdentityKey> = Readonly<{
    field: K;
    reason: 'type' | 'empty' | 'length' | 'prefix' | 'character' | 'leading-zero';
}>;
```

### `ModelInputMeter`

```ts
interface ModelInputMeter {
    readonly basis: ModelCountingBasis;
    measure(input: Readonly<{
        profile: Adoption;
        supplier: ProfileSupplier;
        context: ContextLimits;
        limits: readonly ModelLimit[];
        assembled: AssembledModelInput;
        parameters: readonly ParameterAdoption[];
        representation: MeterRepresentation;
    }>): Outcome<RequestBudget, TransportFailure>;
}
```

### `ModelInputRejection`

```ts
type ModelInputRejection = Readonly<{
    field: string;
    reason: 'type' | 'missing' | 'unknown-field' | 'accessor' | 'non-enumerable' | 'symbol-key' | 'prototype' | 'sparse' | 'cycle' | 'unreadable' | 'budget-nodes' | 'budget-depth' | 'budget-string' | 'budget-strings' | 'budget-array' | 'budget-members' | 'budget-key' | 'identity' | 'reserved' | 'value' | 'range' | 'duplicate' | 'selection' | 'adoption' | 'content' | 'message' | 'json' | 'integer';
}>;
```

### `ModelInstanceDirectory`

```ts
interface ModelInstanceDirectory<P> {
    connect(input: CallAccess<P>): Reply<LiveRoute<P>>;
}
```

### `ModelInstanceHost`

```ts
interface ModelInstanceHost<P> {
    schedule(input: Readonly<{
        tenant: TenantId;
        call: ModelCallId;
    }>): Reply<Readonly<{
        queued: true;
    }>>;
    publish(input: ExecutionRef, handle: ModelHandle<P>): Reply<Publication>;
    withdraw(input: Publication): Reply<Readonly<{
        removed: boolean;
    }>>;
    directory: ModelInstanceDirectory<P>;
}
```

### `ModelInstanceId`

```ts
type ModelInstanceId = Identity<'ModelInstanceId'>;
```

### `ModelInvocationParts`

```ts
type ModelInvocationParts = Readonly<{
    tenant: TenantId;
    call: ModelCallId;
    admission: ModelOperationId;
}>;
```

### `ModelInvocationRef`

```ts
type ModelInvocationRef = string & {
    readonly [invocationReference]: true;
};
```

### `ModelLimit`

```ts
type ModelLimit = Readonly<{
    metric: LimitMetric;
    provided: string;
    upstream: readonly Readonly<{
        supplier: Adoption;
        limit: UpstreamLimit;
    }>[];
}>;
```

### `ModelMediaLease`

```ts
interface ModelMediaLease {
    readonly bytes: AsyncIterable<Uint8Array>;
    close(): Promise<void>;
}
```

### `ModelMediaReader`

```ts
interface ModelMediaReader<P> {
    open(input: Access<P> & Readonly<{
        invocation: Readonly<{
            kind: 'managed';
            call: ModelCallId;
            dispatch: DispatchId;
        }> | Readonly<{
            kind: 'independent';
        }>;
        request: FixedModelRequest;
        source: DurableEvidence;
        reference: ContentReference;
        recipient: string;
    }>, signal: AbortSignal): Promise<Outcome<ModelMediaLease, TransportFailure>>;
}
```

### `ModelMessageConversion`

```ts
interface ModelMessageConversion<P> {
    prepare(input: Access<P> & Readonly<{
        original: ContentBlock;
        source: DurableEvidence;
        origin: 'inbound' | 'model-output' | 'tool-output';
        signal: AbortSignal;
    }>): ConversionReply<ConversionResult>;
}
```

### `ModelModality`

```ts
type ModelModality = Extract<Modality, 'text' | 'image' | 'voice'>;
```

### `ModelOperationId`

```ts
type ModelOperationId = Identity<'ModelOperationId'>;
```

### `ModelOperationParts`

```ts
type ModelOperationParts = ModelInvocationParts & Readonly<{
    operation: ModelOperationId;
}>;
```

### `ModelOperationRef`

```ts
type ModelOperationRef = string & {
    readonly [operationReference]: true;
};
```

### `ModelPreparationLease`

```ts
type ModelPreparationLease = Readonly<{
    bindings: readonly [
        Readonly<{
            supplier: Supplier;
            rules: ModelRequestRules;
            meter: ModelInputMeter;
        }>,
        ...Readonly<{
            supplier: Supplier;
            rules: ModelRequestRules;
            meter: ModelInputMeter;
        }>[]
    ];
    release(): Promise<Readonly<{
        failure?: Extract<ModelFailure, {
            kind: 'unavailable';
        }>;
    }>>;
}>;
```

### `ModelPreparationResources`

```ts
interface ModelPreparationResources<P> {
    acquire(input: Access<P> & Readonly<{
        profile: ModelProfile;
    }>): Reply<ModelPreparationLease>;
}
```

### `ModelProfile`

```ts
type ModelProfile = Readonly<{
    identity: ProfileIdentity;
    adoption: Adoption;
    revision: Revision;
    updatedAt: string;
    availability: 'active' | 'withdrawn';
    definition: ModelProfileDefinition;
}>;
```

### `ModelProfileDefinition`

```ts
type ModelProfileDefinition = Readonly<{
    suppliers: readonly [
        ProfileSupplier,
        ...ProfileSupplier[]
    ];
    fallback: boolean;
    input: readonly [
        ModelModality,
        ...ModelModality[]
    ];
    output: readonly [
        ModelModality,
        ...ModelModality[]
    ];
    context: ContextLimits;
    limits: readonly ModelLimit[];
    parameters: readonly Parameter[];
    representation: Adoption;
    meter: Adoption;
    retryPolicy: Adoption;
}>;
```

### `ModelProfileMaintenance`

```ts
interface ModelProfileMaintenance<P> {
    change(input: Access<P> & Readonly<{
        operation: ModelOperationId;
        change: ProfileChange;
    }>): Reply<ModelProfile>;
    inspect(input: Access<P> & Readonly<{
        operation: ModelOperationId;
    }>): Reply<CommitQuery<ModelProfile>>;
}
```

### `ModelProfileSnapshot`

```ts
type ModelProfileSnapshot = Readonly<{
    precedence: readonly ProfileScope[];
    candidates: readonly Readonly<{
        profile: ModelProfile;
        excluded: boolean;
        locked: boolean;
        credential: 'available' | 'missing' | 'unreadable' | 'unavailable';
    }>[];
    source: DurableEvidence;
}>;
```

### `ModelProfileSource`

```ts
interface ModelProfileSource<P> {
    read(input: Access<P>): Reply<ModelProfileSnapshot>;
}
```

### `ModelProfiles`

```ts
interface ModelProfiles<P> {
    list(input: Access<P> & Readonly<{
        selected: string | null;
        required: ModalityRequirement;
    }>): Reply<ModelChoices>;
    resolve(input: Access<P> & Readonly<{
        route: string;
        required: ModalityRequirement;
    }>): Reply<ProfileResolution>;
}
```

### `ModelProvider`

```ts
interface ModelProvider<P> {
    readonly runtime: ModelRuntime<P>;
    recover(input: Access<P>): Reply<Readonly<{
        scheduled: string;
    }>>;
    quiesce(): Reply<Readonly<{
        pending: string;
        running: string;
    }>>;
}
```

### `ModelReferenceAccess`

```ts
type ModelReferenceAccess<P> = Access<P> & Readonly<{
    reference: ModelInvocationRef;
}>;
```

### `ModelReferenceFailure`

```ts
type ModelReferenceFailure = Readonly<{
    kind: 'malformed';
    rejection: ModelReferenceRejection;
}> | Readonly<{
    kind: 'invalid-tenant';
}> | Readonly<{
    kind: 'foreign-tenant';
}>;
```

### `ModelReferenceRejection`

```ts
type ModelReferenceRejection = Readonly<{
    field: 'ModelInvocationRef' | 'ModelOperationRef';
    reason: 'type' | 'length' | 'syntax' | 'domain' | 'version' | 'shape' | 'identity' | 'reserved' | 'unreadable';
}>;
```

### `ModelRequestPreparation`

```ts
interface ModelRequestPreparation<P> {
    prepare(input: Access<P> & Readonly<{
        profile: ModelProfile;
        required: ModalityRequirement;
        assembled: AssembledModelInput;
    }>): Reply<FixedModelRequest>;
}
```

### `ModelRequestRules`

```ts
interface ModelRequestRules {
    plan(input: Readonly<{
        profile: ModelProfile;
        supplier: Supplier;
        assembled: AssembledModelInput;
    }>): Outcome<Readonly<{
        parameters: readonly ParameterAdoption[];
        representation: MeterRepresentation;
    }>, TransportFailure>;
}
```

### `ModelRetryPolicy`

```ts
interface ModelRetryPolicy<P> {
    decide(input: CallAccess<P> & Readonly<{
        position: RetryPosition;
        initiator: ActorRef;
        request: FixedModelRequest;
        dispatches: readonly DispatchRecord[];
        failure: ModelFault;
    }>): Reply<RetryResolution>;
    inspect(input: CallAccess<P> & Readonly<{
        position: RetryPosition;
    }>): Reply<RetryResolution>;
}
```

### `ModelRuntime`

```ts
interface ModelRuntime<P> {
    readonly calls: ModelCalls<P>;
    readonly consumption: ModelConsumption<P>;
    readonly instances: ModelDirectory<P>;
}
```

### `ModelSendBoundary`

```ts
interface ModelSendBoundary<P> {
    send(input: SendDemand<P>, signal: AbortSignal): Promise<SendResult>;
}
```

### `ModelTextTokenizer`

```ts
interface ModelTextTokenizer {
    readonly definition: TokenizerDefinition;
    count(input: readonly TokenizationSegment[]): Outcome<Readonly<{
        tokens: string;
    }>, TokenizationFailure>;
}
```

### `ModelToolPayloadAdapter`

```ts
interface ModelToolPayloadAdapter<TPayload> {
    convertToModelPayload(declaration: ToolDeclaration): Outcome<TPayload, TransportFailure>;
}
```

### `ModelTransport`

```ts
interface ModelTransport {
    prepare(request: FixedModelRequest, supplier: Supplier, dispatch: TransportDispatch): Promise<Outcome<PreparedTransport, TransportFailure>>;
}
```

### `Mutation`

```ts
type Mutation<P> = CallAccess<P> & Readonly<{
    operation: ModelOperationId;
}>;
```

### `Observation`

```ts
type Observation = Readonly<{
    kind: 'snapshot';
    value: Snapshot;
}> | Readonly<{
    kind: 'changed';
    value: Snapshot;
}> | Readonly<{
    kind: 'ended';
    reason: 'observer-closed' | 'stale-instance' | 'denied' | 'unavailable';
}>;
```

### `OutputCursor`

```ts
type OutputCursor = Identity<'ModelOutputCursor'>;
```

### `OverLimitMetric`

```ts
type OverLimitMetric = 'context-tokens' | 'input-tokens' | LimitMetric;
```

### `Parameter`

```ts
type Parameter = Readonly<{
    kind: 'temperature';
    value: number;
}> | Readonly<{
    kind: 'top-p';
    value: number;
}> | Readonly<{
    kind: 'max-output-tokens';
    value: string;
}> | Readonly<{
    kind: 'stop';
    value: readonly string[];
}> | Readonly<{
    kind: 'reasoning-effort';
    value: 'none' | 'low' | 'medium' | 'high' | 'max';
}> | Readonly<{
    kind: 'seed';
    value: string;
}> | Readonly<{
    kind: 'frequency-penalty';
    value: number;
}> | Readonly<{
    kind: 'presence-penalty';
    value: number;
}> | Readonly<{
    kind: 'extension';
    definition: Adoption;
    value: JsonValue;
}>;
```

### `ParameterAdoption`

```ts
type ParameterAdoption = Readonly<{
    supplier: Adoption;
    applied: Parameter;
    origin: Readonly<{
        kind: 'explicit';
        requested: Parameter;
        source: Adoption;
    }> | Readonly<{
        kind: 'default';
        source: Adoption;
    }>;
}>;
```

### `PreparedTransport`

```ts
interface PreparedTransport {
    materialize(signal: AbortSignal): Promise<Outcome<MaterializedTransport, TransportFailure>>;
    close(): Promise<void>;
}
```

### `ProfileChange`

```ts
type ProfileChange = Readonly<{
    kind: 'create';
    identity: ProfileIdentity;
    definition: ModelProfileDefinition;
}> | Readonly<{
    kind: 'revise';
    identity: ProfileIdentity;
    expected: Revision;
    definition: ModelProfileDefinition;
}> | Readonly<{
    kind: 'withdraw' | 'restore';
    identity: ProfileIdentity;
    expected: Revision;
}>;
```

### `ProfileIdentity`

```ts
type ProfileIdentity = Readonly<{
    scope: ProfileScope;
    route: string;
}>;
```

### `ProfileReplay`

```ts
type ProfileReplay = Readonly<{
    produces?: string;
    accepts?: readonly string[];
    foreignThinking?: ForeignThinking;
}>;
```

### `ProfileResolution`

```ts
type ProfileResolution = Readonly<{
    kind: 'resolved';
    profile: ModelProfile;
    source: DurableEvidence;
    selectable: boolean;
    reasons: readonly ('modality' | 'locked' | 'scope')[];
    credential: 'available' | 'missing' | 'unreadable' | 'unavailable';
    shadowed: readonly Adoption[];
}> | Readonly<{
    kind: 'absent';
    reason: 'unknown-name' | 'withdrawn' | 'excluded';
}>;
```

### `ProfileScope`

```ts
type ProfileScope = Readonly<{
    kind: 'factory';
}> | Readonly<{
    kind: 'organization';
    organization: string;
}> | Readonly<{
    kind: 'tenant';
    tenant: TenantId;
}>;
```

### `ProfileSupplier`

```ts
type ProfileSupplier = Omit<Supplier, 'credential'> & Readonly<{
    replay?: ProfileReplay;
}>;
```

### `ProviderDiagnostic`

```ts
type ProviderDiagnostic = Readonly<{
    kind: 'replay-omitted';
    message: MessageId;
    scope: string;
    format: string;
    omittedParts: number;
}> | Readonly<{
    kind: 'reasoning-disabled';
    reason: 'foreign-prefix';
}> | Readonly<{
    kind: 'reasoning-state-dropped';
    reason: 'payload-too-long';
    length: number;
}> | Readonly<{
    kind: 'usage-inconsistent';
    field: string;
}>;
```

### `Publication`

```ts
type Publication = Readonly<{
    execution: ExecutionRef;
    registration: string;
}>;
```

### `ReadId`

```ts
type ReadId = Identity<'ModelReadId'>;
```

### `ReadStart`

```ts
type ReadStart = Readonly<{
    kind: 'started';
    read: ReadId;
    value: ReadState;
}> | Readonly<{
    kind: 'acknowledged';
    custody: Extract<CustodyState, {
        kind: 'acknowledged';
    }>;
}>;
```

### `ReadState`

```ts
type ReadState = Readonly<{
    kind: 'reading';
    page: ResultPage;
}> | Readonly<{
    kind: 'ended';
    reason: 'complete' | 'closed' | 'denied' | 'stalled' | 'owner-lost';
}>;
```

### `RecoveryRecord`

```ts
type RecoveryRecord = Readonly<{
    state: CallState;
    request: FixedModelRequest;
    capacity: ResultCapacity;
    initiator: ActorRef;
    admission: ModelOperationId;
    execution: ExecutionRef | null;
    retry: RetryDecision | null;
    retryPosition: RetryPosition | null;
    unresolved: readonly ModelOperationId[];
    tasks: readonly ('execute' | 'control' | 'handoff' | 'cleanup' | 'account')[];
}>;
```

### `ReplayDeclaration`

```ts
type ReplayDeclaration = Readonly<{
    produces: string;
    accepts: readonly string[];
    foreignThinking: ForeignThinking;
}>;
```

### `ReplayDiagnostic`

```ts
type ReplayDiagnostic = Readonly<{
    message: MessageId;
    scope: string;
    format: string;
    omittedParts: number;
}>;
```

### `ReplayProjection`

```ts
type ReplayProjection = Readonly<{
    treatments: readonly ReplayTreatment[];
    diagnostics: readonly ReplayDiagnostic[];
}>;
```

### `ReplayProjectionInput`

```ts
type ReplayProjectionInput = Readonly<{
    messages: readonly Message[];
    declaration: ReplayDeclaration;
    formats: ReadonlySet<string>;
    off: boolean;
    resent: ReadonlySet<MessageId>;
}>;
```

### `ReplayTreatment`

```ts
type ReplayTreatment = Readonly<{
    index: number;
    message: MessageId;
}> & (Readonly<{
    continuable: true;
    carry: readonly number[];
    thinking: 'native';
}> | Readonly<{
    continuable: false;
    omit: readonly number[];
    thinking: ForeignThinking;
}>);
```

### `Reply`

```ts
type Reply<T> = Promise<Outcome<T, ModelFailure>>;
```

### `RequestBudget`

```ts
type RequestBudget = Readonly<{
    inputDigest: string;
    checks: readonly BudgetCheck[];
    counting: readonly [
        ModelCountingBasis,
        ...ModelCountingBasis[]
    ];
}> & (Readonly<{
    kind: 'complete';
}> | Readonly<{
    kind: 'deferred-media';
    references: readonly [
        ContentReference,
        ...ContentReference[]
    ];
}>);
```

### `ResultCapacity`

```ts
type ResultCapacity = Readonly<{
    bytes: string;
    blocks: string;
    attachmentBytes: string;
}>;
```

### `ResultPage`

```ts
type ResultPage = Readonly<{
    parts: readonly ResultPart[];
    next: string | null;
    settlement: Settlement;
}>;
```

### `ResultPart`

```ts
type ResultPart = Readonly<{
    trims: readonly ResultTrim[];
}> & (Readonly<{
    kind: 'sealed';
    block: ModelBlock;
}> | Readonly<{
    kind: 'partial';
    content: GrowingContentKind;
    value: string;
}>);
```

### `ResultTrim`

```ts
type ResultTrim = Readonly<{
    removed: string;
    reason: string;
}>;
```

### `ResultVersion`

```ts
type ResultVersion = Identity<'ModelResultVersion'>;
```

### `RetryDecision`

```ts
type RetryDecision = Readonly<{
    kind: 'stop';
    fault: ModelFault;
}> | Readonly<{
    kind: 'retry';
    supplier: Supplier;
    notBefore: string;
    basis: Adoption;
}>;
```

### `RetryPosition`

```ts
type RetryPosition = Readonly<{
    operation: ModelOperationId;
    dispatch: DispatchId;
    policy: Adoption;
    consumer: ConsumerRef;
}>;
```

### `RetryResolution`

```ts
type RetryResolution = Readonly<{
    kind: 'pending';
    position: RetryPosition;
}> | Readonly<{
    kind: 'decided';
    position: RetryPosition;
    decision: RetryDecision;
    source: DurableEvidence;
}>;
```

### `Revision`

```ts
type Revision = Identity<'ModelRevision'>;
```

### `SendDemand`

```ts
type SendDemand<P> = CallAccess<P> & Readonly<{
    execution: ExecutionRef;
    dispatch: DispatchId;
    request: FixedModelRequest;
    supplier: Supplier;
    consumer: ConsumerRef;
    initiator: ActorRef;
}>;
```

### `SendFace`

```ts
type SendFace = Readonly<{
    authorized: boolean;
    official: boolean;
}>;
```

### `SendResult`

```ts
type SendResult = Readonly<{
    kind: 'started';
    window: string;
    facts: AsyncIterable<TransportFact>;
}> | Readonly<{
    kind: 'not-started';
    failure: ModelFailure;
}> | Readonly<{
    kind: 'unknown';
    dispatch: DispatchId;
    diagnostic: string;
}>;
```

### `Settlement`

```ts
type Settlement = Readonly<{
    version: ResultVersion;
    termination: Termination;
    cursor: OutputCursor;
    source: DurableEvidence;
}>;
```

### `Snapshot`

```ts
type Snapshot = Readonly<{
    call: ModelCallId;
    cursor: OutputCursor;
    blocks: readonly VisibleBlock[];
    state: CallState;
}>;
```

### `Supplier`

```ts
type Supplier = Readonly<{
    adoption: Adoption;
    recipient: string;
    model: string;
    credential: Readonly<{
        kind: 'tenant';
        id: CredentialId;
    }> | Readonly<{
        kind: 'factory';
    }>;
}>;
```

### `Termination`

```ts
type Termination = Readonly<{
    kind: 'completed';
    reason: 'stop' | 'limit' | 'tool-suggestions';
}> | Readonly<{
    kind: 'failed';
    fault: ModelFault;
}> | Readonly<{
    kind: 'interrupted';
    control: ModelOperationId;
}>;
```

### `TokenLimit`

```ts
type TokenLimit = Omit<ModelLimit, 'metric'>;
```

### `TokenizationFailure`

```ts
type TokenizationFailure = Readonly<{
    kind: 'invalid';
    reason: string;
}> | Readonly<{
    kind: 'unsupported-token';
    name: string;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
```

### `TokenizationSegment`

```ts
type TokenizationSegment = Readonly<{
    kind: 'text';
    text: string;
}> | Readonly<{
    kind: 'special-token';
    name: string;
}>;
```

### `TokenizerDefinition`

```ts
type TokenizerDefinition = Readonly<{
    adoption: Adoption;
    implementation: Adoption;
    vocabulary: Adoption;
    configuration: Adoption;
}>;
```

### `ToolDeclaration`

```ts
type ToolDeclaration = Readonly<{
    name: string;
    description: string;
    argumentsSchema: JsonValue;
}>;
```

### `ToolSuggestion`

```ts
type ToolSuggestion = ToolCallPart;
```

### `TransportDispatch`

```ts
type TransportDispatch = Readonly<{
    resent: readonly MessageId[];
}>;
```

### `TransportFact`

```ts
type TransportFact = Readonly<{
    kind: 'block-open';
    index: string;
    mode: 'append' | 'replace';
    content: GrowingContentKind;
}> | Readonly<{
    kind: 'block-delta';
    index: string;
    delta: string;
}> | Readonly<{
    kind: 'block-replace';
    index: string;
    value: string;
}> | Readonly<{
    kind: 'block-seal';
    index: string;
    block: ModelBlock;
}> | Readonly<{
    kind: 'trim';
    index: string;
    removed: string;
    reason: string;
}> | Readonly<{
    kind: 'account';
    event: string;
    value: CallAccountReport;
}> | Readonly<{
    kind: 'diagnostic';
    value: ProviderDiagnostic;
}> | Readonly<{
    kind: 'ended';
    termination: TransportTermination;
}>;
```

### `TransportFailure`

```ts
type TransportFailure = Extract<ModelFailure, {
    kind: 'denied' | 'invalid' | 'unsupported' | 'unavailable';
}>;
```

### `TransportTermination`

```ts
type TransportTermination = Exclude<Termination, {
    kind: 'interrupted';
}> | Readonly<{
    kind: 'interrupted';
    stop: 'confirmed';
}>;
```

### `UpstreamLimit`

```ts
type UpstreamLimit = Readonly<{
    kind: 'unknown';
}> | Readonly<{
    kind: 'finite';
    amount: string;
    source: Adoption;
}> | Readonly<{
    kind: 'unlimited' | 'not-applicable';
    source: Adoption;
}>;
```

### `VisibleBlock`

```ts
type VisibleBlock = Readonly<{
    kind: 'sealed';
    index: string;
    block: ModelBlock;
}> | Readonly<{
    kind: 'growing';
    index: string;
    mode: 'append' | 'replace';
    content: GrowingContentKind;
    value: string;
}>;
```

### `WriteContext`

```ts
type WriteContext = ExecutionRef & Readonly<{
    operation: ModelOperationId;
    expected: Revision;
}>;
```

### `compareOutputCursors`

```ts
function compareOutputCursors(left: OutputCursor, right: OutputCursor): -1 | 0 | 1;
```

### `compareRevisions`

```ts
function compareRevisions(left: Revision, right: Revision): -1 | 0 | 1;
```

### `continuedMessages`

```ts
function continuedMessages(projection: ReplayProjection): ReadonlySet<MessageId>;
```

### `decodeCredentialId`

```ts
function decodeCredentialId(value: unknown): Outcome<CredentialId, ModelIdentityRejection<'ModelCredentialId'>>;
```

### `decodeDispatchId`

```ts
function decodeDispatchId(text: unknown): Outcome<DispatchId, ModelIdentityRejection<'ModelDispatchId'>>;
```

### `decodeModelCallId`

```ts
function decodeModelCallId(text: unknown): Outcome<ModelCallId, ModelIdentityRejection<'ModelCallId'>>;
```

### `decodeModelDiagnosticCursor`

```ts
function decodeModelDiagnosticCursor(text: unknown): Outcome<ModelDiagnosticCursor, ModelIdentityRejection<'ModelDiagnosticCursor'>>;
```

### `decodeModelDiagnosticId`

```ts
function decodeModelDiagnosticId(text: unknown): Outcome<ModelDiagnosticId, ModelIdentityRejection<'ModelDiagnosticId'>>;
```

### `decodeModelInstanceId`

```ts
function decodeModelInstanceId(text: unknown): Outcome<ModelInstanceId, ModelIdentityRejection<'ModelInstanceId'>>;
```

### `decodeModelInvocationRef`

```ts
function decodeModelInvocationRef(text: unknown): Outcome<ModelInvocationRef, ModelReferenceRejection>;
```

### `decodeModelOperationId`

```ts
function decodeModelOperationId(text: unknown): Outcome<ModelOperationId, ModelIdentityRejection<'ModelOperationId'>>;
```

### `decodeModelOperationRef`

```ts
function decodeModelOperationRef(text: unknown): Outcome<ModelOperationRef, ModelReferenceRejection>;
```

### `decodeOutputCursor`

```ts
function decodeOutputCursor(text: unknown): Outcome<OutputCursor, ModelIdentityRejection<'ModelOutputCursor'>>;
```

### `decodeReadId`

```ts
function decodeReadId(text: unknown): Outcome<ReadId, ModelIdentityRejection<'ModelReadId'>>;
```

### `decodeResultVersion`

```ts
function decodeResultVersion(text: unknown): Outcome<ResultVersion, ModelIdentityRejection<'ModelResultVersion'>>;
```

### `decodeRevision`

```ts
function decodeRevision(text: unknown): Outcome<Revision, ModelIdentityRejection<'ModelRevision'>>;
```

### `deriveGuardControlOperation`

```ts
function deriveGuardControlOperation(call: ModelCallId): ModelOperationId;
```

### `encodeModelInvocationRef`

```ts
function encodeModelInvocationRef(parts: ModelInvocationParts): Outcome<ModelInvocationRef, ModelReferenceRejection>;
```

### `encodeModelOperationRef`

```ts
function encodeModelOperationRef(parts: ModelOperationParts): Outcome<ModelOperationRef, ModelReferenceRejection>;
```

### `judgeAdmit`

```ts
function judgeAdmit<P>(value: ModelAdmitCandidate<P>): Outcome<Admit<P>, ModelInputRejection>;
```

### `judgeFixedModelRequest`

```ts
function judgeFixedModelRequest(value: unknown): Outcome<FixedModelRequest, ModelInputRejection>;
```

### `judgeReplayDeclaration`

```ts
function judgeReplayDeclaration(supplier: Readonly<{
    recipient: string;
    model: string;
    replay?: unknown;
}>, index: number): Outcome<ReplayDeclaration, Extract<ModelFailure, {
    kind: 'invalid';
}>>;
```

### `projectReplay`

```ts
function projectReplay(input: ReplayProjectionInput): ReplayProjection;
```

### `resolveModelInvocationRef`

```ts
function resolveModelInvocationRef(reference: unknown, tenant: TenantId): Outcome<ModelInvocationParts, ModelReferenceFailure>;
```

### `resolveModelOperationRef`

```ts
function resolveModelOperationRef(reference: unknown, tenant: TenantId): Outcome<ModelOperationParts, ModelReferenceFailure>;
```

### `sameCredentialHolder`

```ts
function sameCredentialHolder(left: Pick<CredentialReference, 'id' | 'tenant'>, right: Pick<CredentialReference, 'id' | 'tenant'>): boolean;
```

## 入口 `./testing`

### `CONFORMANCE_OBLIGATIONS`

```ts
const CONFORMANCE_OBLIGATIONS: readonly [
    'admission-repeat-recognised',
    'admission-conflict-on-different-input',
    'operation-not-reused-across-methods',
    'admission-is-not-a-send',
    'reserved-operation-refused',
    'refused-admission-forms-no-call',
    'commit-unknown-keeps-operation',
    'commit-unknown-not-reported-as-refusal',
    'commit-unknown-cancel-recovers-original',
    'commit-unknown-acknowledge-recovers-original',
    'mixed-partial-result-readable',
    'settled-call-keeps-termination',
    'read-before-settle-refused',
    'acknowledge-refused-before-settle',
    'forged-evidence-refused',
    'acknowledge-records-custody',
    'duplicate-acknowledge-returns-original',
    'acknowledge-conflict-on-different-input',
    'acknowledged-result-not-read-again',
    'acknowledge-and-read-serialised',
    'read-page-stable-for-same-after',
    'close-read-idempotent',
    'acknowledge-keeps-open-read-readable',
    'revoked-reader-gets-no-page',
    'cleanup-failure-keeps-acknowledgement',
    'repeat-cancel-returns-original-control',
    'cancel-does-not-claim-stop',
    'cancelled-call-ends-interrupted-unacknowledged',
    'cancel-confined-to-target-call',
    'unauthorised-cancel-denied',
    'cancel-sends-nothing-more',
    'observation-opens-with-snapshot',
    'stopping-observation-keeps-call-running',
    'disconnect-ends-observation-as-unavailable',
    'new-observer-starts-from-snapshot',
    'growing-block-holds-accumulated-value',
    'sealed-block-takes-no-more-fill',
    'unsealed-tool-arguments-not-executable',
    'cross-tenant-access-refused',
    'refusal-hides-existence',
    'revoked-principal-gets-denied',
    'revoked-principal-observation-ends-denied',
    'withdrawn-instance-has-no-live-route',
    'directory-failure-is-unavailable',
    'replaced-instance-ends-observation-as-stale',
    'quiesce-refuses-new-admissions',
    'quiesce-reports-pending-and-running',
    'transport-sends-only-at-start',
    'repeated-transport-step-sends-nothing',
    'materialization-receipt-matches-request',
    'fact-stream-ends-once',
    'interruption-is-confirmed',
    'transport-close-is-idempotent'
];
```

### `ConformanceAction`

```ts
type ConformanceAction = 'inspect' | 'dispatches' | 'cancel' | 'connect' | 'observe' | 'read' | 'acknowledge';
```

### `ConformanceCall`

```ts
type ConformanceCall = Readonly<{
    tenant: TenantId;
    call: ModelCallId;
}>;
```

### `ConformanceHooks`

```ts
interface ConformanceHooks<P> {
    startRun?(input: ConformanceCall & Readonly<{
        dispatch: DispatchId;
    }>): Promise<void>;
    showFacts?(input: ConformanceCall & Readonly<{
        facts: readonly TransportFact[];
    }>): Promise<void>;
    settleCall?(input: ConformanceCall & Readonly<{
        termination: Termination;
        parts: readonly ResultPart[];
        pageSize: number;
        pageTargetBytes: number;
    }>): Promise<void>;
    provideEvidence?(input: ConformanceCall & Readonly<{
        label: string;
    }>): Promise<DurableEvidence>;
    failNextWrite?(input: Readonly<{
        tenant: TenantId;
        action: 'admit' | 'cancel' | 'acknowledge';
        operation: ModelOperationId;
        effect: 'applied' | 'dropped';
    }>): Promise<void>;
    advanceCleanup?(input: ConformanceCall): Promise<void>;
    blockCleanup?(input: ConformanceCall): Promise<void>;
    withdrawInstance?(input: ConformanceCall): Promise<void>;
    replaceInstance?(input: ConformanceCall & Readonly<{
        instance: ModelInstanceId;
    }>): Promise<void>;
    disconnectObservers?(input: ConformanceCall): Promise<void>;
    revokeAccess?(input: ConformanceCall & Readonly<{
        principal: P;
        action: 'all' | ConformanceAction;
    }>): Promise<void>;
    failDirectory?(): Promise<void>;
}
```

### `ConformanceObligation`

```ts
type ConformanceObligation = (typeof CONFORMANCE_OBLIGATIONS)[number];
```

### `ConformanceOptions`

```ts
type ConformanceOptions<P> = Readonly<{
    subject: () => ConformanceSubject<P> | Promise<ConformanceSubject<P>>;
    waitMs?: number;
}>;
```

### `ConformanceReport`

```ts
type ConformanceReport = Readonly<{
    ok: boolean;
    results: readonly ObligationResult[];
}>;
```

### `ConformanceSubject`

```ts
type ConformanceSubject<P> = Readonly<{
    provider: ModelProvider<P>;
    principal: P;
    tenant: TenantId;
    otherTenant: TenantId;
    request?: FixedModelRequest;
    consumer?: ConsumerRef;
    capacity?: ResultCapacity;
    hooks?: ConformanceHooks<P>;
    transport?: ConformanceTransport;
    dispose?(): Promise<void>;
}>;
```

### `ConformanceTransport`

```ts
type ConformanceTransport = Readonly<{
    transport: ModelTransport;
    sends(): number;
    request?: FixedModelRequest;
    supplier?: Supplier;
}>;
```

### `ObligationResult`

```ts
type ObligationResult = Readonly<{
    obligation: ConformanceObligation;
    status: 'pass' | 'fail' | 'not-applicable';
    detail: string;
}>;
```

### `ScriptController`

```ts
interface ScriptController<P> {
    start(input: ScriptedCall & Readonly<{
        dispatch: DispatchId;
        firstContent: DispatchRecord['firstContent'];
    }>): void;
    emit(input: ScriptedCall & Readonly<{
        blocks: readonly VisibleBlock[];
    }>): void;
    settle(input: ScriptedCall & Readonly<{
        version: ResultVersion;
        termination: Termination;
        parts: readonly ResultPart[];
        source: DurableEvidence;
        pageSize: number;
        pageTargetBytes: number;
    }>): void;
    play(input: ScriptedCall & Readonly<{
        facts: readonly TransportFact[];
    }>): void;
    expectEvidence(input: ScriptedCall & Readonly<{
        evidence: DurableEvidence;
    }>): void;
    failDirectory(): void;
    recordDispatch(input: ScriptedCall & Readonly<{
        record: DispatchRecord;
    }>): void;
    advanceControl(input: ScriptedCall & Readonly<{
        propagation: Extract<ControlState, {
            kind: 'requested';
        }>['propagation'];
        upstream: Extract<ControlState, {
            kind: 'requested';
        }>['upstream'];
    }>): void;
    setCleanup(input: ScriptedCall & Readonly<{
        cleanup: Extract<CustodyState, {
            kind: 'acknowledged';
        }>['cleanup'];
        diagnostic: string | null;
    }>): void;
    withdrawInstance(input: ScriptedCall): void;
    replaceInstance(input: ScriptedCall & Readonly<{
        instance: ModelInstanceId;
    }>): void;
    disconnectObservers(input: ScriptedCall): void;
    openObservations(input: ScriptedCall): number;
    revokeAccess(input: ScriptedCall & Readonly<{
        principal: P;
        actions: 'all' | readonly [
            ScriptedAction,
            ...ScriptedAction[]
        ];
    }>): void;
    commitUnknown(input: Readonly<{
        tenant: TenantId;
        action: WriteAction;
        operation: ModelOperationId;
        effect: 'applied' | 'dropped';
        query: 'answers' | 'stays-unknown';
    }>): void;
    queryCommit(input: CallAccess<P> & Readonly<{
        operation: ModelOperationId;
    }>): Reply<CommitQuery<Readonly<{
        revision: Revision;
    }>>>;
}
```

### `ScriptedAction`

```ts
type ScriptedAction = 'admit' | 'inspect' | 'dispatches' | 'cancel' | 'connect' | 'observe' | 'read' | 'acknowledge' | 'query';
```

### `ScriptedCall`

```ts
type ScriptedCall = Readonly<{
    tenant: TenantId;
    call: ModelCallId;
}>;
```

### `ScriptedModelError`

```ts
class ScriptedModelError extends Error {
    readonly reason: ScriptedModelErrorReason;
    constructor(reason: ScriptedModelErrorReason, message: string);
}
```

### `ScriptedModelErrorReason`

```ts
type ScriptedModelErrorReason = 'unknown-call' | 'invalid-script' | 'repeated-step';
```

### `ScriptedModelProvider`

```ts
type ScriptedModelProvider<P> = Readonly<{
    provider: ModelProvider<P>;
    controller: ScriptController<P>;
}>;
```

### `ScriptedModelProviderOptions`

```ts
type ScriptedModelProviderOptions<P> = Readonly<{
    instance: ModelInstanceId;
    samePrincipal?: (left: P, right: P) => boolean;
}>;
```

### `ScriptedPrincipal`

```ts
type ScriptedPrincipal = Readonly<{
    name: string;
}>;
```

### `ScriptedTransport`

```ts
type ScriptedTransport = Readonly<{
    transport: ModelTransport;
    counts(): ScriptedTransportCounts;
}>;
```

### `ScriptedTransportCounts`

```ts
type ScriptedTransportCounts = Readonly<{
    prepare: number;
    materialize: number;
    start: number;
    closePrepared: number;
    closeMaterialized: number;
}>;
```

### `ScriptedTransportEnding`

```ts
type ScriptedTransportEnding = Readonly<{
    kind: 'terminated';
    termination: TransportTermination;
}> | Readonly<{
    kind: 'exhausted';
}> | Readonly<{
    kind: 'throws';
    error: Error;
}>;
```

### `ScriptedTransportScript`

```ts
type ScriptedTransportScript = Readonly<{
    receipt: MaterializationReceipt;
    facts: readonly Exclude<TransportFact, {
        kind: 'ended';
    }>[];
    ending: ScriptedTransportEnding;
    rejection: Readonly<{
        at: 'prepare' | 'materialize';
        failure: TransportFailure;
    }> | null;
}>;
```

### `ScriptedWriteAction` = `WriteAction`

```ts
type WriteAction = 'admit' | 'cancel' | 'acknowledge';
```

### `checkModelProviderConformance`

```ts
function checkModelProviderConformance<P>(options: ConformanceOptions<P>): Promise<ConformanceReport>;
```

### `createScriptedConformanceSubject`

```ts
function createScriptedConformanceSubject(): ConformanceSubject<ScriptedPrincipal>;
```

### `createScriptedModelProvider`

```ts
function createScriptedModelProvider<P>(options: ScriptedModelProviderOptions<P>): ScriptedModelProvider<P>;
```

### `createScriptedTransport`

```ts
function createScriptedTransport(script: ScriptedTransportScript): ScriptedTransport;
```

## 内部引用

（无）
