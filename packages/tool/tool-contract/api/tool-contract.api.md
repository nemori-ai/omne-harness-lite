# @omne-harness/tool-contract 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

### `Access`

```ts
type Access<P> = Readonly<{
    principal: P;
    tenant: TenantId;
}>;
```

### `AccountScope`

```ts
type AccountScope = Readonly<{
    kind: 'tenant';
    tenant: TenantId;
}> | Readonly<{
    kind: 'organization';
    organization: string;
}>;
```

### `ActiveRelation`

```ts
type ActiveRelation = Readonly<{
    relation: 'foreground';
    wait: WaitState;
}> | Readonly<{
    relation: 'background';
    wait: Readonly<{
        kind: 'none';
    }>;
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

### `AdoptionRules`

```ts
type AdoptionRules = Readonly<{
    owner: string;
    name: string;
    revision: string;
}> & Readonly<Record<string, unknown>>;
```

### `Attachment`

```ts
type Attachment = ContentReference;
```

### `AvailabilityFacts`

```ts
type AvailabilityFacts = Readonly<{
    definition: ToolDefinition;
    executor: Adoption;
    qualification: 'allowed' | 'denied';
    dependencies: readonly Readonly<{
        name: string;
        available: boolean;
    }>[];
    inputCompatible: boolean;
    outputCompatible: boolean;
    attachmentsReadable: boolean;
}>;
```

### `BackgroundSource`

```ts
type BackgroundSource = Readonly<{
    kind: 'launched';
}> | Readonly<{
    kind: 'control';
    operation: ToolOperationId;
}> | Readonly<{
    kind: 'foreground-limit';
}> | Readonly<{
    kind: 'threshold';
}>;
```

### `CallAccess`

```ts
type CallAccess<P> = Access<P> & Readonly<{
    call: ToolCallId;
}>;
```

### `Checkpoint`

```ts
type Checkpoint = Readonly<{
    schema: Adoption;
    payload: DurableEvidence;
    start: ToolStartRecord;
    consumedResponses: readonly ToolOperationId[];
    effectBoundary: DurableEvidence;
    exclusion: DurableEvidence;
}>;
```

### `ChildPosition`

```ts
type ChildPosition = Readonly<{
    program: DurableEvidence;
    ordinal: string;
}>;
```

### `ChildReservation`

```ts
type ChildReservation = Readonly<{
    parent: ToolCallId;
    position: ChildPosition;
    child: ToolCallId;
    admission: ToolOperationId;
    request: FixedToolRequest;
    source: DurableEvidence;
}>;
```

### `ChildState`

```ts
type ChildState = Readonly<{
    reservation: ChildReservation;
}> & (Readonly<{
    kind: 'reserved' | 'unknown';
}> | Readonly<{
    kind: 'excluded';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'admitted';
    state: ToolState;
}> | Readonly<{
    kind: 'retained';
    state: ToolState;
    result: ToolResultVersion;
    custody: DurableEvidence;
    release: DurableEvidence;
}>);
```

### `ClockSegment`

```ts
type ClockSegment = Readonly<{
    operation: ToolOperationId;
    source: string;
    epoch: string;
    marker: DurableEvidence;
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

### `ContentPage`

```ts
type ContentPage = Readonly<{
    result: ToolResultVersion;
    attachment: Attachment;
    offset: string;
    bytes: Uint8Array;
    next: string | null;
}>;
```

### `ControlDispatch`

```ts
type ControlDispatch = ProtocolIdentity & Readonly<{
    start: ToolStartRecord;
    intent: Extract<ToolControl, {
        kind: 'stop';
    }>;
    source: DurableEvidence;
}>;
```

### `ControlProgress`

```ts
type ControlProgress = Readonly<{
    kind: 'pending' | 'unknown';
    diagnostic: string;
}> | Readonly<{
    kind: 'accepted';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'stopped' | 'already-ended' | 'relation-changed';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'rejected';
    reason: string;
    evidence: DurableEvidence;
}>;
```

### `ControlReceipt`

```ts
type ControlReceipt = Readonly<{
    operation: ToolOperationId;
    state: ToolState;
    progress: ControlProgress;
}>;
```

### `ControlRecord`

```ts
type ControlRecord = Readonly<{
    operation: ToolOperationId;
    intent: ToolControl;
    source: DurableEvidence;
    progress: ControlProgress;
}>;
```

### `DecisionValue`

```ts
type DecisionValue = ToolDecision<JsonValue>;
```

### `DeliveryState`

```ts
type DeliveryState = Readonly<{
    kind: 'pending';
    delivery: ToolDeliveryId;
    consumer: ConsumerRef;
}> | Readonly<{
    kind: 'released';
    delivery: ToolDeliveryId;
    consumer: ConsumerRef;
    evidence: DurableEvidence;
}>;
```

### `DiagnosticPage`

```ts
type DiagnosticPage = Readonly<{
    entries: readonly Readonly<{
        operation: ToolOperationId;
        phase: string;
        code: string;
        evidence: DurableEvidence;
    }>[];
    next: string | null;
}>;
```

### `DrainState`

```ts
type DrainState = Readonly<{
    admission: 'open' | 'closed';
    inventory: DurableEvidence;
    active: readonly ToolCallId[];
    tasks: readonly ToolTask[];
    untransferred: readonly DurableEvidence[];
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

### `Effect`

```ts
type Effect = Readonly<{
    kind: 'not-started';
}> | Readonly<{
    kind: 'not-occurred';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'occurred';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'unknown';
    diagnostic: string;
}>;
```

### `ExternalOperationResolution`

```ts
type ExternalOperationResolution = Readonly<{
    kind: 'committed';
    operation: ToolOperationId;
    receipt: DurableEvidence;
}> | Readonly<{
    kind: 'excluded';
    operation: ToolOperationId;
    exclusion: DurableEvidence;
}> | Readonly<{
    kind: 'pending' | 'unknown';
    operation: ToolOperationId;
    diagnostic: string;
}>;
```

### `ExternalResponse`

```ts
type ExternalResponse = Readonly<{
    kind: 'decision';
    value: DecisionValue;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'resource';
    value: JsonValue;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'expired';
    source: DurableEvidence;
}>;
```

### `FactBatch`

```ts
type FactBatch<B extends ContentBlock> = Readonly<{
    start: ToolStartRecord;
    source: DurableEvidence;
    batch: string;
    after: string | null;
    cursor: string;
    events: readonly Readonly<{
        event: string;
        fact: ToolExecutionFact<B>;
    }>[];
}>;
```

### `FactProgress`

```ts
type FactProgress = Readonly<{
    start: ToolStartRecord;
    source: DurableEvidence;
    cursor: string | null;
    pendingAcknowledgements: readonly FactReceipt[];
}>;
```

### `FactReceipt`

```ts
type FactReceipt = Readonly<{
    start: ToolOperationId;
    batch: string;
    cursor: string;
    custody: DurableEvidence;
}>;
```

### `FixedToolRequest`

```ts
type FixedToolRequest = Readonly<{
    availability: ToolAvailability;
    invocation: ToolInvocation;
    command: string | null;
    arguments: ToolArguments;
    settings: Adoption;
    context: Adoption;
    workspace: Adoption | null;
    environment: Adoption;
    resources: readonly Adoption[];
    scope: ResourceScope;
    consumer: ConsumerRef;
    batchDecision: DurableEvidence | null;
    mode: 'foreground' | 'background';
    limits: Readonly<{
        concurrency: number | null;
        foregroundMs: number | null;
        backgroundAfterMs: number | null;
    }>;
}>;
```

### `ForegroundReturn`

```ts
type ForegroundReturn = Readonly<{
    kind: 'final';
    result: ToolResultVersion;
}> | Readonly<{
    kind: 'background';
    call: ToolCallId;
    source: BackgroundSource;
}>;
```

### `Handoff`

```ts
type Handoff = Readonly<{
    kind: 'retained';
    custody: DurableEvidence;
}> | Readonly<{
    kind: 'processed';
    completion: DurableEvidence;
}>;
```

### `IndependentToolScopeInput`

```ts
type IndependentToolScopeInput = Readonly<{
    limits: ToolAuthorLimits;
    signal: AbortSignal;
    process: ToolProcessReceiver | null;
    waits: ToolWaiter | null;
}>;
```

### `InterruptionCause`

```ts
type InterruptionCause = Readonly<{
    kind: 'control';
    operation: ToolOperationId;
    withdrawn: boolean;
}> | Readonly<{
    kind: 'foreground-limit';
}> | Readonly<{
    kind: 'resume-rejected';
    exclusion: DurableEvidence;
}>;
```

### `InvocationAccess`

```ts
type InvocationAccess<P> = Access<P> & Readonly<{
    reference: ToolInvocationRef;
}>;
```

### `Mutation`

```ts
type Mutation<P> = CallAccess<P> & Readonly<{
    operation: ToolOperationId;
}>;
```

### `OperationResolution`

```ts
type OperationResolution = Readonly<{
    kind: 'committed';
    revision: ToolRevision;
    receipt: DurableEvidence;
}> | Readonly<{
    kind: 'rolled-back' | 'not-committed';
}> | Readonly<{
    kind: 'unknown';
}>;
```

### `OutputCodec`

```ts
interface OutputCodec<R> {
    readonly adoption: Adoption;
    encode(value: unknown): Outcome<Uint8Array, Readonly<{
        reason: string;
    }>>;
    decode(bytes: Uint8Array): Outcome<R, Readonly<{
        reason: string;
    }>>;
}
```

### `ParameterCodec`

```ts
interface ParameterCodec<A> {
    readonly adoption: Adoption;
    parse(input: ToolArguments): Outcome<A, Readonly<{
        kind: 'incomplete' | 'invalid';
        reason: string;
    }>>;
}
```

### `ParameterContract`

```ts
type ParameterContract = Readonly<{
    schema: JsonValue;
    vocabulary: Adoption;
    descriptions: readonly Readonly<{
        path: string;
        text: string;
    }>[];
}>;
```

### `ParsedToolArguments`

```ts
type ParsedToolArguments = Readonly<{
    original: JsonValue;
    effective: JsonValue;
}>;
```

### `PhysicalExecution`

```ts
type PhysicalExecution = Readonly<{
    kind: 'not-started';
}> | Readonly<{
    kind: 'starting' | 'live' | 'unknown';
    start: ToolOperationId;
}> | Readonly<{
    kind: 'suspended';
    checkpoint: DurableEvidence;
}> | Readonly<{
    kind: 'ended' | 'lost';
    evidence: DurableEvidence;
}>;
```

### `PreparationProgress`

```ts
type PreparationProgress<E> = Readonly<{
    kind: 'prepared';
    environment: PreparedEnvironment<E>;
}> | Readonly<{
    kind: 'excluded';
    exclusion: DurableEvidence;
}> | Readonly<{
    kind: 'rejected';
    reason: string;
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'pending' | 'unknown';
    diagnostic: string;
}>;
```

### `PreparationRecord`

```ts
type PreparationRecord = ProtocolIdentity & Readonly<{
    purpose: 'initial' | 'resume';
    request: FixedToolRequest;
}>;
```

### `PreparedEnvironment`

```ts
interface PreparedEnvironment<E> {
    readonly value: E;
    readonly evidence: DurableEvidence;
    readonly preparation: PreparationRecord;
}
```

### `ProcessBlock`

```ts
type ProcessBlock = Readonly<{
    index: string;
    mode: 'append' | 'replace';
    state: 'open' | 'closed';
    sequence: string;
    content: ContentBlock;
    trim: Readonly<{
        removed: string;
        reason: string;
    }> | null;
}>;
```

### `ProcessSnapshot`

```ts
type ProcessSnapshot = Readonly<{
    cursor: ToolCursor;
    state: ToolState;
    blocks: readonly ProcessBlock[];
}>;
```

### `ProgramClosure`

```ts
type ProgramClosure = Readonly<{
    operation: ToolOperationId;
    end: ProgramEnd;
    pending: readonly ToolCallId[];
}> & (Readonly<{
    kind: 'closing';
    barrier: null;
}> | Readonly<{
    kind: 'closed';
    barrier: DurableEvidence;
}>);
```

### `ProgramEnd`

```ts
type ProgramEnd = Readonly<{
    kind: 'returned';
    output: RawOutput;
}> | Readonly<{
    kind: 'stopped';
    cause: InterruptionCause;
}> | Readonly<{
    kind: 'failed';
    cause: 'exception' | 'resource-limit' | 'continuity-lost';
    evidence: DurableEvidence;
}>;
```

### `ProgramScheduling`

```ts
type ProgramScheduling = Readonly<{
    execution: ToolExecutionRef;
    source: DurableEvidence;
    sequence: string;
    marker: DurableEvidence;
}> & (Readonly<{
    kind: 'runnable';
}> | Readonly<{
    kind: 'blocked';
    children: readonly ToolCallId[];
}> | Readonly<{
    kind: 'unknown';
    diagnostic: string;
}>);
```

### `ProgramToolResult`

```ts
type ProgramToolResult<B extends ContentBlock> = Readonly<{
    child: ToolCallId;
    result: ToolResultVersion;
    terminal: ToolTerminal;
    effect: Effect;
    value: ToolResult<B>;
}>;
```

### `ProgramTools`

```ts
interface ProgramTools<B extends ContentBlock> {
    call(input: Readonly<{
        name: string;
        command: string | null;
        arguments: JsonValue;
    }>): Reply<ProgramToolResult<B>>;
    read(input: Readonly<{
        child: ToolCallId;
        result: ToolResultVersion;
        after: string | null;
    }>): Reply<ResultPage<B>>;
    attachment(input: Readonly<{
        child: ToolCallId;
        result: ToolResultVersion;
        attachment: Attachment;
        after: string | null;
        maxBytes: number;
    }>): Reply<ContentPage>;
}
```

### `ProtocolIdentity`

```ts
type ProtocolIdentity = Readonly<{
    tenant: TenantId;
    call: ToolCallId;
    operation: ToolOperationId;
    adoption: Adoption;
    inputDigest: string;
}>;
```

### `QueuePosition`

```ts
type QueuePosition = Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'waiting' | 'held';
    key: string;
    ordinal: string;
}> | Readonly<{
    kind: 'released';
    key: string;
    ordinal: string;
    evidence: DurableEvidence;
}>;
```

### `RawOutput`

```ts
type RawOutput = Readonly<{
    codec: Adoption;
    content: Attachment;
    custody: DurableEvidence;
}>;
```

### `ReleaseProgress`

```ts
type ReleaseProgress = Readonly<{
    kind: 'released';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'pending' | 'unknown' | 'rejected';
    diagnostic: string;
}>;
```

### `ReleaseRecord`

```ts
type ReleaseRecord = ProtocolIdentity & Readonly<{
    preparation: ToolOperationId;
    resource: DurableEvidence;
    custody: DurableEvidence;
}>;
```

### `ReleasedDelivery`

```ts
type ReleasedDelivery = Extract<DeliveryState, {
    kind: 'released';
}>;
```

### `Reply`

```ts
type Reply<T> = Promise<Outcome<T, ToolFailure>>;
```

### `ResourceScope`

```ts
type ResourceScope = Readonly<{
    owner: string;
    key: string;
    grant: DurableEvidence;
}>;
```

### `ResponseProgress`

```ts
type ResponseProgress = Readonly<{
    kind: 'accepted';
    receipt: DurableEvidence;
}> | Readonly<{
    kind: 'continued';
    receipt: DurableEvidence;
    timing: DurableEvidence;
}> | Readonly<{
    kind: 'not-accepted';
    exclusion: DurableEvidence;
}> | Readonly<{
    kind: 'unknown' | 'rejected';
    diagnostic: string;
}>;
```

### `ResponseRecord`

```ts
type ResponseRecord = ProtocolIdentity & Readonly<{
    start: ToolStartRecord;
    wait: ToolWaitId;
    response: ExternalResponse;
}>;
```

### `ResultPage`

```ts
type ResultPage<B extends ContentBlock> = Readonly<{
    result: ToolResultVersion;
    terminal: ToolTerminal;
    effect: Effect;
    actualTerminal: ToolTerminal | null;
    relation: 'original' | 'late';
    delivery: ToolDeliveryId;
    source: DurableEvidence;
    value: ToolResult<B>;
    next: string | null;
}>;
```

### `ResultPolicy`

```ts
interface ResultPolicy<B extends ContentBlock> {
    readonly adoption: Adoption;
    judge(value: ContentBlock): Outcome<B, Readonly<{
        reason: string;
    }>>;
    judgeResult(value: ToolResult<ContentBlock>): Outcome<ToolResult<B>, Readonly<{
        reason: string;
    }>>;
}
```

### `StartGuard`

```ts
type StartGuard = Readonly<{
    owner: string;
    resource: string;
    revision: string;
    evidence: DurableEvidence;
    scope: Readonly<{
        kind: 'resource';
    }> | (Readonly<{
        kind: 'program';
        parent: ToolCallId;
    }> & (Readonly<{
        gate: 'open';
    }> | Readonly<{
        gate: 'closing' | 'closed';
        closure: ToolOperationId;
        applies: 'all-children' | 'foreground-and-unadmitted';
        cutoff: DurableEvidence;
    }>));
}>;
```

### `StartPermit`

```ts
type StartPermit = ProtocolIdentity & Readonly<{
    start: ToolStartRecord;
    guards: readonly StartGuard[];
    request: DurableEvidence;
}>;
```

### `StartProgress`

```ts
type StartProgress = Readonly<{
    kind: 'started';
    acceptance: DurableEvidence;
}> | Readonly<{
    kind: 'unknown';
    diagnostic: string;
}> | Readonly<{
    kind: 'not-started';
    exclusion: DurableEvidence;
}> | Readonly<{
    kind: 'rejected';
    reason: string;
    exclusion: DurableEvidence;
}>;
```

### `SuspensionProgress`

```ts
type SuspensionProgress = Readonly<{
    kind: 'suspended';
    checkpoint: Checkpoint;
}> | Readonly<{
    kind: 'not-suspended';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'unknown' | 'rejected';
    diagnostic: string;
}>;
```

### `SuspensionRecord`

```ts
type SuspensionRecord = ProtocolIdentity & Readonly<{
    start: ToolStartRecord;
    schema: Adoption;
}>;
```

### `TOOL_IDENTITY_MAX_LENGTH`

```ts
const TOOL_IDENTITY_MAX_LENGTH = 256;
```

### `TOOL_REFERENCE_MAX_LENGTH`

```ts
const TOOL_REFERENCE_MAX_LENGTH = 1668;
```

### `TaskResolution`

```ts
type TaskResolution = Readonly<{
    kind: 'done';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'blocked';
    reason: string;
}>;
```

### `TextRenderer`

```ts
interface TextRenderer<R> {
    render(value: R): Outcome<string, Readonly<{
        reason: string;
    }>>;
}
```

### `TextResultFactory`

```ts
interface TextResultFactory<B extends ContentBlock> {
    text(value: string): Outcome<ToolResult<B>, Readonly<{
        reason: string;
    }>>;
}
```

### `ToolAccounts`

```ts
interface ToolAccounts<P> {
    list(input: Readonly<{
        principal: P;
        scope: AccountScope;
        after: string | null;
        limit: number;
    }>): Reply<Readonly<{
        entries: readonly Readonly<{
            tenant: TenantId;
            call: ToolCallId;
            start: ToolOperationId | null;
            source: DurableEvidence;
            account: CallAccount;
        }>[];
        next: string | null;
    }>>;
}
```

### `ToolArguments`

```ts
type ToolArguments = Readonly<{
    original: string;
    effective: string;
    complete: boolean;
}>;
```

### `ToolArgumentsRejection`

```ts
type ToolArgumentsRejection = Readonly<{
    kind: 'shape';
    field: string;
    reason: string;
}> | Readonly<{
    kind: 'incomplete';
}> | Readonly<{
    kind: 'invalid';
    field: 'original' | 'effective';
    reason: string;
}>;
```

### `ToolAskRequest`

```ts
type ToolAskRequest<A = JsonValue> = Readonly<{
    kind: 'ask';
    key: string;
    contract: ToolWaitContract<A, 'ask'>;
    request: JsonValue;
}>;
```

### `ToolAuthor`

```ts
type ToolAuthor<A, R, E, B extends ContentBlock> = Readonly<{
    parameters: ParameterCodec<A>;
    waits: readonly ToolWaitContract<unknown, 'ask' | 'resource'>[];
}> & (Readonly<{
    kind: 'ordinary';
    executor: ToolExecutor<A, R, E>;
    codec: OutputCodec<R>;
    output: ToolReturnValidator<A, R>;
    renderer: TextRenderer<R>;
    program: ToolProgramOutput<R>;
}> | Readonly<{
    kind: 'structured';
    executor: ToolExecutor<A, ToolResult<B>, E>;
    codec: OutputCodec<ToolResult<B>>;
    output: ToolReturnValidator<A, ToolResult<B>>;
    program: ToolProgramContract;
}>);
```

### `ToolAuthorLimits`

```ts
type ToolAuthorLimits = Readonly<{
    authorBufferBytes: number;
    authorBufferItems: number;
    authorWaitHistoryBytes: number;
    authorWaitHistoryItems: number;
}>;
```

### `ToolAuthorRegistration`

```ts
type ToolAuthorRegistration<E, B extends ContentBlock> = Readonly<{
    definition: ToolDefinition;
    [toolAuthorRegistration]: Readonly<{
        environment: (value: E) => E;
        block: (value: B) => B;
    }>;
}>;
```

### `ToolAvailability`

```ts
type ToolAvailability = Readonly<{
    kind: 'available';
    definition: ToolDefinition;
    executor: Adoption;
}> | Readonly<{
    kind: 'known-unavailable';
    definition: ToolDefinition;
    reason: string;
}>;
```

### `ToolBindingRegistry`

```ts
interface ToolBindingRegistry<P, E, B extends ContentBlock> {
    register(input: Access<P> & Readonly<{
        loaded: ToolLoadedRegistration<E, B>;
        authority: DurableEvidence;
    }>): Reply<Readonly<{
        contribution: string;
        release(): Promise<Readonly<{
            removed: boolean;
        }>>;
    }>>;
}
```

### `ToolBindings`

```ts
interface ToolBindings<P, B extends ContentBlock, E> {
    inspect(input: ToolInspection<P>): Reply<ToolAvailability>;
    resolve(input: CallAccess<P> & Readonly<{
        request: FixedToolRequest;
    }>): Reply<ToolExecutorBinding<P, B, E>>;
    recover(input: CallAccess<P> & Readonly<{
        start: ToolStartRecord;
    }>): Reply<ToolRecoveryBinding<B>>;
}
```

### `ToolCallId`

```ts
type ToolCallId = ToolIdentity<'ToolCallId'>;
```

### `ToolCatalog`

```ts
interface ToolCatalog<P> {
    inspect(input: ToolInspection<P>): Reply<ToolAvailability>;
    usage(input: ToolInspection<P> & Readonly<{
        adoption: Adoption;
    }>): Reply<ToolUsage>;
    search(input: Access<P> & Readonly<{
        query: string;
        consumer: ToolConsumerProfile;
        invocation: ToolInvocation['kind'];
        after: string | null;
        limit: number;
    }>): Reply<Readonly<{
        entries: readonly ToolAvailability[];
        next: string | null;
    }>>;
}
```

### `ToolChildren`

```ts
interface ToolChildren<P> {
    reserve(input: Mutation<P> & Readonly<{
        execution: ToolExecutionRef;
        position: ChildPosition;
        request: FixedToolRequest;
    }>): Reply<ChildReservation>;
    admitted(input: Mutation<P> & Readonly<{
        reservation: ChildReservation;
        outcome: ToolLookup;
    }>): Reply<ChildState>;
    retain(input: Mutation<P> & Readonly<{
        child: ToolCallId;
        result: ToolResultVersion;
        delivery: ToolDeliveryId;
        custody: DurableEvidence;
        release: DurableEvidence;
    }>): Reply<ChildState>;
    list(input: CallAccess<P> & Readonly<{
        after: string | null;
        limit: number;
    }>): Reply<Readonly<{
        children: readonly ChildState[];
        next: string | null;
    }>>;
    close(input: Mutation<P> & Readonly<{
        end: ProgramEnd;
    }>): Reply<ProgramClosure>;
    closure(input: CallAccess<P>): Reply<ProgramClosure | null>;
    confirmBarrier(input: Mutation<P> & Readonly<{
        close: ToolOperationId;
        evidence: DurableEvidence;
    }>): Reply<ProgramClosure>;
    finish(input: Mutation<P> & Readonly<{
        output: RawOutput;
    }>): Reply<DurableEvidence>;
}
```

### `ToolClock`

```ts
interface ToolClock {
    now(): string;
    begin(input: Readonly<{
        operation: ToolOperationId;
        execution: ToolExecutionRef;
    }>): Reply<ClockSegment>;
    elapsed(evidence: DurableEvidence): Reply<Readonly<{
        milliseconds: string;
        evidence: DurableEvidence;
    }>>;
    waitUntil(instant: string, signal: AbortSignal): Promise<'elapsed' | 'cancelled'>;
}
```

### `ToolCommandOutcome`

```ts
type ToolCommandOutcome<T> = Readonly<{
    kind: 'committed';
    operation: ToolOperationRef;
    receipt: T;
}> | Readonly<{
    kind: 'commit-unknown';
    operation: ToolOperationRef;
}> | Readonly<{
    kind: 'rejected';
    failure: ToolDefiniteFailure;
}>;
```

### `ToolCommands`

```ts
interface ToolCommands<P, B extends ContentBlock> {
    admit(input: Mutation<P> & Readonly<{
        request: FixedToolRequest;
    }>): Reply<ToolState>;
    control(input: Mutation<P> & Readonly<{
        intent: ToolControl;
    }>): Reply<ControlReceipt>;
    acceptDecision(input: Mutation<P> & Readonly<{
        wait: ToolWaitId;
        decision: DurableEvidence;
    }>): Reply<WaitState>;
    acceptResource(input: Mutation<P> & Readonly<{
        wait: ToolWaitId;
        response: DurableEvidence;
    }>): Reply<WaitRecord>;
    releaseDelivery(input: Mutation<P> & Readonly<{
        result: ToolResultVersion;
        delivery: ToolDeliveryId;
        consumer: ConsumerRef;
        evidence: Handoff;
    }>): Reply<ReleasedDelivery>;
    scanPending(input: Access<P> & Readonly<{
        after: string | null;
        limit: number;
    }>): Reply<Readonly<{
        calls: readonly ToolCallId[];
        next: string | null;
    }>>;
    loadRecovery(input: CallAccess<P>): Reply<ToolRecovery<B>>;
    claim(input: Mutation<P> & Readonly<{
        instance: ToolInstanceId;
        continuity: DurableEvidence;
    }>): Reply<ToolExecutionRef>;
    planPreparation(input: WriteContext & Readonly<{
        request: FixedToolRequest;
        purpose: 'initial' | 'resume';
    }>): Reply<PreparationRecord>;
    prepared(input: WriteContext & Readonly<{
        preparation: PreparationRecord;
        resources: DurableEvidence;
    }>): Reply<ToolState>;
    enqueue(input: WriteContext): Reply<ToolState>;
    prepareStart(input: WriteContext): Reply<Readonly<{
        state: ToolState;
        start: Extract<ToolStartRecord, {
            kind: 'start';
        }>;
    }>>;
    prepareResume(input: WriteContext & Readonly<{
        checkpoint: DurableEvidence;
    }>): Reply<Readonly<{
        state: ToolState;
        start: Extract<ToolStartRecord, {
            kind: 'resume';
        }>;
    }>>;
    rejectPending(input: WriteContext & Readonly<{
        reason: string;
        exclusion: DurableEvidence;
    }>): Reply<ToolState>;
    recordStart(input: WriteContext & Readonly<{
        invocation: ToolStartRecord;
        outcome: StartProgress;
    }>): Reply<ToolState>;
    preserveProcess(input: WriteContext & Readonly<{
        blocks: readonly ProcessBlock[];
    }>): Reply<ToolCursor>;
    openWait(input: WriteContext & Readonly<{
        wait: WaitIntent;
    }>): Reply<WaitRecord>;
    attachRegistration(input: WriteContext & Readonly<{
        wait: ToolWaitId;
        registration: DurableEvidence;
    }>): Reply<WaitRecord>;
    attachResource(input: WriteContext & Readonly<{
        wait: ToolWaitId;
        registration: DurableEvidence;
    }>): Reply<WaitRecord>;
    planSuspension(input: WriteContext & Readonly<{
        start: ToolStartRecord;
        schema: Adoption;
    }>): Reply<SuspensionRecord>;
    suspend(input: WriteContext & Readonly<{
        suspension: SuspensionRecord;
        checkpoint: Checkpoint;
    }>): Reply<ToolState>;
    preserveResult(input: WriteContext & Readonly<{
        raw: RawOutput;
        value: ToolResult<B>;
        terminal: ToolTerminal;
        effect: Effect;
    }>): Reply<ToolState>;
    recordResponse(input: WriteContext & Readonly<{
        response: ResponseRecord;
        outcome: ResponseProgress;
    }>): Reply<WaitRecord>;
    closeWait(input: WriteContext & Readonly<{
        wait: ToolWaitId;
        continuation: DurableEvidence;
    }>): Reply<ToolState>;
    recordControl(input: Mutation<P> & Readonly<{
        control: ToolOperationId;
        source: DurableEvidence;
        progress: ControlProgress;
    }>): Reply<ControlRecord>;
    receiveFacts(input: CallAccess<P> & Readonly<{
        start: ToolStartRecord;
        batch: FactBatch<B>;
    }>): Reply<FactReceipt>;
    recordFactAcknowledgement(input: Mutation<P> & Readonly<{
        receipt: FactReceipt;
        sourceReceipt: DurableEvidence;
    }>): Reply<FactProgress>;
    recordScheduling(input: WriteContext & Readonly<{
        scheduling: ProgramScheduling;
    }>): Reply<ToolState>;
    recordAccount(input: Mutation<P> & Readonly<{
        start: ToolStartRecord | null;
        source: DurableEvidence;
        event: string;
        value: CallAccount;
    }>): Reply<DurableEvidence>;
    planRelease(input: Mutation<P> & Readonly<{
        preparation: PreparationRecord;
        custody: DurableEvidence;
    }>): Reply<ReleaseRecord>;
    recordRelease(input: Mutation<P> & Readonly<{
        release: ReleaseRecord;
        outcome: ReleaseProgress;
    }>): Reply<DurableEvidence>;
    recordLateFact(input: Mutation<P> & Readonly<{
        source: DurableEvidence;
        event: string;
        fact: Readonly<{
            kind: 'account';
            value: CallAccount;
        }> | Readonly<{
            kind: 'effect';
            value: Effect;
        }>;
    }>): Reply<ToolRevision>;
    recordLateResult(input: Mutation<P> & Readonly<{
        start: ToolStartRecord;
        source: DurableEvidence;
        event: string;
        raw: RawOutput;
        value: ToolResult<B>;
        actual: ToolTerminal;
        effect: Effect;
    }>): Reply<Readonly<{
        result: ToolResultVersion;
        delivery: DeliveryState;
    }>>;
    settleLost(input: Mutation<P> & Readonly<{
        continuity: DurableEvidence;
    }>): Reply<ToolState>;
    recordTask(input: Mutation<P> & Readonly<{
        task: ToolTask;
        resolution: TaskResolution;
    }>): Reply<DurableEvidence>;
}
```

### `ToolConsumerProfile`

```ts
type ToolConsumerProfile = Readonly<{
    capabilities: DurableEvidence;
    conversion: Adoption | null;
    attachmentAccess: DurableEvidence;
}>;
```

### `ToolContentReader`

```ts
interface ToolContentReader<P> {
    read(input: CallAccess<P> & Readonly<{
        result: ToolResultVersion;
        attachment: Attachment;
        after: string | null;
        maxBytes: number;
    }>): Reply<ContentPage>;
    raw(input: CallAccess<P> & Readonly<{
        result: ToolResultVersion;
    }>): Reply<RawOutput>;
}
```

### `ToolControl`

```ts
type ToolControl = Readonly<{
    kind: 'stop';
}> | Readonly<{
    kind: 'withdraw';
    reach: 'all' | 'foreground-and-unadmitted';
}> | Readonly<{
    kind: 'background';
}>;
```

### `ToolCursor`

```ts
type ToolCursor = ToolIdentity<'ToolCursor'>;
```

### `ToolDecision`

```ts
type ToolDecision<A> = Readonly<{
    kind: 'answer';
    value: A;
}> | Readonly<{
    kind: 'no-answer';
}> | Readonly<{
    kind: 'declined';
}>;
```

### `ToolDecisionBridge`

```ts
interface ToolDecisionBridge<P> {
    inspectOperation(input: Mutation<P>): Reply<ExternalOperationResolution>;
    ensure(input: Mutation<P> & Readonly<{
        wait: ToolWaitId;
        request: DurableEvidence;
    }>): Reply<DurableEvidence>;
    inspect(input: CallAccess<P> & Readonly<{
        wait: ToolWaitId;
    }>): Reply<Readonly<{
        registration: DurableEvidence;
        decision: DurableEvidence | null;
    }>>;
    invalidate(input: Mutation<P> & Readonly<{
        wait: ToolWaitId;
        terminal: DurableEvidence;
    }>): Reply<DurableEvidence>;
    resolve(input: CallAccess<P> & Readonly<{
        wait: ToolWaitId;
        decision: DurableEvidence;
    }>): Reply<DecisionValue>;
}
```

### `ToolDeclarations`

```ts
type ToolDeclarations = Readonly<{
    adoption: Adoption;
    environment: Adoption | null;
    attachments: readonly Readonly<{
        store: string;
        mediaTypes: readonly string[];
    }>[];
    inputModalities: readonly Modality[];
    outputModalities: readonly Modality[];
    settings: ToolSettingsDeclaration | null;
}>;
```

### `ToolDefiniteFailure`

```ts
type ToolDefiniteFailure = Exclude<ToolFailure, {
    kind: 'commit-unknown';
}>;
```

### `ToolDefinition`

```ts
type ToolDefinition = ToolDefinitionMetadata & (Readonly<{
    kind: 'function';
    parameters: ParameterContract;
    returns: ToolReturnDeclaration;
}> | Readonly<{
    kind: 'commands';
    commands: readonly Readonly<{
        name: string;
        summary: string;
        parameters: Readonly<{
            kind: 'declared';
            value: ParameterContract;
        }> | Readonly<{
            kind: 'executor-owned';
        }>;
        returns: ToolReturnDeclaration;
    }>[];
}>);
```

### `ToolDefinitionMetadata`

```ts
type ToolDefinitionMetadata = Readonly<{
    adoption: Adoption;
    name: string;
    description: string;
    requiredCapabilities: readonly string[];
    backgroundAllowed: boolean;
    programmable?: boolean;
    declarations: ToolDeclarations;
}>;
```

### `ToolDeliveryId`

```ts
type ToolDeliveryId = ToolIdentity<'ToolDeliveryId'>;
```

### `ToolDirectory`

```ts
interface ToolDirectory<P> {
    connect(input: CallAccess<P>): Reply<Readonly<{
        kind: 'live';
        handle: ToolHandle<P>;
    }> | Readonly<{
        kind: 'no-live-route';
    }>>;
}
```

### `ToolDriver`

```ts
interface ToolDriver<P> {
    run(input: CallAccess<P> & Readonly<{
        instance: ToolInstanceId;
        signal: AbortSignal;
    }>): Promise<void>;
}
```

### `ToolEmitReceipt`

```ts
type ToolEmitReceipt = Readonly<{
    sequence: string;
}> & (Readonly<{
    kind: 'local';
}> | Readonly<{
    kind: 'retained';
    evidence: DurableEvidence;
}>);
```

### `ToolEnvironment`

```ts
interface ToolEnvironment<P, E> {
    prepare(input: CallAccess<P> & Readonly<{
        preparation: PreparationRecord;
    }>): Reply<PreparationProgress<E>>;
    inspectPreparation(input: CallAccess<P> & Readonly<{
        preparation: PreparationRecord;
    }>): Reply<PreparationProgress<E>>;
    release(input: CallAccess<P> & Readonly<{
        release: ReleaseRecord;
    }>): Reply<ReleaseProgress>;
    inspectRelease(input: CallAccess<P> & Readonly<{
        release: ReleaseRecord;
    }>): Reply<ReleaseProgress>;
}
```

### `ToolExecutionContext`

```ts
interface ToolExecutionContext extends ToolProcessEmitter, ToolWaiter {
    readonly mode: 'independent' | 'managed';
    readonly signal: AbortSignal;
}
```

### `ToolExecutionFact`

```ts
type ToolExecutionFact<B extends ContentBlock> = Readonly<{
    kind: 'process';
    blocks: readonly ProcessBlock[];
}> | Readonly<{
    kind: 'wait';
    value: WaitIntent;
}> | Readonly<{
    kind: 'continued';
    wait: ToolWaitId;
    response: ToolOperationId;
    timing: DurableEvidence;
}> | Readonly<{
    kind: 'program-scheduling';
    value: ProgramScheduling;
}> | Readonly<{
    kind: 'account';
    event: string;
    value: CallAccount;
}> | Readonly<{
    kind: 'final';
    raw: RawOutput;
    result: ToolResult<B>;
    terminal: ToolTerminal;
    effect: Effect;
}>;
```

### `ToolExecutionRef`

```ts
type ToolExecutionRef = Readonly<{
    tenant: TenantId;
    call: ToolCallId;
    instance: ToolInstanceId;
    generation: string;
}>;
```

### `ToolExecutionScope`

```ts
interface ToolExecutionScope {
    readonly context: ToolExecutionContext;
    readonly limits: ToolAuthorLimits;
    finish(exit: 'returned' | 'failed'): Promise<Outcome<void, ToolPrimitiveFailure>>;
}
```

### `ToolExecutor`

```ts
interface ToolExecutor<A, R, E> {
    execute(argumentsValue: A, environment: E, execution: ToolExecutionContext): Promise<R>;
}
```

### `ToolExecutorBinding`

```ts
type ToolExecutorBinding<P, B extends ContentBlock, E> = Readonly<{
    kind: 'live-only';
    start(input: CallAccess<P> & Readonly<{
        start: Extract<ToolStartRecord, {
            kind: 'start';
        }>;
        permit: StartPermit;
        request: FixedToolRequest;
    }>, environment: E): Reply<ToolLiveExecution<B>>;
    inspectStart(input: CallAccess<P> & Readonly<{
        start: ToolStartRecord;
    }>): Reply<ToolStartLookup<B>>;
}> | Readonly<{
    kind: 'checkpointed';
    checkpointSchema: Adoption;
    start(input: CallAccess<P> & Readonly<{
        start: Extract<ToolStartRecord, {
            kind: 'start';
        }>;
        permit: StartPermit;
        request: FixedToolRequest;
    }>, environment: E): Reply<ToolLiveExecution<B>>;
    inspectStart(input: CallAccess<P> & Readonly<{
        start: ToolStartRecord;
    }>): Reply<ToolStartLookup<B>>;
    suspend(input: SuspensionRecord): Reply<SuspensionProgress>;
    inspectSuspension(input: SuspensionRecord): Reply<SuspensionProgress>;
    resume(input: CallAccess<P> & Readonly<{
        start: Extract<ToolStartRecord, {
            kind: 'resume';
        }>;
        permit: StartPermit;
        request: FixedToolRequest;
    }>, environment: E): Reply<ToolLiveExecution<B>>;
}>;
```

### `ToolFailure`

```ts
type ToolFailure = Readonly<{
    kind: 'denied';
    action: string;
}> | Readonly<{
    kind: 'invalid';
    field: string;
    reason: string;
}> | Readonly<{
    kind: 'conflict';
    operation: ToolOperationId;
}> | Readonly<{
    kind: 'unavailable';
    dependency: string;
    diagnostic: string;
}> | Readonly<{
    kind: 'commit-unknown';
    operation: ToolOperationId;
}> | Readonly<{
    kind: 'not-settled';
}> | Readonly<{
    kind: 'stale-instance';
    instance: ToolInstanceId;
}> | Readonly<{
    kind: 'stale-revision';
    current: ToolRevision;
}> | Readonly<{
    kind: 'invalid-cursor';
    reason: string;
}> | Readonly<{
    kind: 'unsupported';
    adoption: Adoption;
    reason: string;
}>;
```

### `ToolHandle`

```ts
interface ToolHandle<P> {
    readonly instance: ToolInstanceId;
    observe(input: Access<P> & Readonly<{
        after: ToolCursor | null;
        signal: AbortSignal;
    }>): AsyncIterable<ToolObservation>;
}
```

### `ToolIdentity`

```ts
type ToolIdentity<K extends string> = string & {
    readonly [toolIdentity]: K;
};
```

### `ToolIdentityRejection`

```ts
type ToolIdentityRejection<K extends string> = Readonly<{
    field: K;
    reason: 'type' | 'empty' | 'length' | 'character';
}>;
```

### `ToolInspection`

```ts
type ToolInspection<P> = Access<P> & Readonly<{
    name: string;
    command: string | null;
    consumer: ToolConsumerProfile;
}>;
```

### `ToolInstanceHost`

```ts
interface ToolInstanceHost<P> {
    install(driver: ToolDriver<P>): Readonly<{
        release(): Promise<void>;
    }>;
    schedule(input: Readonly<{
        tenant: TenantId;
        call: ToolCallId;
    }>): Reply<Readonly<{
        queued: true;
    }>>;
    publish(input: ToolExecutionRef, handle: ToolHandle<P>): Reply<Readonly<{
        execution: ToolExecutionRef;
        registration: string;
    }>>;
    withdraw(input: Readonly<{
        execution: ToolExecutionRef;
        registration: string;
    }>): Reply<Readonly<{
        removed: boolean;
    }>>;
    readonly directory: ToolDirectory<P>;
}
```

### `ToolInstanceId`

```ts
type ToolInstanceId = ToolIdentity<'ToolInstanceId'>;
```

### `ToolInstanceIdentities`

```ts
interface ToolInstanceIdentities {
    newInstance(): Reply<ToolInstanceId>;
}
```

### `ToolInvocation`

```ts
type ToolInvocation = Readonly<{
    kind: 'direct' | 'programmatic';
    source: DurableEvidence;
}>;
```

### `ToolInvocationCommands`

```ts
interface ToolInvocationCommands<P> {
    control(input: InvocationAccess<P> & Readonly<{
        intent: ToolControl;
    }>): Promise<ToolCommandOutcome<ControlReceipt>>;
    releaseDelivery(input: InvocationAccess<P> & Readonly<{
        result: ToolResultVersion;
        delivery: ToolDeliveryId;
        consumer: ConsumerRef;
        evidence: Handoff;
    }>): Promise<ToolReleaseDeliveryOutcome>;
}
```

### `ToolInvocationContentReader`

```ts
interface ToolInvocationContentReader<P> {
    read(input: InvocationAccess<P> & Readonly<{
        result: ToolResultVersion;
        attachment: Attachment;
        after: string | null;
        maxBytes: number;
    }>): Reply<ContentPage>;
    raw(input: InvocationAccess<P> & Readonly<{
        result: ToolResultVersion;
    }>): Reply<RawOutput>;
}
```

### `ToolInvocationDirectory`

```ts
interface ToolInvocationDirectory<P> {
    connect(input: InvocationAccess<P>): ReturnType<ToolDirectory<P>['connect']>;
}
```

### `ToolInvocationParts`

```ts
type ToolInvocationParts = Readonly<{
    tenant: TenantId;
    call: ToolCallId;
    admission: ToolOperationId;
}>;
```

### `ToolInvocationQueries`

```ts
interface ToolInvocationQueries<P, B extends ContentBlock> {
    lookup(input: InvocationAccess<P>): Reply<ToolLookup>;
    queryOperation(input: Access<P> & Readonly<{
        operation: ToolOperationRef;
    }>): Reply<OperationResolution>;
    readProcess(input: InvocationAccess<P> & Readonly<{
        at: ToolCursor | null;
    }>): Reply<ProcessSnapshot>;
    readWait(input: InvocationAccess<P> & Readonly<{
        wait: ToolWaitId;
    }>): Reply<WaitRecord>;
    readDiagnostics(input: InvocationAccess<P> & Readonly<{
        after: string | null;
    }>): Reply<DiagnosticPage>;
    readResult(input: InvocationAccess<P> & Readonly<{
        result: ToolResultVersion;
        after: string | null;
    }>): Reply<ResultPage<B>>;
    account(input: InvocationAccess<P>): Reply<CallAccount>;
}
```

### `ToolInvocationRef`

```ts
type ToolInvocationRef = string & {
    readonly [toolInvocationRef]: true;
};
```

### `ToolInvocationSourceIssuer`

```ts
interface ToolInvocationSourceIssuer<P> {
    resolve(input: Access<P> & Readonly<{
        request: ToolInvokeRequest;
    }>): Promise<ToolInvocationSourceOutcome>;
}
```

### `ToolInvocationSourceOutcome`

```ts
type ToolInvocationSourceOutcome = Readonly<{
    kind: 'bound';
    call: ToolCallId;
    admission: ToolOperationId;
    invocation: ToolInvocation;
    recovered: boolean;
}> | Readonly<{
    kind: 'issuance-unknown';
    call: ToolCallId;
    admission: ToolOperationId;
}> | Readonly<{
    kind: 'association-unknown';
}> | Readonly<{
    kind: 'rejected';
    failure: ToolDefiniteFailure;
}>;
```

### `ToolInvokeOutcome`

```ts
type ToolInvokeOutcome = Readonly<{
    kind: 'accepted';
    reference: ToolInvocationRef;
    state: ToolState;
    recovered: boolean;
}> | Readonly<{
    kind: 'commit-unknown';
    reference: ToolInvocationRef;
}> | Readonly<{
    kind: 'association-unknown';
}> | Readonly<{
    kind: 'rejected';
    failure: ToolDefiniteFailure;
}>;
```

### `ToolInvokeRequest`

```ts
type ToolInvokeRequest = Omit<FixedToolRequest, 'invocation'>;
```

### `ToolLiveExecution`

```ts
interface ToolLiveExecution<B extends ContentBlock> {
    facts(input: Readonly<{
        after: string | null;
        signal: AbortSignal;
    }>): AsyncIterable<FactBatch<B>>;
    acknowledge(input: FactReceipt): Reply<DurableEvidence>;
    stop(input: ControlDispatch): Reply<ControlProgress>;
    inspectControl(input: ControlDispatch): Reply<ControlProgress>;
    answer(input: ResponseRecord): Reply<ResponseProgress>;
    inspectAnswer(input: ResponseRecord): Reply<ResponseProgress>;
}
```

### `ToolLoadedRegistration`

```ts
type ToolLoadedRegistration<E, B extends ContentBlock> = Readonly<{
    author: ToolAuthorRegistration<E, B>;
    executor: Adoption;
    settings: Adoption;
    source: DurableEvidence;
    [toolLoadedRegistration]: true;
}>;
```

### `ToolLoader`

```ts
interface ToolLoader<P, E, B extends ContentBlock> {
    load(input: Access<P> & Readonly<{
        definition: Adoption;
        executor: Adoption;
        settings: Adoption;
        source: DurableEvidence;
    }>): Reply<ToolLoadedRegistration<E, B>>;
}
```

### `ToolLookup`

```ts
type ToolLookup = Readonly<{
    kind: 'found';
    state: ToolState;
}> | Readonly<{
    kind: 'not-accepted';
    operation: ToolOperationId;
}>;
```

### `ToolMessageContentBlock`

```ts
type ToolMessageContentBlock = TextContentBlock | ReferenceContentBlock;
```

### `ToolObservation`

```ts
type ToolObservation = Readonly<{
    kind: 'snapshot';
    cursor: ToolCursor;
    state: ToolState;
    process: readonly ProcessBlock[];
    foreground: ForegroundReturn | null;
}> | Readonly<{
    kind: 'delta';
    from: ToolCursor;
    cursor: ToolCursor;
    state: ToolState;
    blocks: readonly ProcessBlock[];
}> | Readonly<{
    kind: 'gap';
    after: ToolCursor;
    reason: 'buffer' | 'history';
}> | Readonly<{
    kind: 'ended';
    reason: 'closed' | 'denied' | 'unavailable' | 'stale-instance';
}>;
```

### `ToolOffloader`

```ts
interface ToolOffloader<P, B extends ContentBlock> {
    offload(input: Mutation<P> & Readonly<{
        result: ToolResultVersion;
        maxBytes: number;
        headBytes: number;
        tailBytes: number;
    }>): Reply<Readonly<{
        source: DurableEvidence;
        value: ToolResult<B>;
        originalBytes: string;
    }>>;
}
```

### `ToolOperation`

```ts
type ToolOperation<E, B extends ContentBlock, P extends ToolOperationParameters = ToolOperationParameters> = Readonly<{
    parameters: P;
    returns: ToolReturnDeclaration;
    [toolOperation]: Readonly<{
        environment: (value: E) => E;
        block: (value: B) => B;
    }>;
}>;
```

### `ToolOperationId`

```ts
type ToolOperationId = ToolIdentity<'ToolOperationId'>;
```

### `ToolOperationIdentities`

```ts
interface ToolOperationIdentities {
    newOperation(): Reply<ToolOperationId>;
}
```

### `ToolOperationParameters`

```ts
type ToolOperationParameters = Readonly<{
    kind: 'declared';
    value: ParameterContract;
}> | Readonly<{
    kind: 'executor-owned';
    usage: string;
    protocol: Adoption;
}>;
```

### `ToolOperationParts`

```ts
type ToolOperationParts = ToolInvocationParts & Readonly<{
    operation: ToolOperationId;
}>;
```

### `ToolOperationRef`

```ts
type ToolOperationRef = string & {
    readonly [toolOperationRef]: true;
};
```

### `ToolOperationSpec`

```ts
type ToolOperationSpec<A, R, E, B extends ContentBlock, P extends ToolOperationParameters> = Readonly<{
    parameters: P;
}> & (Readonly<{
    returns: ToolReturnDeclaration & Readonly<{
        kind: 'ordinary';
    }>;
    author: Extract<ToolAuthor<A, R, E, B>, {
        kind: 'ordinary';
    }>;
}> | Readonly<{
    returns: ToolReturnDeclaration & Readonly<{
        kind: 'structured';
    }>;
    author: Extract<ToolAuthor<A, R, E, B>, {
        kind: 'structured';
    }>;
}>);
```

### `ToolOutputCustody`

```ts
interface ToolOutputCustody<P> {
    preserve(input: Mutation<P> & Readonly<{
        codec: Adoption;
        bytes: Uint8Array;
        source: DurableEvidence;
    }>): Reply<RawOutput>;
    inspect(input: Mutation<P>): Reply<Readonly<{
        kind: 'retained';
        raw: RawOutput;
    }> | Readonly<{
        kind: 'unknown';
    }> | Readonly<{
        kind: 'excluded';
        evidence: DurableEvidence;
    }>>;
    retainResult(input: Mutation<P> & Readonly<{
        raw: RawOutput;
        value: ToolResult<ContentBlock>;
    }>): Reply<DurableEvidence>;
}
```

### `ToolPresentation`

```ts
type ToolPresentation = Readonly<{
    name: string;
    description: string;
    programmable: boolean;
    commands: readonly Readonly<{
        name: string;
        summary: string;
    }>[];
}>;
```

### `ToolPrimitiveFailure`

```ts
type ToolPrimitiveFailure = Readonly<{
    reason: string;
}> & (Readonly<{
    kind: 'invalid' | 'unsupported' | 'capacity' | 'too-large' | 'busy' | 'conflict' | 'closed' | 'cancelled';
}> | Readonly<{
    kind: 'unavailable' | 'unknown';
    operation: string;
}>);
```

### `ToolProcessEmitter`

```ts
interface ToolProcessEmitter {
    emit(update: ToolProcessUpdate): Promise<Outcome<ToolEmitReceipt, ToolPrimitiveFailure>>;
}
```

### `ToolProcessReceiver`

```ts
interface ToolProcessReceiver {
    receive(input: Readonly<{
        sequence: string;
        update: ToolProcessUpdate;
    }>): Promise<Outcome<void, ToolPrimitiveFailure>>;
}
```

### `ToolProcessUpdate`

```ts
type ToolProcessUpdate = Readonly<{
    kind: 'append-text';
    index: string;
    text: string;
    close: boolean;
}> | Readonly<{
    kind: 'replace';
    index: string;
    content: ContentBlock;
    close: boolean;
}>;
```

### `ToolProgramContract`

```ts
type ToolProgramContract = Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'json';
    adoption: Adoption;
    schema: ToolValueSchema<unknown>;
}>;
```

### `ToolProgramDeclaration`

```ts
type ToolProgramDeclaration = Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'json';
    contract: Adoption;
    schema: ToolSchemaIdentity;
    definition: ParameterContract;
    maxBytes: number;
}>;
```

### `ToolProgramOutput`

```ts
type ToolProgramOutput<R> = Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'json';
    adoption: Adoption;
    schema: ToolValueSchema<unknown>;
    encode(value: R): Outcome<JsonValue, Readonly<{
        reason: string;
    }>>;
}>;
```

### `ToolProvider`

```ts
interface ToolProvider<P, B extends ContentBlock> {
    readonly runtime: ToolRuntime<P, B>;
    recover(input: Access<P>): Reply<Readonly<{
        scheduled: string;
    }>>;
    quiesce(): Reply<Readonly<{
        pending: string;
        running: string;
    }>>;
    inspectDrain(input: Access<P>): Reply<DrainState>;
    handover(input: Access<P> & Readonly<{
        operation: ToolOperationId;
        successor: DurableEvidence;
        inventory: DurableEvidence;
    }>): Reply<DurableEvidence>;
}
```

### `ToolReads`

```ts
interface ToolReads<P, B extends ContentBlock> {
    lookup(input: CallAccess<P> & Readonly<{
        admission: ToolOperationId;
    }>): Reply<ToolLookup>;
    operation(input: CallAccess<P> & Readonly<{
        operation: ToolOperationId;
    }>): Reply<OperationResolution>;
    result(input: CallAccess<P> & Readonly<{
        result: ToolResultVersion;
        after: string | null;
    }>): Reply<ResultPage<B>>;
    process(input: CallAccess<P> & Readonly<{
        at: ToolCursor | null;
    }>): Reply<ProcessSnapshot>;
    wait(input: CallAccess<P> & Readonly<{
        wait: ToolWaitId;
    }>): Reply<WaitRecord>;
    diagnostics(input: CallAccess<P> & Readonly<{
        after: string | null;
    }>): Reply<DiagnosticPage>;
    account(input: CallAccess<P>): Reply<CallAccount>;
    readonly content: ToolContentReader<P>;
}
```

### `ToolRecovery`

```ts
type ToolRecovery<B extends ContentBlock> = Readonly<{
    state: ToolState;
    request: FixedToolRequest;
    admission: ToolOperationId;
    initiator: Readonly<{
        owner: string;
        subject: string;
        revision: string;
    }>;
    execution: ToolExecutionRef | null;
    checkpoint: DurableEvidence | null;
    start: ToolStartRecord | null;
    startRejection: Readonly<{
        reason: string;
        exclusion: DurableEvidence;
    }> | null;
    invocations: readonly ToolStartRecord[];
    controls: readonly ControlRecord[];
    result: ToolResult<B> | null;
    unresolved: readonly ToolOperationId[];
    preparations: readonly PreparationRecord[];
    waits: readonly WaitRecord[];
    suspensions: readonly SuspensionRecord[];
    rawOutputs: readonly RawOutput[];
    tasks: readonly ToolTask[];
    program: ProgramClosure | null;
    scheduling: ProgramScheduling | null;
    streams: readonly FactProgress[];
}>;
```

### `ToolRecoveryBinding`

```ts
interface ToolRecoveryBinding<B extends ContentBlock> {
    acknowledge(input: FactReceipt): Reply<DurableEvidence>;
    inspectStart(start: ToolStartRecord): Reply<ToolStartLookup<B>>;
    inspectSuspension(input: SuspensionRecord): Reply<SuspensionProgress>;
    stop(input: ControlDispatch): Reply<ControlProgress>;
    inspectControl(input: ControlDispatch): Reply<ControlProgress>;
}
```

### `ToolReferenceFailure`

```ts
type ToolReferenceFailure = Readonly<{
    kind: 'malformed';
    rejection: ToolReferenceRejection;
}> | Readonly<{
    kind: 'foreign-tenant';
}>;
```

### `ToolReferenceRejection`

```ts
type ToolReferenceRejection = Readonly<{
    field: 'ToolInvocationRef' | 'ToolOperationRef';
    reason: 'type' | 'version' | 'shape' | 'length';
}>;
```

### `ToolRelation`

```ts
type ToolRelation = Readonly<{
    relation: 'foreground' | 'background';
}>;
```

### `ToolReleaseDeliveryOutcome`

```ts
type ToolReleaseDeliveryOutcome = Readonly<{
    kind: 'released';
    receipt: ReleasedDelivery;
}> | Readonly<{
    kind: 'commit-unknown';
    operation: ToolOperationRef;
}> | Readonly<{
    kind: 'rejected';
    failure: ToolDefiniteFailure;
}>;
```

### `ToolResourceReply`

```ts
type ToolResourceReply<A = JsonValue> = Readonly<{
    kind: 'response';
    value: A;
}> | Readonly<{
    kind: 'expired';
}>;
```

### `ToolResourceResponses`

```ts
interface ToolResourceResponses<P> {
    inspectOperation(input: Mutation<P>): Reply<ExternalOperationResolution>;
    ensure(input: Mutation<P> & Readonly<{
        wait: Extract<WaitIntent, {
            kind: 'resource';
        }>;
    }>): Reply<DurableEvidence>;
    inspect(input: CallAccess<P> & Readonly<{
        wait: ToolWaitId;
    }>): Reply<Readonly<{
        registration: DurableEvidence;
        response: DurableEvidence | null;
    }>>;
    expire(input: Mutation<P> & Readonly<{
        wait: Extract<WaitIntent, {
            kind: 'resource';
        }>;
        registration: DurableEvidence;
    }>): Reply<DurableEvidence>;
    invalidate(input: Mutation<P> & Readonly<{
        wait: ToolWaitId;
        terminal: DurableEvidence;
    }>): Reply<DurableEvidence>;
    resolve(input: CallAccess<P> & Readonly<{
        wait: WaitIntent;
        response: DurableEvidence;
    }>): Reply<Extract<ExternalResponse, {
        kind: 'resource' | 'expired';
    }>>;
}
```

### `ToolResourceWaitRequest`

```ts
type ToolResourceWaitRequest<A = JsonValue> = Readonly<{
    kind: 'resource';
    key: string;
    contract: ToolWaitContract<A, 'resource'>;
    request: JsonValue;
    deadline: string | null;
}>;
```

### `ToolResponseCandidate`

```ts
type ToolResponseCandidate = Readonly<{
    kind: 'answer' | 'resource';
    value: JsonValue;
}> | Readonly<{
    kind: 'no-answer' | 'declined';
}>;
```

### `ToolResult`

```ts
type ToolResult<B extends ContentBlock> = Readonly<{
    content: readonly B[];
    data: ToolResultData;
    original: Readonly<{
        kind: 'none';
    }> | Readonly<{
        kind: 'offloaded';
        source: Attachment;
        summary: readonly B[];
    }>;
    attachments: readonly Attachment[];
}>;
```

### `ToolResultData`

```ts
type ToolResultData = Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'json';
    contract: Adoption;
    schema: ToolSchemaIdentity;
    value: JsonValue;
}>;
```

### `ToolResultVersion`

```ts
type ToolResultVersion = ToolIdentity<'ToolResultVersion'>;
```

### `ToolReturnDeclaration`

```ts
type ToolReturnDeclaration = Readonly<{
    kind: 'ordinary' | 'structured';
    program: ToolProgramDeclaration;
}>;
```

### `ToolReturnValidator`

```ts
interface ToolReturnValidator<A, R> {
    readonly adoption: Adoption;
    check(input: Readonly<{
        arguments: A;
        value: unknown;
    }>): Outcome<R, Readonly<{
        reason: string;
    }>>;
}
```

### `ToolRevision`

```ts
type ToolRevision = ToolIdentity<'ToolRevision'>;
```

### `ToolRuntime`

```ts
interface ToolRuntime<P, B extends ContentBlock> {
    invoke(input: Access<P> & Readonly<{
        request: ToolInvokeRequest;
    }>): Promise<ToolInvokeOutcome>;
    inspect(input: ToolInspection<P>): Reply<ToolAvailability>;
    readonly queries: ToolInvocationQueries<P, B>;
    readonly commands: ToolInvocationCommands<P>;
    readonly instances: ToolInvocationDirectory<P>;
    readonly content: ToolInvocationContentReader<P>;
    readonly catalog: ToolCatalog<P>;
}
```

### `ToolSchemaIdentity`

```ts
type ToolSchemaIdentity = Readonly<{
    id: string;
    revision: string;
    digest: string;
}>;
```

### `ToolSettingsDeclaration`

```ts
type ToolSettingsDeclaration = Readonly<{
    schema: ParameterContract;
    defaults: JsonValue;
    items: readonly Readonly<{
        path: readonly string[];
        category: 'preference' | 'binding' | 'placement-identity' | 'governance';
        sensitive: boolean;
    }>[];
}>;
```

### `ToolStartAuthority`

```ts
interface ToolStartAuthority<P> {
    exclude(input: Mutation<P> & Readonly<{
        reason: string;
    }>): Reply<DurableEvidence>;
    prepare(input: CallAccess<P> & Readonly<{
        start: ToolStartRecord;
        request: FixedToolRequest;
    }>): Reply<StartPermit>;
    consume(input: CallAccess<P> & Readonly<{
        permit: StartPermit;
        executorReceipt: DurableEvidence;
    }>): Reply<StartProgress>;
    inspect(input: CallAccess<P> & Readonly<{
        start: ToolStartRecord;
    }>): Reply<StartProgress>;
    invalidate(input: Access<P> & Readonly<{
        operation: ToolOperationId;
        guard: StartGuard;
    }>): Reply<DurableEvidence>;
}
```

### `ToolStartLookup`

```ts
type ToolStartLookup<B extends ContentBlock> = Readonly<{
    kind: 'not-started';
    exclusion: DurableEvidence;
}> | Readonly<{
    kind: 'unknown';
    diagnostic: string;
}> | Readonly<{
    kind: 'live';
    execution: ToolLiveExecution<B>;
}> | Readonly<{
    kind: 'settled';
    source: DurableEvidence;
    event: string;
    fact: Extract<ToolExecutionFact<B>, {
        kind: 'final';
    }>;
}> | Readonly<{
    kind: 'lost';
    continuity: DurableEvidence;
}>;
```

### `ToolStartRecord`

```ts
type ToolStartRecord = Readonly<{
    operation: ToolOperationId;
    executor: Adoption;
    execution: ToolExecutionRef;
}> & (Readonly<{
    kind: 'start';
}> | Readonly<{
    kind: 'resume';
    checkpoint: DurableEvidence;
}>);
```

### `ToolState`

```ts
type ToolState = Readonly<{
    call: ToolCallId;
    revision: ToolRevision;
    source: DurableEvidence;
    foreground: ForegroundReturn | null;
    effect: Effect;
    execution: PhysicalExecution;
    timing: ToolTiming;
    queue: QueuePosition;
    controls: readonly ControlRecord[];
    delivery: DeliveryState | null;
    supplements: readonly Readonly<{
        result: ToolResultVersion;
        actual: ToolTerminal;
        delivery: DeliveryState;
        source: DurableEvidence;
    }>[];
}> & ((Readonly<{
    phase: 'accepted' | 'preparing' | 'queued' | 'starting';
    wait: Readonly<{
        kind: 'none';
    }>;
}> & ToolRelation) | (Readonly<{
    phase: 'running';
    instance: ToolInstanceId;
}> & ActiveRelation) | (Readonly<{
    phase: 'suspended';
    checkpoint: DurableEvidence;
}> & ActiveRelation) | (Readonly<{
    phase: 'settled';
    wait: Readonly<{
        kind: 'none';
    }>;
    result: ToolResultVersion;
}> & (Readonly<{
    relation: 'foreground';
    terminal: ToolTerminal;
}> | Readonly<{
    relation: 'background';
    terminal: Exclude<ToolTerminal, {
        kind: 'no-response';
    }>;
}>)));
```

### `ToolTask`

```ts
type ToolTask = Readonly<{
    operation: ToolOperationId;
    state: 'pending' | 'blocked';
    diagnostic: string | null;
}> & (Readonly<{
    kind: 'prepare';
    preparation: PreparationRecord;
}> | Readonly<{
    kind: 'release';
    release: ReleaseRecord;
}> | Readonly<{
    kind: 'start';
    start: ToolStartRecord;
}> | Readonly<{
    kind: 'answer';
    response: ResponseRecord;
}> | Readonly<{
    kind: 'stop';
    control: ControlDispatch;
}> | Readonly<{
    kind: 'suspend';
    suspension: SuspensionRecord;
}> | Readonly<{
    kind: 'wait-registration';
    wait: ToolWaitId;
    action: 'ensure' | 'invalidate';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'deliver';
    result: ToolResultVersion;
    delivery: ToolDeliveryId;
    consumer: ConsumerRef;
}> | Readonly<{
    kind: 'queue' | 'settle' | 'account' | 'facts' | 'clock';
    basis: DurableEvidence;
}> | Readonly<{
    kind: 'child';
    reservation: ChildReservation;
    action: 'reconcile' | 'collect' | 'control';
    cause: ProgramEnd | null;
}> | Readonly<{
    kind: 'program-fence';
    end: ProgramEnd;
    guard: StartGuard;
}> | Readonly<{
    kind: 'resource-wait';
    wait: Extract<WaitIntent, {
        kind: 'resource';
    }>;
    action: 'ensure' | 'expire' | 'invalidate';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'fact-ack';
    start: ToolStartRecord;
    source: DurableEvidence;
    receipt: FactReceipt;
}>);
```

### `ToolTerminal`

```ts
type ToolTerminal = Readonly<{
    kind: 'completed';
}> | Readonly<{
    kind: 'failed';
    cause: 'arguments' | 'environment' | 'executor' | 'runtime-lost' | 'result';
    diagnostic: string;
}> | Readonly<{
    kind: 'unavailable';
    reason: string;
}> | Readonly<{
    kind: 'interrupted';
    cause: InterruptionCause;
}> | Readonly<{
    kind: 'no-response';
    wait: ToolWaitId;
    reason: string;
}>;
```

### `ToolTiming`

```ts
type ToolTiming = Readonly<{
    accumulatedMs: string;
}> & (Readonly<{
    kind: 'running';
    segment: ClockSegment;
}> | Readonly<{
    kind: 'paused' | 'closed';
}> | Readonly<{
    kind: 'unknown';
    segment: ClockSegment;
    diagnostic: string;
}>);
```

### `ToolUsage`

```ts
type ToolUsage = Readonly<{
    definition: Adoption;
    command: string | null;
    description: string;
    parameters: ParameterContract | Readonly<{
        kind: 'executor-owned';
        usage: string;
        protocol: Adoption;
    }>;
    returns: ToolReturnDeclaration;
}>;
```

### `ToolValueSchema`

```ts
type ToolValueSchema<T> = Readonly<{
    identity: ToolSchemaIdentity;
    ref: SchemaRef<T>;
    maxBytes: number;
}>;
```

### `ToolWaitContract`

```ts
type ToolWaitContract<A, K extends 'ask' | 'resource'> = ToolWaitProtocolDefinition<A, K> & Readonly<{
    [toolWaitContract]: true;
}>;
```

### `ToolWaitId`

```ts
type ToolWaitId = ToolIdentity<'ToolWaitId'>;
```

### `ToolWaitProtocolDefinition`

```ts
type ToolWaitProtocolDefinition<A, K extends 'ask' | 'resource'> = Readonly<{
    kind: K;
    adoption: Adoption;
    request: ToolValueSchema<unknown>;
    response: ToolValueSchema<A>;
    expiry: K extends 'ask' ? 'forbidden' : 'forbidden' | 'supported';
}>;
```

### `ToolWaitResponseValidator`

```ts
interface ToolWaitResponseValidator<P> {
    validate(input: CallAccess<P> & Readonly<{
        wait: ToolWaitId;
        submission: ToolOperationId;
        source: DurableEvidence;
        candidate: ToolResponseCandidate;
    }>): Reply<ToolWaitValidation>;
}
```

### `ToolWaitSchemaSnapshot`

```ts
type ToolWaitSchemaSnapshot = Readonly<{
    contract: Adoption;
    request: ToolSchemaIdentity;
    response: ToolSchemaIdentity;
    requestMaxBytes: number;
    responseMaxBytes: number;
    expiry: 'forbidden' | 'supported';
    source: DurableEvidence;
}>;
```

### `ToolWaitValidation`

```ts
type ToolWaitValidation = Readonly<{
    kind: 'valid';
    candidate: ToolResponseCandidate;
    qualification: DurableEvidence;
}> | Readonly<{
    kind: 'invalid';
    issues: readonly SchemaIssue[];
}> | Readonly<{
    kind: 'denied' | 'stale' | 'conflict';
    reason: string;
}>;
```

### `ToolWaiter`

```ts
interface ToolWaiter {
    wait<A>(request: ToolAskRequest<A>): Promise<Outcome<ToolDecision<A>, ToolPrimitiveFailure>>;
    wait<A>(request: ToolResourceWaitRequest<A>): Promise<Outcome<ToolResourceReply<A>, ToolPrimitiveFailure>>;
}
```

### `WaitIntent`

```ts
type WaitIntent = Readonly<{
    wait: ToolWaitId;
    resume: DurableEvidence;
    schemas: ToolWaitSchemaSnapshot;
}> & (Readonly<{
    kind: 'ask';
    request: DurableEvidence;
}> | Readonly<{
    kind: 'resource';
    contract: Adoption;
    request: DurableEvidence;
    deadline: string | null;
}>);
```

### `WaitRecord`

```ts
type WaitRecord = Readonly<{
    intent: WaitIntent;
}> & (Readonly<{
    phase: 'opening';
    operation: ToolOperationId;
}> | Readonly<{
    phase: 'open';
    value: Exclude<WaitState, {
        kind: 'none';
    }>;
}> | Readonly<{
    phase: 'responding';
    value: Exclude<WaitState, {
        kind: 'none';
    }>;
    response: ResponseRecord;
    progress: ResponseProgress;
}> | Readonly<{
    phase: 'closed';
    cause: 'continued' | 'cancelled' | 'terminal';
    evidence: DurableEvidence;
}>);
```

### `WaitState`

```ts
type WaitState = Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'ask';
    wait: ToolWaitId;
    registration: DurableEvidence;
    resume: DurableEvidence;
    decision: DurableEvidence | null;
}> | Readonly<{
    kind: 'resource';
    wait: ToolWaitId;
    contract: Adoption;
    deadline: string | null;
    resume: DurableEvidence;
    registration: DurableEvidence;
}>;
```

### `WriteContext`

```ts
type WriteContext = ToolExecutionRef & Readonly<{
    operation: ToolOperationId;
    expected: ToolRevision;
}>;
```

### `createDefaultParameterCodec`

```ts
function createDefaultParameterCodec(limits: JsonLimits): Outcome<ParameterCodec<JsonValue>, Readonly<{
    field: string;
    reason: string;
}>>;
```

### `decodeToolCallId`

```ts
function decodeToolCallId(text: unknown): Outcome<ToolCallId, ToolIdentityRejection<'ToolCallId'>>;
```

### `decodeToolCursor`

```ts
function decodeToolCursor(text: unknown): Outcome<ToolCursor, ToolIdentityRejection<'ToolCursor'>>;
```

### `decodeToolDeliveryId`

```ts
function decodeToolDeliveryId(text: unknown): Outcome<ToolDeliveryId, ToolIdentityRejection<'ToolDeliveryId'>>;
```

### `decodeToolInstanceId`

```ts
function decodeToolInstanceId(text: unknown): Outcome<ToolInstanceId, ToolIdentityRejection<'ToolInstanceId'>>;
```

### `decodeToolInvocationRef`

```ts
function decodeToolInvocationRef(text: unknown): Outcome<ToolInvocationRef, ToolReferenceRejection>;
```

### `decodeToolOperationId`

```ts
function decodeToolOperationId(text: unknown): Outcome<ToolOperationId, ToolIdentityRejection<'ToolOperationId'>>;
```

### `decodeToolOperationRef`

```ts
function decodeToolOperationRef(text: unknown): Outcome<ToolOperationRef, ToolReferenceRejection>;
```

### `decodeToolResultVersion`

```ts
function decodeToolResultVersion(text: unknown): Outcome<ToolResultVersion, ToolIdentityRejection<'ToolResultVersion'>>;
```

### `decodeToolRevision`

```ts
function decodeToolRevision(text: unknown): Outcome<ToolRevision, ToolIdentityRejection<'ToolRevision'>>;
```

### `decodeToolWaitId`

```ts
function decodeToolWaitId(text: unknown): Outcome<ToolWaitId, ToolIdentityRejection<'ToolWaitId'>>;
```

### `defaultResultPolicy`

```ts
const defaultResultPolicy: ResultPolicy<ToolMessageContentBlock>;
```

### `defaultResultPolicyAdoption`

```ts
const defaultResultPolicyAdoption: Adoption;
```

### `defaultResultPolicyRules`

```ts
const defaultResultPolicyRules: Readonly<{
    owner: "@omne-harness/tool-contract";
    name: "default-result-policy";
    revision: "1";
    accept: readonly [
        "text",
        "voice-reference",
        "image-reference",
        "file-reference"
    ];
    reject: readonly [
        "thinking",
        "inline-media",
        "inline-file",
        "nested-container",
        "unknown-kind"
    ];
}>;
```

### `defineCommandTool`

```ts
function defineCommandTool<E, B extends ContentBlock>(input: Readonly<{
    metadata: ToolDefinitionMetadata;
    commands: Readonly<Record<string, Readonly<{
        summary: string;
        operation: ToolOperation<E, B>;
    }>>>;
}>): Outcome<ToolAuthorRegistration<E, B>, Rejection>;
```

### `defineFunctionTool`

```ts
function defineFunctionTool<E, B extends ContentBlock>(input: Readonly<{
    metadata: ToolDefinitionMetadata;
    operation: ToolOperation<E, B, Extract<ToolOperationParameters, {
        kind: 'declared';
    }>>;
}>): Outcome<ToolAuthorRegistration<E, B>, Rejection>;
```

### `defineToolOperation`

```ts
function defineToolOperation<A, R, E, B extends ContentBlock, P extends ToolOperationParameters>(input: ToolOperationSpec<A, R, E, B, P>): Outcome<ToolOperation<E, B, P>, Rejection>;
```

### `defineToolWaitContract`

```ts
function defineToolWaitContract<A, K extends 'ask' | 'resource'>(definition: ToolWaitProtocolDefinition<A, K>): Outcome<ToolWaitContract<A, K>, Readonly<{
    reason: string;
}>>;
```

### `describedAdoption`

```ts
function describedAdoption(rules: AdoptionRules): Adoption;
```

### `encodeToolInvocationRef`

```ts
function encodeToolInvocationRef(parts: ToolInvocationParts): Outcome<ToolInvocationRef, ToolReferenceRejection>;
```

### `encodeToolOperationRef`

```ts
function encodeToolOperationRef(parts: ToolOperationParts): Outcome<ToolOperationRef, ToolReferenceRejection>;
```

### `evaluateToolAvailability`

```ts
function evaluateToolAvailability(facts: AvailabilityFacts): ToolAvailability;
```

### `judgeConsumerRef`

```ts
function judgeConsumerRef(value: unknown): Outcome<ConsumerRef, Readonly<{
    field: string;
    reason: string;
}>>;
```

### `judgeFixedToolRequest`

```ts
function judgeFixedToolRequest(value: unknown): Outcome<FixedToolRequest, Readonly<{
    field: string;
    reason: string;
}>>;
```

### `judgeHandoff`

```ts
function judgeHandoff(value: unknown): Outcome<Handoff, Readonly<{
    field: string;
    reason: string;
}>>;
```

### `judgeToolArguments`

```ts
function judgeToolArguments(input: unknown, limits: JsonLimits): Outcome<ParsedToolArguments, ToolArgumentsRejection>;
```

### `judgeToolDefinition`

```ts
function judgeToolDefinition(value: unknown): Outcome<ToolDefinition, Readonly<{
    field: string;
    reason: string;
}>>;
```

### `judgeToolInvokeRequest`

```ts
function judgeToolInvokeRequest(value: unknown): Outcome<ToolInvokeRequest, Readonly<{
    field: string;
    reason: string;
}>>;
```

### `judgeToolState`

```ts
function judgeToolState(value: unknown): Outcome<ToolState, Readonly<{
    field: string;
    reason: string;
}>>;
```

### `presentTool`

```ts
function presentTool(definition: ToolDefinition): ToolPresentation;
```

### `projectToolResult`

```ts
function projectToolResult(value: ToolResult<ContentBlock>, attachmentBlockIds: readonly BlockId[]): Outcome<readonly ToolMessageContentBlock[], Readonly<{
    field: string;
    reason: string;
}>>;
```

### `readToolInvocationRef`

```ts
function readToolInvocationRef(reference: ToolInvocationRef): ToolInvocationParts;
```

### `readToolOperationRef`

```ts
function readToolOperationRef(reference: ToolOperationRef): ToolOperationParts;
```

### `renderToolResult`

```ts
function renderToolResult<A, R, E, B extends ContentBlock>(value: R, author: Extract<ToolAuthor<A, R, E, B>, {
    kind: 'ordinary';
}>, text: TextResultFactory<B>, policy: ResultPolicy<B>): Rendering<B>;
function renderToolResult<A, E, B extends ContentBlock>(value: ToolResult<B>, author: Extract<ToolAuthor<A, never, E, B>, {
    kind: 'structured';
}>, text: TextResultFactory<B>, policy: ResultPolicy<B>): Rendering<B>;
```

### `resolveToolInvocationRef`

```ts
function resolveToolInvocationRef(reference: unknown, tenant: TenantId): Outcome<ToolInvocationParts, ToolReferenceFailure>;
```

### `resolveToolOperationRef`

```ts
function resolveToolOperationRef(reference: unknown, tenant: TenantId): Outcome<ToolOperationParts, ToolReferenceFailure>;
```

### `toolBodyContract`

```ts
function toolBodyContract(): BodyContract;
```

## 入口 `./binding`

### `OwnSlot`

```ts
type OwnSlot = ReturnType<typeof slot>;
```

### `ToolOperationSlot`

```ts
type ToolOperationSlot = Readonly<{
    author: AnyAuthor;
    parameters: ToolOperationParameters;
    returns: ToolReturnDeclaration;
}>;
```

### `ToolRegistrationSlot`

```ts
type ToolRegistrationSlot = Readonly<{
    kind: 'function';
    operation: ToolOperationSlot;
}> | Readonly<{
    kind: 'commands';
    operations: readonly (readonly [
        string,
        ToolOperationSlot
    ])[];
}>;
```

### `readOwnSlot` = `slot`

```ts
function slot(value: object, key: PropertyKey): Slot;
```

### `readToolOperation`

```ts
function readToolOperation(value: unknown): ToolOperationSlot | undefined;
```

### `readToolRegistration`

```ts
function readToolRegistration(value: unknown): ToolRegistrationSlot | undefined;
```

## 入口 `./testing`

### `AnswerModel`

```ts
type AnswerModel<Method extends string = string> = Readonly<Record<Method, AnswerRow>>;
```

### `AnswerRow`

```ts
type AnswerRow<K extends string = string> = Readonly<{
    clause: string;
    progress: readonly K[];
    lostReply?: readonly string[];
    ranks?: Readonly<Partial<Record<K, number>>>;
    recalled?: readonly K[];
}>;
```

### `CaseVerdict`

```ts
type CaseVerdict = Readonly<{
    kind: 'passed';
}> | Readonly<{
    kind: 'not-applicable';
    handle: string;
}>;
```

### `Completion`

```ts
type Completion = Readonly<{
    name: string;
    call: (() => Promise<void>) | undefined;
}>;
```

### `ConformanceCase`

```ts
type ConformanceCase<F> = Readonly<{
    name: string;
    clause: string;
    run(fixture: F): Promise<void>;
}>;
```

### `CrossTenantAnswers`

```ts
type CrossTenantAnswers<A> = Readonly<{
    real: A;
    ghost: A;
}>;
```

### `MemoryEnvironment`

```ts
type MemoryEnvironment = Readonly<{
    resource: string;
}>;
```

### `MemoryToolClock`

```ts
interface MemoryToolClock extends ToolClock {
    readonly durability: 'none';
    readonly controls: Readonly<{
        advance(milliseconds: number): void;
        setBack(milliseconds: number): void;
        changeEpoch(): void;
        instantAfter(milliseconds: number): string;
    }>;
}
```

### `MemoryToolDecisionBridge`

```ts
interface MemoryToolDecisionBridge<P> extends ToolDecisionBridge<P> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        hold(): void;
        settle(): Promise<void>;
        excludeDeferred(operation: ReturnType<typeof operationId>): Promise<void>;
        invalidations(): readonly DurableEvidence[];
        decide(input: Readonly<{
            tenant: Access<unknown>['tenant'];
            call: ToolCallId;
            wait: ToolWaitId;
            value: DecisionValue;
        }>): Promise<DurableEvidence>;
    }>;
}
```

### `MemoryToolEnvironment`

```ts
interface MemoryToolEnvironment<P> extends ToolEnvironment<P, MemoryEnvironment> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        allocations(): number;
        hold(): void;
        settle(): Promise<void>;
        excludeDeferred(preparation: PreparationRecord): Promise<void>;
        rejectNext(reason: string): void;
    }>;
}
```

### `MemoryToolExecutorBinding`

```ts
interface MemoryToolExecutorBinding<P, E> {
    readonly durability: 'none';
    readonly binding: LiveOnly<P, E>;
    readonly controls: Readonly<{
        launches(): number;
        emit(start: Start, fact: Fact): Promise<void>;
        finish(start: Start, final: FinalFact): Promise<void>;
        loseContinuity(start: Start): Promise<void>;
        blindInspection(start: Start): void;
        pendingAcknowledgements(start: Start): number;
        holdStop(start: Start): void;
        completeStop(start: Start): Promise<void>;
        settle(): Promise<void>;
    }>;
}
```

### `MemoryToolOutputCustody`

```ts
interface MemoryToolOutputCustody<P> extends ToolOutputCustody<P> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        readBytes(raw: RawOutput): Promise<Uint8Array>;
        failNext(): void;
        dropNextAnswer(): void;
        settle(): Promise<void>;
    }>;
}
```

### `MemoryToolResourceResponses`

```ts
interface MemoryToolResourceResponses<P> extends ToolResourceResponses<P> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        hold(): void;
        settle(): Promise<void>;
        excludeDeferred(operation: ToolOperationId): Promise<void>;
        invalidations(): readonly DurableEvidence[];
        respond(input: Readonly<{
            tenant: Access<unknown>['tenant'];
            call: ToolCallId;
            wait: ResourceWait;
            value: JsonValue;
        }>): Promise<DurableEvidence>;
        reachDeadline(input: Readonly<{
            tenant: Access<unknown>['tenant'];
            call: ToolCallId;
            wait: ResourceWait;
        }>): Promise<void>;
    }>;
}
```

### `MemoryToolStartAuthority`

```ts
interface MemoryToolStartAuthority<P> extends ToolStartAuthority<P> {
    readonly durability: 'none';
}
```

### `NotApplicable`

```ts
class NotApplicable extends Error {
    readonly handle: string;
    constructor(handle: string);
}
```

### `ToolClockFixture`

```ts
interface ToolClockFixture {
    readonly clock: ToolClock;
    readonly access: Access<unknown>;
    readonly waitMs?: number;
    readonly quietMs?: number;
    advance?(milliseconds: number): void | Promise<void>;
    setBack?(milliseconds: number): void | Promise<void>;
    changeEpoch?(): void | Promise<void>;
    instantAfter?(milliseconds: number): string;
}
```

### `ToolDecisionBridgeFixture`

```ts
interface ToolDecisionBridgeFixture<P> extends ExternalHandles {
    readonly bridge: ToolDecisionBridge<P>;
    readonly access: Access<P>;
    readonly otherAccess?: Access<P>;
    decide?(input: Readonly<{
        call: ToolCallId;
        wait: ToolWaitId;
        value: DecisionValue;
    }>): Promise<DurableEvidence>;
}
```

### `ToolEnvironmentFixture`

```ts
interface ToolEnvironmentFixture<P, E> {
    readonly environment: ToolEnvironment<P, E>;
    readonly access: Access<P>;
    readonly otherAccess?: Access<P>;
    readonly request?: FixedToolRequest;
    allocations?(): number;
    hold?(): void;
    settle?(): Promise<void>;
    excludeDeferred?(preparation: PreparationRecord): Promise<void>;
    rejectNext?(reason: string): void;
}
```

### `ToolExecutorBindingFixture`

```ts
interface ToolExecutorBindingFixture<P, E> {
    readonly binding: LiveOnly<P, E>;
    readonly access: Access<P>;
    readonly otherAccess?: Access<P>;
    readonly environment: E;
    readonly request?: FixedToolRequest;
    readonly readDeadlineMs?: number;
    readonly quietMs?: number;
    permit?(start: Start): Promise<StartPermit>;
    settle?(): Promise<void>;
    launches?(): number;
    emit?(start: Start, fact: Fact): Promise<void>;
    finish?(start: Start, final: FinalFact): Promise<void>;
    loseContinuity?(start: Start): Promise<void>;
    blindInspection?(start: Start): void;
    pendingAcknowledgements?(start: Start): number;
    holdStop?(start: Start): void;
    completeStop?(start: Start): Promise<void>;
}
```

### `ToolOutputCustodyFixture`

```ts
interface ToolOutputCustodyFixture<P> {
    readonly custody: ToolOutputCustody<P>;
    readonly access: Access<P>;
    readonly otherAccess?: Access<P>;
    readonly codec?: Adoption;
    readBytes?(raw: RawOutput): Promise<Uint8Array>;
    failNext?(): void;
    dropNextAnswer?(): void;
    settle?(): Promise<void>;
}
```

### `ToolResourceResponsesFixture`

```ts
interface ToolResourceResponsesFixture<P> extends ExternalHandles {
    readonly responses: ToolResourceResponses<P>;
    readonly access: Access<P>;
    readonly otherAccess?: Access<P>;
    readonly deadline?: string;
    respond?(input: Readonly<{
        call: ToolCallId;
        wait: ResourceWait;
        value: JsonValue;
    }>): Promise<DurableEvidence>;
    reachDeadline?(input: Readonly<{
        call: ToolCallId;
        wait: ResourceWait;
    }>): Promise<void>;
}
```

### `ToolStartAuthorityFixture`

```ts
interface ToolStartAuthorityFixture<P> {
    readonly authority: ToolStartAuthority<P>;
    readonly access: Access<P>;
    readonly otherAccess?: Access<P>;
    readonly request?: FixedToolRequest;
    settle?(): Promise<void>;
}
```

### `clockAnswers`

```ts
const clockAnswers: {
    readonly now: {
        readonly clause: 'P07';
        readonly progress: readonly [
        ];
    };
    readonly begin: {
        readonly clause: 'P07';
        readonly progress: readonly [
        ];
    };
    readonly elapsed: {
        readonly clause: 'P07';
        readonly progress: readonly [
        ];
    };
    readonly waitUntil: {
        readonly clause: 'P07';
        readonly progress: readonly [
        ];
    };
};
```

### `completedFinal`

```ts
function completedFinal(): FinalFact;
```

### `completionOf`

```ts
function completionOf<K extends string, A extends unknown[] = [
]>(fixture: Readonly<Partial<Record<NoInfer<K>, (...args: A) => Promise<void>>>>, name: K, ...args: A): Completion;
```

### `createMemoryToolClock`

```ts
function createMemoryToolClock(): MemoryToolClock;
```

### `createMemoryToolDecisionBridge`

```ts
function createMemoryToolDecisionBridge<P>(): MemoryToolDecisionBridge<P>;
```

### `createMemoryToolEnvironment`

```ts
function createMemoryToolEnvironment<P>(): MemoryToolEnvironment<P>;
```

### `createMemoryToolExecutorBinding`

```ts
function createMemoryToolExecutorBinding<P, E>(): MemoryToolExecutorBinding<P, E>;
```

### `createMemoryToolOutputCustody`

```ts
function createMemoryToolOutputCustody<P>(): MemoryToolOutputCustody<P>;
```

### `createMemoryToolResourceResponses`

```ts
function createMemoryToolResourceResponses<P>(): MemoryToolResourceResponses<P>;
```

### `createMemoryToolStartAuthority`

```ts
function createMemoryToolStartAuthority<P>(): MemoryToolStartAuthority<P>;
```

### `crossTenantAnswers`

```ts
function crossTenantAnswers<A extends Outcome<unknown, ToolFailure>>(read: Readonly<{
    ask: Readonly<{
        real: () => Promise<A>;
        ghost: () => Promise<A>;
    }>;
    row: AnswerRow;
    completion?: Completion;
    identifying: readonly unknown[];
    submitted: readonly unknown[];
    what: string;
}>): Promise<CrossTenantAnswers<A>>;
```

### `decisionBridgeAnswers`

```ts
const decisionBridgeAnswers: {
    readonly ensure: {
        readonly clause: 'P06';
        readonly progress: readonly [
        ];
        readonly lostReply: readonly [
            "commit-unknown"
        ];
    };
    readonly invalidate: {
        readonly clause: 'P06';
        readonly progress: readonly [
        ];
        readonly lostReply: readonly [
            "commit-unknown"
        ];
    };
    readonly inspect: {
        readonly clause: 'P06';
        readonly progress: readonly [
        ];
    };
    readonly inspectOperation: {
        readonly clause: 'P06';
        readonly progress: readonly [
            "pending",
            "unknown"
        ];
    };
    readonly resolve: {
        readonly clause: 'P12';
        readonly progress: readonly [
        ];
    };
};
```

### `environmentAnswers`

```ts
const environmentAnswers: {
    readonly prepare: {
        readonly clause: 'P03';
        readonly progress: string[];
    };
    readonly inspectPreparation: {
        readonly clause: 'P03';
        readonly progress: string[];
    };
    readonly release: {
        readonly clause: 'P03';
        readonly progress: string[];
    };
    readonly inspectRelease: {
        readonly clause: 'P03';
        readonly progress: string[];
    };
};
```

### `executorBindingAnswers`

```ts
const executorBindingAnswers: {
    readonly start: {
        readonly clause: 'P05';
        readonly progress: readonly [
        ];
    };
    readonly inspectStart: {
        readonly clause: 'P05';
        readonly progress: readonly [
            "unknown"
        ];
    };
    readonly acknowledge: {
        readonly clause: 'P05';
        readonly progress: readonly [
        ];
    };
    readonly stop: Readonly<{
        clause: string;
        progress: readonly ("accepted" | "pending" | "unknown")[];
        lostReply?: readonly string[];
        ranks?: Readonly<Partial<Record<"accepted" | "pending" | "unknown", number>>>;
        recalled?: readonly ("accepted" | "pending" | "unknown")[];
    }>;
    readonly inspectControl: Readonly<{
        clause: string;
        progress: readonly ("accepted" | "pending" | "unknown")[];
        lostReply?: readonly string[];
        ranks?: Readonly<Partial<Record<"accepted" | "pending" | "unknown", number>>>;
        recalled?: readonly ("accepted" | "pending" | "unknown")[];
    }>;
};
```

### `finalAnswer`

```ts
function finalAnswer<A>(read: Readonly<{
    ask: () => Promise<A>;
    row: AnswerRow;
    completion?: Completion;
    view?: (answer: A) => unknown;
    what: string;
}>): Promise<A>;
```

### `isNotApplicable`

```ts
function isNotApplicable(error: unknown): error is NotApplicable;
```

### `isProgress`

```ts
function isProgress(answer: unknown, row: AnswerRow): boolean;
```

### `memoryToolClockFixture`

```ts
function memoryToolClockFixture(): ToolClockFixture;
```

### `memoryToolDecisionBridgeFixture`

```ts
function memoryToolDecisionBridgeFixture(): ToolDecisionBridgeFixture<string>;
```

### `memoryToolEnvironmentFixture`

```ts
function memoryToolEnvironmentFixture(): ToolEnvironmentFixture<string, MemoryEnvironment>;
```

### `memoryToolExecutorBindingFixture`

```ts
function memoryToolExecutorBindingFixture(): ToolExecutorBindingFixture<string, {
    readonly resource: string;
}>;
```

### `memoryToolOutputCustodyFixture`

```ts
function memoryToolOutputCustodyFixture(): ToolOutputCustodyFixture<string>;
```

### `memoryToolResourceResponsesFixture`

```ts
function memoryToolResourceResponsesFixture(): ToolResourceResponsesFixture<string>;
```

### `memoryToolStartAuthorityFixture`

```ts
function memoryToolStartAuthorityFixture(): ToolStartAuthorityFixture<string>;
```

### `outputCustodyAnswers`

```ts
const outputCustodyAnswers: {
    readonly preserve: {
        readonly clause: 'P01';
        readonly progress: readonly [
        ];
        readonly lostReply: readonly [
            "commit-unknown"
        ];
    };
    readonly inspect: {
        readonly clause: 'P05';
        readonly progress: readonly [
            "unknown"
        ];
    };
    readonly retainResult: {
        readonly clause: 'P01';
        readonly progress: readonly [
        ];
        readonly lostReply: readonly [
            "commit-unknown"
        ];
    };
};
```

### `resendRecalls`

```ts
function resendRecalls(row: AnswerRow, reads: Readonly<{
    earlier: unknown;
    later: unknown;
}>, what: string): void;
```

### `resourceResponsesAnswers`

```ts
const resourceResponsesAnswers: {
    readonly ensure: {
        readonly clause: 'P06';
        readonly progress: readonly [
        ];
        readonly lostReply: readonly [
            "commit-unknown"
        ];
    };
    readonly invalidate: {
        readonly clause: 'P06';
        readonly progress: readonly [
        ];
        readonly lostReply: readonly [
            "commit-unknown"
        ];
    };
    readonly inspect: {
        readonly clause: 'P06';
        readonly progress: readonly [
        ];
    };
    readonly inspectOperation: {
        readonly clause: 'P06';
        readonly progress: readonly [
            "pending",
            "unknown"
        ];
    };
    readonly expire: {
        readonly clause: 'P06';
        readonly progress: readonly [
        ];
        readonly lostReply: readonly [
            "commit-unknown"
        ];
    };
    readonly resolve: {
        readonly clause: 'P12';
        readonly progress: readonly [
        ];
    };
};
```

### `runConformanceCase`

```ts
function runConformanceCase<F>(conformance: ConformanceCase<F>, fixture: F): Promise<CaseVerdict>;
```

### `startAuthorityAnswers`

```ts
const startAuthorityAnswers: {
    readonly prepare: {
        readonly clause: 'P04';
        readonly progress: readonly [
        ];
    };
    readonly consume: {
        readonly clause: 'P04';
        readonly progress: readonly [
            "unknown"
        ];
    };
    readonly inspect: {
        readonly clause: 'P04';
        readonly progress: readonly [
            "unknown"
        ];
    };
    readonly invalidate: {
        readonly clause: 'P04';
        readonly progress: readonly [
        ];
    };
    readonly exclude: {
        readonly clause: 'P04';
        readonly progress: readonly [
        ];
    };
};
```

### `testingTenant`

```ts
function testingTenant(organization: string, account: string): TenantId;
```

### `toolClockConformance`

```ts
function toolClockConformance(): readonly ConformanceCase<ToolClockFixture>[];
```

### `toolDecisionBridgeConformance`

```ts
function toolDecisionBridgeConformance<P>(): readonly ConformanceCase<ToolDecisionBridgeFixture<P>>[];
```

### `toolEnvironmentConformance`

```ts
function toolEnvironmentConformance<P, E>(): readonly ConformanceCase<Fixture<P, E>>[];
```

### `toolExecutorBindingConformance`

```ts
function toolExecutorBindingConformance<P, E>(): readonly ConformanceCase<ToolExecutorBindingFixture<P, E>>[];
```

### `toolOutputCustodyConformance`

```ts
function toolOutputCustodyConformance<P>(): readonly ConformanceCase<ToolOutputCustodyFixture<P>>[];
```

### `toolResourceResponsesConformance`

```ts
function toolResourceResponsesConformance<P>(): readonly ConformanceCase<ToolResourceResponsesFixture<P>>[];
```

### `toolStartAuthorityConformance`

```ts
function toolStartAuthorityConformance<P>(): readonly ConformanceCase<Fixture<P>>[];
```

## 内部引用

### `AnyAuthor`

```ts
type AnyAuthor = ToolAuthor<unknown, unknown, unknown, ContentBlock>;
```

### `ExternalHandles`

```ts
interface ExternalHandles {
    hold?(): void;
    settle?(): Promise<void>;
    excludeDeferred?(operation: ToolOperationId): Promise<void>;
    invalidations?(): readonly DurableEvidence[];
}
```

### `Fact`

```ts
type Fact = ToolExecutionFact<ContentBlock>;
```

### `FinalFact`

```ts
type FinalFact = Extract<Fact, {
    kind: 'final';
}>;
```

### `Fixture` · testing-environment.d.ts

```ts
type Fixture<P, E> = ToolEnvironmentFixture<P, E>;
```

### `Fixture` · testing-start-authority.d.ts

```ts
type Fixture<P> = ToolStartAuthorityFixture<P>;
```

### `LiveOnly`

```ts
type LiveOnly<P, E> = Extract<ToolExecutorBinding<P, ContentBlock, E>, {
    kind: 'live-only';
}>;
```

### `Rejection`

```ts
type Rejection = Readonly<{
    field: string;
    reason: string;
}>;
```

### `Rendering`

```ts
type Rendering<B extends ContentBlock> = Step<ToolResult<B>>;
```

### `ResourceWait`

```ts
type ResourceWait = Extract<WaitIntent, {
    kind: 'resource';
}>;
```

### `Slot`

```ts
type Slot = Readonly<{
    kind: 'absent';
}> | Readonly<{
    kind: 'accessor';
}> | Readonly<{
    kind: 'value';
    value: unknown;
}>;
```

### `Start`

```ts
type Start = Extract<ToolStartRecord, {
    kind: 'start';
}>;
```

### `Step`

```ts
type Step<T> = Outcome<T, Readonly<{
    reason: string;
}>>;
```

### `operationId`

```ts
const operationId: (text: string) => ToolOperationId;
```
