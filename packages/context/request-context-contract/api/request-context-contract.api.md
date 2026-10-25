# @omne-harness/request-context-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `Access` · `refs.d.ts`
- `Adoption` · `refs.d.ts`
- `AlterationEvidence` · `values.d.ts`
- `AssemblyContext` · `values.d.ts`
- `AssemblyFailure` · `values.d.ts`
- `AssemblyInput` · `values.d.ts`
- `AssemblyOperations` · `ports.d.ts`
- `AssemblyOutcome` · `values.d.ts`
- `AssemblyPolicies` · `ports.d.ts`
- `AssemblyPorts` · `ports.d.ts`
- `AssemblyResult` · `values.d.ts`
- `AssemblyUnknown` · `values.d.ts`
- `BatchRef` · `refs.d.ts`
- `BlockMaterial` · `values.d.ts`
- `BudgetBreach` · `values.d.ts`
- `BudgetInput` · `budget.d.ts`
- `CandidateRef` · `refs.d.ts`
- `CompactionContextResult` · `ports.d.ts`
- `CompactionPlan` · `values.d.ts`
- `CompactionPlanDraft` · `ports.d.ts`
- `CompactionPolicy` · `ports.d.ts`
- `CompactionPolicyPort` · `ports.d.ts`
- `CompactionSettingsValue` · `blocks.d.ts`
- `ConditionsEvidence` · `values.d.ts`
- `ContextBlockKey` · 包 `@omne-harness/runtime-context-contract`
- `ContextReadGroup` · `values.d.ts`
- `ContextTransition` · `values.d.ts`
- `ContributionRejection` · `registry.d.ts`
- `ContributionResult` · `registry.d.ts`
- `ContributionsResult` · `registry.d.ts`
- `ConversionIndex` · `values.d.ts`
- `ConversionIndexResult` · `ports.d.ts`
- `ConversionResultSource` · `ports.d.ts`
- `Coverage` · `values.d.ts`
- `Decoded` · `schema-primitives.d.ts`
- `Decoder` · `schema-primitives.d.ts`
- `DeriveInput` · `values.d.ts`
- `DurableEvidence` · `refs.d.ts`
- `EpochId` · `refs.d.ts`
- `FitVerdict` · `values.d.ts`
- `HistoryEvidence` · `values.d.ts`
- `HistoryPage` · `ports.d.ts`
- `HistoryReadResult` · `ports.d.ts`
- `HistoryRow` · `values.d.ts`
- `HistorySource` · `ports.d.ts`
- `HumanProjection` · `projection.d.ts`
- `InvalidReason` · `values.d.ts`
- `LAYER_ORDER` · `values.d.ts`
- `Layer` · `values.d.ts`
- `LayerAnchor` · `values.d.ts`
- `NewInputBatch` · `values.d.ts`
- `PREFIX_BREAK_REASONS` · `values.d.ts`
- `PassageRef` · `refs.d.ts`
- `Path` · `schema-primitives.d.ts`
- `Placement` · `placement.d.ts`
- `PlacementInput` · `placement.d.ts`
- `PlanId` · `refs.d.ts`
- `PlanProgress` · `values.d.ts`
- `PlanResult` · `values.d.ts`
- `PositionRef` · `refs.d.ts`
- `PrefixBreakReason` · `values.d.ts`
- `PreparedInputKey` · `values.d.ts`
- `PreviousPreparation` · `values.d.ts`
- `ProjectedHistory` · `values.d.ts`
- `ProjectedMessage` · `values.d.ts`
- `PromptContribution` · `values.d.ts`
- `PromptContributionBase` · `values.d.ts`
- `PromptContributionRegistry` · `registry.d.ts`
- `PromptContributionSet` · `values.d.ts`
- `PromptSection` · `values.d.ts`
- `PromptVariable` · `values.d.ts`
- `REQUEST_CONTEXT_REF_MAX_LENGTH` · `refs.d.ts`
- `RefKind` · `refs.d.ts`
- `RefRejection` · `refs.d.ts`
- `RepresentationChoice` · `values.d.ts`
- `RepresentationPolicyConfig` · `ports.d.ts`
- `RepresentationPolicyPort` · `ports.d.ts`
- `RepresentationResult` · `representation.d.ts`
- `RequestCandidate` · `values.d.ts`
- `RequestContextRef` · `refs.d.ts`
- `RequestLayers` · `values.d.ts`
- `RequestPurpose` · `values.d.ts`
- `RequestSerializer` · `ports.d.ts`
- `RetainBudget` · `ports.d.ts`
- `SNAPSHOT_ANCHOR_RULE` · `placement.d.ts`
- `ScopeRef` · 包 `@omne-harness/runtime-context-contract`
- `SelectedModel` · `values.d.ts`
- `SnapshotAnchor` · `values.d.ts`
- `SnapshotMaterial` · `values.d.ts`
- `SnapshotReminder` · `values.d.ts`
- `StepInput` · `values.d.ts`
- `StepRequest` · `values.d.ts`
- `StepResult` · `values.d.ts`
- `SummaryMaterial` · `values.d.ts`
- `SystemPromptResult` · `prompt.d.ts`
- `TailFacts` · `values.d.ts`
- `ToolAdoption` · `values.d.ts`
- `ToolDeclarationSet` · `values.d.ts`
- `ToolRoute` · `values.d.ts`
- `TransitionEvidence` · `values.d.ts`
- `UnavailableOwner` · `values.d.ts`
- `WindowUsageValue` · `blocks.d.ts`
- `assemble` · `assembly.d.ts`
- `assembleSystemPrompt` · `prompt.d.ts`
- `chooseRepresentations` · `representation.d.ts`
- `compactionPlanSchema` · `schema.d.ts`
- `compactionPolicySchema` · `schema.d.ts`
- `compactionSettingsBlock` · `blocks.d.ts`
- `compactionSettingsSchema` · `blocks.d.ts`
- `coverageSchema` · `schema.d.ts`
- `declareTools` · `declare-tools.d.ts`
- `decodeBatchRef` · `refs.d.ts`
- `decodeCandidateRef` · `refs.d.ts`
- `decodeEpochId` · `refs.d.ts`
- `decodePassageRef` · `refs.d.ts`
- `decodePlanId` · `refs.d.ts`
- `decodePositionRef` · `refs.d.ts`
- `deriveStep` · `compaction-step.d.ts`
- `judgeBudget` · `budget.d.ts`
- `placeContext` · `placement.d.ts`
- `planCompaction` · `plan.d.ts`
- `planProgressSchema` · `schema.d.ts`
- `project` · `projection.d.ts`
- `projectForHuman` · `projection.d.ts`
- `representationPolicyConfigSchema` · `schema.d.ts`
- `resume` · `resume.d.ts`
- `standardSchema` · `schema-primitives.d.ts`
- `windowUsageBlock` · `blocks.d.ts`
- `windowUsageSchema` · `blocks.d.ts`

## 入口 `./testing` · `testing/index.d.ts`

- `AssemblyInputFixtureOptions` · `testing/fixtures.d.ts`
- `COMPACTION_POLICY_OBLIGATIONS` · `testing/conformance.d.ts`
- `CaseVerdict` · `testing/case.d.ts`
- `CompactionPolicyFixture` · `testing/conformance.d.ts`
- `CompactionPolicyObligation` · `testing/conformance.d.ts`
- `ConformanceCase` · `testing/case.d.ts`
- `ConformanceSubject` · `testing/conformance.d.ts`
- `FIXTURE_COMPACTION_POLICY` · `testing/doubles.d.ts`
- `FIXTURE_REPRESENTATION_CONFIG` · `testing/doubles.d.ts`
- `HISTORY_SOURCE_OBLIGATIONS` · `testing/conformance.d.ts`
- `HistoryFixture` · `testing/history-source.d.ts`
- `HistorySourceFixture` · `testing/conformance.d.ts`
- `HistorySourceObligation` · `testing/conformance.d.ts`
- `MemoryConversionResults` · `testing/doubles.d.ts`
- `MemoryHistorySource` · `testing/history-source.d.ts`
- `MeterScript` · `testing/doubles.d.ts`
- `NotApplicable` · `testing/case.d.ts`
- `REPRESENTATION_POLICY_OBLIGATIONS` · `testing/conformance.d.ts`
- `REQUEST_CONTEXT_OBLIGATIONS` · `testing/conformance.d.ts`
- `RepresentationPolicyFixture` · `testing/conformance.d.ts`
- `RepresentationPolicyObligation` · `testing/conformance.d.ts`
- `RequestContextObligation` · `testing/conformance.d.ts`
- `ScriptedInputMeter` · `testing/doubles.d.ts`
- `compactionPolicyConformance` · `testing/conformance.d.ts`
- `createAssemblyInput` · `testing/fixtures.d.ts`
- `createMemoryConversionResults` · `testing/doubles.d.ts`
- `createMemoryHistorySource` · `testing/history-source.d.ts`
- `createScriptedCompactionPolicy` · `testing/doubles.d.ts`
- `createScriptedInputMeter` · `testing/doubles.d.ts`
- `createScriptedRepresentationPolicy` · `testing/doubles.d.ts`
- `historySourceConformance` · `testing/conformance.d.ts`
- `representationPolicyConformance` · `testing/conformance.d.ts`
- `requestContextConformance` · `testing/conformance.d.ts`
- `runConformanceCase` · `testing/case.d.ts`
- `testingAccess` · `testing/fixtures.d.ts`

## 声明文件 `assembly-budget.d.ts`

```ts
import type * as M from '@omne-harness/model-contract';
import type { AssemblyInput, AssemblyFailure, RequestLayers, FitVerdict } from './values.js';
import type { AssemblyPorts, AssemblyPolicies } from './ports.js';
import type { StablePreparation } from './preparation.js';
import type { RepresentationResult } from './representation.js';
export declare function measureLayers<P>(input: AssemblyInput<P>, ports: AssemblyPorts<P>, policies: AssemblyPolicies, prepared: StablePreparation, layers: RequestLayers, represented: Extract<RepresentationResult, {
    kind: 'chosen';
}>, assembled: M.AssembledModelInput): Readonly<{
    kind: 'measured';
    whole: M.RequestBudget;
    verdict: FitVerdict;
}> | AssemblyFailure;
```

## 声明文件 `assembly-coverage.d.ts`

```ts
import type * as M from '@omne-harness/model-contract';
import type { StablePreparation } from './preparation.js';
import type { LayeredRequest } from './assembly-layers.js';
import type { RepresentationResult } from './representation.js';
import type { AssemblyInput, Coverage, PrefixBreakReason } from './values.js';
export declare function prefix(coverage: Omit<Coverage, 'prefixBreak'>, previous: Coverage | null, input: AssemblyInput<unknown>): PrefixBreakReason;
export declare function assemblyCoverage(input: AssemblyInput<unknown>, prepared: StablePreparation, dynamic: LayeredRequest, represented: Extract<RepresentationResult, {
    kind: 'chosen';
}>, whole: M.RequestBudget): Coverage;
```

## 声明文件 `assembly-layers.d.ts`

```ts
import { type Placement } from './placement.js';
import type { StablePreparation } from './preparation.js';
import type { AssemblyFailure } from './values.js';
import type * as M from '@omne-harness/model-contract';
import type { Message } from '@omne-harness/message';
import type { AssemblyInput, RequestLayers } from './values.js';
import type { AssemblyPolicies } from './ports.js';
export declare function assembledInput<P>(input: AssemblyInput<P>, policies: AssemblyPolicies, layers: RequestLayers, messages: readonly Message[]): M.AssembledModelInput;
export type LayeredRequest = Readonly<{
    kind: 'layers';
    layers: RequestLayers;
    messages: readonly Message[];
    anchorSource: Placement['anchorSource'];
}>;
export declare function placeLayers<P>(input: AssemblyInput<P>, prepared: StablePreparation): LayeredRequest | AssemblyFailure;
```

## 声明文件 `assembly-outcome.d.ts`

```ts
import type { AssemblyInput, AssemblyResult, RequestCandidate, FitVerdict } from './values.js';
export declare function assemblyOutcome(input: AssemblyInput<unknown>, candidate: Omit<RequestCandidate, 'verdict'>, verdict: FitVerdict): AssemblyResult;
```

## 声明文件 `assembly-representation.d.ts`

```ts
import type { Message } from '@omne-harness/message';
import type { AssemblyInput, AssemblyFailure, AssemblyUnknown } from './values.js';
import type { AssemblyPorts, AssemblyPolicies } from './ports.js';
import { type RepresentationResult } from './representation.js';
export declare function representLayers<P>(input: AssemblyInput<P>, ports: AssemblyPorts<P>, policies: AssemblyPolicies, messages: readonly Message[]): Promise<Extract<RepresentationResult, {
    kind: 'chosen';
}> | AssemblyFailure | AssemblyUnknown>;
```

## 声明文件 `assembly.d.ts`

```ts
import type { AssemblyInput, AssemblyResult } from './values.js';
import type { AssemblyPorts, AssemblyPolicies } from './ports.js';
export declare function assemble<P>(input: AssemblyInput<P>, ports: AssemblyPorts<P>, policies: AssemblyPolicies): Promise<AssemblyResult>;
```

## 声明文件 `blocks.d.ts`

```ts
import type { SuppliedBlockDescriptor } from '@omne-harness/runtime-context-contract';
import type { Adoption, CandidateRef } from './refs.js';
import type { RetainBudget, CompactionPolicy } from './ports.js';
export type CompactionSettingsValue = Readonly<{
    policy: Adoption;
    retainBudget: RetainBudget;
    retainPreference: CompactionPolicy['retainPreference'];
    triggerPercent: string | null;
    headroomTokens: string | null;
    trimFirst: boolean;
    stepBound: string;
}>;
export type WindowUsageValue = Readonly<{
    candidate: CandidateRef;
    usedTokens: string;
    windowTokens: string;
    ratio: string;
}>;
declare module '@omne-harness/runtime-context-contract' {
    interface ContextBlocks {
        'context.compaction-settings': CompactionSettingsValue;
        'context.window-usage': WindowUsageValue;
    }
}
export declare const compactionSettingsSchema: import("@standard-schema/spec").StandardSchemaV1<unknown, Readonly<{
    policy: Adoption;
    retainBudget: RetainBudget;
    retainPreference: CompactionPolicy['retainPreference'];
    triggerPercent: string | null;
    headroomTokens: string | null;
    trimFirst: boolean;
    stepBound: string;
}>>;
export declare const windowUsageSchema: import("@standard-schema/spec").StandardSchemaV1<unknown, Readonly<{
    candidate: CandidateRef;
    usedTokens: string;
    windowTokens: string;
    ratio: string;
}>>;
export declare const compactionSettingsBlock: SuppliedBlockDescriptor<'context.compaction-settings', CompactionSettingsValue>;
export declare const windowUsageBlock: SuppliedBlockDescriptor<'context.window-usage', WindowUsageValue>;
```

## 声明文件 `budget.d.ts`

```ts
import type * as M from '@omne-harness/model-contract';
import type { FitVerdict } from './values.js';
import type { CompactionPolicy } from './ports.js';
export type BudgetInput = Readonly<{
    whole: M.RequestBudget;
    fixedPart: M.RequestBudget;
    context: M.ContextLimits;
    limits: readonly M.ModelLimit[];
    policy: CompactionPolicy;
}>;
export declare function judgeBudget(input: BudgetInput): FitVerdict;
```

## 声明文件 `compaction-context.d.ts`

```ts
import type { CompactionContext } from '@omne-harness/message';
import type { AssemblyInput, PlanResult, AssemblyFailure, AssemblyUnknown } from './values.js';
import type { AssemblyPorts, AssemblyPolicies, CompactionContextResult } from './ports.js';
import type { readHistory } from './history-read.js';
export declare function readCompactionContext<P>(input: AssemblyInput<P>, ports: AssemblyPorts<P>, history: Extract<Awaited<ReturnType<typeof readHistory>>, {
    kind: 'history';
}>): Promise<Extract<CompactionContextResult, {
    kind: 'context';
}> | AssemblyFailure | AssemblyUnknown>;
export declare function measureRetention<P>(input: AssemblyInput<P>, ports: AssemblyPorts<P>, policies: AssemblyPolicies, context: Readonly<{
    value: CompactionContext;
}>): Readonly<{
    kind: 'measured';
    measureEntries: (entries: readonly import('@omne-harness/message').RecordEntryRef[]) => string;
    limit: bigint;
}> | AssemblyFailure | Extract<PlanResult, {
    kind: 'cannot-fit';
}>;
```

## 声明文件 `compaction-request.d.ts`

```ts
import type { AssembledModelInput } from '@omne-harness/model-contract';
import type { AssemblyFailure, SummaryMaterial, CompactionPlan, StepRequest } from './values.js';
import type { AssemblyPolicies } from './ports.js';
export declare function invalid(reason: 'plan-mismatch' | 'progress-mismatch' | 'policy-mismatch' | 'unsupported-format'): AssemblyFailure;
export declare function summary(material: SummaryMaterial, policies: AssemblyPolicies): AssembledModelInput;
export declare function request(plan: CompactionPlan, index: string, material: SummaryMaterial, kind: 'trim' | 'summarize', policies: AssemblyPolicies): StepRequest;
```

## 声明文件 `compaction-step.d.ts`

```ts
import type { DeriveInput, StepResult } from './values.js';
import type { AssemblyPorts, AssemblyPolicies } from './ports.js';
export declare function deriveStep<P>(input: DeriveInput, ports: AssemblyPorts<P>, policies: AssemblyPolicies): Promise<StepResult>;
```

## 声明文件 `coverage-validation.d.ts`

```ts
import { type Coverage } from './values.js';
export declare function isCoverage(value: unknown): value is Coverage;
```

## 声明文件 `declare-tools.d.ts`

```ts
import type { ToolAdoption } from './values.js';
export type { ToolRoute, ToolDeclarationSet } from './values.js';
import type { ToolDeclarationSet } from './values.js';
export declare function declareTools(tools: readonly ToolAdoption[]): ToolDeclarationSet;
```

## 声明文件 `history-read.d.ts`

```ts
import type { AssemblyInput, AssemblyFailure, HistoryEvidence } from './values.js';
import type { AssemblyPorts, HistoryRow } from './ports.js';
export declare function readHistory<P>(input: AssemblyInput<P>, ports: AssemblyPorts<P>): Promise<Readonly<{
    kind: 'history';
    rows: readonly HistoryRow[];
    evidence: HistoryEvidence;
}> | AssemblyFailure | Readonly<{
    kind: 'unknown';
    source: 'read';
    diagnostic: string;
}>>;
```

## 声明文件 `index.d.ts`

```ts
export type { ScopeRef, ContextBlockKey } from '@omne-harness/runtime-context-contract';
export type { Path, Decoded, Decoder } from './schema.js';
export { standardSchema, compactionPolicySchema, representationPolicyConfigSchema, planProgressSchema, compactionPlanSchema, coverageSchema, } from './schema.js';
export type { ToolRoute, ToolDeclarationSet } from './declare-tools.js';
export { declareTools } from './declare-tools.js';
export type { ConversionIndex, RepresentationResult } from './representation.js';
export { chooseRepresentations } from './representation.js';
export type { ProjectedMessage, ProjectedHistory, HumanProjection } from './projection.js';
export { project, projectForHuman } from './projection.js';
export type { CompactionSettingsValue, WindowUsageValue } from './blocks.js';
export { compactionSettingsSchema, windowUsageSchema, compactionSettingsBlock, windowUsageBlock, } from './blocks.js';
export type { SystemPromptResult } from './prompt.js';
export { assembleSystemPrompt } from './prompt.js';
export type { Placement, PlacementInput } from './placement.js';
export { SNAPSHOT_ANCHOR_RULE, placeContext } from './placement.js';
export type { Access, Adoption, DurableEvidence, RequestContextRef, CandidateRef, PositionRef, PlanId, EpochId, BatchRef, PassageRef, RefKind, RefRejection, } from './refs.js';
export { REQUEST_CONTEXT_REF_MAX_LENGTH, decodeCandidateRef, decodePositionRef, decodePlanId, decodeEpochId, decodeBatchRef, decodePassageRef, } from './refs.js';
export type { AssemblyPorts, AssemblyPolicies, AssemblyOperations } from './ports.js';
export type { PreparedInputKey } from './values.js';
export { assemble } from './assembly.js';
export type { HistoryRow, HistoryPage, HistoryReadResult, CompactionContextResult, HistorySource, ConversionIndexResult, ConversionResultSource, RetainBudget, CompactionPolicy, CompactionPlanDraft, CompactionPolicyPort, RepresentationPolicyConfig, RepresentationPolicyPort, RequestSerializer, } from './ports.js';
export type { BudgetInput } from './budget.js';
export { judgeBudget } from './budget.js';
export type { ContributionRejection, ContributionResult, ContributionsResult, PromptContributionRegistry, } from './registry.js';
export type { RequestPurpose, HistoryEvidence, NewInputBatch, BlockMaterial, SnapshotMaterial, ContextReadGroup, AssemblyContext, PromptContributionBase, PromptSection, PromptVariable, PromptContribution, PromptContributionSet, SelectedModel, ToolAdoption, ConditionsEvidence, AlterationEvidence, PreviousPreparation, AssemblyInput, TransitionEvidence, Layer, PrefixBreakReason, LayerAnchor, SnapshotAnchor, Coverage, BudgetBreach, FitVerdict, RepresentationChoice, SnapshotReminder, TailFacts, RequestLayers, RequestCandidate, CompactionPlan, PlanProgress, SummaryMaterial, StepRequest, StepInput, ContextTransition, AssemblyFailure, InvalidReason, UnavailableOwner, AssemblyUnknown, AssemblyOutcome, AssemblyResult, PlanResult, StepResult, } from './values.js';
export { LAYER_ORDER, PREFIX_BREAK_REASONS } from './values.js';
export type { DeriveInput } from './values.js';
export { planCompaction } from './plan.js';
export { deriveStep } from './compaction-step.js';
export { resume } from './resume.js';
```

## 声明文件 `input-validation.d.ts`

```ts
import type { AssemblyPorts } from './ports.js';
import type { AssemblyUnknown } from './values.js';
import type { AssemblyInput, AssemblyFailure } from './values.js';
export declare function validateInput<P>(input: AssemblyInput<P>): AssemblyFailure | null;
export declare function validateAssembly<P>(input: AssemblyInput<P>, ports: AssemblyPorts<P>): AssemblyFailure | AssemblyUnknown | null;
```

## 声明文件 `internal.d.ts`

```ts
import { type TextContentBlock } from '@omne-harness/content-block';
import { type MessageId, type SystemReminderMessage } from '@omne-harness/message';
export declare function canonical(value: unknown): string;
export declare function digest(value: unknown): string;
export declare function messageId(value: unknown): MessageId;
export declare function textBlock(text: string, identity: unknown): TextContentBlock;
export declare function reminder(text: string, identity: unknown): SystemReminderMessage;
export declare function nonEmpty<T>(xs: readonly T[]): xs is readonly [
    T,
    ...T[]
];
export declare function decimalParts(text: string): Readonly<{
    n: bigint;
    scale: bigint;
}>;
export declare function measuredAmount(check: import('@omne-harness/model-contract').BudgetCheck): bigint;
```

## 声明文件 `measurement.d.ts`

```ts
import type * as M from '@omne-harness/model-contract';
import type { AssemblyInput, AssemblyFailure } from './values.js';
import type { AssemblyPorts } from './ports.js';
export declare function measure<P>(input: Pick<AssemblyInput<P>, 'selection'>, ports: AssemblyPorts<P>, assembled: M.AssembledModelInput, deferred: readonly import('@omne-harness/content-block').ContentReference[]): M.RequestBudget | AssemblyFailure;
```

## 声明文件 `placement.d.ts`

```ts
import type { ContextReadGroup, Coverage, TransitionEvidence, NewInputBatch, SnapshotReminder, TailFacts, AssemblyFailure } from './values.js';
import type { ProjectedHistory } from './projection.js';
export declare const SNAPSHOT_ANCHOR_RULE: Readonly<{
    readonly owner: 'request-context-contract';
    readonly name: 'snapshot-anchor';
    readonly revision: '1';
    readonly at: 'model-visible-history-tail-at-full-read';
    readonly excludes: 'new-inputs-of-this-request';
    readonly afterCompaction: 'history-tail-at-resume; after-compaction-record-when-range-reaches-point';
}>;
export type Placement = Readonly<{
    snapshot: SnapshotReminder;
    tail: TailFacts;
    anchorSource: 'new-full-read' | 'adopted' | 'after-compaction';
}>;
export type PlacementInput = Readonly<{
    candidate: import('./refs.js').CandidateRef;
    contextRead: ContextReadGroup;
    adopted: Coverage | null;
    transition: TransitionEvidence | null;
    view: ProjectedHistory;
    newInputs: NewInputBatch;
}>;
export declare function placeContext(input: PlacementInput): Placement | Extract<AssemblyFailure, {
    kind: 'invalid';
}>;
```

## 声明文件 `plan.d.ts`

```ts
import type { AssemblyInput, PlanResult } from './values.js';
import type { AssemblyPorts, AssemblyPolicies } from './ports.js';
export declare function planCompaction<P>(input: AssemblyInput<P>, ports: AssemblyPorts<P>, policies: AssemblyPolicies): Promise<PlanResult>;
```

## 声明文件 `ports.d.ts`

```ts
import type { AssemblyInput, AssemblyResult } from './values.js';
import type * as M from '@omne-harness/model-contract';
import type { RecordEntryRef } from '@omne-harness/message';
import type { ContentBlock, BlockId } from '@omne-harness/content-block';
import type { Access, Adoption, EpochId } from './refs.js';
import type { HistoryEvidence, CompactionPlan, SummaryMaterial, RepresentationChoice } from './values.js';
import type { ProjectedHistory, ConversionIndex } from './values.js';
export type { HistoryRow } from './values.js';
import type { HistoryRow } from './values.js';
export type HistoryPage = Readonly<{
    rows: readonly HistoryRow[];
    next: number | null;
}>;
export type HistoryReadResult = Readonly<{
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
export type CompactionContextResult = Readonly<{
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
export interface HistorySource<P> {
    read(evidence: HistoryEvidence, access: Access<P> | null, after: number | null, budgetBytes: number): Promise<HistoryReadResult>;
    compactionContext(evidence: HistoryEvidence, access: Access<P> | null, coverTo: RecordEntryRef): Promise<CompactionContextResult>;
}
export type ConversionIndexResult = Readonly<{
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
export interface ConversionResultSource<P> {
    read(access: Access<P> | null, blocks: readonly BlockId[]): Promise<ConversionIndexResult>;
}
export type RetainBudget = Readonly<{
    kind: 'ratio';
    retainRatio: string;
}> | Readonly<{
    kind: 'tokens';
    retainTokens: string;
}>;
export type CompactionPolicy = Readonly<{
    retainBudget: RetainBudget;
    retainPreference: 'newest-first' | 'most-referenced';
    triggerPercent: string | null;
    headroomTokens: string | null;
    trimFirst: boolean;
    stepBound: string;
}>;
export type CompactionPlanDraft = Readonly<{
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
export interface CompactionPolicyPort {
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
export type RepresentationPolicyConfig = Readonly<{
    preferences: Readonly<Record<M.ModelModality, readonly ('original' | 'derived' | 'transcript')[]>>;
}>;
export interface RepresentationPolicyPort {
    readonly identity: Adoption;
    readonly config: RepresentationPolicyConfig;
    choose(input: Readonly<{
        block: ContentBlock;
        conversion: M.ConversionResult | null;
        modalities: readonly M.ModelModality[];
    }>): RepresentationChoice['choice'] | 'none';
}
export interface RequestSerializer {
    bytesOf(assembled: M.AssembledModelInput): string;
}
export type AssemblyPorts<P> = Readonly<{
    history: HistorySource<P>;
    meter: M.ModelInputMeter;
    conversions: ConversionResultSource<P>;
    serializer: RequestSerializer;
}>;
export type AssemblyPolicies = Readonly<{
    compaction: CompactionPolicyPort;
    representation: RepresentationPolicyPort;
}>;
export type AssemblyOperations<P> = Readonly<{
    assemble(input: AssemblyInput<P>): Promise<AssemblyResult>;
    planCompaction(input: AssemblyInput<P>): Promise<import('./values.js').PlanResult>;
    deriveStep(input: import('./values.js').DeriveInput): Promise<import('./values.js').StepResult>;
    resume(input: AssemblyInput<P> & Readonly<{
        transition: import('./values.js').TransitionEvidence;
    }>): Promise<AssemblyResult>;
}>;
```

## 声明文件 `preparation.d.ts`

```ts
import { readHistory } from './history-read.js';
import { type ProjectedHistory } from './projection.js';
import { type SystemPromptResult } from './prompt.js';
import { type ToolDeclarationSet } from './declare-tools.js';
import type { AssemblyInput, PreparedInputKey, AssemblyFailure, AssemblyUnknown } from './values.js';
export declare function preparationKey<P>(input: AssemblyInput<P>): PreparedInputKey;
export type StablePreparation = Readonly<{
    kind: 'prepared';
    key: PreparedInputKey;
    history: Extract<Awaited<ReturnType<typeof readHistory>>, {
        kind: 'history';
    }>;
    view: ProjectedHistory;
    prompt: Extract<SystemPromptResult, {
        kind: 'rendered';
    }>;
    declarations: ToolDeclarationSet;
}>;
export declare function prepareStable<P>(input: AssemblyInput<P>, ports: import('./ports.js').AssemblyPorts<P>): Promise<StablePreparation | AssemblyFailure | AssemblyUnknown>;
```

## 声明文件 `projection.d.ts`

```ts
import { type Message, type RecordEntryRef } from '@omne-harness/message';
import type { EpochId } from './refs.js';
import type { HistoryRow } from './ports.js';
export type { ProjectedMessage, ProjectedHistory } from './values.js';
import type { ProjectedHistory } from './values.js';
export type HumanProjection = Readonly<{
    entries: readonly Readonly<{
        seq: number;
        entry: RecordEntryRef;
        message: Message;
        summarized: 'retained' | 'summarized' | 'after' | null;
    }>[];
}>;
export declare function project(rows: readonly HistoryRow[], epoch: EpochId): ProjectedHistory;
export declare function projectForHuman(rows: readonly HistoryRow[]): HumanProjection;
```

## 声明文件 `prompt.d.ts`

```ts
import type { ContentBlock } from '@omne-harness/content-block';
import type { ScopeRef } from '@omne-harness/runtime-context-contract';
import type { AssemblyContext, Coverage, PromptContributionSet } from './values.js';
export type SystemPromptResult = Readonly<{
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
export declare function assembleSystemPrompt(set: PromptContributionSet, context: AssemblyContext): SystemPromptResult;
```

## 声明文件 `refs.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { Outcome } from '@omne-harness/operation-result';
export type Access<P> = Readonly<{
    principal: P;
    tenant: TenantId;
}>;
export type Adoption = Readonly<{
    owner: string;
    name: string;
    revision: string;
    digest: string;
}>;
export type DurableEvidence = Readonly<{
    owner: string;
    record: string;
    revision: string;
    digest: string;
}>;
declare const brand: unique symbol;
export type RequestContextRef<K extends string> = string & {
    readonly [brand]: K;
};
export type CandidateRef = RequestContextRef<'CandidateRef'>;
export type PositionRef = RequestContextRef<'PositionRef'>;
export type PlanId = RequestContextRef<'PlanId'>;
export type EpochId = RequestContextRef<'EpochId'>;
export type BatchRef = RequestContextRef<'BatchRef'>;
export type PassageRef = RequestContextRef<'PassageRef'>;
export type RefKind = 'CandidateRef' | 'PositionRef' | 'PlanId' | 'EpochId' | 'BatchRef' | 'PassageRef';
export type RefRejection = Readonly<{
    field: RefKind;
    reason: 'type' | 'empty' | 'length' | 'character';
}>;
export declare const REQUEST_CONTEXT_REF_MAX_LENGTH = 256;
export declare const decodeCandidateRef: (v: unknown) => Outcome<RequestContextRef<"CandidateRef">, Readonly<{
    field: RefKind;
    reason: 'type' | 'empty' | 'length' | 'character';
}>>;
export declare const decodePositionRef: (v: unknown) => Outcome<RequestContextRef<"PositionRef">, Readonly<{
    field: RefKind;
    reason: 'type' | 'empty' | 'length' | 'character';
}>>;
export declare const decodePlanId: (v: unknown) => Outcome<RequestContextRef<"PlanId">, Readonly<{
    field: RefKind;
    reason: 'type' | 'empty' | 'length' | 'character';
}>>;
export declare const decodeEpochId: (v: unknown) => Outcome<RequestContextRef<"EpochId">, Readonly<{
    field: RefKind;
    reason: 'type' | 'empty' | 'length' | 'character';
}>>;
export declare const decodeBatchRef: (v: unknown) => Outcome<RequestContextRef<"BatchRef">, Readonly<{
    field: RefKind;
    reason: 'type' | 'empty' | 'length' | 'character';
}>>;
export declare const decodePassageRef: (v: unknown) => Outcome<RequestContextRef<"PassageRef">, Readonly<{
    field: RefKind;
    reason: 'type' | 'empty' | 'length' | 'character';
}>>;
export {};
```

## 声明文件 `registry.d.ts`

```ts
import type { ScopeRef } from '@omne-harness/runtime-context-contract';
import type { PromptSection, PromptVariable, PromptContributionSet } from './values.js';
export type ContributionRejection = 'no-scope' | 'duplicate-name' | 'per-request-variable' | 'unknown-variable' | 'closed';
export type ContributionResult = Readonly<{
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
export type ContributionsResult = Readonly<{
    kind: 'current';
    set: PromptContributionSet;
}> | Readonly<{
    kind: 'rejected';
    reason: 'closed';
}>;
export interface PromptContributionRegistry {
    contributeSection(section: Omit<PromptSection, 'scope' | 'revision'>): ContributionResult;
    contributeVariable(variable: Omit<PromptVariable, 'scope' | 'revision'>): ContributionResult;
    contributions(scope: ScopeRef | null): ContributionsResult;
}
```

## 声明文件 `representation.d.ts`

```ts
import type * as M from '@omne-harness/model-contract';
import { type BlockId, type ContentReference } from '@omne-harness/content-block';
import { type Message, type MessageId } from '@omne-harness/message';
import type { RepresentationChoice } from './values.js';
import type { RepresentationPolicyPort } from './ports.js';
export type { ConversionIndex } from './values.js';
import type { ConversionIndex } from './values.js';
export type RepresentationResult = Readonly<{
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
type RepresentationInput = Readonly<{
    messages: readonly Message[];
    conversions: ConversionIndex;
    modalities: readonly M.ModelModality[];
    policy: RepresentationPolicyPort;
}>;
export declare function chooseRepresentations(input: RepresentationInput): RepresentationResult;
```

## 声明文件 `resume.d.ts`

```ts
import type { AssemblyInput, AssemblyResult, TransitionEvidence } from './values.js';
import type { AssemblyPolicies, AssemblyPorts } from './ports.js';
export declare function resume<P>(input: AssemblyInput<P> & Readonly<{
    transition: TransitionEvidence;
}>, ports: AssemblyPorts<P>, policies: AssemblyPolicies): Promise<AssemblyResult>;
```

## 声明文件 `schema-primitives.d.ts`

```ts
import type { StandardSchemaV1 } from '@standard-schema/spec';
export type Path = readonly (string | number)[];
export type Decoded<T> = Readonly<{
    ok: true;
    value: T;
}> | Readonly<{
    ok: false;
    issues: readonly Readonly<{
        path: Path;
        message: string;
    }>[];
}>;
export type Decoder<T> = (value: unknown, path: Path) => Decoded<T>;
export declare function standardSchema<T>(decode: Decoder<T>): StandardSchemaV1<unknown, T>;
export declare function record(v: unknown): v is Record<string, unknown>;
export declare function decimal(v: unknown): v is string;
export declare function revision(v: unknown): v is number;
export declare function integer(v: unknown): v is string;
export declare function reject(path: Path): Decoded<never>;
export declare function adoption(v: unknown): v is import('./refs.js').Adoption;
export declare function isEvidence(v: unknown): v is import('./refs.js').DurableEvidence;
export declare function isConsumed(v: unknown): v is Readonly<{
    index: string;
    evidence: import('./refs.js').DurableEvidence;
}>;
```

## 声明文件 `schema.d.ts`

```ts
import type { RetainBudget } from './ports.js';
export type { Path, Decoded, Decoder } from './schema-primitives.js';
export { standardSchema, record, decimal } from './schema-primitives.js';
export declare const compactionPolicySchema: import("@standard-schema/spec").StandardSchemaV1<unknown, Readonly<{
    retainBudget: RetainBudget;
    retainPreference: 'newest-first' | 'most-referenced';
    triggerPercent: string | null;
    headroomTokens: string | null;
    trimFirst: boolean;
    stepBound: string;
}>>;
export declare const representationPolicyConfigSchema: import("@standard-schema/spec").StandardSchemaV1<unknown, Readonly<{
    preferences: Readonly<Record<import("@omne-harness/model-contract").ModelModality, readonly ('original' | 'derived' | 'transcript')[]>>;
}>>;
export declare const planProgressSchema: import("@standard-schema/spec").StandardSchemaV1<unknown, Readonly<{
    planId: import("./refs.js").PlanId;
    completed: string;
    consumed: readonly Readonly<{
        index: string;
        evidence: import("./refs.js").DurableEvidence;
    }>[];
}>>;
export declare const compactionPlanSchema: import("@standard-schema/spec").StandardSchemaV1<unknown, Readonly<{
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
export declare const coverageSchema: import("@standard-schema/spec").StandardSchemaV1<unknown, Readonly<{
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

## 声明文件 `testing/case.d.ts`

```ts
export type ConformanceCase<F> = Readonly<{
    name: string;
    clause: string;
    run(fixture: F): Promise<void>;
}>;
export declare class NotApplicable extends Error {
    readonly handle: string;
    constructor(handle: string);
}
export type CaseVerdict = Readonly<{
    kind: 'passed';
}> | Readonly<{
    kind: 'not-applicable';
    handle: string;
}>;
export declare function runConformanceCase<F>(test: ConformanceCase<F>, fixture: F): Promise<CaseVerdict>;
```

## 声明文件 `testing/conformance.d.ts`

```ts
import { type TenantId } from '@omne-harness/legal-identity';
import type { HistorySource, CompactionPolicyPort, RepresentationPolicyPort } from '../ports.js';
import type { Access } from '../refs.js';
import type { AssemblyPorts, AssemblyPolicies } from '../ports.js';
import type { AssemblyInput, AssemblyResult, PlanResult, StepResult, TransitionEvidence } from '../values.js';
import type { DeriveInput } from '../values.js';
import type { ConformanceCase } from './case.js';
import type { HistoryFixture } from './history-source.js';
export type ConformanceSubject<P> = Readonly<{
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
type BoundCase = Readonly<{
    id: string;
    obligation: string;
    run(): Promise<void>;
}>;
declare function historySourceCases<P>(subject: Readonly<{
    source: HistorySource<P>;
    fixture: HistoryFixture;
    access: Access<P>;
    otherTenant: TenantId;
    createSource: (fixture: HistoryFixture) => HistorySource<P>;
}>): readonly BoundCase[];
declare function compactionPolicyCases(subject: Readonly<{
    policy: CompactionPolicyPort;
    fixture: HistoryFixture;
}>): readonly BoundCase[];
declare function representationPolicyCases(subject: Readonly<{
    policy: RepresentationPolicyPort;
}>): readonly BoundCase[];
export declare const REQUEST_CONTEXT_OBLIGATIONS: readonly [
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
export type RequestContextObligation = (typeof REQUEST_CONTEXT_OBLIGATIONS)[number];
export declare const HISTORY_SOURCE_OBLIGATIONS: readonly [
    'read-requires-access',
    'tenant-isolation',
    'page-size-retains-order',
    'missing-scope-is-invalid',
    'page-respects-byte-budget',
    'prefix-digest-is-chained'
];
export type HistorySourceObligation = (typeof HISTORY_SOURCE_OBLIGATIONS)[number];
export declare const COMPACTION_POLICY_OBLIGATIONS: readonly [
    'configuration-stable',
    'trim-does-not-mutate'
];
export type CompactionPolicyObligation = (typeof COMPACTION_POLICY_OBLIGATIONS)[number];
export declare const REPRESENTATION_POLICY_OBLIGATIONS: readonly [
    'text-original-decision',
    'unsupported-without-conversion'
];
export type RepresentationPolicyObligation = (typeof REPRESENTATION_POLICY_OBLIGATIONS)[number];
export declare function requestContextConformance<P>(): readonly ConformanceCase<ConformanceSubject<P>>[];
export type HistorySourceFixture<P> = Parameters<typeof historySourceCases<P>>[0];
export declare function historySourceConformance<P>(): readonly ConformanceCase<HistorySourceFixture<P>>[];
export type CompactionPolicyFixture = Parameters<typeof compactionPolicyCases>[0];
export declare function compactionPolicyConformance(): readonly ConformanceCase<CompactionPolicyFixture>[];
export type RepresentationPolicyFixture = Parameters<typeof representationPolicyCases>[0];
export declare function representationPolicyConformance(): readonly ConformanceCase<RepresentationPolicyFixture>[];
export {};
```

## 声明文件 `testing/doubles.d.ts`

```ts
import type * as M from '@omne-harness/model-contract';
import type { Outcome } from '@omne-harness/operation-result';
import type { BlockId } from '@omne-harness/content-block';
import type { ConversionResultSource, CompactionPolicyPort, RepresentationPolicyPort, CompactionPolicy, RepresentationPolicyConfig } from '../ports.js';
export type MeterScript = (input: Parameters<M.ModelInputMeter['measure']>[0]) => Outcome<M.RequestBudget, M.TransportFailure>;
export interface ScriptedInputMeter extends M.ModelInputMeter {
    readonly durability: 'none';
    calls(): number;
}
export declare function createScriptedInputMeter(basis: M.ModelCountingBasis, script: MeterScript): ScriptedInputMeter;
export interface MemoryConversionResults<P> extends ConversionResultSource<P> {
    readonly durability: 'none';
    set(block: BlockId, result: M.ConversionResult): void;
}
export declare function createMemoryConversionResults<P>(initial?: ReadonlyMap<BlockId, M.ConversionResult>): MemoryConversionResults<P>;
export declare const FIXTURE_COMPACTION_POLICY: CompactionPolicy;
export declare const FIXTURE_REPRESENTATION_CONFIG: RepresentationPolicyConfig;
export declare function createScriptedCompactionPolicy(config?: CompactionPolicy): CompactionPolicyPort & Readonly<{
    durability: 'none';
}>;
export declare function createScriptedRepresentationPolicy(config?: RepresentationPolicyConfig): RepresentationPolicyPort & Readonly<{
    durability: 'none';
}>;
```

## 声明文件 `testing/fixtures.d.ts`

```ts
import { type ModelProfile } from '@omne-harness/model-contract';
import { type Message } from '@omne-harness/message';
import { type AssemblyInput, type HistoryRow } from '../index.js';
export declare const adoption: {
    owner: string;
    name: string;
    revision: string;
    digest: string;
};
export declare const evidence: {
    owner: string;
    record: string;
    revision: string;
    digest: string;
};
export declare function must<T>(v: {
    ok: T;
} | {
    failure: unknown;
}): T;
export declare const scope: import('@omne-harness/runtime-context-contract').ScopeRef;
export declare const epoch: import("../refs.js").RequestContextRef<"EpochId">;
export declare function entry(raw: string): import("@omne-harness/message").RecordEntryRef;
export declare function text(raw: string, id?: string): {
    id: import("@omne-harness/content-block").BlockId;
    visibility: import("@omne-harness/content-block").Visibility;
    kind: 'text';
    text: string;
};
export declare function message(raw: string, id?: string): Message;
export declare function row(seq?: number): HistoryRow;
export declare const profile: ModelProfile;
export type AssemblyInputFixtureOptions = Partial<AssemblyInput<string>>;
export declare function createAssemblyInput(options?: AssemblyInputFixtureOptions): AssemblyInput<string>;
export declare function testingAccess<P>(principal: P, tenant: import('@omne-harness/legal-identity').TenantId): import('../refs.js').Access<P>;
```

## 声明文件 `testing/history-source.d.ts`

```ts
import { type TenantId } from '@omne-harness/legal-identity';
import type { ScopeRef } from '@omne-harness/runtime-context-contract';
import { type CompactionMessage, type CoveredEntry, type RecordEntryRef } from '@omne-harness/message';
import type { EpochId } from '../refs.js';
import type { HistorySource, HistoryRow } from '../ports.js';
export type HistoryFixture = Readonly<{
    scope: ScopeRef;
    epochs: readonly Readonly<{
        epoch: EpochId;
        rows: readonly Omit<HistoryRow, 'prefixDigest'>[];
        entries: readonly CoveredEntry[];
        open: readonly RecordEntryRef[];
    }>[];
    tenant: TenantId;
}>;
export interface MemoryHistorySource<P> extends HistorySource<P> {
    readonly durability: 'none';
    commitCompaction(record: CompactionMessage): EpochId;
    denyTenant(tenant: TenantId): void;
    fail(diagnostic: string): void;
    readCount(): number;
}
export declare function createMemoryHistorySource<P>(fixture: HistoryFixture): MemoryHistorySource<P>;
```

## 声明文件 `testing/index.d.ts`

```ts
export { createMemoryHistorySource } from './history-source.js';
export type { MemoryHistorySource, HistoryFixture } from './history-source.js';
export { createScriptedInputMeter, createMemoryConversionResults, createScriptedCompactionPolicy, createScriptedRepresentationPolicy, FIXTURE_COMPACTION_POLICY, FIXTURE_REPRESENTATION_CONFIG, } from './doubles.js';
export type { MeterScript, ScriptedInputMeter, MemoryConversionResults } from './doubles.js';
export type { AssemblyInputFixtureOptions } from './fixtures.js';
export { createAssemblyInput, testingAccess } from './fixtures.js';
export { requestContextConformance, historySourceConformance, compactionPolicyConformance, representationPolicyConformance, } from './conformance.js';
export type { ConformanceSubject } from './conformance.js';
export { runConformanceCase } from './case.js';
export type { ConformanceCase, CaseVerdict } from './case.js';
export { REQUEST_CONTEXT_OBLIGATIONS, HISTORY_SOURCE_OBLIGATIONS, COMPACTION_POLICY_OBLIGATIONS, REPRESENTATION_POLICY_OBLIGATIONS, } from './conformance.js';
export type { RequestContextObligation, HistorySourceObligation, CompactionPolicyObligation, RepresentationPolicyObligation, HistorySourceFixture, CompactionPolicyFixture, RepresentationPolicyFixture, } from './conformance.js';
export { NotApplicable } from './case.js';
```

## 声明文件 `values.d.ts`

```ts
import type { Access, Adoption, DurableEvidence, EpochId, BatchRef, CandidateRef, PositionRef, PassageRef, PlanId } from './refs.js';
import type { ScopeRef, ContextBlockKey, SnapshotResult, ChangesResult, BlockRevision, ViewRevision, EligibilityId, BlockValue, BlockDescriptorBase } from '@omne-harness/runtime-context-contract';
import type * as M from '@omne-harness/model-contract';
import type * as T from '@omne-harness/tool-contract';
import type { Message, RecordEntryRef, CompactionMessage, MessageContentBlock } from '@omne-harness/message';
import type { ContentBlock, BlockId, ContentReference } from '@omne-harness/content-block';
export type RequestPurpose = 'main' | 'extension';
export type HistoryEvidence = Readonly<{
    scope: ScopeRef;
    epoch: EpochId;
    upper: number;
}>;
export type NewInputBatch = Readonly<{
    batch: BatchRef;
    entries: readonly RecordEntryRef[];
    saved: DurableEvidence | null;
}>;
export type BlockMaterial<K extends ContextBlockKey = ContextBlockKey> = Readonly<{
    key: K;
    revision: BlockRevision;
    value: BlockValue<K>;
    previous: unknown | null;
    volatility: BlockDescriptorBase<K, BlockValue<K>>['volatility'];
}>;
export type SnapshotMaterial = Readonly<{
    scope: ScopeRef;
    eligibility: EligibilityId;
    revision: ViewRevision;
    blocks: readonly BlockMaterial[];
}>;
export type ContextReadGroup = Readonly<{
    scope: ScopeRef;
    recipient: string;
    read: SnapshotResult | ChangesResult;
    snapshot: SnapshotMaterial | null;
    perRequest: readonly BlockMaterial[];
    source: DurableEvidence;
    coverage: DurableEvidence;
}>;
export type AssemblyContext = Readonly<{
    scope: ScopeRef;
    definition: string | null;
    workspace: string | null;
    keys: Readonly<Record<string, string>>;
}>;
export type PromptContributionBase = Readonly<{
    name: string;
    scope: ScopeRef | null;
    source: Adoption;
    revision: string;
}>;
export type PromptSection = PromptContributionBase & Readonly<{
    kind: 'section';
    order: string;
    template: string;
    uses: readonly string[];
}>;
export type PromptVariable = PromptContributionBase & Readonly<{
    kind: 'variable';
    value: string;
    volatility: 'stable' | 'per-request';
}>;
export type PromptContribution = PromptSection | PromptVariable;
export type PromptContributionSet = Readonly<{
    contributions: readonly PromptContribution[];
    digest: string;
    generation: string | null;
}>;
export type SelectedModel = Readonly<{
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
export type ToolAdoption = Readonly<{
    resident: boolean;
    availability: T.ToolAvailability;
    binding: Adoption;
}>;
export type ConditionsEvidence = Readonly<{
    evidence: DurableEvidence;
    revision: string;
}>;
export type AlterationEvidence = Readonly<{
    evidence: DurableEvidence;
    touches: 'existing-layers' | 'history-tail';
}>;
export type PreviousPreparation = Readonly<{
    candidate: CandidateRef;
    enteredCompaction: PlanId | null;
    carried?: RequestCandidate;
}>;
export type AssemblyInput<P> = Readonly<{
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
export type TransitionEvidence = Readonly<{
    planId: PlanId;
    candidate: CandidateRef;
    committed: DurableEvidence;
    epoch: EpochId;
}>;
export declare const LAYER_ORDER: readonly [
    "system-prompt",
    "tool-declarations",
    "history-head",
    "snapshot-reminder",
    "history-body",
    "tail-facts"
];
export type Layer = (typeof LAYER_ORDER)[number];
export declare const PREFIX_BREAK_REASONS: readonly [
    "new-full-read",
    "system-prompt-changed",
    "tool-set-changed",
    "compaction",
    "extension-altered",
    "model-changed",
    "unchanged"
];
export type PrefixBreakReason = (typeof PREFIX_BREAK_REASONS)[number];
export type LayerAnchor = Readonly<{
    layer: Extract<Layer, 'history-head' | 'snapshot-reminder' | 'history-body'>;
    seq: number;
    prefixDigest: string;
}>;
export type SnapshotAnchor = Readonly<{
    epoch: EpochId;
    seq: number;
    prefixDigest: string | null;
}>;
export type Coverage = Readonly<{
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
export type BudgetBreach = Readonly<{
    check: M.BudgetCheck;
    layer: Layer | 'whole';
}>;
export type FitVerdict = Readonly<{
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
export type RepresentationChoice = Readonly<{
    message: import('@omne-harness/message').MessageId;
    block: BlockId;
    choice: 'original' | 'derived' | 'transcript' | 'pending-load';
    converter: Adoption | null;
    mediaType: string | null;
}>;
export type SnapshotReminder = Readonly<{
    scope: ScopeRef;
    eligibility: EligibilityId;
    revision: ViewRevision;
    anchor: SnapshotAnchor;
    blocks: readonly BlockMaterial[];
    message: import('@omne-harness/message').SystemReminderMessage | null;
}>;
export type TailFacts = Readonly<{
    blocks: readonly BlockMaterial[];
    message: import('@omne-harness/message').SystemReminderMessage | null;
}>;
export type RequestLayers = Readonly<{
    systemPrompt: readonly ContentBlock[];
    toolDeclarations: ToolDeclarationSet;
    historyHead: readonly Message[];
    snapshotReminder: SnapshotReminder;
    historyBody: readonly Message[];
    tailFacts: TailFacts;
}>;
export type RequestCandidate = Readonly<{
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
export type CompactionPlan = Readonly<{
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
export type PlanProgress = Readonly<{
    planId: PlanId;
    completed: string;
    consumed: readonly Readonly<{
        index: string;
        evidence: DurableEvidence;
    }>[];
}>;
export type SummaryMaterial = Readonly<{
    covered: readonly import('@omne-harness/message').CoveredEntry[];
    retained: readonly RecordEntryRef[];
    trimmed: readonly Readonly<{
        message: import('@omne-harness/message').MessageId;
        block: BlockId;
        originalBytes: string;
        keptBytes: string;
    }>[];
}>;
export type StepRequest = Readonly<{
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
export type StepInput = Readonly<{
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
export type ContextTransition = Readonly<{
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
export type AssemblyFailure = Readonly<{
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
export type InvalidReason = 'missing-input' | 'missing-access' | 'missing-scope' | 'inputs-not-saved' | 'missing-snapshot-material' | 'missing-assembly-context' | 'unsupported-format' | 'compaction-purpose' | 'per-request-variable' | 'profile-binding-conflict' | 'resume-without-full-snapshot' | 'scope-mismatch' | 'contradictory-retry' | 'contributions-not-accepted' | 'cursor-invalidated' | 'plan-mismatch' | 'progress-mismatch' | 'policy-mismatch';
export type UnavailableOwner = 'history-source' | 'meter' | 'conversion-results' | 'runtime-context' | 'representation' | 'instance';
export type AssemblyUnknown = Readonly<{
    kind: 'unknown';
    source: 'read' | 'commit';
    diagnostic: string;
}>;
export type AssemblyOutcome = Readonly<{
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
export type AssemblyResult = AssemblyOutcome | AssemblyFailure | AssemblyUnknown;
export type PlanResult = Readonly<{
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
export type StepResult = Readonly<{
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
export type PreparedInputKey = Readonly<{
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
export type DeriveInput = Readonly<{
    plan: CompactionPlan;
    progress: PlanProgress;
    step: StepInput;
    material: SummaryMaterial | null;
    selection: SelectedModel;
}>;
export type ToolRoute = Readonly<{
    declared: string;
    tool: Adoption;
    binding: Adoption;
    command: string | null;
}>;
export type ToolDeclarationSet = Readonly<{
    direct: readonly M.ToolDeclaration[];
    programmatic: readonly M.ToolDeclaration[];
    routes: readonly ToolRoute[];
    digest: string;
}>;
export type HistoryRow = Readonly<{
    seq: number;
    entry: RecordEntryRef;
    message: Message;
    bytes: string;
    prefixDigest: string;
}>;
export type ProjectedMessage = Readonly<{
    seq: number;
    entry: RecordEntryRef;
    prefixDigest: string;
    message: Message;
    dropped: readonly BlockId[];
}>;
export type ProjectedHistory = Readonly<{
    epoch: EpochId;
    messages: readonly ProjectedMessage[];
    compaction: Readonly<{
        seq: number;
        entry: RecordEntryRef;
    }> | null;
}>;
export type ConversionIndex = ReadonlyMap<BlockId, M.ConversionResult>;
```
