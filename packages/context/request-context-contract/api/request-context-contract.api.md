# @omne-harness/request-context-contract 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

### `Access`

```ts
type Access<P> = Readonly<{
    principal: P;
    tenant: TenantId;
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

### `AlterationEvidence`

```ts
type AlterationEvidence = Readonly<{
    evidence: DurableEvidence;
    touches: 'existing-layers' | 'history-tail';
}>;
```

### `AssemblyContext`

```ts
type AssemblyContext = Readonly<{
    scope: ScopeRef;
    definition: string | null;
    workspace: string | null;
    keys: Readonly<Record<string, string>>;
}>;
```

### `AssemblyFailure`

```ts
type AssemblyFailure = Readonly<{
    kind: 'denied';
    action: 'read-history' | 'read-conversions' | 'assemble';
    diagnostic: string;
}> | Readonly<{
    kind: 'invalid';
    field: string;
    reason: InvalidReason;
}> | Readonly<{
    kind: 'unavailable';
    owner: UnavailableOwner;
    diagnostic: string;
    original?: M.ConversionResult;
}>;
```

### `AssemblyInput`

```ts
type AssemblyInput<P> = Readonly<{
    identity: Readonly<{
        access: Access<P>;
        purpose: RequestPurpose;
        position: PositionRef;
        candidate: CandidateRef;
    }>;
    history: HistoryEvidence;
    inputs: NewInputBatch;
    contextRead: ContextReadGroup;
    adopted: Coverage | null;
    transition: TransitionEvidence | null;
    promptContributions: PromptContributionSet | null;
    assembleContext: AssemblyContext;
    selection: SelectedModel;
    tools: readonly ToolAdoption[];
    conditions: ConditionsEvidence;
    previous: PreviousPreparation | null;
    alterations: readonly AlterationEvidence[];
    beforeModelCall: readonly PassageRef[] | null;
}>;
```

### `AssemblyOperations`

```ts
type AssemblyOperations<P> = Readonly<{
    assemble(input: AssemblyInput<P>): Promise<AssemblyResult>;
    planCompaction(input: AssemblyInput<P>): Promise<import('./values.js').PlanResult>;
    deriveStep(input: import('./values.js').DeriveInput): Promise<import('./values.js').StepResult>;
    resume(input: AssemblyInput<P> & Readonly<{
        transition: import('./values.js').TransitionEvidence;
    }>): Promise<AssemblyResult>;
}>;
```

### `AssemblyOutcome`

```ts
type AssemblyOutcome = Readonly<{
    kind: 'candidate-before-extension';
    candidate: RequestCandidate;
}> | Readonly<{
    kind: 'candidate-fixable';
    candidate: RequestCandidate;
}> | Readonly<{
    kind: 'needs-compaction';
    coverage: Coverage;
    verdict: Extract<FitVerdict, {
        kind: 'needs-compaction';
    }>;
    layers: RequestLayers;
}> | Readonly<{
    kind: 'cannot-fit';
    reason: 'fixed-part-over-limit' | 'after-compaction';
    coverage: Coverage;
    verdict: FitVerdict;
    diagnostic: string;
}>;
```

### `AssemblyPolicies`

```ts
type AssemblyPolicies = Readonly<{
    compaction: CompactionPolicyPort;
    representation: RepresentationPolicyPort;
}>;
```

### `AssemblyPorts`

```ts
type AssemblyPorts<P> = Readonly<{
    history: HistorySource<P>;
    meter: M.ModelInputMeter;
    conversions: ConversionResultSource<P>;
    serializer: RequestSerializer;
}>;
```

### `AssemblyResult`

```ts
type AssemblyResult = AssemblyOutcome | AssemblyFailure | AssemblyUnknown;
```

### `AssemblyUnknown`

```ts
type AssemblyUnknown = Readonly<{
    kind: 'unknown';
    source: 'read' | 'commit';
    diagnostic: string;
}>;
```

### `BatchRef`

```ts
type BatchRef = RequestContextRef<'BatchRef'>;
```

### `BlockMaterial`

```ts
type BlockMaterial<K extends ContextBlockKey = ContextBlockKey> = Readonly<{
    key: K;
    revision: BlockRevision;
    value: BlockValue<K>;
    previous: unknown | null;
    volatility: BlockDescriptorBase<K, BlockValue<K>>['volatility'];
}>;
```

### `BudgetBreach`

```ts
type BudgetBreach = Readonly<{
    check: M.BudgetCheck;
    layer: Layer | 'whole';
}>;
```

### `BudgetInput`

```ts
type BudgetInput = Readonly<{
    whole: M.RequestBudget;
    fixedPart: M.RequestBudget;
    context: M.ContextLimits;
    limits: readonly M.ModelLimit[];
    policy: CompactionPolicy;
}>;
```

### `CandidateRef`

```ts
type CandidateRef = RequestContextRef<'CandidateRef'>;
```

### `CompactionContextResult`

```ts
type CompactionContextResult = Readonly<{
    kind: 'context';
    value: import('@omne-harness/message').CompactionContext;
    epoch: EpochId;
}> | Readonly<{
    kind: 'epoch-changed';
    current: HistoryEvidence;
}> | Readonly<{
    kind: 'denied';
}> | Readonly<{
    kind: 'invalid';
    reason: 'missing-scope' | 'missing-access' | 'unknown-epoch';
}> | Readonly<{
    kind: 'unknown';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
```

### `CompactionPlan`

```ts
type CompactionPlan = Readonly<{
    planId: PlanId;
    candidate: CandidateRef;
    epoch: EpochId;
    bound: string;
    policy: Readonly<{
        identity: Adoption;
        configDigest: string;
    }>;
    covers: import('@omne-harness/message').CompactedRange;
    retained: readonly RecordEntryRef[];
    floor: readonly RecordEntryRef[];
    after: readonly Message[];
    shape: 'trim-then-summarize' | 'summarize';
}>;
```

### `CompactionPlanDraft`

```ts
type CompactionPlanDraft = Readonly<{
    kind: 'draft';
    coverTo: RecordEntryRef;
    retained: readonly RecordEntryRef[];
    bound: string;
    shape: CompactionPlan['shape'];
}> | Readonly<{
    kind: 'floor-exceeds-budget';
    floor: readonly RecordEntryRef[];
    budget: string;
}>;
```

### `CompactionPolicy`

```ts
type CompactionPolicy = Readonly<{
    retainBudget: RetainBudget;
    retainPreference: 'newest-first' | 'most-referenced';
    triggerPercent: string | null;
    headroomTokens: string | null;
    trimFirst: boolean;
    stepBound: string;
}>;
```

### `CompactionPolicyPort`

```ts
interface CompactionPolicyPort {
    readonly identity: Adoption;
    readonly config: CompactionPolicy;
    configDigest(): string;
    plan(input: Readonly<{
        view: ProjectedHistory;
        context: import('@omne-harness/message').CompactionContext;
        measure: (entries: readonly RecordEntryRef[]) => string;
        windowTokens: string;
    }>): CompactionPlanDraft;
    trim(material: SummaryMaterial, limits: Readonly<{
        maxBlockBytes: string;
    }>): SummaryMaterial;
    summaryInstruction(material: SummaryMaterial): readonly ContentBlock[];
}
```

### `CompactionSettingsValue`

```ts
type CompactionSettingsValue = Readonly<{
    policy: Adoption;
    retainBudget: RetainBudget;
    retainPreference: CompactionPolicy['retainPreference'];
    triggerPercent: string | null;
    headroomTokens: string | null;
    trimFirst: boolean;
    stepBound: string;
}>;
```

### `ConditionsEvidence`

```ts
type ConditionsEvidence = Readonly<{
    evidence: DurableEvidence;
    revision: string;
}>;
```

### `ContextBlockKey`

```ts
export { ContextBlockKey } from '@omne-harness/runtime-context-contract';
```

### `ContextReadGroup`

```ts
type ContextReadGroup = Readonly<{
    scope: ScopeRef;
    recipient: string;
    read: SnapshotResult | ChangesResult;
    snapshot: SnapshotMaterial | null;
    perRequest: readonly BlockMaterial[];
    source: DurableEvidence;
    coverage: DurableEvidence;
}>;
```

### `ContextTransition`

```ts
type ContextTransition = Readonly<{
    planId: PlanId;
    candidate: CandidateRef;
    message: CompactionMessage;
    derivation: import('@omne-harness/message').CompactionDerivation;
    commitment: Readonly<{
        preparation: CandidateRef;
        steps: readonly Readonly<{
            index: string;
            consumed: DurableEvidence;
        }>[];
        digest: string;
    }>;
}>;
```

### `ContributionRejection`

```ts
type ContributionRejection = 'no-scope' | 'duplicate-name' | 'per-request-variable' | 'unknown-variable' | 'closed';
```

### `ContributionResult`

```ts
type ContributionResult = Readonly<{
    kind: 'registered';
    name: string;
    scope: ScopeRef | null;
    revision: string;
    dispose: () => void;
}> | Readonly<{
    kind: 'rejected';
    reason: ContributionRejection;
    name: string;
}>;
```

### `ContributionsResult`

```ts
type ContributionsResult = Readonly<{
    kind: 'current';
    set: PromptContributionSet;
}> | Readonly<{
    kind: 'rejected';
    reason: 'closed';
}>;
```

### `ConversionIndex`

```ts
type ConversionIndex = ReadonlyMap<BlockId, M.ConversionResult>;
```

### `ConversionIndexResult`

```ts
type ConversionIndexResult = Readonly<{
    kind: 'index';
    entries: ConversionIndex;
}> | Readonly<{
    kind: 'denied';
}> | Readonly<{
    kind: 'unknown';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
```

### `ConversionResultSource`

```ts
interface ConversionResultSource<P> {
    read(access: Access<P> | null, blocks: readonly BlockId[]): Promise<ConversionIndexResult>;
}
```

### `Coverage`

```ts
type Coverage = Readonly<{
    history: Readonly<{
        epoch: EpochId;
        upper: number;
        anchors: readonly LayerAnchor[];
    }>;
    compactions: Readonly<{
        record: RecordEntryRef | null;
        derivation: string | null;
    }>;
    inputs: Readonly<{
        batch: BatchRef;
        saved: DurableEvidence | null;
    }>;
    snapshot: Readonly<{
        scope: ScopeRef;
        eligibility: EligibilityId;
        revision: ViewRevision;
        anchor: SnapshotAnchor;
        content: 'full' | 'incremental';
    }>;
    prompt: Readonly<{
        sections: readonly Readonly<{
            name: string;
            scope: ScopeRef | null;
            source: Adoption;
            revision: string;
        }>[];
        digest: string;
        generation: string | null;
    }>;
    model: Readonly<{
        profile: Adoption;
        revision: string;
        recipient: string;
        parametersDigest: string;
        replay: 'on' | 'off';
    }>;
    tools: Readonly<{
        direct: readonly string[];
        programmatic: readonly string[];
        digest: string;
    }>;
    conditions: ConditionsEvidence;
    alterations: readonly AlterationEvidence[];
    representations: readonly RepresentationChoice[];
    budget: Readonly<{
        inputDigest: string;
        kind: 'complete' | 'deferred-media';
        deferred: readonly ContentReference[];
        unknownLimits: readonly string[];
    }>;
    prefixBreak: PrefixBreakReason;
}>;
```

### `Decoded`

```ts
type Decoded<T> = Readonly<{
    ok: true;
    value: T;
}> | Readonly<{
    ok: false;
    issues: readonly Readonly<{
        path: Path;
        message: string;
    }>[];
}>;
```

### `Decoder`

```ts
type Decoder<T> = (value: unknown, path: Path) => Decoded<T>;
```

### `DeriveInput`

```ts
type DeriveInput = Readonly<{
    plan: CompactionPlan;
    progress: PlanProgress;
    step: StepInput;
    material: SummaryMaterial | null;
    selection: SelectedModel;
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

### `EpochId`

```ts
type EpochId = RequestContextRef<'EpochId'>;
```

### `FitVerdict`

```ts
type FitVerdict = Readonly<{
    kind: 'fits';
    report: M.RequestBudget;
}> | Readonly<{
    kind: 'fixed-part-over-limit';
    report: M.RequestBudget;
    breaches: readonly [
        BudgetBreach,
        ...BudgetBreach[]
    ];
}> | Readonly<{
    kind: 'needs-compaction';
    report: M.RequestBudget;
    breaches: readonly [
        BudgetBreach,
        ...BudgetBreach[]
    ];
}> | Readonly<{
    kind: 'limit-unknown';
    report: M.RequestBudget;
    unknown: readonly [
        M.BudgetCheck,
        ...M.BudgetCheck[]
    ];
}>;
```

### `HistoryEvidence`

```ts
type HistoryEvidence = Readonly<{
    scope: ScopeRef;
    epoch: EpochId;
    upper: number;
}>;
```

### `HistoryPage`

```ts
type HistoryPage = Readonly<{
    rows: readonly HistoryRow[];
    next: number | null;
}>;
```

### `HistoryReadResult`

```ts
type HistoryReadResult = Readonly<{
    kind: 'page';
    page: HistoryPage;
}> | Readonly<{
    kind: 'epoch-changed';
    current: HistoryEvidence;
}> | Readonly<{
    kind: 'denied';
}> | Readonly<{
    kind: 'invalid';
    reason: 'missing-scope' | 'missing-access' | 'unknown-epoch' | 'upper-out-of-range';
}> | Readonly<{
    kind: 'unknown';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
```

### `HistoryRow`

```ts
type HistoryRow = Readonly<{
    seq: number;
    entry: RecordEntryRef;
    message: Message;
    bytes: string;
    prefixDigest: string;
}>;
```

### `HistorySource`

```ts
interface HistorySource<P> {
    read(evidence: HistoryEvidence, access: Access<P> | null, after: number | null, budgetBytes: number): Promise<HistoryReadResult>;
    compactionContext(evidence: HistoryEvidence, access: Access<P> | null, coverTo: RecordEntryRef): Promise<CompactionContextResult>;
}
```

### `HumanProjection`

```ts
type HumanProjection = Readonly<{
    entries: readonly Readonly<{
        seq: number;
        entry: RecordEntryRef;
        message: Message;
        summarized: 'retained' | 'summarized' | 'after' | null;
    }>[];
}>;
```

### `InvalidReason`

```ts
type InvalidReason = 'missing-input' | 'missing-access' | 'missing-scope' | 'inputs-not-saved' | 'missing-snapshot-material' | 'missing-assembly-context' | 'unsupported-format' | 'compaction-purpose' | 'per-request-variable' | 'profile-binding-conflict' | 'resume-without-full-snapshot' | 'scope-mismatch' | 'contradictory-retry' | 'contributions-not-accepted' | 'cursor-invalidated' | 'plan-mismatch' | 'progress-mismatch' | 'policy-mismatch';
```

### `LAYER_ORDER`

```ts
const LAYER_ORDER: readonly [
    "system-prompt",
    "tool-declarations",
    "history-head",
    "snapshot-reminder",
    "history-body",
    "tail-facts"
];
```

### `Layer`

```ts
type Layer = (typeof LAYER_ORDER)[number];
```

### `LayerAnchor`

```ts
type LayerAnchor = Readonly<{
    layer: Extract<Layer, 'history-head' | 'snapshot-reminder' | 'history-body'>;
    seq: number;
    prefixDigest: string;
}>;
```

### `NewInputBatch`

```ts
type NewInputBatch = Readonly<{
    batch: BatchRef;
    entries: readonly RecordEntryRef[];
    saved: DurableEvidence | null;
}>;
```

### `PREFIX_BREAK_REASONS`

```ts
const PREFIX_BREAK_REASONS: readonly [
    "new-full-read",
    "system-prompt-changed",
    "tool-set-changed",
    "compaction",
    "extension-altered",
    "model-changed",
    "unchanged"
];
```

### `PassageRef`

```ts
type PassageRef = RequestContextRef<'PassageRef'>;
```

### `Path`

```ts
type Path = readonly (string | number)[];
```

### `Placement`

```ts
type Placement = Readonly<{
    snapshot: SnapshotReminder;
    tail: TailFacts;
    anchorSource: 'new-full-read' | 'adopted' | 'after-compaction';
}>;
```

### `PlacementInput`

```ts
type PlacementInput = Readonly<{
    candidate: import('./refs.js').CandidateRef;
    contextRead: ContextReadGroup;
    adopted: Coverage | null;
    transition: TransitionEvidence | null;
    view: ProjectedHistory;
    newInputs: NewInputBatch;
}>;
```

### `PlanId`

```ts
type PlanId = RequestContextRef<'PlanId'>;
```

### `PlanProgress`

```ts
type PlanProgress = Readonly<{
    planId: PlanId;
    completed: string;
    consumed: readonly Readonly<{
        index: string;
        evidence: DurableEvidence;
    }>[];
}>;
```

### `PlanResult`

```ts
type PlanResult = Readonly<{
    kind: 'planned';
    plan: CompactionPlan;
    progress: PlanProgress;
    first: StepRequest;
}> | Readonly<{
    kind: 'cannot-fit';
    reason: 'floor-exceeds-budget';
    floor: readonly RecordEntryRef[];
    budget: string;
    diagnostic: string;
}> | AssemblyFailure | AssemblyUnknown;
```

### `PositionRef`

```ts
type PositionRef = RequestContextRef<'PositionRef'>;
```

### `PrefixBreakReason`

```ts
type PrefixBreakReason = (typeof PREFIX_BREAK_REASONS)[number];
```

### `PreparedInputKey`

```ts
type PreparedInputKey = Readonly<{
    identity: Omit<AssemblyInput<unknown>['identity'], 'access'>;
    history: HistoryEvidence;
    inputs: AssemblyInput<unknown>['inputs'];
    context: Readonly<{
        source: DurableEvidence;
        coverage: DurableEvidence;
        snapshot: Pick<SnapshotMaterial, 'scope' | 'eligibility' | 'revision'> | null;
    }>;
    prompt: Readonly<{
        digest: string;
        generation: string | null;
    }>;
    assembly: AssemblyContext;
    model: Readonly<{
        evidence: DurableEvidence;
        toolsEvidence: DurableEvidence;
        adoption: Adoption;
        revision: M.Revision;
        recipient: SelectedModel['recipient'];
        parameters: readonly M.ParameterAdoption[];
        replay: 'on' | 'off';
    }>;
    tools: readonly Readonly<{
        resident: boolean;
        definition: Adoption;
        binding: Adoption;
    }>[];
    conditions: ConditionsEvidence;
    alterations: readonly AlterationEvidence[];
    beforeModelCall: readonly PassageRef[] | null;
}>;
```

### `PreviousPreparation`

```ts
type PreviousPreparation = Readonly<{
    candidate: CandidateRef;
    enteredCompaction: PlanId | null;
    carried?: RequestCandidate;
}>;
```

### `ProjectedHistory`

```ts
type ProjectedHistory = Readonly<{
    epoch: EpochId;
    messages: readonly ProjectedMessage[];
    compaction: Readonly<{
        seq: number;
        entry: RecordEntryRef;
    }> | null;
}>;
```

### `ProjectedMessage`

```ts
type ProjectedMessage = Readonly<{
    seq: number;
    entry: RecordEntryRef;
    prefixDigest: string;
    message: Message;
    dropped: readonly BlockId[];
}>;
```

### `PromptContribution`

```ts
type PromptContribution = PromptSection | PromptVariable;
```

### `PromptContributionBase`

```ts
type PromptContributionBase = Readonly<{
    name: string;
    scope: ScopeRef | null;
    source: Adoption;
    revision: string;
}>;
```

### `PromptContributionRegistry`

```ts
interface PromptContributionRegistry {
    contributeSection(section: Omit<PromptSection, 'scope' | 'revision'>): ContributionResult;
    contributeVariable(variable: Omit<PromptVariable, 'scope' | 'revision'>): ContributionResult;
    contributions(scope: ScopeRef | null): ContributionsResult;
}
```

### `PromptContributionSet`

```ts
type PromptContributionSet = Readonly<{
    contributions: readonly PromptContribution[];
    digest: string;
    generation: string | null;
}>;
```

### `PromptSection`

```ts
type PromptSection = PromptContributionBase & Readonly<{
    kind: 'section';
    order: string;
    template: string;
    uses: readonly string[];
}>;
```

### `PromptVariable`

```ts
type PromptVariable = PromptContributionBase & Readonly<{
    kind: 'variable';
    value: string;
    volatility: 'stable' | 'per-request';
}>;
```

### `REQUEST_CONTEXT_REF_MAX_LENGTH`

```ts
const REQUEST_CONTEXT_REF_MAX_LENGTH = 256;
```

### `RefKind`

```ts
type RefKind = 'CandidateRef' | 'PositionRef' | 'PlanId' | 'EpochId' | 'BatchRef' | 'PassageRef';
```

### `RefRejection`

```ts
type RefRejection = Readonly<{
    field: RefKind;
    reason: 'type' | 'empty' | 'length' | 'character';
}>;
```

### `RepresentationChoice`

```ts
type RepresentationChoice = Readonly<{
    message: import('@omne-harness/message').MessageId;
    block: BlockId;
    choice: 'original' | 'derived' | 'transcript' | 'pending-load';
    converter: Adoption | null;
    mediaType: string | null;
}>;
```

### `RepresentationPolicyConfig`

```ts
type RepresentationPolicyConfig = Readonly<{
    preferences: Readonly<Record<M.ModelModality, readonly ('original' | 'derived' | 'transcript')[]>>;
}>;
```

### `RepresentationPolicyPort`

```ts
interface RepresentationPolicyPort {
    readonly identity: Adoption;
    readonly config: RepresentationPolicyConfig;
    choose(input: Readonly<{
        block: ContentBlock;
        conversion: M.ConversionResult | null;
        modalities: readonly M.ModelModality[];
    }>): RepresentationChoice['choice'] | 'none';
}
```

### `RepresentationResult`

```ts
type RepresentationResult = Readonly<{
    kind: 'chosen';
    choices: readonly RepresentationChoice[];
    messages: readonly Message[];
    modality: M.ModalityRequirement | null;
    deferred: readonly ContentReference[];
}> | Readonly<{
    kind: 'unavailable';
    block: BlockId;
    message: MessageId;
    original: M.ConversionResult;
}>;
```

### `RequestCandidate`

```ts
type RequestCandidate = Readonly<{
    preparation: Readonly<{
        access: Access<unknown>;
        key: PreparedInputKey;
        rows: readonly HistoryRow[];
        view: ProjectedHistory;
    }>;
    candidate: CandidateRef;
    layers: RequestLayers;
    coverage: Coverage;
    verdict: Extract<FitVerdict, {
        kind: 'fits' | 'limit-unknown';
    }>;
    representations: readonly RepresentationChoice[];
    assembled: M.AssembledModelInput;
    modality: M.ModalityRequirement | null;
}>;
```

### `RequestContextRef`

```ts
type RequestContextRef<K extends string> = string & {
    readonly [brand]: K;
};
```

### `RequestLayers`

```ts
type RequestLayers = Readonly<{
    systemPrompt: readonly ContentBlock[];
    toolDeclarations: ToolDeclarationSet;
    historyHead: readonly Message[];
    snapshotReminder: SnapshotReminder;
    historyBody: readonly Message[];
    tailFacts: TailFacts;
}>;
```

### `RequestPurpose`

```ts
type RequestPurpose = 'main' | 'extension';
```

### `RequestSerializer`

```ts
interface RequestSerializer {
    bytesOf(assembled: M.AssembledModelInput): string;
}
```

### `RetainBudget`

```ts
type RetainBudget = Readonly<{
    kind: 'ratio';
    retainRatio: string;
}> | Readonly<{
    kind: 'tokens';
    retainTokens: string;
}>;
```

### `SNAPSHOT_ANCHOR_RULE`

```ts
const SNAPSHOT_ANCHOR_RULE: Readonly<{
    readonly owner: 'request-context-contract';
    readonly name: 'snapshot-anchor';
    readonly revision: '1';
    readonly at: 'model-visible-history-tail-at-full-read';
    readonly excludes: 'new-inputs-of-this-request';
    readonly afterCompaction: 'history-tail-at-resume; after-compaction-record-when-range-reaches-point';
}>;
```

### `ScopeRef`

```ts
export { ScopeRef } from '@omne-harness/runtime-context-contract';
```

### `SelectedModel`

```ts
type SelectedModel = Readonly<{
    recipient: Readonly<{
        route: string;
        model: string;
    }>;
    profile: M.ModelProfile;
    parameters: readonly M.ParameterAdoption[];
    replay: 'on' | 'off';
    toolsEvidence: DurableEvidence;
    evidence: DurableEvidence;
}>;
```

### `SnapshotAnchor`

```ts
type SnapshotAnchor = Readonly<{
    epoch: EpochId;
    seq: number;
    prefixDigest: string | null;
}>;
```

### `SnapshotMaterial`

```ts
type SnapshotMaterial = Readonly<{
    scope: ScopeRef;
    eligibility: EligibilityId;
    revision: ViewRevision;
    blocks: readonly BlockMaterial[];
}>;
```

### `SnapshotReminder`

```ts
type SnapshotReminder = Readonly<{
    scope: ScopeRef;
    eligibility: EligibilityId;
    revision: ViewRevision;
    anchor: SnapshotAnchor;
    blocks: readonly BlockMaterial[];
    message: import('@omne-harness/message').SystemReminderMessage | null;
}>;
```

### `StepInput`

```ts
type StepInput = Readonly<{
    kind: 'trim';
}> | Readonly<{
    kind: 'summary';
    produced: readonly [
        MessageContentBlock,
        ...MessageContentBlock[]
    ];
    consumed: DurableEvidence;
}> | Readonly<{
    kind: 'vetoed';
    reason: string;
    evidence: DurableEvidence;
}>;
```

### `StepRequest`

```ts
type StepRequest = Readonly<{
    planId: PlanId;
    index: string;
}> & (Readonly<{
    kind: 'trim';
    material: SummaryMaterial;
}> | Readonly<{
    kind: 'summarize';
    material: SummaryMaterial;
    assembled: M.AssembledModelInput;
}>);
```

### `StepResult`

```ts
type StepResult = Readonly<{
    kind: 'next';
    step: StepRequest;
    progress: PlanProgress;
}> | Readonly<{
    kind: 'transition';
    value: ContextTransition;
    progress: PlanProgress;
}> | Readonly<{
    kind: 'cannot-fit';
    reason: 'after-compaction';
    cause: 'bound-exhausted' | 'step-vetoed' | 'summary-illegal';
    progress: PlanProgress;
    diagnostic: string;
}> | AssemblyFailure | AssemblyUnknown;
```

### `SummaryMaterial`

```ts
type SummaryMaterial = Readonly<{
    covered: readonly import('@omne-harness/message').CoveredEntry[];
    retained: readonly RecordEntryRef[];
    trimmed: readonly Readonly<{
        message: import('@omne-harness/message').MessageId;
        block: BlockId;
        originalBytes: string;
        keptBytes: string;
    }>[];
}>;
```

### `SystemPromptResult`

```ts
type SystemPromptResult = Readonly<{
    kind: 'rendered';
    blocks: readonly ContentBlock[];
    sections: Coverage['prompt']['sections'];
    digest: string;
}> | Readonly<{
    kind: 'invalid';
    reason: 'per-request-variable' | 'duplicate-name' | 'unknown-variable';
    name: string;
    scope: ScopeRef | null;
}>;
```

### `TailFacts`

```ts
type TailFacts = Readonly<{
    blocks: readonly BlockMaterial[];
    message: import('@omne-harness/message').SystemReminderMessage | null;
}>;
```

### `ToolAdoption`

```ts
type ToolAdoption = Readonly<{
    resident: boolean;
    availability: T.ToolAvailability;
    binding: Adoption;
}>;
```

### `ToolDeclarationSet`

```ts
type ToolDeclarationSet = Readonly<{
    direct: readonly M.ToolDeclaration[];
    programmatic: readonly M.ToolDeclaration[];
    routes: readonly ToolRoute[];
    digest: string;
}>;
```

### `ToolRoute`

```ts
type ToolRoute = Readonly<{
    declared: string;
    tool: Adoption;
    binding: Adoption;
    command: string | null;
}>;
```

### `TransitionEvidence`

```ts
type TransitionEvidence = Readonly<{
    planId: PlanId;
    candidate: CandidateRef;
    committed: DurableEvidence;
    epoch: EpochId;
}>;
```

### `UnavailableOwner`

```ts
type UnavailableOwner = 'history-source' | 'meter' | 'conversion-results' | 'runtime-context' | 'representation' | 'instance';
```

### `WindowUsageValue`

```ts
type WindowUsageValue = Readonly<{
    candidate: CandidateRef;
    usedTokens: string;
    windowTokens: string;
    ratio: string;
}>;
```

### `assemble`

```ts
function assemble<P>(input: AssemblyInput<P>, ports: AssemblyPorts<P>, policies: AssemblyPolicies): Promise<AssemblyResult>;
```

### `assembleSystemPrompt`

```ts
function assembleSystemPrompt(set: PromptContributionSet, context: AssemblyContext): SystemPromptResult;
```

### `chooseRepresentations`

```ts
function chooseRepresentations(input: RepresentationInput): RepresentationResult;
```

### `compactionPlanSchema`

```ts
const compactionPlanSchema: import("@standard-schema/spec").StandardSchemaV1<unknown, Readonly<{
    planId: import("./refs.js").PlanId;
    candidate: import("./refs.js").CandidateRef;
    epoch: import("./refs.js").EpochId;
    bound: string;
    policy: Readonly<{
        identity: import("./refs.js").Adoption;
        configDigest: string;
    }>;
    covers: import('@omne-harness/message').CompactedRange;
    retained: readonly import("@omne-harness/message").RecordEntryRef[];
    floor: readonly import("@omne-harness/message").RecordEntryRef[];
    after: readonly import("@omne-harness/message").Message[];
    shape: 'trim-then-summarize' | 'summarize';
}>>;
```

### `compactionPolicySchema`

```ts
const compactionPolicySchema: import("@standard-schema/spec").StandardSchemaV1<unknown, Readonly<{
    retainBudget: RetainBudget;
    retainPreference: 'newest-first' | 'most-referenced';
    triggerPercent: string | null;
    headroomTokens: string | null;
    trimFirst: boolean;
    stepBound: string;
}>>;
```

### `compactionSettingsBlock`

```ts
const compactionSettingsBlock: SuppliedBlockDescriptor<'context.compaction-settings', CompactionSettingsValue>;
```

### `compactionSettingsSchema`

```ts
const compactionSettingsSchema: import("@standard-schema/spec").StandardSchemaV1<unknown, Readonly<{
    policy: Adoption;
    retainBudget: RetainBudget;
    retainPreference: CompactionPolicy['retainPreference'];
    triggerPercent: string | null;
    headroomTokens: string | null;
    trimFirst: boolean;
    stepBound: string;
}>>;
```

### `coverageSchema`

```ts
const coverageSchema: import("@standard-schema/spec").StandardSchemaV1<unknown, Readonly<{
    history: Readonly<{
        epoch: import("./refs.js").EpochId;
        upper: number;
        anchors: readonly import("./values.js").LayerAnchor[];
    }>;
    compactions: Readonly<{
        record: import("@omne-harness/message").RecordEntryRef | null;
        derivation: string | null;
    }>;
    inputs: Readonly<{
        batch: import("./refs.js").BatchRef;
        saved: import("./refs.js").DurableEvidence | null;
    }>;
    snapshot: Readonly<{
        scope: import("@omne-harness/runtime-context-contract").ScopeRef;
        eligibility: import("@omne-harness/runtime-context-contract").EligibilityId;
        revision: import("@omne-harness/runtime-context-contract").ViewRevision;
        anchor: import("./values.js").SnapshotAnchor;
        content: 'full' | 'incremental';
    }>;
    prompt: Readonly<{
        sections: readonly Readonly<{
            name: string;
            scope: import("@omne-harness/runtime-context-contract").ScopeRef | null;
            source: import("./refs.js").Adoption;
            revision: string;
        }>[];
        digest: string;
        generation: string | null;
    }>;
    model: Readonly<{
        profile: import("./refs.js").Adoption;
        revision: string;
        recipient: string;
        parametersDigest: string;
        replay: 'on' | 'off';
    }>;
    tools: Readonly<{
        direct: readonly string[];
        programmatic: readonly string[];
        digest: string;
    }>;
    conditions: import("./values.js").ConditionsEvidence;
    alterations: readonly import("./values.js").AlterationEvidence[];
    representations: readonly import("./values.js").RepresentationChoice[];
    budget: Readonly<{
        inputDigest: string;
        kind: 'complete' | 'deferred-media';
        deferred: readonly import("@omne-harness/content-block").ContentReference[];
        unknownLimits: readonly string[];
    }>;
    prefixBreak: import("./values.js").PrefixBreakReason;
}>>;
```

### `declareTools`

```ts
function declareTools(tools: readonly ToolAdoption[]): ToolDeclarationSet;
```

### `decodeBatchRef`

```ts
const decodeBatchRef: (v: unknown) => Outcome<RequestContextRef<"BatchRef">, Readonly<{
    field: RefKind;
    reason: 'type' | 'empty' | 'length' | 'character';
}>>;
```

### `decodeCandidateRef`

```ts
const decodeCandidateRef: (v: unknown) => Outcome<RequestContextRef<"CandidateRef">, Readonly<{
    field: RefKind;
    reason: 'type' | 'empty' | 'length' | 'character';
}>>;
```

### `decodeEpochId`

```ts
const decodeEpochId: (v: unknown) => Outcome<RequestContextRef<"EpochId">, Readonly<{
    field: RefKind;
    reason: 'type' | 'empty' | 'length' | 'character';
}>>;
```

### `decodePassageRef`

```ts
const decodePassageRef: (v: unknown) => Outcome<RequestContextRef<"PassageRef">, Readonly<{
    field: RefKind;
    reason: 'type' | 'empty' | 'length' | 'character';
}>>;
```

### `decodePlanId`

```ts
const decodePlanId: (v: unknown) => Outcome<RequestContextRef<"PlanId">, Readonly<{
    field: RefKind;
    reason: 'type' | 'empty' | 'length' | 'character';
}>>;
```

### `decodePositionRef`

```ts
const decodePositionRef: (v: unknown) => Outcome<RequestContextRef<"PositionRef">, Readonly<{
    field: RefKind;
    reason: 'type' | 'empty' | 'length' | 'character';
}>>;
```

### `deriveStep`

```ts
function deriveStep<P>(input: DeriveInput, ports: AssemblyPorts<P>, policies: AssemblyPolicies): Promise<StepResult>;
```

### `judgeBudget`

```ts
function judgeBudget(input: BudgetInput): FitVerdict;
```

### `placeContext`

```ts
function placeContext(input: PlacementInput): Placement | Extract<AssemblyFailure, {
    kind: 'invalid';
}>;
```

### `planCompaction`

```ts
function planCompaction<P>(input: AssemblyInput<P>, ports: AssemblyPorts<P>, policies: AssemblyPolicies): Promise<PlanResult>;
```

### `planProgressSchema`

```ts
const planProgressSchema: import("@standard-schema/spec").StandardSchemaV1<unknown, Readonly<{
    planId: import("./refs.js").PlanId;
    completed: string;
    consumed: readonly Readonly<{
        index: string;
        evidence: import("./refs.js").DurableEvidence;
    }>[];
}>>;
```

### `project`

```ts
function project(rows: readonly HistoryRow[], epoch: EpochId): ProjectedHistory;
```

### `projectForHuman`

```ts
function projectForHuman(rows: readonly HistoryRow[]): HumanProjection;
```

### `representationPolicyConfigSchema`

```ts
const representationPolicyConfigSchema: import("@standard-schema/spec").StandardSchemaV1<unknown, Readonly<{
    preferences: Readonly<Record<import("@omne-harness/model-contract").ModelModality, readonly ('original' | 'derived' | 'transcript')[]>>;
}>>;
```

### `resume`

```ts
function resume<P>(input: AssemblyInput<P> & Readonly<{
    transition: TransitionEvidence;
}>, ports: AssemblyPorts<P>, policies: AssemblyPolicies): Promise<AssemblyResult>;
```

### `standardSchema`

```ts
function standardSchema<T>(decode: Decoder<T>): StandardSchemaV1<unknown, T>;
```

### `windowUsageBlock`

```ts
const windowUsageBlock: SuppliedBlockDescriptor<'context.window-usage', WindowUsageValue>;
```

### `windowUsageSchema`

```ts
const windowUsageSchema: import("@standard-schema/spec").StandardSchemaV1<unknown, Readonly<{
    candidate: CandidateRef;
    usedTokens: string;
    windowTokens: string;
    ratio: string;
}>>;
```

## 入口 `./testing`

### `AssemblyInputFixtureOptions`

```ts
type AssemblyInputFixtureOptions = Partial<AssemblyInput<string>>;
```

### `COMPACTION_POLICY_OBLIGATIONS`

```ts
const COMPACTION_POLICY_OBLIGATIONS: readonly [
    'configuration-stable',
    'trim-does-not-mutate'
];
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

### `CompactionPolicyFixture`

```ts
type CompactionPolicyFixture = Parameters<typeof compactionPolicyCases>[0];
```

### `CompactionPolicyObligation`

```ts
type CompactionPolicyObligation = (typeof COMPACTION_POLICY_OBLIGATIONS)[number];
```

### `ConformanceCase`

```ts
type ConformanceCase<F> = Readonly<{
    name: string;
    clause: string;
    run(fixture: F): Promise<void>;
}>;
```

### `ConformanceSubject`

```ts
type ConformanceSubject<P> = Readonly<{
    operations: {
        assemble(input: AssemblyInput<P>, ports: AssemblyPorts<P>, policies: AssemblyPolicies): Promise<AssemblyResult>;
        planCompaction(input: AssemblyInput<P>, ports: AssemblyPorts<P>, policies: AssemblyPolicies): Promise<PlanResult>;
        deriveStep(input: DeriveInput, ports: AssemblyPorts<P>, policies: AssemblyPolicies): Promise<StepResult>;
        resume(input: AssemblyInput<P> & {
            transition: TransitionEvidence;
        }, ports: AssemblyPorts<P>, policies: AssemblyPolicies): Promise<AssemblyResult>;
    };
    input: AssemblyInput<P>;
    ports: AssemblyPorts<P>;
    policies: AssemblyPolicies;
}>;
```

### `FIXTURE_COMPACTION_POLICY`

```ts
const FIXTURE_COMPACTION_POLICY: CompactionPolicy;
```

### `FIXTURE_REPRESENTATION_CONFIG`

```ts
const FIXTURE_REPRESENTATION_CONFIG: RepresentationPolicyConfig;
```

### `HISTORY_SOURCE_OBLIGATIONS`

```ts
const HISTORY_SOURCE_OBLIGATIONS: readonly [
    'read-requires-access',
    'tenant-isolation',
    'page-size-retains-order',
    'missing-scope-is-invalid',
    'page-respects-byte-budget',
    'prefix-digest-is-chained'
];
```

### `HistoryFixture`

```ts
type HistoryFixture = Readonly<{
    scope: ScopeRef;
    epochs: readonly Readonly<{
        epoch: EpochId;
        rows: readonly Omit<HistoryRow, 'prefixDigest'>[];
        entries: readonly CoveredEntry[];
        open: readonly RecordEntryRef[];
    }>[];
    tenant: TenantId;
}>;
```

### `HistorySourceFixture`

```ts
type HistorySourceFixture<P> = Parameters<typeof historySourceCases<P>>[0];
```

### `HistorySourceObligation`

```ts
type HistorySourceObligation = (typeof HISTORY_SOURCE_OBLIGATIONS)[number];
```

### `MemoryConversionResults`

```ts
interface MemoryConversionResults<P> extends ConversionResultSource<P> {
    readonly durability: 'none';
    set(block: BlockId, result: M.ConversionResult): void;
}
```

### `MemoryHistorySource`

```ts
interface MemoryHistorySource<P> extends HistorySource<P> {
    readonly durability: 'none';
    commitCompaction(record: CompactionMessage): EpochId;
    denyTenant(tenant: TenantId): void;
    fail(diagnostic: string): void;
    readCount(): number;
}
```

### `MeterScript`

```ts
type MeterScript = (input: Parameters<M.ModelInputMeter['measure']>[0]) => Outcome<M.RequestBudget, M.TransportFailure>;
```

### `NotApplicable`

```ts
class NotApplicable extends Error {
    readonly handle: string;
    constructor(handle: string);
}
```

### `REPRESENTATION_POLICY_OBLIGATIONS`

```ts
const REPRESENTATION_POLICY_OBLIGATIONS: readonly [
    'text-original-decision',
    'unsupported-without-conversion'
];
```

### `REQUEST_CONTEXT_OBLIGATIONS`

```ts
const REQUEST_CONTEXT_OBLIGATIONS: readonly [
    'new-inputs-must-be-saved',
    'same-input-is-deterministic',
    'fixed-overflow-is-outcome',
    'unknown-limits-remain-candidates',
    'resume-full-snapshot-required',
    'incremental-material-required',
    'carried-content-reuses-history',
    'floor-cannot-be-dropped',
    'floor-after-cover-cannot-evade-budget',
    'plan-progress-and-policy-checked',
    'entered-plan-changes-outcome',
    'tail-facts-never-enter-snapshot',
    'pages-share-evidence',
    'unknown-source-not-empty'
];
```

### `RepresentationPolicyFixture`

```ts
type RepresentationPolicyFixture = Parameters<typeof representationPolicyCases>[0];
```

### `RepresentationPolicyObligation`

```ts
type RepresentationPolicyObligation = (typeof REPRESENTATION_POLICY_OBLIGATIONS)[number];
```

### `RequestContextObligation`

```ts
type RequestContextObligation = (typeof REQUEST_CONTEXT_OBLIGATIONS)[number];
```

### `ScriptedInputMeter`

```ts
interface ScriptedInputMeter extends M.ModelInputMeter {
    readonly durability: 'none';
    calls(): number;
}
```

### `compactionPolicyConformance`

```ts
function compactionPolicyConformance(): readonly ConformanceCase<CompactionPolicyFixture>[];
```

### `createAssemblyInput`

```ts
function createAssemblyInput(options?: AssemblyInputFixtureOptions): AssemblyInput<string>;
```

### `createMemoryConversionResults`

```ts
function createMemoryConversionResults<P>(initial?: ReadonlyMap<BlockId, M.ConversionResult>): MemoryConversionResults<P>;
```

### `createMemoryHistorySource`

```ts
function createMemoryHistorySource<P>(fixture: HistoryFixture): MemoryHistorySource<P>;
```

### `createScriptedCompactionPolicy`

```ts
function createScriptedCompactionPolicy(config?: CompactionPolicy): CompactionPolicyPort & Readonly<{
    durability: 'none';
}>;
```

### `createScriptedInputMeter`

```ts
function createScriptedInputMeter(basis: M.ModelCountingBasis, script: MeterScript): ScriptedInputMeter;
```

### `createScriptedRepresentationPolicy`

```ts
function createScriptedRepresentationPolicy(config?: RepresentationPolicyConfig): RepresentationPolicyPort & Readonly<{
    durability: 'none';
}>;
```

### `historySourceConformance`

```ts
function historySourceConformance<P>(): readonly ConformanceCase<HistorySourceFixture<P>>[];
```

### `representationPolicyConformance`

```ts
function representationPolicyConformance(): readonly ConformanceCase<RepresentationPolicyFixture>[];
```

### `requestContextConformance`

```ts
function requestContextConformance<P>(): readonly ConformanceCase<ConformanceSubject<P>>[];
```

### `runConformanceCase`

```ts
function runConformanceCase<F>(test: ConformanceCase<F>, fixture: F): Promise<CaseVerdict>;
```

### `testingAccess`

```ts
function testingAccess<P>(principal: P, tenant: import('@omne-harness/legal-identity').TenantId): import('../refs.js').Access<P>;
```

## 内部引用

### `BoundCase`

```ts
type BoundCase = Readonly<{
    id: string;
    obligation: string;
    run(): Promise<void>;
}>;
```

### `RepresentationInput`

```ts
type RepresentationInput = Readonly<{
    messages: readonly Message[];
    conversions: ConversionIndex;
    modalities: readonly M.ModelModality[];
    policy: RepresentationPolicyPort;
}>;
```

### `compactionPolicyCases`

```ts
function compactionPolicyCases(subject: Readonly<{
    policy: CompactionPolicyPort;
    fixture: HistoryFixture;
}>): readonly BoundCase[];
```

### `historySourceCases`

```ts
function historySourceCases<P>(subject: Readonly<{
    source: HistorySource<P>;
    fixture: HistoryFixture;
    access: Access<P>;
    otherTenant: TenantId;
    createSource: (fixture: HistoryFixture) => HistorySource<P>;
}>): readonly BoundCase[];
```

### `representationPolicyCases`

```ts
function representationPolicyCases(subject: Readonly<{
    policy: RepresentationPolicyPort;
}>): readonly BoundCase[];
```

## 模块扩充 `@omne-harness/runtime-context-contract`

### `ContextBlocks`

```ts
interface ContextBlocks {
    'context.compaction-settings': CompactionSettingsValue;
    'context.window-usage': WindowUsageValue;
}
```
