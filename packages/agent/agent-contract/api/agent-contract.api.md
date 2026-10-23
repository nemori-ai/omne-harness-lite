# @omne-harness/agent-contract 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

### `AGENT_IDENTITY_MAX_LENGTH`

```ts
const AGENT_IDENTITY_MAX_LENGTH = 256;
```

### `ATTRIBUTE_ITEMS`

```ts
const ATTRIBUTE_ITEMS: readonly [
    'first_token_wait_limit',
    'post_first_token_stall_limit',
    'model'
];
```

### `AcceptedInput`

```ts
type AcceptedInput = Readonly<{
    id: InputId;
    content: Message;
    source: Evidence | null;
    priority: 'ordinary' | 'urgent';
}>;
```

### `Access`

```ts
type Access<P> = Readonly<{
    principal: P;
    tenant: TenantId;
}>;
```

### `Action`

```ts
type Action = Readonly<{
    id: ActionId;
    original: ToolPart & Readonly<{
        kind: 'tool_call';
    }>;
    effectiveArguments: string;
    judgment: ActionJudgment;
    call: PendingCall | null;
}>;
```

### `ActionAdmission`

```ts
interface ActionAdmission<P> {
    admit(input: Access<P> & Readonly<{
        advance: Authority;
        execution: AgentExecutionId;
        passage: PassageId;
        action: ActionId;
        original: Action['original'];
        effectiveArguments: string;
        definition: Adoption;
        permissions: CapturedRead | null;
        decision: Readonly<{
            card: Evidence;
            answer: CardAnswer;
        }> | null;
    }>): Reply<AdmissionDecision>;
}
```

### `ActionBarrier`

```ts
type ActionBarrier = Readonly<{
    kind: 'closed';
    judging: readonly ActionId[];
    asked: readonly Readonly<{
        action: ActionId;
        passage: PassageId;
        round: CardRoundId;
    }>[];
}> | Readonly<{
    kind: 'open';
    evidence: Evidence;
    approved: readonly [
        ActionId,
        ...ActionId[]
    ];
}> | Readonly<{
    kind: 'all-denied';
    evidence: Evidence;
}>;
```

### `ActionBatch`

```ts
type ActionBatch = Readonly<{
    id: ActionBatchId;
    source: ProducedResult;
    actions: readonly Action[];
    barrier: ActionBarrier;
    slots: readonly ActionSlot[];
    batchPass: readonly PassageId[] | null;
}>;
```

### `ActionBatchId`

```ts
type ActionBatchId = AgentIdentity<'AgentActionBatchId'>;
```

### `ActionId`

```ts
type ActionId = AgentIdentity<'AgentActionId'>;
```

### `ActionIdentity`

```ts
type ActionIdentity = Readonly<{
    position: 'before_action';
    action: ActionId;
    call?: never;
}> | Readonly<{
    position: 'after_action';
    dimension: Readonly<{
        scope: 'each';
    }>;
    action: ActionId;
    call?: never;
}> | Readonly<{
    position: 'after_action';
    dimension: Readonly<{
        scope: 'batch';
    }>;
    action?: never;
    call?: never;
}> | Readonly<{
    position: 'after_model_call';
    dimension: Readonly<{
        ending: 'complete_reply';
    }>;
    action?: never;
    call?: never;
}> | Readonly<{
    position: 'after_model_call';
    dimension: Readonly<{
        ending: 'failure';
    }>;
    action?: never;
    call: M.ModelCallId;
}> | Readonly<{
    position: Exclude<Position, 'before_action' | 'after_action' | 'after_model_call'>;
    action?: never;
    call?: never;
}>;
```

### `ActionJudgment`

```ts
type ActionJudgment = Readonly<{
    kind: 'pending';
    passage: PassageId;
}> | Readonly<{
    kind: 'waiting';
    passage: PassageId;
    cards: readonly Evidence[];
}> | Readonly<{
    kind: 'denied';
    evidence: Evidence;
}> | Readonly<{
    kind: 'allowed';
    evidence: Evidence;
    request: T.FixedToolRequest;
}>;
```

### `ActionSlot`

```ts
type ActionSlot = Readonly<{
    action: ActionId;
    each: readonly PassageId[] | null;
    candidate: Message | null;
    handoff: Evidence | null;
}> & (Readonly<{
    kind: 'denied';
    evidence: Evidence;
}> | Readonly<{
    kind: 'dispatched';
}> | Readonly<{
    kind: 'result';
    result: ProducedResult;
    terminal: T.ToolTerminal;
    custody: Evidence;
}> | Readonly<{
    kind: 'background';
    placeholder: ProducedResult;
    confirmation: Evidence;
}>);
```

### `AdmissionDecision`

```ts
type AdmissionDecision = Readonly<{
    kind: 'allow';
    evidence: Evidence;
}> | Readonly<{
    kind: 'deny';
    reason: string;
    evidence: Evidence;
}> | Readonly<{
    kind: 'need-decision';
    card: DecisionCardDraft;
    evidence: Evidence;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
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

### `AdvancementFact`

```ts
type AdvancementFact = Readonly<{
    kind: 'current' | 'stopping' | 'ended' | 'superseded';
    source: Evidence;
}>;
```

### `AgentAccessCheck`

```ts
interface AgentAccessCheck<P> {
    check(input: Readonly<{
        access: Access<P>;
        operation: AgentAccessOperation;
        target: AgentAccessTarget;
    }>): Promise<AgentAccessDecision>;
}
```

### `AgentAccessDecision`

```ts
type AgentAccessDecision = Readonly<{
    kind: 'allowed';
    evidence: Evidence;
}> | Readonly<{
    kind: 'denied';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
```

### `AgentAccessOperation`

```ts
type AgentAccessOperation = 'invoke' | 'resume' | 'submit' | 'control' | 'read' | 'events' | 'acknowledge' | 'takeover' | 'observe' | 'resolve' | 'connect' | 'reserve' | 'publish' | 'withdraw' | 'quiesce' | 'query' | 'load' | 'reconcile' | 'detach' | 'record-terminal-observation';
```

### `AgentAccessTarget`

```ts
type AgentAccessTarget = Readonly<{
    kind: 'scope';
    scope: Evidence;
    definition: Adoption;
}> | Readonly<{
    kind: 'instance';
    instance: AgentInstanceId;
}> | Readonly<{
    kind: 'execution';
    instance: AgentInstanceId;
    execution: AgentExecutionId;
}>;
```

### `AgentAdoptions`

```ts
interface AgentAdoptions<P> {
    resolve(input: Access<P> & Readonly<{
        adoption: Adoption;
    }>): Reply<Readonly<{
        definition: AgentDefinition;
        evaluator: AgentEvaluator;
        extensions: readonly LoopExtensionDeclaration[];
    }>>;
    handover(input: Access<P> & Readonly<{
        from: Adoption;
        to: Adoption;
        snapshot: ExecutionSnapshot;
        original: Continuation;
    }>): Reply<Readonly<{
        continuation: Continuation;
        evidence: Evidence;
    }>>;
}
```

### `AgentCheckpoint`

```ts
type AgentCheckpoint = Readonly<{
    schema: Adoption;
    definition: Adoption;
    step: StepId;
    position: string;
    calls: readonly PendingCall[];
    passages: readonly Passage[];
    batch: ActionBatch | null;
    inputBatch: InputBatchId | null;
    requestPreparation: Preparation | null;
    compaction: CompactionState | null;
    adoptedContext: Evidence | null;
    guard: GuardFact | null;
    completedPassages: readonly PassageId[];
    priorConditions: Evidence | null;
}>;
```

### `AgentClock`

```ts
interface AgentClock {
    now(): Reply<AgentInstant>;
    waitUntil(instant: AgentInstant, signal: AbortSignal): Reply<'elapsed' | 'cancelled'>;
}
```

### `AgentConclusion`

```ts
type AgentConclusion = Readonly<{
    kind: 'complete';
}> | Readonly<{
    kind: 'fail' | 'cancelled';
    cause: Evidence;
}>;
```

### `AgentDefinition`

```ts
type AgentDefinition = {
    readonly category: 'AgentDefinition';
    readonly name: string;
    readonly version: VersionChoice;
    readonly references: readonly AssetReference[];
    readonly attributes: readonly AttributeDeclaration[];
};
```

### `AgentDirectory`

```ts
interface AgentDirectory<P> {
    resolve(input: Access<P> & Readonly<{
        instance: AgentInstanceId;
    }>): Reply<AgentRuntime<P>>;
    connect(input: Access<P> & Readonly<{
        instance: AgentInstanceId;
    }>): Reply<Readonly<{
        kind: 'live';
        handle: AgentHandle<P>;
    }> | Readonly<{
        kind: 'no-live-route';
    }>>;
}
```

### `AgentEvaluator`

```ts
interface AgentEvaluator {
    initial(input: Readonly<{
        definition: Adoption;
        step: StepId;
    }>): Outcome<AgentCheckpoint, Failure>;
    next(input: LoopFacts): Outcome<Next, Failure>;
    encode(value: AgentCheckpoint): Continuation;
    decode(value: Continuation): Outcome<AgentCheckpoint, Failure>;
}
```

### `AgentEvent`

```ts
type AgentEvent = Readonly<{
    execution: AgentExecutionId;
    sequence: string;
    executionAttachment: ExecutionAttachmentId;
    schema: Adoption;
    cause: Evidence;
    body: AgentEventBody;
}>;
```

### `AgentEventBody`

```ts
type AgentEventBody = Readonly<{
    kind: 'input-taken';
    batch: InputBatch;
}> | Readonly<{
    kind: 'message';
    message: Message;
    source: Evidence;
}> | Readonly<{
    kind: 'producer';
    result: ProducedResult;
    consumption: ConsumptionId;
}> | Readonly<{
    kind: 'stream';
    producer: ProducedResult['producer'];
    cursor: string;
    source: Evidence;
    schema: Adoption;
    value: JsonValue;
}> | Readonly<{
    kind: 'waiting';
    waits: readonly Waiting[];
}> | Readonly<{
    kind: 'control';
    operation: AgentOperationId;
    stage: ControlStage;
    state: 'reached' | 'unresolved';
    source: Evidence;
}> | Readonly<{
    kind: 'ended';
    conclusion: AgentConclusion;
    disposition: Evidence;
}>;
```

### `AgentExecutionControl`

```ts
interface AgentExecutionControl<P> {
    control(input: ExecutionMutation<P> & Readonly<{
        command: ExecutionControl;
    }>): Reply<CommandReceipt>;
}
```

### `AgentExecutionEvents`

```ts
interface AgentExecutionEvents<P> {
    read(input: Access<P> & Readonly<{
        execution: AgentExecutionId;
        after: string | null;
        limit: number;
    }>): Reply<EventPage>;
    events(input: Access<P> & Readonly<{
        execution: AgentExecutionId;
        after: string | null;
        signal: AbortSignal;
    }>): AsyncIterable<Outcome<EventPage, Failure>>;
    acknowledge(input: ExecutionMutation<P> & Readonly<{
        through: string;
        receipt: Evidence | null;
    }>): Reply<CommandReceipt>;
}
```

### `AgentExecutionHandle`

```ts
interface AgentExecutionHandle<P> {
    readonly execution: AgentExecutionId;
    readonly input: AgentExecutionInput<P>;
    readonly control: AgentExecutionControl<P>;
    readonly output: AgentExecutionEvents<P>;
}
```

### `AgentExecutionId`

```ts
type AgentExecutionId = AgentIdentity<'AgentExecutionId'>;
```

### `AgentExecutionInput`

```ts
interface AgentExecutionInput<P> {
    submit(input: ExecutionMutation<P> & Readonly<{
        value: AcceptedInput;
    }>): Reply<CommandReceipt>;
}
```

### `AgentExecutionRecovery`

```ts
interface AgentExecutionRecovery<P> {
    query(input: ExecutionMutation<P>): Reply<Readonly<{
        kind: 'committed';
        receipt: CommandReceipt;
    }> | Readonly<{
        kind: 'excluded';
        evidence: Evidence;
    }> | Readonly<{
        kind: 'unknown';
    }>>;
    load(input: Access<P> & Readonly<{
        execution: AgentExecutionId;
    }>): Reply<ExecutionSnapshot>;
    reconcile(input: ExecutionMutation<P>): Reply<Readonly<{
        remaining: readonly ConsumptionId[];
        evidence: Evidence;
    }>>;
    detach(input: ExecutionMutation<P> & Readonly<{
        authority: Authority;
        reason: Evidence;
    }>): Reply<Evidence>;
}
```

### `AgentHandle`

```ts
interface AgentHandle<P> {
    readonly instance: AgentInstanceId;
    observe(input: Access<P> & Readonly<{
        signal: AbortSignal;
    }>): AsyncIterable<AgentObservation>;
}
```

### `AgentIdentity`

```ts
type AgentIdentity<K extends string> = string & {
    readonly [agentIdentity]: K;
};
```

### `AgentInstanceHost`

```ts
interface AgentInstanceHost<P> {
    reserve(input: Access<P> & Readonly<{
        operation: AgentOperationId;
        scope: Evidence;
        definition: Adoption;
    }>): Reply<Readonly<{
        instance: AgentInstanceId;
        registration: AgentRegistrationHandle<P>;
    }>>;
    publish(input: Access<P> & Readonly<{
        operation: AgentOperationId;
        instance: AgentInstanceId;
        scope: Evidence;
        state: AgentState;
    }>): Reply<Registration>;
    withdraw(input: Access<P> & Readonly<{
        operation: AgentOperationId;
        instance: AgentInstanceId;
        registration: AgentRegistrationId;
    }>): Reply<Registration>;
    readonly directory: AgentDirectory<P>;
}
```

### `AgentInstanceId`

```ts
type AgentInstanceId = AgentIdentity<'AgentInstanceId'>;
```

### `AgentInstant`

```ts
type AgentInstant = string;
```

### `AgentJournal`

```ts
interface AgentJournal<P> extends AgentJournalAttachment<P>, AgentJournalRecording<P>, AgentJournalFinishing<P>, AgentJournalObservation<P>, AgentJournalReading<P> {
    readonly capabilities: JournalCapabilities;
}
```

### `AgentJournalAttachment`

```ts
interface AgentJournalAttachment<P> {
    open(input: ExecutionMutation<P> & Readonly<{
        instance: AgentInstanceId;
        grant: Evidence | null;
        initial: AcceptedInput;
        checkpoint: AgentCheckpoint;
    }>): Reply<Readonly<{
        receipt: CommandReceipt;
        authority: Authority;
    }>>;
    attach(input: ExecutionMutation<P> & Readonly<{
        instance: AgentInstanceId;
        grant: Evidence | null;
        recovery: Evidence;
        takeover: Evidence | null;
    }>): Reply<Readonly<{
        receipt: CommandReceipt;
        authority: Authority;
    }>>;
    detach(input: Parameters<AgentExecutionRecovery<P>['detach']>[0]): Reply<Evidence>;
}
```

### `AgentJournalFinishing`

```ts
interface AgentJournalFinishing<P> {
    tryFinish(input: ExecutionMutation<P> & Readonly<{
        authorization: FinishAuthorization;
        expected: ExecutionRevision;
        intent: FinishIntent;
    }>): Reply<FinishResult>;
}
```

### `AgentJournalObservation`

```ts
interface AgentJournalObservation<P> {
    recordTerminalObservation(input: ExecutionMutation<P> & Readonly<{
        terminal: Evidence;
        passage: PassageId;
        implementation: Adoption;
        observed: Evidence;
    }>): Reply<CommandReceipt>;
}
```

### `AgentJournalReading`

```ts
interface AgentJournalReading<P> {
    load(input: Access<P> & Readonly<{
        execution: AgentExecutionId;
    }>): Reply<ExecutionSnapshot>;
    inputs(input: Access<P> & Readonly<{
        execution: AgentExecutionId;
        watermark: Evidence;
    }>): Reply<Readonly<{
        batch: InputBatch;
        messages: readonly Message[];
    }>>;
    readReplyAdmissions(input: Access<P> & Readonly<{
        execution: AgentExecutionId;
        through: Evidence;
        after: string | null;
        limit: number;
    }>): Reply<ReplyAdmissionPage>;
    query(input: ExecutionMutation<P>): ReturnType<AgentExecutionRecovery<P>['query']>;
    readonly output: Pick<AgentExecutionEvents<P>, 'read' | 'events'>;
}
```

### `AgentJournalRecording`

```ts
interface AgentJournalRecording<P> {
    commit(input: JournalCommit<P>): Reply<CommandReceipt>;
    submit(input: Parameters<AgentExecutionInput<P>['submit']>[0]): Reply<CommandReceipt>;
    control(input: Parameters<AgentExecutionControl<P>['control']>[0]): Reply<CommandReceipt>;
    acknowledge(input: Parameters<AgentExecutionEvents<P>['acknowledge']>[0]): Reply<CommandReceipt>;
    recordResult(input: ExecutionMutation<P> & Readonly<{
        result: ProducedResult;
        consumption: ConsumptionId;
        transfer: Extract<CallerCommit, {
            kind: 'custody' | 'processed';
        }> | Readonly<{
            kind: 'none';
        }>;
        release: Readonly<{
            kind: 'pending';
        }> | Readonly<{
            kind: 'confirmed';
            receipt: Evidence;
        }>;
    }>): Reply<CommandReceipt>;
    recordControl(input: ExecutionMutation<P> & Readonly<{
        target: AgentOperationId;
        stage: Exclude<ControlStage, 'accepted'>;
        state: 'reached' | 'unresolved';
        source: Evidence;
    }>): Reply<CommandReceipt>;
}
```

### `AgentMaterials`

```ts
interface AgentMaterials<P, B extends ContentBlock> {
    preserve(input: Access<P> & Readonly<{
        identity: string;
        consumer: ConsumerRef;
        value: Material<B>;
    }>): Reply<Evidence>;
    read(input: Access<P> & Readonly<{
        source: Evidence;
    }>): Reply<Material<B>>;
}
```

### `AgentObservation`

```ts
type AgentObservation = Readonly<{
    kind: 'state';
    value: AgentState;
}> | Readonly<{
    kind: 'ended';
    reason: 'closed' | 'denied' | 'retired' | 'unavailable';
}>;
```

### `AgentOperationId`

```ts
type AgentOperationId = AgentIdentity<'AgentOperationId'>;
```

### `AgentRegistrationHandle`

```ts
interface AgentRegistrationHandle<P> {
    readonly instance: AgentInstanceId;
    report(input: Readonly<{
        state: AgentState;
    }>): void;
    withdraw(input: Access<P> & Readonly<{
        operation: AgentOperationId;
        reason: Evidence;
    }>): Reply<Registration | null>;
}
```

### `AgentRegistrationId`

```ts
type AgentRegistrationId = AgentIdentity<'AgentRegistrationId'>;
```

### `AgentRuntime`

```ts
interface AgentRuntime<P> {
    readonly instance: AgentInstanceId;
    invoke(input: ExecutionMutation<P> & Readonly<{
        initial: AcceptedInput;
        grant: Evidence | null;
    }>): Reply<AgentExecutionHandle<P>>;
    resume(input: ExecutionMutation<P> & Readonly<{
        recovery: Evidence;
        grant: Evidence | null;
    }>): Reply<AgentExecutionHandle<P>>;
}
```

### `AgentRuntimeControl`

```ts
interface AgentRuntimeControl<P> {
    quiesce(input: Access<P> & Readonly<{
        operation: AgentOperationId;
        reason: Evidence;
    }>): Reply<QuiesceResult>;
}
```

### `AgentState`

```ts
type AgentState = Readonly<{
    kind: 'idle';
    instance: AgentInstanceId;
}> | Readonly<{
    kind: 'occupied';
    instance: AgentInstanceId;
    execution: AgentExecutionId;
    executionAttachment: ExecutionAttachmentId;
}> | Readonly<{
    kind: 'draining';
    instance: AgentInstanceId;
    unresolved: readonly AgentExecutionId[];
}> | Readonly<{
    kind: 'disposed';
    instance: AgentInstanceId;
}>;
```

### `AssetReference`

```ts
type AssetReference = {
    readonly capability: CapabilityRef;
    readonly resident?: boolean;
};
```

### `AttributeDeclaration`

```ts
type AttributeDeclaration = {
    readonly item: AttributeItem;
};
```

### `AttributeItem`

```ts
type AttributeItem = (typeof ATTRIBUTE_ITEMS)[number];
```

### `Authority`

```ts
type Authority = Readonly<{
    execution: AgentExecutionId;
    executionAttachment: ExecutionAttachmentId;
    instance: AgentInstanceId;
    generation: string;
    source: Evidence;
}>;
```

### `BatchJudgment`

```ts
type BatchJudgment<T> = {
    readonly kind: 'accepted';
    readonly value: readonly T[];
} | {
    readonly kind: 'refused';
    readonly reason: RefusalReason;
    readonly index: number;
};
```

### `CallerCommit`

```ts
type CallerCommit = Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'message';
    message: Message;
    source: Evidence;
    admission: Evidence;
}> | Readonly<{
    kind: 'context-transition';
    value: PreparedContextTransition;
    admission: Evidence;
}> | Readonly<{
    kind: 'custody';
    result: ProducedResult;
    consumption: ConsumptionId;
    retained: Evidence;
}> | Readonly<{
    kind: 'processed';
    result: ProducedResult;
    consumption: ConsumptionId;
    completion: Evidence;
}>;
```

### `CapabilityRef`

```ts
type CapabilityRef = {
    readonly category: string;
    readonly name: string;
};
```

### `CapturedRead`

```ts
type CapturedRead = Readonly<{
    schema: Adoption;
    value: JsonValue;
    source: Evidence;
}>;
```

### `CardAnswer`

```ts
type CardAnswer = Readonly<{
    kind: 'chosen';
    option: string;
    value: JsonValue | null;
    evidence: Evidence;
}> | Readonly<{
    kind: 'declined';
    evidence: Evidence;
}>;
```

### `CardOption`

```ts
type CardOption = Readonly<{
    id: string;
    label: string;
    effect?: JsonValue;
}>;
```

### `CardReply`

```ts
type CardReply = CardAnswer | Readonly<{
    kind: 'pending';
}> | Readonly<{
    kind: 'invalidated';
    evidence: Evidence;
}>;
```

### `CardRequest`

```ts
type CardRequest = Readonly<{
    identity: string;
    schema: Adoption;
    value: JsonValue;
}>;
```

### `CardRound`

```ts
type CardRound = Readonly<{
    round: CardRoundId;
    ask: Conclusion & Readonly<{
        output: Extract<ExtensionOutput, {
            kind: 'ask';
        }>;
    }>;
    requests: readonly CardRequest[];
    progress: CardRoundProgress;
}>;
```

### `CardRoundId`

```ts
type CardRoundId = AgentIdentity<'AgentCardRoundId'>;
```

### `CardRoundProgress`

```ts
type CardRoundProgress = Readonly<{
    kind: 'requested';
}> | Readonly<{
    kind: 'presented';
    cards: readonly PassageCard[];
}> | Readonly<{
    kind: 'answered';
    cards: readonly PassageCard[];
}> | Readonly<{
    kind: 'processed';
    cards: readonly PassageCard[];
    conclusion: Evidence;
}> | Readonly<{
    kind: 'present-failed';
    failure: Evidence;
}>;
```

### `CommandReceipt`

```ts
type CommandReceipt = Readonly<{
    operation: AgentOperationId;
    execution: AgentExecutionId;
    revision: ExecutionRevision;
    evidence: Evidence;
    state: 'accepted' | 'applied' | 'unresolved';
}>;
```

### `CompactionAdvance`

```ts
type CompactionAdvance = Readonly<{
    kind: 'continue';
    progress: CompactionProgress;
    stepRequest: Extract<Preparation, {
        kind: 'ready';
    }>;
}> | Readonly<{
    kind: 'transition';
    progress: CompactionProgress;
    value: PreparedContextTransition;
}> | Readonly<{
    kind: 'cannot-fit';
    progress: CompactionProgress;
    reason: 'after-compaction';
    diagnostic: string;
}>;
```

### `CompactionProgress`

```ts
type CompactionProgress = Readonly<{
    plan: Evidence;
    bound: string;
    completed: string;
}>;
```

### `CompactionState`

```ts
type CompactionState = Readonly<{
    action: ActionId;
    progress: CompactionProgress;
    initiated: string;
    stepRequest: Extract<Preparation, {
        kind: 'ready';
    }> | null;
    ended: 'committed' | 'failed' | null;
}>;
```

### `Conclusion`

```ts
type Conclusion = ActionIdentity & Readonly<{
    passage: PassageId;
    extension: string;
    implementation: Adoption;
    power: Power;
    at: AgentInstant;
}> & (Readonly<{
    output: ExtensionOutput;
    skipped?: never;
    error?: never;
    unavailability?: never;
}> | Readonly<{
    skipped: 'unavailable';
    unavailability: UnavailabilityPolicy | 'fallback';
    output?: never;
    error?: never;
}> | Readonly<{
    skipped: 'errored';
    error: string;
    output: Extract<ExtensionOutput, {
        kind: 'observed' | 'veto';
    }>;
    unavailability?: never;
}>);
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

### `ConsumptionId`

```ts
type ConsumptionId = AgentIdentity<'AgentConsumptionId'>;
```

### `ContextContent`

```ts
type ContextContent = 'full' | 'incremental';
```

### `Continuation`

```ts
type Continuation = Readonly<{
    position: string;
    definition: Adoption;
    schema: Adoption;
    value: JsonValue;
}>;
```

### `ControlRecord`

```ts
type ControlRecord = Readonly<{
    operation: AgentOperationId;
    command: ExecutionControl;
    stages: Readonly<{
        accepted: ControlStageFact;
    } & Partial<Record<Exclude<ControlStage, 'accepted'>, ControlStageFact>>>;
}>;
```

### `ControlStage`

```ts
type ControlStage = 'accepted' | 'intent-established' | 'qualification-revoked' | 'producer-confirmed' | 'physically-stopped' | 'duty-released';
```

### `ControlStageFact`

```ts
type ControlStageFact = Readonly<{
    state: 'reached' | 'unresolved';
    source: Evidence;
}>;
```

### `CurrentConditions`

```ts
interface CurrentConditions<P> {
    read(input: Access<P> & Readonly<{
        advance: Authority;
        previous: Evidence | null;
    }>): Reply<RuntimeConditions>;
}
```

### `DecisionCardDraft`

```ts
type DecisionCardDraft = Readonly<{
    explanation: string;
    options: readonly [
        CardOption,
        ...CardOption[]
    ];
    about: Readonly<{
        position: Position;
        action?: ActionId;
    }>;
    proposedRewrite?: Readonly<{
        option: CardOption['id'];
        effectiveArguments: string;
    }>;
}>;
```

### `DecisionCards`

```ts
interface DecisionCards<P> {
    present(input: Access<P> & Readonly<{
        advance: Authority;
        passage: PassageId;
        round: CardRoundId;
        original: Evidence;
        requests: readonly CardRequest[];
    }>): Reply<readonly Evidence[]>;
    lookup(input: Access<P> & Readonly<{
        passage: PassageId;
        round: CardRoundId;
        original: Evidence;
        requests: readonly string[];
    }>): Reply<Readonly<{
        kind: 'presented';
        cards: readonly Evidence[];
    }> | Readonly<{
        kind: 'not-presented';
        exclusion: Evidence;
    }> | Readonly<{
        kind: 'unknown';
    }>>;
    read(input: Access<P> & Readonly<{
        card: Evidence;
    }>): Reply<CardReply>;
    invalidate(input: Access<P> & Readonly<{
        operation: AgentOperationId;
        passage: PassageId;
        round: CardRoundId;
        cards: readonly Evidence[];
        reason: Evidence;
    }>): Reply<readonly Readonly<{
        card: Evidence;
        reply: Exclude<CardReply, {
            kind: 'pending';
        }>;
    }>[]>;
}
```

### `Dimension`

```ts
type Dimension = Readonly<{
    ending: 'complete_reply' | 'failure';
}> | Readonly<{
    scope: 'each' | 'batch';
}>;
```

### `EffectIntent`

```ts
type EffectIntent = Readonly<{
    action: ActionId;
    pending: PendingCall;
    authority: Authority;
}>;
```

### `ErrorPolicy`

```ts
type ErrorPolicy = 'ignore' | 'record' | 'treat_as_veto';
```

### `EventPage`

```ts
type EventPage = Readonly<{
    kind: 'page';
    events: readonly AgentEvent[];
    next: string;
    caughtUp: boolean;
}> | Readonly<{
    kind: 'gap';
    retainedFrom: string;
    recovery: Evidence;
}>;
```

### `Evidence`

```ts
type Evidence = Readonly<{
    owner: string;
    record: string;
    revision: string;
    digest: string;
}>;
```

### `ExecutionAttachmentId`

```ts
type ExecutionAttachmentId = AgentIdentity<'ExecutionAttachmentId'>;
```

### `ExecutionControl`

```ts
type ExecutionControl = Readonly<{
    kind: 'interrupt-model';
    call: M.ModelCallId;
    reason: Evidence;
}> | Readonly<{
    kind: 'interrupt-tool' | 'background-tool';
    call: T.ToolCallId;
    reason: Evidence;
}> | Readonly<{
    kind: 'cancel';
    reason: Evidence;
}> | Readonly<{
    kind: 'suspend';
    reason: Evidence;
}>;
```

### `ExecutionMutation`

```ts
type ExecutionMutation<P> = Access<P> & Readonly<{
    execution: AgentExecutionId;
    operation: AgentOperationId;
}>;
```

### `ExecutionRevision`

```ts
type ExecutionRevision = AgentIdentity<'ExecutionRevision'>;
```

### `ExecutionSnapshot`

```ts
type ExecutionSnapshot = Readonly<{
    execution: AgentExecutionId;
    revision: ExecutionRevision;
    state: ExecutionState;
    checkpoint: AgentCheckpoint;
    inputWatermark: Evidence;
    history: Evidence;
    replyAdmissions: ReplyAdmissionProjection;
    executionAttachment: Authority | null;
    unresolved: readonly AgentOperationId[];
    controls: readonly ControlRecord[];
    results: readonly ResultResponsibility[];
    effects: readonly EffectIntent[];
    terminalObservations: readonly TerminalObservation[];
    output: Readonly<{
        emittedThrough: string | null;
        acknowledgedThrough: string | null;
    }>;
}>;
```

### `ExecutionState`

```ts
type ExecutionState = Readonly<{
    kind: 'reconciling' | 'advancing';
}> | Readonly<{
    kind: 'waiting';
    waits: readonly Waiting[];
}> | Readonly<{
    kind: 'settling';
    intent: FinishIntent;
}> | Readonly<{
    kind: 'suspended';
    handoff: Evidence;
}> | Readonly<{
    kind: 'ended';
    conclusion: AgentConclusion;
    disposition: Evidence;
}>;
```

### `ExtensionImplementationDeclaration`

```ts
type ExtensionImplementationDeclaration = Readonly<{
    kind: 'builtin';
    builtinName: string;
}> | Readonly<{
    kind: 'command';
    host: 'claude_code' | 'codex';
    dialect: string;
    event: string;
    command: string;
    matcher?: string;
    timeout?: string;
}>;
```

### `ExtensionImplementations`

```ts
interface ExtensionImplementations<P> {
    resolve(input: Access<P> & Readonly<{
        passage: Passage;
    }>): Reply<LoopExtensionImplementation>;
}
```

### `ExtensionInput`

```ts
type ExtensionInput = Readonly<{
    position: Position;
    dimension?: Dimension;
    subject: Subject;
    earlier: readonly Conclusion[];
    execution: AgentExecutionId;
    passage: PassageId;
}>;
```

### `ExtensionInvocationMode`

```ts
type ExtensionInvocationMode = Readonly<{
    kind: 'fresh';
}> | Readonly<{
    kind: 'replay';
    binding: ExtensionReplayBinding;
}>;
```

### `ExtensionInvocationResult`

```ts
type ExtensionInvocationResult = Readonly<{
    kind: 'output';
    value: unknown;
}> | Readonly<{
    kind: 'errored';
    error: string;
    classification?: 'ordinary' | 'nonzero_exit' | 'timeout' | 'bad_output';
}> | Readonly<{
    kind: 'notStartedUnavailable';
}> | Readonly<{
    kind: 'replayInconsistent';
}> | Readonly<{
    kind: 'controlUnavailable';
}>;
```

### `ExtensionOutput`

```ts
type ExtensionOutput = Readonly<{
    kind: 'observed';
}> | Readonly<{
    kind: 'inject';
    message: Message & Readonly<{
        role: 'system_reminder';
    }>;
}> | Readonly<{
    kind: 'rewrite';
    subject: Subject;
}> | Readonly<{
    kind: 'select_model';
    route: string;
    reason?: string;
}> | Readonly<{
    kind: 'veto';
    reason: string;
}> | Readonly<{
    kind: 'stop';
    terminal?: 'cancelled' | 'failed';
    reason: string;
}> | Readonly<{
    kind: 'retry';
    plan: Readonly<{
        supplier: M.Supplier;
        notBefore: AgentInstant | null;
        basis: Adoption;
    }>;
}> | Readonly<{
    kind: 'ask';
    card: DecisionCardDraft;
}>;
```

### `ExtensionOutputJudgeInput`

```ts
type ExtensionOutputJudgeInput = Readonly<{
    position: Position;
    dimension: Dimension | null;
    purpose: 'main' | 'compaction' | null;
    power: Power;
    trigger: 'first-content' | 'final' | null;
    subject: Subject;
    output: unknown;
}>;
```

### `ExtensionReplayBinding`

```ts
type ExtensionReplayBinding = Readonly<{
    passage: PassageId;
    rounds: readonly Readonly<{
        round: CardRoundId;
        cards: readonly Readonly<{
            identity: string;
            card: Evidence;
            response: Readonly<{
                evidence: Evidence;
                answer: CardAnswer;
            }> | null;
        }>[];
    }>[];
    control: 'valid' | 'replayInconsistent' | 'unavailable';
}>;
```

### `Failure`

```ts
type Failure = Readonly<{
    kind: 'denied';
    action: string;
}> | Readonly<{
    kind: 'invalid';
    field: string;
    reason: string;
}> | Readonly<{
    kind: 'unavailable';
    owner: string;
    diagnostic: string;
}> | Readonly<{
    kind: 'stale-advance' | 'not-ready' | 'terminal' | 'busy' | 'changed' | 'unsupported';
}> | Readonly<{
    kind: 'commit-unknown';
    operation: AgentOperationId;
}> | Readonly<{
    kind: 'conflict';
    operation: AgentOperationId;
}>;
```

### `FailureCandidate`

```ts
type FailureCandidate = Readonly<{
    step: StepId | null;
    at: AgentInstant;
    source: Evidence;
}> & (Readonly<{
    kind: 'cannot-fit';
    reason: 'fixed' | 'after-compaction';
    context: Evidence;
    veto?: Evidence;
    rejection?: Evidence;
    plan?: CompactionProgress;
}> | Readonly<{
    kind: 'compaction-invalid';
    plan: Evidence;
    progress?: Readonly<{
        expected: CompactionProgress;
        returned: CompactionProgress;
    }>;
    transition?: Evidence;
}> | Readonly<{
    kind: 'request-rejected';
    failure: Extract<Failure, {
        kind: 'invalid';
    }>;
    model: Evidence;
    selection: Evidence;
}> | Readonly<{
    kind: 'no-reply';
    call: M.ModelCallId;
    result: ProducedResult;
}> | Readonly<{
    kind: 'message-rejected';
    from: MessageSource;
    evidence: Evidence;
}> | Readonly<{
    kind: 'extension-stop';
    passage: PassageId;
    reason: string;
}> | Readonly<{
    kind: 'guard';
    level: 3;
    basis: Evidence;
}>);
```

### `FinalRequest`

```ts
type FinalRequest = Readonly<{
    preparation: ActionId;
    request: M.FixedModelRequest;
    capacity: M.ResultCapacity;
    recipient: ModelRecipient;
    coverage: Evidence;
    alterations: readonly Evidence[];
}>;
```

### `FinishAuthorization`

```ts
type FinishAuthorization = Readonly<{
    kind: 'advancement';
    authority: Authority;
}> | Readonly<{
    kind: 'cancel';
    control: AgentOperationId;
    source: Evidence;
}>;
```

### `FinishIntent`

```ts
type FinishIntent = Readonly<{
    conclusion: AgentConclusion;
    inputWatermark: Evidence;
    obligations: Evidence;
    beforeTerminal: Evidence | null;
    failure: FailureCandidate | null;
}>;
```

### `FinishResult`

```ts
type FinishResult = Readonly<{
    kind: 'ended';
    receipt: CommandReceipt;
}> | Readonly<{
    kind: 'changed';
    revision: ExecutionRevision;
}> | Readonly<{
    kind: 'blocked';
    reason: 'inputs' | 'controls' | 'operations' | 'passages' | 'custody';
    source: Evidence;
}>;
```

### `GuardFact`

```ts
type GuardFact = Readonly<{
    level: GuardLevel;
    policy: Adoption;
    through: Evidence;
    basis: Evidence;
    passage: PassageId;
    at: AgentInstant;
}>;
```

### `GuardLevel`

```ts
type GuardLevel = 0 | 1 | 2 | 3;
```

### `HandoffResult`

```ts
type HandoffResult = Readonly<{
    kind: 'accepted';
    admission: Evidence;
}> | Readonly<{
    kind: 'rejected';
    reason: string;
    evidence: Evidence;
}>;
```

### `IdentityFailure`

```ts
type IdentityFailure<K extends string = string> = Readonly<{
    field: K;
    reason: 'type' | 'empty' | 'length' | 'character';
}>;
```

### `InputBatch`

```ts
type InputBatch = Readonly<{
    id: InputBatchId;
    watermark: Evidence;
    ordered: readonly InputId[];
}>;
```

### `InputBatchId`

```ts
type InputBatchId = AgentIdentity<'AgentInputBatchId'>;
```

### `InputId`

```ts
type InputId = AgentIdentity<'AgentInputId'>;
```

### `JournalCapabilities`

```ts
type JournalCapabilities = Readonly<{
    participants: ReadonlySet<Exclude<CallerCommit['kind'], 'none'>>;
}>;
```

### `JournalCommit`

```ts
type JournalCommit<P> = ExecutionMutation<P> & Readonly<{
    authority: Authority;
    expected: ExecutionRevision;
    checkpoint: AgentCheckpoint;
    state: Exclude<ExecutionState, {
        kind: 'ended';
    }>;
    events: readonly Exclude<AgentEventBody, {
        kind: 'ended';
    }>[];
    effects: readonly EffectIntent[];
    caller: CallerCommit;
    replyAdmission: ModelReplyAdmission | null;
}>;
```

### `Judgment`

```ts
type Judgment<T, Reason extends string = RefusalReason> = {
    readonly kind: 'accepted';
    readonly value: T;
} | {
    readonly kind: 'refused';
    readonly reason: Reason;
};
```

### `LoopExtensionDeclaration`

```ts
type LoopExtensionDeclaration = Readonly<{
    name: string;
    position: Position;
    dimension?: Dimension;
    power: Power;
    needs?: readonly [
        string,
        ...string[]
    ];
    implementation: ExtensionImplementationDeclaration;
    onError?: ErrorPolicy;
    unavailability?: UnavailabilityPolicy;
}>;
```

### `LoopExtensionImplementation`

```ts
interface LoopExtensionImplementation {
    readonly implementation: Adoption;
    invoke(input: ExtensionInput, signal: AbortSignal, mode: ExtensionInvocationMode): Promise<ExtensionInvocationResult>;
}
```

### `LoopFacts`

```ts
type LoopFacts = Readonly<{
    advancement: AdvancementFact;
    checkpoint: AgentCheckpoint;
    conditions: RuntimeConditions;
    batch: InputBatch;
    inputs: readonly Message[];
    producers: readonly ProducerDecisionView[];
    consumption: readonly ResultResponsibility[];
    replyAdmissions: ReplyAdmissionProjection;
    controls: readonly ControlRecord[];
}>;
```

### `Material`

```ts
type Material<B extends ContentBlock> = Readonly<{
    kind: 'model';
    result: ProducedResult;
    pages: readonly M.ResultPage[];
}> | Readonly<{
    kind: 'tool';
    result: ProducedResult;
    pages: readonly T.ResultPage<B>[];
}> | Readonly<{
    kind: 'facts';
    schema: Adoption;
    value: JsonValue;
}>;
```

### `MessageHandoff`

```ts
interface MessageHandoff<P> {
    accept(input: Access<P> & Readonly<{
        execution: AgentExecutionId;
        operation: AgentOperationId;
        advance: Authority | null;
        source: MessageSource;
        candidate: Message;
    }>): Reply<HandoffResult>;
}
```

### `MessageSource`

```ts
type MessageSource = Readonly<{
    kind: 'external-input';
    input: InputId;
}> | Readonly<{
    kind: 'model-reply';
    step: StepId;
    action: ActionId;
    call: M.ModelCallId;
    result: ProducedResult;
}> | Readonly<{
    kind: 'tool-result';
    action: ActionId;
    call: T.ToolCallId;
    result: ProducedResult;
}> | Readonly<{
    kind: 'action-denied';
    action: ActionId;
    evidence: Evidence;
}> | Readonly<{
    kind: 'reminder';
    passage: PassageId;
}> | Readonly<{
    kind: 'context-transition';
    transition: PreparedContextTransition;
}>;
```

### `ModelContextRead`

```ts
type ModelContextRead = Readonly<{
    recipient: ModelRecipient;
    content: ContextContent;
    source: Evidence;
    coverage: Evidence;
}>;
```

### `ModelContextReader`

```ts
interface ModelContextReader<P> {
    read(input: Access<P> & Readonly<{
        advance: Authority;
        position: ConsumerRef;
        recipient: ModelRecipient;
        history: Evidence;
        adopted: Evidence | null;
        transition: Evidence | null;
    }>): Reply<ModelContextRead>;
}
```

### `ModelPurpose`

```ts
type ModelPurpose = 'main' | 'compaction' | 'extension';
```

### `ModelRecipient`

```ts
type ModelRecipient = Readonly<{
    route: string;
    profile: Adoption;
}>;
```

### `ModelReplyAdmission`

```ts
type ModelReplyAdmission = Readonly<{
    step: StepId;
    action: ActionId;
    call: M.ModelCallId;
    resultVersion: string;
    decision: 'admitted' | 'rejected';
    source: Evidence;
}>;
```

### `ModelSelection`

```ts
interface ModelSelection<P> {
    select(input: Access<P> & Readonly<{
        advance: Authority;
        scope: Evidence;
        purpose: ModelPurpose;
        position: ConsumerRef;
        history: Evidence;
        conditions: RuntimeConditions;
        alterations: readonly Evidence[];
    }>): Reply<SelectedModel>;
}
```

### `Next`

```ts
type Next = Readonly<{
    kind: 'reconcile';
    calls: readonly PendingCall[];
}> | Readonly<{
    kind: 'take-inputs';
    position: string;
}> | Readonly<{
    kind: 'prepare-request';
    step: StepId;
    previous: Preparation | null;
}> | Readonly<{
    kind: 'compact-derive';
    original: Extract<Preparation, {
        kind: 'needs-compaction';
    }>;
    progress: CompactionProgress;
    result: Readonly<{
        produced: ProducedResult;
        consumed: Evidence;
    }> | null;
}> | Readonly<{
    kind: 'commit-transition';
    value: PreparedContextTransition;
}> | Readonly<{
    kind: 'resume-request';
    original: Extract<Preparation, {
        kind: 'needs-compaction';
    }>;
    transition: Evidence;
}> | Readonly<{
    kind: 'extension';
    passage: PassageId;
}> | Readonly<{
    kind: 'admit-model';
    preparation: Extract<Preparation, {
        kind: 'ready';
    }>;
}> | Readonly<{
    kind: 'admit-message';
    source: MessageSource;
    candidate: Message;
}> | Readonly<{
    kind: 'admit-tools';
    batch: ActionBatch;
}> | Readonly<{
    kind: 'consume';
    consumption: ConsumptionId;
    result: ProducedResult;
}> | Readonly<{
    kind: 'wait';
    waiting: readonly Waiting[];
}> | Readonly<{
    kind: 'try-finish';
    conclusion: AgentConclusion;
    failure: FailureCandidate | null;
}> | Readonly<{
    kind: 'stop';
    reason: 'cancelled' | 'terminal' | 'superseded' | 'suspended';
}>;
```

### `OutputRefusalReason`

```ts
type OutputRefusalReason = 'malformed' | 'position_unknown' | 'power_unknown' | 'dimension_missing' | 'dimension_not_allowed' | 'output_not_allowed_for_power' | 'output_not_allowed_at_position' | 'ask_at_forbidden_position' | 'rewrite_touches_immutable' | 'inject_source_mismatch';
```

### `POSITIONS`

```ts
const POSITIONS: readonly [
    'execution_started',
    'before_compaction',
    'after_compaction',
    'before_model_call',
    'after_model_call',
    'before_action',
    'after_action',
    'before_terminal',
    'after_terminal'
];
```

### `POSITION_OUTPUTS`

```ts
const POSITION_OUTPUTS: Readonly<Record<PositionOutputKey, PositionOutputs>>;
```

### `POWERS`

```ts
const POWERS: readonly [
    'observe',
    'rewrite',
    'veto'
];
```

### `Passage`

```ts
type Passage = Readonly<{
    id: PassageId;
    position: Position;
    dimension: Dimension | null;
    purpose: 'main' | 'compaction' | null;
    action: ActionId | null;
    ordinal: number;
    declaration: LoopExtensionDeclaration;
    implementation: Adoption;
    input: Evidence;
    effective: Evidence;
    operations: readonly PassageOperation[];
    progress: PassageProgress;
}>;
```

### `PassageCard`

```ts
type PassageCard = Readonly<{
    identity: string;
    card: Evidence;
    response: Exclude<CardReply, {
        kind: 'pending';
    }> | null;
    processed: Evidence | null;
}>;
```

### `PassageId`

```ts
type PassageId = AgentIdentity<'AgentPassageId'>;
```

### `PassageOperation`

```ts
type PassageOperation = Readonly<{
    action: ActionId;
    ordinal: number;
    input: Evidence;
}> & (Readonly<{
    kind: 'producer';
    pending: Extract<PendingCall, {
        kind: 'model';
    }>;
    progress: PassageOperationProgress<Readonly<{
        result: ProducedResult;
        consumed: Evidence;
    }>>;
}> | Readonly<{
    kind: 'read';
    owner: string;
    protocol: Adoption;
    query: JsonValue;
    progress: PassageOperationProgress<CapturedRead>;
}> | Readonly<{
    kind: 'guard';
    progress: PassageOperationProgress<GuardFact>;
}>);
```

### `PassageOperationProgress`

```ts
type PassageOperationProgress<R> = Readonly<{
    kind: 'requested';
}> | Readonly<{
    kind: 'resolved';
    result: R;
}> | Readonly<{
    kind: 'applied';
    result: R;
    transition: Evidence;
}>;
```

### `PassageProgress`

```ts
type PassageProgress = Readonly<{
    kind: 'requested';
    mode: ExtensionInvocationMode;
}> | Readonly<{
    kind: 'asked';
    rounds: readonly [
        CardRound,
        ...CardRound[]
    ];
}> | Readonly<{
    kind: 'resolved';
    rounds: readonly CardRound[];
    conclusion: Conclusion;
}> | Readonly<{
    kind: 'applied';
    rounds: readonly CardRound[];
    conclusion: Conclusion;
    transition: Evidence;
}>;
```

### `PendingCall`

```ts
type PendingCall = Readonly<{
    action: ActionId;
    consumption: ConsumptionId;
    position: ConsumerRef;
    fixed: Evidence;
}> & (Readonly<{
    kind: 'model';
    reference: M.ModelInvocationRef;
    purpose: ModelPurpose;
}> | Readonly<{
    kind: 'tool';
    call: T.ToolCallId;
    admission: T.ToolOperationId;
    purpose: 'action';
}>);
```

### `Position`

```ts
type Position = (typeof POSITIONS)[number];
```

### `PositionOutputKey`

```ts
type PositionOutputKey = Exclude<Position, SplitPosition> | `before_model_call/${NonNullable<ExtensionOutputJudgeInput['purpose']>}` | `after_model_call/${Ending}` | `after_action/${Scope}`;
```

### `PositionOutputs`

```ts
type PositionOutputs = Readonly<{
    allowed: readonly OutputKind[];
    rewritable: readonly (readonly string[])[];
}>;
```

### `Power`

```ts
type Power = (typeof POWERS)[number];
```

### `Preparation`

```ts
type Preparation = Readonly<{
    id: ActionId;
    purpose: ModelPurpose;
    position: ConsumerRef;
    source: Evidence;
    state: JsonValue;
    schema: Adoption;
}> & (Readonly<{
    kind: 'assembled';
    input: M.AssembledModelInput;
    budget: Evidence;
    recipient: ModelRecipient;
    coverage: Evidence;
}> | Readonly<{
    kind: 'ready';
    request: M.FixedModelRequest;
    capacity: M.ResultCapacity;
    budget: Evidence;
    recipient: ModelRecipient;
    coverage: Evidence;
}> | Readonly<{
    kind: 'needs-compaction';
    original: Readonly<{
        input: Evidence;
        alterations: readonly Evidence[];
        beforeModelCall: readonly PassageId[] | null;
    }>;
    progress: CompactionProgress;
}> | Readonly<{
    kind: 'cannot-fit';
    reason: 'fixed' | 'after-compaction';
    diagnostic: string;
}>);
```

### `PreparedContextTransition`

```ts
type PreparedContextTransition = Readonly<{
    preparation: ActionId;
    message: Message;
    source: Evidence;
    derivation: Evidence;
    commitment: Evidence;
}>;
```

### `ProducedResult`

```ts
type ProducedResult = Readonly<{
    producer: Readonly<{
        kind: 'model';
        call: M.ModelCallId;
    }> | Readonly<{
        kind: 'tool';
        call: T.ToolCallId;
    }>;
    version: string;
    delivery: string | null;
    source: Evidence;
}>;
```

### `ProducerDecisionView`

```ts
type ProducerDecisionView = Readonly<{
    kind: 'unresolved';
    pending: PendingCall;
    source: Evidence;
}> | Readonly<{
    kind: 'model-active';
    pending: Extract<PendingCall, {
        kind: 'model';
    }>;
    source: Evidence;
}> | Readonly<{
    kind: 'model-settled';
    pending: Extract<PendingCall, {
        kind: 'model';
    }>;
    result: ProducedResult;
    source: Evidence;
}> | Readonly<{
    kind: 'tool-active';
    pending: Extract<PendingCall, {
        kind: 'tool';
    }>;
    source: Evidence;
    waiting: 'none' | 'external' | 'human';
    supportedControls: readonly ('interrupt' | 'background')[];
}> | Readonly<{
    kind: 'tool-result';
    pending: Extract<PendingCall, {
        kind: 'tool';
    }>;
    result: ProducedResult;
    source: Evidence;
}> | Readonly<{
    kind: 'tool-background';
    pending: Extract<PendingCall, {
        kind: 'tool';
    }>;
    placeholder: ProducedResult;
    confirmation: Evidence;
    source: Evidence;
}>;
```

### `ProgressionDirective`

```ts
type ProgressionDirective = Readonly<{
    kind: 'evaluate-completion';
    basis: Evidence;
}> | Readonly<{
    kind: 'continue';
    basis: Evidence;
}>;
```

### `QuiesceResult`

```ts
type QuiesceResult = Readonly<{
    kind: 'drained' | 'unresolved';
    remaining: readonly AgentExecutionId[];
    evidence: Evidence;
}>;
```

### `RefusalReason`

```ts
type RefusalReason = 'malformed' | 'duplicate-capability' | 'unknown-attribute' | 'unknown-position' | 'unknown-power' | 'dimension-missing' | 'dimension-not-allowed' | 'power-above-ceiling' | 'needs-not-allowed' | 'implementation-missing' | 'error-policy-not-allowed' | 'unavailability-not-allowed' | 'executable' | 'checker-failed';
```

### `RegisteredReads`

```ts
interface RegisteredReads<P> {
    read(input: Access<P> & Readonly<{
        action: ActionId;
        passage: PassageId;
        original: Evidence;
        owner: string;
        protocol: Adoption;
        query: JsonValue;
    }>): Reply<Readonly<{
        kind: 'captured';
        value: CapturedRead;
    }> | Readonly<{
        kind: 'unknown';
    }>>;
    lookup(input: Access<P> & Readonly<{
        action: ActionId;
        passage: PassageId;
        original: Evidence;
    }>): Reply<Readonly<{
        kind: 'captured';
        value: CapturedRead;
    }> | Readonly<{
        kind: 'excluded';
        evidence: Evidence;
    }> | Readonly<{
        kind: 'unknown';
    }>>;
}
```

### `Registration`

```ts
type Registration = Readonly<{
    registration: AgentRegistrationId;
    state: RegistrationState;
}>;
```

### `RegistrationState`

```ts
type RegistrationState = 'published' | 'withdrawing' | 'withdrawn';
```

### `Reply`

```ts
type Reply<A> = Promise<Outcome<A, Failure>>;
```

### `ReplyAdmissionPage`

```ts
type ReplyAdmissionPage = Readonly<{
    kind: 'page';
    through: Evidence;
    items: readonly Readonly<{
        sequence: string;
        fact: ModelReplyAdmission;
    }>[];
    next: string | null;
    complete: boolean;
}> | Readonly<{
    kind: 'gap';
    recovery: Evidence;
}>;
```

### `ReplyAdmissionProjection`

```ts
type ReplyAdmissionProjection = Readonly<{
    through: Evidence;
    rule: Adoption;
    lastAdmission: Evidence | null;
    consecutiveDenials: string;
    totalDenials: string;
}>;
```

### `RequestPreparation`

```ts
interface RequestPreparation<P> {
    prepare(input: Access<P> & Readonly<{
        advance: Authority;
        action: ActionId;
        purpose: Exclude<ModelPurpose, 'compaction'>;
        position: ConsumerRef;
        history: Evidence;
        inputs: InputBatch;
        conditions: RuntimeConditions;
        selection: SelectedModel;
        context: ModelContextRead;
        previous: Preparation | null;
        alterations: readonly Evidence[];
        beforeModelCall: readonly PassageId[] | null;
    }>): Reply<Preparation>;
    derive(input: Access<P> & Readonly<{
        advance: Authority;
        original: Extract<Preparation, {
            kind: 'needs-compaction';
        }>;
        progress: CompactionProgress;
        action: ActionId;
        selection: SelectedModel;
        result: Readonly<{
            produced: ProducedResult;
            consumed: Evidence;
        }> | null;
    }>): Reply<CompactionAdvance>;
    resume(input: Access<P> & Readonly<{
        advance: Authority;
        original: Extract<Preparation, {
            kind: 'needs-compaction';
        }>;
        transition: Evidence;
        selection: SelectedModel;
        context: ModelContextRead;
    }>): Reply<Preparation>;
}
```

### `ResultResponsibility`

```ts
type ResultResponsibility = Readonly<{
    result: ProducedResult;
    consumption: ConsumptionId;
    custody: Evidence | null;
    completion: Evidence | null;
    release: Readonly<{
        kind: 'pending';
    }> | Readonly<{
        kind: 'confirmed';
        receipt: Evidence;
    }>;
}>;
```

### `RuntimeConditions`

```ts
type RuntimeConditions = Readonly<{
    source: Evidence;
    configuration: Adoption;
    progression: ProgressionDirective;
    model: Adoption;
    context: Evidence;
    bindings: readonly Adoption[];
}>;
```

### `SelectedModel`

```ts
type SelectedModel = Readonly<{
    recipient: ModelRecipient;
    resolution: Extract<M.ProfileResolution, {
        kind: 'resolved';
    }> & Readonly<{
        selectable: true;
    }>;
    parameters: readonly M.Parameter[];
    tools: Evidence;
    evidence: Evidence;
}>;
```

### `StepId`

```ts
type StepId = AgentIdentity<'AgentStepId'>;
```

### `StructureFailure`

```ts
type StructureFailure = Readonly<{
    field: string;
    reason: 'type' | 'empty' | 'unknown-field' | 'missing' | 'identity';
}>;
```

### `Subject`

```ts
type Subject = Readonly<{
    execution: AgentExecutionId;
    conditions: Evidence;
}> | Readonly<{
    preparation: Extract<Preparation, {
        kind: 'needs-compaction';
    }>;
}> | Readonly<{
    transition: PreparedContextTransition;
}> | Readonly<{
    purpose: 'main';
    preparation: Extract<Preparation, {
        kind: 'assembled';
    }>;
}> | Readonly<{
    purpose: 'compaction';
    step: Extract<Preparation, {
        kind: 'ready';
    }>;
    progress: CompactionProgress;
}> | Readonly<{
    purpose: 'main' | 'compaction';
    call: M.ModelCallId;
    result: ProducedResult;
    reply: Message;
    termination: M.Termination;
    account: CallAccount | null;
}> | Readonly<{
    purpose: 'main' | 'compaction';
    call: M.ModelCallId;
    request: M.FixedModelRequest;
    fault: M.ModelFault;
    dispatches: readonly M.DispatchRecord[];
    retry: M.RetryResolution | null;
}> | Readonly<{
    action: ActionId;
    original: Action['original'];
    effectiveArguments: string;
    definition: T.ToolDefinition;
    batch: readonly ActionId[];
}> | Readonly<{
    action: ActionId;
    candidate: Message;
    outcome: Readonly<{
        kind: 'denied';
        evidence: Evidence;
    }> | Readonly<{
        kind: 'executed';
        result: ProducedResult;
        terminal: T.ToolTerminal;
    }>;
}> | Readonly<{
    batch: ActionBatchId;
    outcomes: readonly Readonly<{
        action: ActionId;
        outcome: 'denied' | 'executed';
        terminal: T.ToolTerminal | null;
    }>[];
}> | Readonly<{
    proposed: AgentConclusion;
    basis: Evidence;
}> | Readonly<{
    terminal: AgentConclusion;
    disposition: Evidence;
}>;
```

### `TerminalObservation`

```ts
type TerminalObservation = Readonly<{
    terminal: Evidence;
    passage: PassageId;
    implementation: Adoption;
    observed: Evidence | null;
}>;
```

### `UnavailabilityPolicy`

```ts
type UnavailabilityPolicy = 'skip' | 'veto';
```

### `VersionChoice`

```ts
type VersionChoice = {
    readonly kind: 'pinned';
    readonly version: string;
} | {
    readonly kind: 'then-legal-winner';
};
```

### `Waiting`

```ts
type Waiting = Readonly<{
    kind: 'producer';
    pending: PendingCall;
}> | Readonly<{
    kind: 'human';
    passage: PassageId;
    cards: readonly Evidence[];
}> | Readonly<{
    kind: 'dependency';
    owner: string;
    position: string;
}>;
```

### `agentBodyContract`

```ts
function agentBodyContract(): BodyContract;
```

### `decodeActionBatchId`

```ts
const decodeActionBatchId: IdentityDecoder<ActionBatchId, "ActionBatchId">;
```

### `decodeActionId`

```ts
const decodeActionId: IdentityDecoder<ActionId, "ActionId">;
```

### `decodeAgentExecutionId`

```ts
const decodeAgentExecutionId: IdentityDecoder<AgentExecutionId, "AgentExecutionId">;
```

### `decodeAgentInstanceId`

```ts
const decodeAgentInstanceId: IdentityDecoder<AgentInstanceId, "AgentInstanceId">;
```

### `decodeAgentOperationId`

```ts
const decodeAgentOperationId: IdentityDecoder<AgentOperationId, "AgentOperationId">;
```

### `decodeAgentRegistrationId`

```ts
const decodeAgentRegistrationId: IdentityDecoder<AgentRegistrationId, "AgentRegistrationId">;
```

### `decodeCardRoundId`

```ts
const decodeCardRoundId: IdentityDecoder<CardRoundId, "CardRoundId">;
```

### `decodeConsumptionId`

```ts
const decodeConsumptionId: IdentityDecoder<ConsumptionId, "ConsumptionId">;
```

### `decodeExecutionAttachmentId`

```ts
const decodeExecutionAttachmentId: IdentityDecoder<ExecutionAttachmentId, "ExecutionAttachmentId">;
```

### `decodeExecutionRevision`

```ts
const decodeExecutionRevision: IdentityDecoder<ExecutionRevision, "ExecutionRevision">;
```

### `decodeInputBatchId`

```ts
const decodeInputBatchId: IdentityDecoder<InputBatchId, "InputBatchId">;
```

### `decodeInputId`

```ts
const decodeInputId: IdentityDecoder<InputId, "InputId">;
```

### `decodePassageId`

```ts
const decodePassageId: IdentityDecoder<PassageId, "PassageId">;
```

### `decodeStepId`

```ts
const decodeStepId: IdentityDecoder<StepId, "StepId">;
```

### `judgeAccess`

```ts
function judgeAccess<P>(value: unknown, judgePrincipal: (value: unknown) => Outcome<P, StructureFailure>): Outcome<Access<P>, StructureFailure>;
```

### `judgeAdoption`

```ts
function judgeAdoption(value: unknown): Outcome<Adoption, StructureFailure>;
```

### `judgeAgentDefinition`

```ts
function judgeAgentDefinition(value: unknown): Promise<Judgment<AgentDefinition>>;
```

### `judgeAuthority`

```ts
function judgeAuthority(value: unknown): Outcome<Authority, StructureFailure>;
```

### `judgeEvidence`

```ts
function judgeEvidence(value: unknown): Outcome<Evidence, StructureFailure>;
```

### `judgeExtensionOutput`

```ts
function judgeExtensionOutput(input: ExtensionOutputJudgeInput): Judgment<ExtensionOutput, OutputRefusalReason>;
```

### `judgeLoopExtensions`

```ts
function judgeLoopExtensions(value: unknown): Promise<BatchJudgment<LoopExtensionDeclaration>>;
```

## 内部引用

### `Ending`

```ts
type Ending = Extract<Dimension, {
    ending: unknown;
}>['ending'];
```

### `IdentityDecoder`

```ts
type IdentityDecoder<T extends AgentIdentity<string>, N extends string> = (value: unknown) => Outcome<T, IdentityFailure<N>>;
```

### `OutputKind`

```ts
type OutputKind = ExtensionOutput['kind'];
```

### `Scope`

```ts
type Scope = Extract<Dimension, {
    scope: unknown;
}>['scope'];
```

### `SplitPosition`

```ts
type SplitPosition = 'before_model_call' | 'after_model_call' | 'after_action';
```
