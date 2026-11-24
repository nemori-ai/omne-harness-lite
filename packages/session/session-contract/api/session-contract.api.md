# @omne-harness/session-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `AdmittedMessage` · `faces.d.ts`
- `AdmittedSource` · `input-sources.d.ts`
- `Adoption` · 包 `@omne-harness/exchange-refs`
- `AdoptionEvidenceCommand` · `ports.d.ts`
- `AdvanceClaim` · `judgments.d.ts`
- `AdvanceJudgment` · `judgments.d.ts`
- `AdvanceRef` · `identity.d.ts`
- `AgentDrivePort` · `ports.d.ts`
- `AgentInstanceRef` · `identity.d.ts`
- `ArchiveCollapse` · `call-control.d.ts`
- `ArchivedBy` · `faces.d.ts`
- `AttemptId` · `identity.d.ts`
- `Attendance` · `values.d.ts`
- `AuthorizationConsumer` · `authorizations.d.ts`
- `AuthorizationContext` · `authorizations.d.ts`
- `AuthorizationExpression` · `authorizations.d.ts`
- `AuthorizationScope` · `authorizations.d.ts`
- `AutoArchivePolicy` · `values.d.ts`
- `BackgroundCallLabel` · `background-calls.d.ts`
- `BackgroundCallRecord` · `background-calls.d.ts`
- `BackgroundCallResolution` · `background-calls.d.ts`
- `BackgroundCallSource` · `background-calls.d.ts`
- `BackgroundCallState` · `background-calls.d.ts`
- `BackgroundCallStatus` · `background-calls.d.ts`
- `BackgroundCallStop` · `background-calls.d.ts`
- `BackgroundCallView` · `background-calls.d.ts`
- `BackgroundDisposition` · `values.d.ts`
- `BackgroundOutcomeJudgment` · `background-outcome.d.ts`
- `BatchId` · `identity.d.ts`
- `BeforeIntakeRegistry` · `before-intake.d.ts`
- `BoundedClose` · `values.d.ts`
- `BudgetTerms` · `input-sources.d.ts`
- `CONTEXT_SCOPE_KINDS` · `context-scopes.d.ts`
- `CallBinding` · `values.d.ts`
- `CallRegistrationView` · `call-registration.d.ts`
- `ChildRecord` · `standing.d.ts`
- `ClockSample` · `values.d.ts`
- `CommitReceipt` · `faces.d.ts`
- `CommittedBatch` · `judgments.d.ts`
- `CommittedBinding` · `committed-bindings.d.ts`
- `CompactionCommitState` · `compaction-commit.d.ts`
- `CompactionContextRead` · `faces.d.ts`
- `Completion` · `faces.d.ts`
- `CompletionJudgment` · `judgments.d.ts`
- `ConsumerRef` · 包 `@omne-harness/exchange-refs`
- `Consumption` · `values.d.ts`
- `ConsumptionId` · `identity.d.ts`
- `ContextMaterial` · `values.d.ts`
- `ContextScopeBinding` · `values.d.ts`
- `Control` · `values.d.ts`
- `ControlIntent` · `values.d.ts`
- `ControlOperationResolution` · `control-values.d.ts`
- `ControlProgress` · `values.d.ts`
- `ControlRoutes` · `call-control.d.ts`
- `ControlScope` · `judgments.d.ts`
- `ControlTarget` · `values.d.ts`
- `CustodyEvidenceCommand` · `ports.d.ts`
- `DEFAULT_SESSION_INTAKE_LIMITS` · `intake.d.ts`
- `DecideReads` · `judgments.d.ts`
- `Decision` · `judgments.d.ts`
- `DeclarationChange` · `values.d.ts`
- `DeliveredInputs` · `faces.d.ts`
- `DerivedAdmission` · `input-sources.d.ts`
- `DerivedInputKind` · `input-sources.d.ts`
- `DerivedMessage` · `values.d.ts`
- `DirectCallControl` · `call-control.d.ts`
- `DirectoryStanding` · `directory-relation.d.ts`
- `DriveFailure` · `ports.d.ts`
- `DriveOperationElements` · `operations.d.ts`
- `DriveReceipt` · `ports.d.ts`
- `DriveReply` · `ports.d.ts`
- `DriveTarget` · `ports.d.ts`
- `DurableEvidence` · 包 `@omne-harness/exchange-refs`
- `EMPTY_AUTHORIZATIONS` · `authorizations.d.ts`
- `EncodedEntry` · `judgments.d.ts`
- `EntryClass` · `faces.d.ts`
- `EntryId` · `identity.d.ts`
- `ExecutionHistoryBoundary` · `history-values.d.ts`
- `ExecutionRef` · `values.d.ts`
- `ExecutionStatus` · `ports.d.ts`
- `ExternalCompletion` · `faces.d.ts`
- `ForkFacts` · `fork.d.ts`
- `ForkPoint` · `fork.d.ts`
- `ForkPointJudgment` · `fork.d.ts`
- `ForkPointRead` · `faces.d.ts`
- `FreezeVerdict` · `values.d.ts`
- `GuardCommand` · `ports.d.ts`
- `HistoryEntry` · `faces.d.ts`
- `HistoryPage` · `faces.d.ts`
- `INGRESS_FAMILIES` · `operations.d.ts`
- `INITIALIZATION_PROTOCOL` · `initialization-schema.d.ts`
- `INPUT_FATE_KINDS` · `input-fate.d.ts`
- `INTAKE_BUDGET_REQUIRED` · `input-sources.d.ts`
- `INTAKE_GUARD_OWNER` · `input-sources.d.ts`
- `IdleCoverage` · `values.d.ts`
- `IdleJudgment` · `judgments.d.ts`
- `IdleObservation` · `values.d.ts`
- `IngressFamily` · `operations.d.ts`
- `InitialAdoption` · `values.d.ts`
- `InitializationAdoption` · `values.d.ts`
- `InitializationConsequence` · `values.d.ts`
- `InitializationFactReference` · `values.d.ts`
- `InitializationGuardFacts` · `values.d.ts`
- `InitializationGuardResult` · `values.d.ts`
- `InitializationPlanItem` · `values.d.ts`
- `InitializationRegistration` · `values.d.ts`
- `InitializationRequirement` · `values.d.ts`
- `InitializationResult` · `values.d.ts`
- `InitializationSource` · `values.d.ts`
- `InitializationSources` · `values.d.ts`
- `InitializationState` · `values.d.ts`
- `InputAdmissionBoundary` · `history-values.d.ts`
- `InputAdmissionMember` · `history-values.d.ts`
- `InputAdmissionPage` · `history-values.d.ts`
- `InputBatch` · `values.d.ts`
- `InputFate` · `input-fate.d.ts`
- `InputId` · `identity.d.ts`
- `InputSourceDeclaration` · `input-sources.d.ts`
- `InputSourceLookup` · `input-sources.d.ts`
- `InputSourceName` · `input-sources.d.ts`
- `InputSourceRegistry` · `input-sources.d.ts`
- `InputSources` · `input-sources.d.ts`
- `IntakeBasis` · `input-sources.d.ts`
- `IntakeBlockRefusal` · `before-intake.d.ts`
- `IntakeProcessor` · `before-intake.d.ts`
- `IntakeScreening` · `before-intake.d.ts`
- `IntakeSubject` · `input-sources.d.ts`
- `IntakeTerms` · `input-sources.d.ts`
- `IntakeVerdict` · `before-intake.d.ts`
- `MAX_SESSION_DEPTH` · `standing.d.ts`
- `ModelViewBasis` · `faces.d.ts`
- `ModelViewRead` · `faces.d.ts`
- `ModelViewRow` · `faces.d.ts`
- `Modes` · `values.d.ts`
- `Mutation` · `identity.d.ts`
- `MutationName` · `ports.d.ts`
- `OnceAuthorization` · `authorizations.d.ts`
- `OpenWork` · `judgments.d.ts`
- `OperationJudgment` · `judgments.d.ts`
- `OperationRecord` · `judgments.d.ts`
- `OperationResolution` · `faces.d.ts`
- `PENDING_PAGE_LIMIT` · `intake-reads.d.ts`
- `PENDING_PREVIEW_CHARS` · `intake-reads.d.ts`
- `Participation` · `values.d.ts`
- `PendingInput` · `intake-reads.d.ts`
- `PendingPage` · `intake-reads.d.ts`
- `PendingReason` · `faces.d.ts`
- `ProducedResult` · `values.d.ts`
- `ProducerFact` · `faces.d.ts`
- `ProducerRef` · `values.d.ts`
- `ProductionEvidenceCommand` · `ports.d.ts`
- `RELATIONS_TO_REFERENCE` · `directory-relation.d.ts`
- `RecoveryTask` · `values.d.ts`
- `ReduceResult` · `judgments.d.ts`
- `RelatedSession` · `standing.d.ts`
- `Relation` · `values.d.ts`
- `RelationToReference` · `directory-relation.d.ts`
- `ReleasedScope` · `faces.d.ts`
- `Reply` · `faces.d.ts`
- `ResidentAdoption` · `values.d.ts`
- `ResidentKey` · `identity.d.ts`
- `ResidentReference` · `faces.d.ts`
- `ResidentTool` · `values.d.ts`
- `Resolution` · `utterance-resolver.d.ts`
- `ResultConsumption` · `values.d.ts`
- `RouteJudgment` · `judgments.d.ts`
- `RoutedInput` · `values.d.ts`
- `RunAdoption` · `ports.d.ts`
- `RunAdoptionInput` · `ports.d.ts`
- `RunBoundaryView` · `run-boundary.d.ts`
- `RunEnd` · `values.d.ts`
- `RunExecution` · `values.d.ts`
- `RunFailure` · `values.d.ts`
- `RunId` · `identity.d.ts`
- `RunStartJudgment` · `judgments.d.ts`
- `RunState` · `values.d.ts`
- `RunTerminal` · `values.d.ts`
- `SavedModelSelection` · `control-values.d.ts`
- `ScopeReleaseDisposition` · `values.d.ts`
- `ScopeReleasePort` · `ports.d.ts`
- `ScopeReleaseReadback` · `ports.d.ts`
- `Screened` · `before-intake.d.ts`
- `SenderView` · `utterance-resolver.d.ts`
- `SessionAccess` · `identity.d.ts`
- `SessionAccessCheck` · `access.d.ts`
- `SessionAccessDecision` · `access.d.ts`
- `SessionAccessOperation` · `access.d.ts`
- `SessionAccessRequest` · `access.d.ts`
- `SessionAccessTarget` · `access.d.ts`
- `SessionAdoptionPlanAnswer` · `ports.d.ts`
- `SessionAdoptionPlanInput` · `ports.d.ts`
- `SessionAdoptionRecorded` · `ports.d.ts`
- `SessionAdoptionSource` · `ports.d.ts`
- `SessionAttemptRecord` · `history-values.d.ts`
- `SessionAuthorization` · `authorizations.d.ts`
- `SessionBatchRecord` · `history-values.d.ts`
- `SessionBlockDeclaration` · `ports.d.ts`
- `SessionCall` · `call-settlement.d.ts`
- `SessionCallBinding` · `call-settlement.d.ts`
- `SessionCallControl` · `ports.d.ts`
- `SessionCallEntryReferences` · `work-entry-values.d.ts`
- `SessionCallKeys` · `call-settlement.d.ts`
- `SessionCallLookup` · `control-values.d.ts`
- `SessionCallRecord` · `call-values.d.ts`
- `SessionCallRegistration` · `call-values.d.ts`
- `SessionCallStates` · `ports.d.ts`
- `SessionCallTerminal` · `control-values.d.ts`
- `SessionCallWait` · `call-values.d.ts`
- `SessionCallerClass` · `identity.d.ts`
- `SessionCheckedAccess` · `access.d.ts`
- `SessionClock` · `ports.d.ts`
- `SessionCommand` · `ports.d.ts`
- `SessionContextInput` · `ports.d.ts`
- `SessionContextScope` · `context-scopes.d.ts`
- `SessionControlAnswer` · `control-values.d.ts`
- `SessionControlDecisionInput` · `control-normalization.d.ts`
- `SessionControlEntryReferences` · `work-entry-values.d.ts`
- `SessionControlEvidence` · `control-normalization.d.ts`
- `SessionControlOrigin` · `control-normalization.d.ts`
- `SessionControlReceipt` · `control-values.d.ts`
- `SessionControlRecordEvidence` · `control-normalization.d.ts`
- `SessionControlSettlement` · `control-normalization.d.ts`
- `SessionControlStage` · `control-normalization.d.ts`
- `SessionCreation` · `values.d.ts`
- `SessionCustodySource` · `ports.d.ts`
- `SessionDelegatedTransactions` · `access.d.ts`
- `SessionDerivedInputs` · `input-sources.d.ts`
- `SessionDirectory` · `faces.d.ts`
- `SessionEntriesBoundary` · `interpretation-values.d.ts`
- `SessionEntriesChannel` · `interpretation-values.d.ts`
- `SessionEntriesInterpretation` · `interpretation-values.d.ts`
- `SessionEntriesItem` · `interpretation-values.d.ts`
- `SessionEntriesObservation` · `interpretation-values.d.ts`
- `SessionEntriesProgress` · `interpretation-values.d.ts`
- `SessionEntriesReceipt` · `interpretation-values.d.ts`
- `SessionEntriesStart` · `interpretation-values.d.ts`
- `SessionEvidenceBridge` · `ports.d.ts`
- `SessionExecutionPrefix` · `history-values.d.ts`
- `SessionFaces` · `faces.d.ts`
- `SessionFactBoundary` · `history-values.d.ts`
- `SessionFactKind` · `history-values.d.ts`
- `SessionFailure` · `faces.d.ts`
- `SessionFork` · `fork.d.ts`
- `SessionFrozen` · `values.d.ts`
- `SessionHistory` · `faces.d.ts`
- `SessionHistoryIndex` · `history-values.d.ts`
- `SessionHistoryReads` · `history-values.d.ts`
- `SessionId` · `identity.d.ts`
- `SessionIdentity` · `identity.d.ts`
- `SessionIdentityBridge` · `ports.d.ts`
- `SessionIdleInput` · `ports.d.ts`
- `SessionInputAdmission` · `history-values.d.ts`
- `SessionInputScope` · `history-values.d.ts`
- `SessionIntakeBudget` · `input-sources.d.ts`
- `SessionIntakeLimits` · `intake.d.ts`
- `SessionInternalPrincipals` · `ports.d.ts`
- `SessionLateCallFact` · `call-settlement.d.ts`
- `SessionListFilter` · `faces.d.ts`
- `SessionListItem` · `faces.d.ts`
- `SessionListPage` · `faces.d.ts`
- `SessionListRelation` · `faces.d.ts`
- `SessionLogCommitObservation` · `interpretation-values.d.ts`
- `SessionLogConsequence` · `projection.d.ts`
- `SessionLogObservation` · `projection.d.ts`
- `SessionLogReceipt` · `interpretation-values.d.ts`
- `SessionLogRoot` · `history-values.d.ts`
- `SessionManagement` · `faces.d.ts`
- `SessionModelSelection` · `control-values.d.ts`
- `SessionNotifier` · `ports.d.ts`
- `SessionOperationElements` · `operations.d.ts`
- `SessionOperationId` · `identity.d.ts`
- `SessionPermissionAssignment` · `permission-values.d.ts`
- `SessionPermissionChangeBasis` · `permission-values.d.ts`
- `SessionPermissionHistory` · `permission-history.d.ts`
- `SessionPermissionWriteQualification` · `permission-values.d.ts`
- `SessionPermissions` · `permission-values.d.ts`
- `SessionPrefixFact` · `history-values.d.ts`
- `SessionPrincipalBindingSource` · `ports.d.ts`
- `SessionProductionSource` · `ports.d.ts`
- `SessionReadAccessOperation` · `access.d.ts`
- `SessionReconciliation` · `faces.d.ts`
- `SessionRevision` · `identity.d.ts`
- `SessionRunLookup` · `control-values.d.ts`
- `SessionScopeOwnerSource` · `ports.d.ts`
- `SessionTakenRecord` · `history-values.d.ts`
- `SessionTodos` · `todos.d.ts`
- `SessionTransactionPort` · `ports.d.ts`
- `SessionTree` · `values.d.ts`
- `SessionUninterpretedCall` · `history-values.d.ts`
- `SessionWaiting` · `values.d.ts`
- `SessionWork` · `faces.d.ts`
- `SessionWorkEntryIndex` · `work-entry-values.d.ts`
- `SessionWorkPrincipals` · `ports.d.ts`
- `SettledCallLookup` · `call-settlement.d.ts`
- `SourceAdmission` · `input-sources.d.ts`
- `SourceRefusal` · `input-sources.d.ts`
- `SourceRequest` · `source-requests.d.ts`
- `SourceRequestIdentities` · `source-requests.d.ts`
- `SourceTerms` · `input-sources.d.ts`
- `StartAdoption` · `faces.d.ts`
- `StartedRun` · `faces.d.ts`
- `StopInitiator` · `background-calls.d.ts`
- `StopView` · `background-calls.d.ts`
- `TodoItem` · `todos.d.ts`
- `TodoItemId` · `identity.d.ts`
- `TodoMutationReceipt` · `todos.d.ts`
- `TodoPage` · `todos.d.ts`
- `TodoPageCursor` · `todos.d.ts`
- `UnarchivedLifecycle` · `faces.d.ts`
- `Utterance` · `utterance-resolver.d.ts`
- `UtteranceResolver` · `utterance-resolver.d.ts`
- `UtteranceResolverRegistry` · `utterance-resolver.d.ts`
- `VisibleTodoItem` · `todos.d.ts`
- `Waiting` · `values.d.ts`
- `WaitingCall` · `intake-reads.d.ts`
- `WorkSnapshot` · `values.d.ts`
- `WorkspaceAttachment` · `values.d.ts`
- `WorkspaceSelection` · `workspace-selection.d.ts`
- `admitDerived` · `input-sources.d.ts`
- `admitDerivedOf` · `input-sources.d.ts`
- `admitSource` · `input-sources.d.ts`
- `archiveCollapse` · `call-control.d.ts`
- `backgroundCallView` · `background-calls.d.ts`
- `backgroundCalls` · `call-control.d.ts`
- `backgroundInputId` · `background-outcome.d.ts`
- `batchCallKeys` · `reduce.d.ts`
- `batchEvidence` · `batch-evidence.d.ts`
- `bindingOf` · `call-settlement.d.ts`
- `boundCall` · `call-settlement.d.ts`
- `boundConsumptions` · `committed-bindings.d.ts`
- `bringsOrigin` · `before-intake.d.ts`
- `budgetTermsOf` · `input-sources.d.ts`
- `callKeysIn` · `call-settlement.d.ts`
- `callKeysOutside` · `call-settlement.d.ts`
- `callWithLate` · `call-settlement.d.ts`
- `cancellationDriveOf` · `decision-support.d.ts`
- `childRecorded` · `standing.d.ts`
- `commandDigest` · `decide.d.ts`
- `commandInput` · `input-sources.d.ts`
- `commitWithinBudget` · `input-sources.d.ts`
- `committedBindings` · `committed-bindings.d.ts`
- `compactionCallChangeOf` · `work-entry-state.d.ts`
- `compactionContextForView` · `model-view.d.ts`
- `consumptionIdOf` · `decide-results.d.ts`
- `contextScopeOf` · `context-scopes.d.ts`
- `contextScopesOf` · `context-scopes.d.ts`
- `controlAnswer` · `call-control.d.ts`
- `controlRoutes` · `call-control.d.ts`
- `createBeforeIntakeRegistry` · `before-intake.d.ts`
- `createInputSourceRegistry` · `input-sources.d.ts`
- `createUtteranceResolverRegistry` · `utterance-resolver.d.ts`
- `decide` · `decide.d.ts`
- `decideCompactionCommit` · `compaction-commit.d.ts`
- `decideControlConsequences` · `control-normalization.d.ts`
- `deriveDriveOperation` · `operations.d.ts`
- `deriveIngressOperation` · `operations.d.ts`
- `deriveSessionOperation` · `operations.d.ts`
- `digestSessionEntries` · `entries-interpretation.d.ts`
- `digestSessionLog` · `log-interpretation.d.ts`
- `executionReadThrough` · `log-interpretation.d.ts`
- `expandHistoryEntries` · `entries.d.ts`
- `expectedHolds` · `judgments.d.ts`
- `expectedRevision` · `judgments.d.ts`
- `foldInputFate` · `input-fate.d.ts`
- `forkPointBefore` · `fork.d.ts`
- `forkPointText` · `fork.d.ts`
- `incompleteAuthorization` · `authorizations.d.ts`
- `initializationRegistrationCommit` · `initialization-plan.d.ts`
- `inputFateOfRows` · `intake-reads.d.ts`
- `inputSourceName` · `input-sources.d.ts`
- `inputsToDeliver` · `intake.d.ts`
- `intakeTermsOf` · `input-sources.d.ts`
- `isAcceptedInputRecord` · `model-view.d.ts`
- `isDeferredFact` · `history-values.d.ts`
- `judgeAdvance` · `judgments.d.ts`
- `judgeBackgroundOutcome` · `background-outcome.d.ts`
- `judgeCompletion` · `judgments.d.ts`
- `judgeForkPoint` · `fork.d.ts`
- `judgeIdle` · `judgments.d.ts`
- `judgeIntakeBlocks` · `before-intake.d.ts`
- `judgeRunStart` · `judgments.d.ts`
- `judgeSessionIntake` · `intake.d.ts`
- `judgeStanding` · `standing.d.ts`
- `judgeWaiting` · `judgments.d.ts`
- `keepsTheWords` · `before-intake.d.ts`
- `lendCalls` · `call-settlement.d.ts`
- `mutationAccessRequest` · `access.d.ts`
- `onceAuthorizationOf` · `authorizations.d.ts`
- `openWork` · `judgments.d.ts`
- `originalContent` · `before-intake.d.ts`
- `ownPositionAfter` · `fork.d.ts`
- `parseForkPoint` · `fork.d.ts`
- `parseInputSourceName` · `input-sources.d.ts`
- `pendingAcceptances` · `intake-reads.d.ts`
- `pendingInputOf` · `intake-reads.d.ts`
- `pendingIntakeCount` · `intake.d.ts`
- `pendingPageOf` · `intake-reads.d.ts`
- `prepareEntriesTerms` · `input-sources.d.ts`
- `prepareIntakeTerms` · `input-sources.d.ts`
- `previewOf` · `intake-reads.d.ts`
- `projectCompactionCommit` · `compaction-commit.d.ts`
- `projectSessionEntries` · `entries-interpretation.d.ts`
- `projectSessionLog` · `projection.d.ts`
- `readAccessRequest` · `access.d.ts`
- `readCallRegistration` · `call-registration.d.ts`
- `readRunBoundary` · `run-boundary.d.ts`
- `rebuildSessionPermissions` · `permission-history.d.ts`
- `reduce` · `reduce.d.ts`
- `reduceAuthorizations` · `authorizations.d.ts`
- `relatedOf` · `standing.d.ts`
- `relatedSessionOf` · `standing.d.ts`
- `relationToReference` · `directory-relation.d.ts`
- `requiredWorkEntries` · `work-entry-state.d.ts`
- `resolveCascade` · `judgments.d.ts`
- `resolveControlScope` · `judgments.d.ts`
- `resolveOperation` · `judgments.d.ts`
- `retireOnce` · `authorizations.d.ts`
- `routeInput` · `judgments.d.ts`
- `runCancelledBy` · `decision-support.d.ts`
- `runIdOf` · `decide.d.ts`
- `runStartInputs` · `intake.d.ts`
- `screenInput` · `before-intake.d.ts`
- `sessionInputBytes` · `intake.d.ts`
- `sessionIntakeLimits` · `intake.d.ts`
- `sessionModesBlock` · `block.d.ts`
- `shortCallId` · `background-calls.d.ts`
- `sourceRequestIdentities` · `source-requests.d.ts`
- `standingOf` · `standing.d.ts`
- `uninterpretedCalls` · `uninterpreted-calls.d.ts`
- `waitingCalls` · `intake-reads.d.ts`
- `wakingInputs` · `intake.d.ts`
- `withIntakeTerms` · `input-sources.d.ts`
- `withoutCommitted` · `committed-bindings.d.ts`
- `workspaceSelection` · `workspace-selection.d.ts`

## 入口 `./testing` · `testing.d.ts`

- `CaseVerdict` · `testing-case.d.ts`
- `ConformanceCase` · `testing-case.d.ts`
- `IdentityScript` · `testing-ports.d.ts`
- `MemoryAgentDrive` · `testing-providers.d.ts`
- `MemoryInitializationSource` · `testing-initialization-source.d.ts`
- `MemoryInitializationTransactions` · `testing-transactions.d.ts`
- `MemoryScopeRelease` · `testing-providers.d.ts`
- `MemorySessionClock` · `testing-ports.d.ts`
- `MemorySessionContextInput` · `testing-ports.d.ts`
- `MemorySessionEvidenceBridge` · `testing-ports.d.ts`
- `MemorySessionHistorySource` · `testing-history-source.d.ts`
- `MemorySessionIdleInput` · `testing-providers.d.ts`
- `MemorySessionLogTransactions` · `testing-transactions.d.ts`
- `MemorySessionNotifier` · `testing-providers.d.ts`
- `MemorySessionTransactionOptions` · `testing-transactions.d.ts`
- `MemorySessionTransactionPair` · `testing-transactions.d.ts`
- `MemorySessionTransactions` · `testing-transactions.d.ts`
- `NotApplicable` · `testing-case.d.ts`
- `ScriptedSessionAccessCheck` · `testing-access.d.ts`
- `ScriptedSessionIdentityBridge` · `testing-ports.d.ts`
- `SessionAccessScript` · `testing-access.d.ts`
- `SessionDelegatedTransactionsFixture` · `testing-delegated.d.ts`
- `SessionLogFixture` · `testing-log.d.ts`
- `SessionTransactionsFixture` · `testing-transactions.d.ts`
- `TESTING_DECLARATIONS` · `testing-sources.d.ts`
- `TESTING_OWNER` · `testing-values.d.ts`
- `TESTING_SOURCES` · `testing-sources.d.ts`
- `TESTING_SYSTEM_COMPONENT` · `testing-sources.d.ts`
- `adoptedInitializationFixture` · `testing-initialization.d.ts`
- `adoption` · `testing-values.d.ts`
- `agentDriveConformance` · `testing-provider-conformance.d.ts`
- `assertIndistinguishable` · `testing-case.d.ts`
- `assistantMessage` · `testing-values.d.ts`
- `conformanceCase` · `testing-case.d.ts`
- `createMemoryAgentDrive` · `testing-providers.d.ts`
- `createMemoryInitializationSource` · `testing-initialization-source.d.ts`
- `createMemoryScopeRelease` · `testing-providers.d.ts`
- `createMemorySessionClock` · `testing-ports.d.ts`
- `createMemorySessionContextInput` · `testing-ports.d.ts`
- `createMemorySessionEvidenceBridge` · `testing-ports.d.ts`
- `createMemorySessionHistorySource` · `testing-history-source.d.ts`
- `createMemorySessionIdleInput` · `testing-providers.d.ts`
- `createMemorySessionNotifier` · `testing-providers.d.ts`
- `createMemorySessionTransactionPair` · `testing-transactions.d.ts`
- `createMemorySessionTransactions` · `testing-transactions.d.ts`
- `createPolicySessionAccessCheck` · `testing-access.d.ts`
- `createScriptedSessionAccessCheck` · `testing-access.d.ts`
- `createScriptedSessionIdentityBridge` · `testing-ports.d.ts`
- `creation` · `testing-values.d.ts`
- `evidence` · `testing-values.d.ts`
- `expectKind` · `testing-case.d.ts`
- `guard` · `testing-values.d.ts`
- `handle` · `testing-case.d.ts`
- `initializationFixtureFacts` · `testing-initialization.d.ts`
- `initializationFixtureGuard` · `testing-initialization.d.ts`
- `inputId` · `testing-values.d.ts`
- `isNotApplicable` · `testing-case.d.ts`
- `memoryAccess` · `testing-values.d.ts`
- `memoryOtherAccess` · `testing-values.d.ts`
- `memorySessionDelegatedTransactionsFixture` · `testing-delegated.d.ts`
- `memorySessionLogFixture` · `testing-log.d.ts`
- `memorySessionTransactionsFixture` · `testing-transactions.d.ts`
- `mintEvidence` · `testing-values.d.ts`
- `operationId` · `testing-values.d.ts`
- `ordinaryInput` · `testing-values.d.ts`
- `pendingReasonsOf` · `testing-transactions.d.ts`
- `refused` · `testing-case.d.ts`
- `runConformanceCase` · `testing-case.d.ts`
- `scopeReleaseConformance` · `testing-provider-conformance.d.ts`
- `sessionClockConformance` · `testing-provider-conformance.d.ts`
- `sessionContextInputConformance` · `testing-provider-conformance.d.ts`
- `sessionDelegatedTransactionsConformance` · `testing-delegated.d.ts`
- `sessionEntriesConformance` · `testing-entries.d.ts`
- `sessionEvidenceBridgeConformance` · `testing-provider-conformance.d.ts`
- `sessionId` · `testing-values.d.ts`
- `sessionIdentityBridgeConformance` · `testing-provider-conformance.d.ts`
- `sessionIdleInputConformance` · `testing-provider-conformance.d.ts`
- `sessionLogConformance` · `testing-log.d.ts`
- `sessionNotifierConformance` · `testing-provider-conformance.d.ts`
- `sessionTransactionsConformance` · `testing-transactions.d.ts`
- `shapeOf` · `testing-case.d.ts`
- `succeeded` · `testing-case.d.ts`
- `testingDerivedInputs` · `testing-sources.d.ts`
- `testingInputSources` · `testing-sources.d.ts`
- `testingIntakeGuards` · `testing-sources.d.ts`
- `testingTenant` · `testing-values.d.ts`
- `testingWorkspace` · `testing-values.d.ts`
- `userMessage` · `testing-values.d.ts`
- `withMemberSubject` · `testing-access.d.ts`

## 声明文件 `access.d.ts`

```ts
import type { SessionPermissionWriteQualification } from './permission-values.ts';
import type { Access, TenantId } from '@omne-harness/legal-identity';
import type { DurableEvidence, ResidentKey, SessionAccess, SessionId } from './identity.ts';
import type { MutationName, SessionCommand, SessionTransactionPort } from './ports.ts';
import type { IntakeSubject } from './input-sources.ts';
export type SessionReadAccessOperation = 'listTodos' | 'readWork' | 'readCurrentScope' | 'readWaiting' | 'readBackgroundCalls' | 'resolveBackgroundCall' | 'readInput' | 'readPending' | 'readWaitingCalls' | 'readInputFate' | 'queryOperation' | 'readModelSelection' | 'queryControlOperation' | 'loadRecovery' | 'inspectIdle' | 'history.begin' | 'history.next' | 'history.since' | 'history.readModelView' | 'history.readCompactionContext' | 'history.readAdoptedRequest';
type SessionMutationAccess<P> = {
    readonly [K in MutationName]: Readonly<{
        access: Access<P>;
        operation: K;
        target: Readonly<{
            kind: 'session';
            session: SessionId;
            command: Extract<SessionCommand, {
                kind: K;
            }>;
        }>;
    }>;
}[MutationName];
export type SessionAccessRequest<P> = SessionMutationAccess<P> | Readonly<{
    access: Access<P>;
    operation: SessionReadAccessOperation;
    target: Readonly<{
        kind: 'session';
        session: SessionId;
    }>;
}> | Readonly<{
    access: Access<P>;
    operation: 'pending';
    target: Readonly<{
        kind: 'tenant';
        tenant: TenantId;
    }>;
}> | Readonly<{
    access: Access<P>;
    operation: 'directory.list';
    target: Readonly<{
        kind: 'tenant';
        tenant: TenantId;
    }>;
}> | Readonly<{
    access: Readonly<{
        principal: P;
        scope: 'system';
    }>;
    operation: 'references';
    target: Readonly<{
        kind: 'resident-references';
        key: ResidentKey;
    }>;
}> | Readonly<{
    access: Readonly<{
        principal: P;
        scope: 'system';
    }>;
    operation: 'releasedScopes';
    target: Readonly<{
        kind: 'released-scopes';
    }>;
}>;
export type SessionAccessOperation = SessionAccessRequest<unknown>['operation'];
export type SessionAccessTarget = SessionAccessRequest<unknown>['target'];
export type SessionAccessDecision = Readonly<{
    kind: 'allowed';
    evidence: DurableEvidence;
    writeQualification?: SessionPermissionWriteQualification;
    subject?: IntakeSubject;
}> | Readonly<{
    kind: 'denied';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface SessionAccessCheck<P> {
    check(input: SessionAccessRequest<P>): Promise<SessionAccessDecision>;
}
export type SessionCheckedAccess<P> = Readonly<{
    request: SessionAccessRequest<P>;
    evidence: DurableEvidence;
    writeQualification?: SessionPermissionWriteQualification;
    subject?: IntakeSubject;
}>;
export interface SessionDelegatedTransactions<P> {
    bind(checked: SessionCheckedAccess<P>): SessionTransactionPort<P>;
}
export declare function readAccessRequest<P>(access: SessionAccess<P>, operation: SessionReadAccessOperation): SessionAccessRequest<P>;
export declare function mutationAccessRequest<P>(access: SessionAccess<P>, command: SessionCommand): SessionAccessRequest<P>;
export {};
```

## 声明文件 `authorizations.d.ts`

```ts
import type { DurableEvidence } from './identity.ts';
export type AuthorizationConsumer = Readonly<{
    owner: string;
    work: string;
    position: string;
}>;
export type AuthorizationScope = Readonly<{
    kind: 'once';
    consumer: AuthorizationConsumer;
    target: string;
    argumentsDigest: string;
}> | Readonly<{
    kind: 'session';
    capabilityId: string;
    enforcementKey: string;
    basis: string;
}>;
export type AuthorizationExpression = Readonly<{
    scope: AuthorizationScope;
    direction: 'grant' | 'revoke';
    source: DurableEvidence;
}>;
type Scoped<K extends AuthorizationScope['kind']> = Omit<Extract<AuthorizationScope, {
    kind: K;
}>, 'kind'> & Readonly<{
    source: DurableEvidence;
}>;
export type OnceAuthorization = Scoped<'once'>;
export type SessionAuthorization = Scoped<'session'>;
export type AuthorizationContext = Readonly<{
    revision: string;
    once: readonly OnceAuthorization[];
    session: readonly SessionAuthorization[];
}>;
export declare const EMPTY_AUTHORIZATIONS: AuthorizationContext;
export declare function incompleteAuthorization(expression: AuthorizationExpression): string | null;
export declare function reduceAuthorizations(context: AuthorizationContext, expression: AuthorizationExpression): AuthorizationContext;
export declare function retireOnce(context: AuthorizationContext): AuthorizationContext;
export declare function onceAuthorizationOf(context: AuthorizationContext, consumer: AuthorizationConsumer): OnceAuthorization | undefined;
export {};
```

## 声明文件 `background-calls.d.ts`

```ts
import type { ConsumptionId, SessionOperationId } from './identity.ts';
import type { ProducerRef } from './values.ts';
type ToolProducer = Extract<ProducerRef, {
    kind: 'tool';
}>;
export type BackgroundCallLabel = Readonly<{
    intent: string | null;
    tool: string;
    command: string | null;
    preview: string;
}>;
export type BackgroundCallSource = 'launched' | 'control' | 'threshold' | 'foreground-limit';
export type StopInitiator = 'user' | 'agent' | 'system';
export type BackgroundCallStop = Readonly<{
    initiator: StopInitiator;
    reason: string | null;
    operation: SessionOperationId;
}>;
export type BackgroundCallRecord = Readonly<{
    consumption: ConsumptionId;
    producer: ToolProducer;
    ordinal: number;
    label: BackgroundCallLabel;
    source: BackgroundCallSource;
    stop?: BackgroundCallStop;
    settled?: 'input' | 'kept';
}>;
export type BackgroundCallResolution = Readonly<{
    producer: ToolProducer;
    settled: 'input' | 'kept' | null;
}>;
export type BackgroundCallState = Readonly<{
    phase: 'queued' | 'running' | 'settled';
    stop: 'pending' | 'accepted' | 'stopped' | null;
    lastLine: string | null;
}>;
export type BackgroundCallStatus = 'queued' | 'running' | 'ended-pending' | 'stopping' | 'unknown';
export type StopView = Readonly<{
    initiator: StopInitiator;
    reason: string | null;
    progress: 'requested' | 'accepted' | 'proven';
}>;
export type BackgroundCallView = Readonly<{
    id: string;
    producer: ToolProducer;
    label: BackgroundCallLabel;
    source: BackgroundCallSource;
    status: BackgroundCallStatus;
    stop: StopView | null;
    lastLine: string | null;
}>;
export declare function shortCallId(ordinal: number): string;
export declare function backgroundCallView(record: BackgroundCallRecord, state: BackgroundCallState | null): BackgroundCallView;
export {};
```

## 声明文件 `background-outcome.d.ts`

```ts
import type { BackgroundCallRecord, BackgroundCallStop } from './background-calls.ts';
import type { SessionEntry } from './entries.ts';
import type { HistoryEntry, SessionFailure } from './faces.ts';
import type { ConsumptionId, InputId } from './identity.ts';
import type { SessionEntriesInterpretation } from './interpretation-values.ts';
import type { Decision, EncodedEntry } from './judgments.ts';
import type { BackgroundDisposition, ControlProgress, ProducerRef, RoutedInput, WorkSnapshot } from './values.ts';
import { type IntakeTerms } from './input-sources.ts';
export declare const BACKGROUND_OUTCOME_EVIDENCE_OWNER = "background-tool-execution";
type Draft = {
    -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K];
};
type Ordinary = Extract<RoutedInput, {
    kind: 'ordinary';
}>;
type Backgrounded = Extract<SessionEntriesInterpretation, {
    kind: 'backgrounded';
}>;
type Outcome = Extract<SessionEntriesInterpretation, {
    kind: 'background-outcome';
}>;
type EntriesDecided = Extract<Decision, {
    kind: 'entries';
}>;
export type BackgroundOutcomeJudgment = Readonly<{
    kind: 'refused';
}> | Readonly<{
    kind: 'kept';
    reason: Extract<BackgroundDisposition, {
        kind: 'kept';
    }>['reason'];
}> | Readonly<{
    kind: 'input';
    destination: 'current-run' | 'next-run';
    stop: BackgroundCallStop | null;
}>;
export type BackgroundStep = Readonly<{
    kind: 'entries';
    entries: readonly EncodedEntry[];
    admitted: readonly Ordinary[];
    placeholders: readonly ConsumptionId[];
    controls: readonly ControlProgress[];
    ordinal?: number;
}> | Readonly<{
    kind: 'rejected';
    failure: SessionFailure;
}>;
export declare function backgroundInputId(producer: ProducerRef, result: string): InputId;
export declare function backgroundRecordOf(snapshot: WorkSnapshot, consumption: ConsumptionId): BackgroundCallRecord | null;
export declare function judgeBackgroundOutcome(snapshot: WorkSnapshot, consumption: ConsumptionId): BackgroundOutcomeJudgment;
export declare function withStopReminder(decision: EntriesDecided, snapshot: WorkSnapshot, record: BackgroundCallRecord, stop: BackgroundCallStop, terms: IntakeTerms | undefined): Decision;
export declare function decideBackground(snapshot: WorkSnapshot, fact: Backgrounded | Outcome, origin: HistoryEntry['origin'], derived: IntakeTerms['derived']): BackgroundStep;
export declare function applyBackgrounded(draft: Draft, entry: Extract<SessionEntry, {
    kind: 'call.backgrounded';
}>): string | null;
export declare function applyBackgroundStop(draft: Draft, progress: ControlProgress): void;
export declare function applyBackgroundSettled(draft: Draft, entry: Extract<SessionEntry, {
    kind: 'call.background-settled';
}>): string | null;
export declare function pruneInputLists(draft: Draft): void;
export {};
```

## 声明文件 `batch-evidence.d.ts`

```ts
import type { DurableEvidence } from './identity.ts';
import type { CommittedBatch } from './judgments.ts';
export declare function batchEvidence(batch: CommittedBatch, session: string): DurableEvidence;
```

## 声明文件 `before-intake.d.ts`

```ts
import { type Message, type MessageContentBlock } from '@omne-harness/message';
import type { InputId, SessionAccess, SessionOperationId } from './identity.ts';
import type { InputSourceName } from './input-sources.ts';
type ContentBlock = MessageContentBlock;
type BlockId = ContentBlock['id'];
export type IntakeScreening<P> = Readonly<{
    original: Message;
    effective: Message;
    source: InputSourceName;
    request: Readonly<{
        input: InputId;
        operation: SessionOperationId;
    }>;
    access: SessionAccess<P>;
}>;
export type IntakeVerdict = Readonly<{
    kind: 'pass';
    effective?: Message;
}> | Readonly<{
    kind: 'block';
    block?: BlockId;
    reason: string;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export type IntakeProcessor<P> = Readonly<{
    name: string;
    run(input: IntakeScreening<P>): Promise<IntakeVerdict>;
}>;
export type BeforeIntakeRegistry<P> = Readonly<{
    register(processor: IntakeProcessor<P>): () => void;
    current(): readonly IntakeProcessor<P>[];
}>;
export declare function createBeforeIntakeRegistry<P>(): BeforeIntakeRegistry<P>;
export declare const bringsOrigin: (message: Message) => boolean;
export declare function originalContent<M extends Message>(message: M): M;
export declare function keepsTheWords(original: Message, effective: unknown): effective is Message;
export type Screened = Readonly<{
    kind: 'screened';
    effective: Message;
}> | Readonly<{
    kind: 'blocked';
    processor: string;
    block: BlockId | null;
    reason: string;
}> | Readonly<{
    kind: 'unavailable';
    processor: string;
    diagnostic: string;
}>;
export declare function screenInput<P>(input: Readonly<{
    processors: readonly IntakeProcessor<P>[];
    start?: Message;
}> & Omit<IntakeScreening<P>, 'effective'>): Promise<Screened>;
export type IntakeBlockRefusal = Readonly<{
    kind: 'inline' | 'unmeasured';
    index: number;
    block: BlockId;
}>;
export declare function judgeIntakeBlocks(message: Message): IntakeBlockRefusal | null;
export {};
```

## 声明文件 `block.d.ts`

```ts
import type { SessionBlockDeclaration } from './ports.ts';
export declare const sessionModesBlock: SessionBlockDeclaration;
```

## 声明文件 `call-control.d.ts`

```ts
import type { ControlProgress, ProducerRef, WorkSnapshot } from './values.ts';
type ToolProducer = Extract<ProducerRef, {
    kind: 'tool';
}>;
export type DirectCallControl = Readonly<{
    producer: ToolProducer;
    intent: 'stop' | 'withdraw';
}>;
export type ControlRoutes = Readonly<{
    agent: boolean;
    direct: readonly DirectCallControl[];
}>;
export declare function backgroundCalls(snapshot: WorkSnapshot): readonly ToolProducer[];
export declare function controlRoutes(snapshot: WorkSnapshot, progress: ControlProgress): ControlRoutes;
export type ArchiveCollapse = Readonly<{
    runs: number;
    backgroundCalls: number;
}>;
export declare function archiveCollapse(snapshot: WorkSnapshot, progress: ControlProgress): ArchiveCollapse | null;
export declare function controlAnswer(snapshot: WorkSnapshot, command: Readonly<{
    kind: 'control' | 'interrupt';
    input: Readonly<{
        operation: string;
    }>;
}>): Readonly<{
    progress: ControlProgress | null;
    collapsed?: ArchiveCollapse | null;
}>;
export declare function settledControls(controls: readonly ControlProgress[], producer: ProducerRef): readonly ControlProgress[];
export {};
```

## 声明文件 `call-registration.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
export type CallRegistrationView = Readonly<{
    kind: 'model' | 'tool';
    reference: string | null;
    purpose: 'main' | 'compaction' | 'extension' | 'action';
}>;
export declare function readCallRegistration(payload: JsonValue): CallRegistrationView | null;
```

## 声明文件 `call-settlement.d.ts`

```ts
import type { SessionCallRecord } from './call-values.ts';
import type { ConsumptionId, DurableEvidence } from './identity.ts';
import type { CallBinding, Consumption, ProducedResult, ProducerRef, WorkSnapshot } from './values.ts';
import type { SessionCallEntryReferences } from './work-entry-values.ts';
type Draft = {
    -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K];
};
export type SessionCall = Readonly<{
    record: SessionCallRecord;
    consumed: Consumption | null;
    references: SessionCallEntryReferences | null;
}>;
export type SessionLateCallFact = Readonly<{
    consumption: ConsumptionId;
    slot: 'association';
    record: SessionCallRecord;
}> | Readonly<{
    consumption: ConsumptionId;
    slot: 'result';
    version: string;
    result: ProducedResult;
}> | Readonly<{
    consumption: ConsumptionId;
    slot: 'custody' | 'completion';
    version: string;
    evidence: DurableEvidence;
}> | Readonly<{
    consumption: ConsumptionId;
    slot: 'release';
    version: string;
}>;
export type SessionCallKeys = Readonly<{
    consumptions: readonly ConsumptionId[];
    producers: readonly ProducerRef[];
}>;
export type SettledCallLookup = (keys: SessionCallKeys) => readonly SessionCall[];
export declare function callKeysIn(value: unknown): SessionCallKeys;
export declare function callOf(snapshot: WorkSnapshot, consumption: ConsumptionId): SessionCall | null;
export declare function callOpen(snapshot: WorkSnapshot, call: SessionCall): boolean;
export declare function lendCalls(snapshot: WorkSnapshot, lent: readonly SessionCall[]): WorkSnapshot;
export type CallSettlement = Readonly<{
    settled: readonly SessionCall[];
    late: readonly SessionLateCallFact[];
}>;
export declare function settleCalls(draft: Draft, lent: readonly SessionCall[]): CallSettlement;
export declare function callWithLate(call: SessionCall, late: readonly SessionLateCallFact[]): SessionCall;
export declare function callNamed(call: SessionCall, keys: SessionCallKeys): boolean;
export declare function callKeysOutside(snapshot: WorkSnapshot, keys: SessionCallKeys): SessionCallKeys;
export type SessionCallBinding = Readonly<{
    consumption: ConsumptionId;
    binding: CallBinding;
}>;
export declare function bindingOf(call: SessionCall): SessionCallBinding | null;
export declare function boundCall(snapshot: WorkSnapshot, producer: ProducerRef): SessionCallBinding | null;
export {};
```

## 声明文件 `call-state.d.ts`

```ts
import type { ConsumptionId, DurableEvidence, RunId } from './identity.ts';
import type { CallBinding, WorkSnapshot, Waiting, ProducedResult } from './values.ts';
import type { SessionCallRegistration, SessionCallWait } from './call-values.ts';
type Draft = {
    -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K];
};
export declare class CallConflict extends Error {
}
export declare function validateBinding(snapshot: WorkSnapshot, binding: CallBinding, run?: RunId): void;
export declare function associated(binding: CallBinding, purpose: string): SessionCallRegistration;
export declare function validateRegistration(snapshot: WorkSnapshot, registration: SessionCallRegistration, run?: RunId): void;
export declare function legacyRegistration(snapshot: WorkSnapshot, consumption: ConsumptionId, binding: CallBinding): SessionCallRegistration;
export declare function registerCall(draft: Draft, consumption: ConsumptionId, registration: SessionCallRegistration, source: DurableEvidence, association: DurableEvidence | null): void;
export declare function registeredWaiting(draft: Draft, run: RunId, calls: readonly SessionCallWait[], other: readonly Waiting[]): void;
export declare function validateResult(binding: CallBinding, result: ProducedResult): void;
export declare const waitKey: (wait: SessionCallWait) => string;
export {};
```

## 声明文件 `call-values.d.ts`

```ts
import type { AttemptId, ConsumerRef, ConsumptionId, DurableEvidence } from './identity.ts';
import type { CallBinding, ProducerRef } from './values.ts';
export type SessionCallRegistration = Readonly<{
    kind: 'associated';
    binding: CallBinding & Readonly<{
        producer: Extract<ProducerRef, {
            kind: 'model';
        }>;
    }>;
    purpose: 'main' | 'compaction' | 'extension';
}> | Readonly<{
    kind: 'associated';
    binding: CallBinding & Readonly<{
        producer: Extract<ProducerRef, {
            kind: 'tool';
        }>;
    }>;
    purpose: 'action';
}> | Readonly<{
    kind: 'tool-intent';
    action: string;
    consumer: ConsumerRef;
    request: DurableEvidence;
    initiatingAttempt: AttemptId | null;
    purpose: 'action';
}>;
export type SessionCallRecord = Readonly<{
    consumption: ConsumptionId;
    registration: SessionCallRegistration;
    registered: DurableEvidence;
    association: DurableEvidence | null;
}>;
export type SessionCallWait = Readonly<{
    consumption: ConsumptionId;
    position: string;
}>;
```

## 声明文件 `committed-bindings.d.ts`

```ts
import type { ConsumptionId } from './identity.ts';
import type { WorkSnapshot } from './values.ts';
export type CommittedBinding = Readonly<{
    kind: 'call-registration' | 'call-association';
    consumption: ConsumptionId;
}>;
export declare function boundConsumptions(snapshot: Pick<WorkSnapshot, 'callRegistrations'>, consumptions: Iterable<ConsumptionId>): ConsumptionId[];
export declare function committedBindings(bound: Iterable<ConsumptionId>): CommittedBinding[];
export declare function withoutCommitted<T>(items: readonly T[], committed: readonly CommittedBinding[], kindOf: (item: T) => string): T[];
```

## 声明文件 `compaction-commit.d.ts`

```ts
import { type CommittedBatch, type DecideReads, type Decision } from './judgments.ts';
import type { SessionCommand } from './ports.ts';
import type { RunExecution, WorkSnapshot } from './values.ts';
export type CompactionCommitState = Pick<WorkSnapshot, 'tenant' | 'session' | 'lifecycle' | 'run' | 'revision' | 'source' | 'interpreter'>;
export declare function decideCompactionCommit(state: CompactionCommitState, command: Extract<SessionCommand, {
    kind: 'commitDerived';
}>, reads: Pick<DecideReads, 'compaction' | 'compactionEpoch'>, protectedEntries: readonly string[]): Decision;
export declare function projectCompactionCommit(state: CompactionCommitState, execution: RunExecution, batch: CommittedBatch): Readonly<{
    state: CompactionCommitState;
    execution: RunExecution;
}> | string;
```

## 声明文件 `context-scopes.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import { type Outcome } from '@omne-harness/operation-result';
import type { HistoryEntry } from './faces.ts';
import type { DurableEvidence, SessionId } from './identity.ts';
export declare const CONTEXT_SCOPE_KINDS: readonly [
    'session.archived',
    'session.unarchived'
];
export type SessionContextScope = Readonly<{
    generation: string;
    scope: string;
    ended: DurableEvidence | null;
}>;
export declare function contextScopeOf(input: Readonly<{
    tenant: TenantId;
    session: SessionId;
    generation: string;
}>): string;
type Holder = Readonly<{
    tenant: TenantId;
    session: SessionId;
}>;
export declare function contextScopesOf(session: Holder, entries: readonly Pick<HistoryEntry, 'kind' | 'payload'>[]): Outcome<readonly SessionContextScope[], string>;
export {};
```

## 声明文件 `control-normalization.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import type { Message } from '@omne-harness/message';
import type { SessionFailure } from './faces.ts';
import type { SessionAttemptRecord } from './history-values.ts';
import type { DurableEvidence, InputId, RunId, SessionOperationId } from './identity.ts';
import type { SessionLogConsequence } from './projection.ts';
import type { CallBinding, WorkSnapshot } from './values.ts';
export type SessionControlStage = 'intent-established' | 'qualification-revoked' | 'producer-confirmed' | 'physically-stopped' | 'duty-released';
export type SessionControlRecordEvidence = Readonly<{
    operation: string;
    command: 'cancel' | 'interrupt-model' | 'interrupt-tool' | 'background-tool' | 'release-tool' | 'withdraw-tool';
    references: readonly string[];
    invocation: string | null;
    reached: readonly SessionControlStage[];
    accepted: string;
}>;
export type SessionControlSettlement = Readonly<{
    kind: 'background' | 'result' | 'model';
    binding: CallBinding;
    revision: string;
}>;
export type SessionControlEvidence = Readonly<{
    through: string;
    records: readonly SessionControlRecordEvidence[];
    settled: readonly SessionControlSettlement[];
    urgent: readonly Readonly<{
        input: InputId;
        message: Message;
        origin: DurableEvidence | null;
    }>[];
}>;
export type SessionControlOrigin = Readonly<{
    operation: SessionOperationId;
    execution: string | null;
}>;
export type SessionControlDecisionInput = Readonly<{
    snapshot: WorkSnapshot;
    execution: string;
    run: RunId;
    attempts: readonly SessionAttemptRecord[];
    origins: readonly SessionControlOrigin[];
    evidence: SessionControlEvidence;
}>;
export declare function decideControlConsequences(input: SessionControlDecisionInput): Outcome<readonly SessionLogConsequence[], SessionFailure>;
```

## 声明文件 `control-state.d.ts`

```ts
import type { ControlProgress, WorkSnapshot } from './values.ts';
type Draft = {
    -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K];
};
export declare function validateControlIdentity(snapshot: WorkSnapshot, progress: ControlProgress): void;
export declare function validateControlProgress(snapshot: WorkSnapshot, progress: ControlProgress): void;
export declare function requestControl(draft: Draft, progress: ControlProgress): void;
export {};
```

## 声明文件 `control-values.d.ts`

```ts
import type { DurableEvidence, RunId, SessionRevision } from './identity.ts';
import type { ControlProgress, ProducerRef, RunTerminal } from './values.ts';
import type { SessionOperationId } from './identity.ts';
declare const EFFORTS: readonly [
    'low',
    'medium',
    'high',
    'xhigh'
];
export declare function validSelectionEffort(effort: unknown): boolean;
export type SavedModelSelection = Readonly<{
    name: string;
    reasoningEffort?: (typeof EFFORTS)[number];
    basis: DurableEvidence;
}>;
export type SessionModelSelection = Readonly<{
    selection: SavedModelSelection;
    revision: SessionRevision;
    source: DurableEvidence;
}>;
export type SessionCallTerminal = Readonly<{
    producer: ProducerRef;
    version: string;
    outcome: 'completed' | 'failed' | 'interrupted' | 'unavailable' | 'no-response';
    source: DurableEvidence;
    recorded: DurableEvidence;
}>;
export type SessionControlAnswer<T> = Readonly<{
    kind: 'requested';
    progress: ControlProgress;
}> | Readonly<{
    kind: 'ended';
    terminal: T;
}> | Readonly<{
    kind: 'not-found';
}>;
export type SessionControlReceipt<T> = Readonly<{
    operation: SessionOperationId;
    source: DurableEvidence;
    answer: SessionControlAnswer<T>;
}>;
export type ControlOperationResolution = Readonly<{
    kind: 'committed';
    receipt: SessionControlReceipt<RunTerminal | SessionCallTerminal>;
}> | Readonly<{
    kind: 'not-committed';
    exclusion: DurableEvidence;
}> | Readonly<{
    kind: 'attempt-rejected';
    original: 'unknown';
    reason: string;
}> | Readonly<{
    kind: 'unknown';
}>;
export type SessionCallLookup = Readonly<{
    kind: 'bound';
    producer: ProducerRef;
    bound: DurableEvidence;
    terminal: SessionCallTerminal | null;
}> | Readonly<{
    kind: 'absent';
    producer: ProducerRef;
    covered: SessionRevision;
}>;
export type SessionRunLookup = Readonly<{
    kind: 'bound';
    run: RunId;
    bound: DurableEvidence;
    terminal: RunTerminal | null;
}> | Readonly<{
    kind: 'absent';
    run: RunId;
    covered: SessionRevision;
}>;
export {};
```

## 声明文件 `decide-control.d.ts`

```ts
import type { SessionCommand } from './ports.ts';
import type { WorkSnapshot } from './values.ts';
import type { Decision } from './judgments.ts';
import type { DecideReads } from './judgments.ts';
export declare function decideNamedControl(snapshot: WorkSnapshot, command: Extract<SessionCommand, {
    kind: 'cancelRun' | 'stopCall' | 'retryRun';
}>, reads: DecideReads): Decision;
export declare function closeControlFailure(decision: Decision, command: SessionCommand): Decision;
export declare function decideCancelRun(snapshot: WorkSnapshot, command: Extract<SessionCommand, {
    kind: 'cancelRun';
}>, reads: DecideReads): Decision;
export declare function decideStopCall(snapshot: WorkSnapshot, command: Extract<SessionCommand, {
    kind: 'stopCall';
}>, reads: DecideReads): Decision;
```

## 声明文件 `decide-delivery.d.ts`

```ts
import type { DeliveredInputs } from './faces.ts';
import { type Decision } from './judgments.ts';
import type { Participation, WorkSnapshot } from './values.ts';
export declare function decideDelivery(snapshot: WorkSnapshot, participation: Participation, value: DeliveredInputs): Decision;
```

## 声明文件 `decide-initialization.d.ts`

```ts
import type { SessionCommand, GuardCommand } from './ports.ts';
import type { Decision, DecideReads } from './judgments.ts';
import type { WorkSnapshot, SessionTree } from './values.ts';
export declare function decideInitializationCreate(command: Extract<SessionCommand, {
    kind: 'create';
}>, guards: readonly GuardCommand[], tree: SessionTree | null): Decision;
export declare function decideInitializationComplete(snapshot: WorkSnapshot, command: Extract<SessionCommand, {
    kind: 'completeInitialization';
}>, guards: readonly GuardCommand[], reads: DecideReads): Decision;
export declare function validateInitializationRecall(previous: WorkSnapshot | null, command: Extract<SessionCommand, {
    kind: 'create' | 'completeInitialization';
}>, guards: readonly GuardCommand[]): Decision | null;
```

## 声明文件 `decide-intake.d.ts`

```ts
import type { GuardCommand } from './ports.ts';
import { type AdmittedSource } from './input-sources.ts';
import { type SessionIntakeLimits } from './intake.ts';
import type { DecideReads, Decision } from './judgments.ts';
import type { RoutedInput } from './values.ts';
type Ordinary = Extract<RoutedInput, {
    kind: 'ordinary';
}>;
type Admitted = Readonly<{
    source: AdmittedSource;
}>;
type Intake = Readonly<{
    reads: DecideReads;
    limits: SessionIntakeLimits;
}>;
export declare function admitInput(input: Ordinary, pending: number, intake: Intake, field: string): Admitted | Decision;
export declare function readsWithTerms(reads: DecideReads, guards: readonly GuardCommand[]): DecideReads;
export {};
```

## 声明文件 `decide-management.d.ts`

```ts
import type { SessionCommand } from './ports.ts';
import type { ContextScopeBinding, ControlIntent, WorkSnapshot } from './values.ts';
import type { Decision, DecideReads } from './judgments.ts';
import type { SessionOperationId } from './identity.ts';
export declare function scopeBinding(snapshot: Pick<WorkSnapshot, 'tenant' | 'session' | 'contextScopes'>, operation: SessionOperationId): ContextScopeBinding;
export declare function decideControl(snapshot: WorkSnapshot, intent: ControlIntent, operation: SessionOperationId, reads: DecideReads): Decision;
export declare function decideManagement(snapshot: WorkSnapshot, command: SessionCommand, reads: DecideReads): Decision;
```

## 声明文件 `decide-receive.d.ts`

```ts
import type { SessionCommand } from './ports.ts';
import type { WorkSnapshot } from './values.ts';
import type { Decision } from './judgments.ts';
import type { HistoryEntry } from './faces.ts';
import type { SessionHistoryReads } from './history-values.ts';
export declare function decideProducerFact(snapshot: WorkSnapshot, command: Extract<SessionCommand, {
    kind: 'receive';
}>, entryOrigin?: HistoryEntry['origin'], history?: SessionHistoryReads): Decision;
```

## 声明文件 `decide-results.d.ts`

```ts
import type { ConsumptionId } from './identity.ts';
import type { WorkSnapshot, ProducedResult } from './values.ts';
import type { SessionCommand } from './ports.ts';
import { type Decision } from './judgments.ts';
import type { SessionHistoryReads, SessionUninterpretedCall } from './history-values.ts';
export declare const consumptionIdOf: (binding: unknown) => ConsumptionId;
export declare function uninterpretedBinding(history: SessionHistoryReads | undefined, matches: (call: SessionUninterpretedCall) => boolean): boolean;
export declare const NOT_INTERPRETED: Decision;
export declare function resultRefusal(snapshot: WorkSnapshot, consumption: ConsumptionId, result: ProducedResult, operation: SessionCommand['input']['operation'], history?: SessionHistoryReads): Decision | null;
export declare function decideResults(snapshot: WorkSnapshot, command: SessionCommand, history?: SessionHistoryReads): Decision;
```

## 声明文件 `decide-retry.d.ts`

```ts
import type { SessionCommand } from './ports.ts';
import type { WorkSnapshot } from './values.ts';
import type { Decision, DecideReads } from './judgments.ts';
export declare function decideRetryRun(snapshot: WorkSnapshot, command: Extract<SessionCommand, {
    kind: 'retryRun';
}>, reads: DecideReads): Decision;
```

## 声明文件 `decide-todos.d.ts`

```ts
import type { DurableEvidence } from './identity.ts';
import type { WorkSnapshot } from './values.ts';
import type { Decision } from './judgments.ts';
import type { SessionCommand } from './ports.ts';
export declare function decideTodos(snapshot: WorkSnapshot, command: Extract<SessionCommand, {
    kind: 'addTodo' | 'removeTodo' | 'markTodoComplete';
}>, source: DurableEvidence): Decision;
```

## 声明文件 `decide.d.ts`

```ts
import type { AttemptId, InputId, RunId, SessionId } from './identity.ts';
import type { WorkSnapshot } from './values.ts';
import type { GuardCommand, SessionCommand } from './ports.ts';
import { type DecideReads, type Decision, type OperationRecord } from './judgments.ts';
export declare const PATH_MUTATIONS: readonly [
    "create",
    "completeInitialization",
    "accept",
    "startRun",
    "recordMessage",
    "receive",
    "finishRun"
];
export declare function runIdOf(session: SessionId, first: InputId, predecessor: RunId | null): RunId;
export declare function attemptIdOf(run: RunId, ordinal: string): AttemptId;
export declare function executionIdOf(run: RunId): string;
export declare function commandDigest(command: SessionCommand): string;
export declare function decide(previous: WorkSnapshot | null, command: SessionCommand, guards: readonly GuardCommand[], record: OperationRecord | null, reads: DecideReads): Decision;
```

## 声明文件 `decision-support.d.ts`

```ts
import type { DurableEvidence, RunId, SessionOperationId } from './identity.ts';
import type { WorkSnapshot, ResidentAdoption, RunEnd, RunTerminal } from './values.ts';
import type { HistoryEntry, SessionFailure } from './faces.ts';
import type { Decision, EncodedEntry } from './judgments.ts';
export declare const rejected: (failure: SessionFailure) => Decision;
export declare const invalid: (field: string, reason: string) => Decision;
export declare const entries: (values: readonly EncodedEntry[]) => Decision;
export declare const sourceOf: (operation: SessionOperationId, what: string) => DurableEvidence;
export declare const controlSource: (operation: SessionOperationId) => DurableEvidence;
export declare function cancellationDriveOf(terminal: RunTerminal, execution: string): string | null;
export declare function runCancelledBy(snapshot: WorkSnapshot, operation: SessionOperationId): RunId | null;
export declare const originOf: (source: DurableEvidence) => HistoryEntry['origin'];
export declare const completeEvidence: (source: DurableEvidence) => boolean;
export declare function residentEntries(snapshot: Pick<WorkSnapshot, 'residents'> | null, material: ResidentAdoption | undefined, source: DurableEvidence): Decision;
export declare function terminalEntries(snapshot: WorkSnapshot, terminal: RunTerminal, source: DurableEvidence, interpretation?: Readonly<{
    sequence: string | null;
    cause: DurableEvidence | null;
    disposition: DurableEvidence;
    end: RunEnd | null;
}>): EncodedEntry[];
```

## 声明文件 `directory-relation.d.ts`

```ts
import type { SessionId } from './identity.ts';
export declare const RELATIONS_TO_REFERENCE: readonly [
    'self',
    'parent',
    'child',
    'sibling',
    'upper',
    'lower',
    'rest',
    'handed-off',
    'handed-from',
    'unrelated'
];
export type RelationToReference = (typeof RELATIONS_TO_REFERENCE)[number];
export type DirectoryStanding = Readonly<{
    session: SessionId;
    parent: SessionId | null;
    origin: SessionId | null;
    root: SessionId;
    depth: number;
}>;
export declare function relationToReference(row: DirectoryStanding, reference: DirectoryStanding): RelationToReference;
```

## 声明文件 `entries-interpretation.d.ts`

```ts
import type { Decision, OperationRecord } from './judgments.ts';
import type { SessionEntriesObservation, SessionEntriesProgress, SessionEntriesStart } from './interpretation-values.ts';
import type { WorkSnapshot } from './values.ts';
import type { IntakeTerms } from './input-sources.ts';
export declare const SAME_LOG_ENTRIES_VIA = "same-log-entries";
type EntriesDecision = Exclude<Decision, {
    kind: 'control-answer';
}>;
export declare function digestSessionEntries(observation: SessionEntriesObservation): string;
export declare function projectSessionEntries(snapshot: WorkSnapshot, input: Readonly<{
    observation: SessionEntriesObservation;
    start: SessionEntriesStart;
    saved: readonly SessionEntriesProgress[];
    record: OperationRecord | null;
    derived?: IntakeTerms['derived'];
}>): EntriesDecision;
export {};
```

## 声明文件 `entries.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
import { type TenantId, type WorkspaceId } from '@omne-harness/legal-identity';
import type { Message } from '@omne-harness/message';
import type { Adoption, AgentInstanceRef, AttemptId, ConsumptionId, DurableEvidence, InputId, RunId, SessionId, SessionOperationId, TodoItemId } from './identity.ts';
import type { BoundedClose, InitializationResult, Participation, RecoveryTask, RunEnd, RunTerminal, SessionCreation, ResidentAdoption, ResidentTool, DeclarationChange, SessionTree, AutoArchivePolicy, IdleObservation, ControlProgress, ContextScopeBinding, CallBinding, ProducedResult, ProducerRef, InputBatch, Waiting, ExecutionRef, BackgroundDisposition } from './values.ts';
import type { EntryClass, HistoryEntry } from './faces.ts';
import type { AdmittedSource } from './input-sources.ts';
import type { EncodedEntry } from './judgments.ts';
import type { InitialAdoption, InitializationAdoption, InitializationGuardResult, InitializationFactReference, InitializationPlanItem, InitializationRequirement, InitializationRegistration } from './values.ts';
import type { SessionCallRegistration, SessionCallWait } from './call-values.ts';
import type { SessionEntriesChannel } from './interpretation-values.ts';
import type { BackgroundCallLabel, BackgroundCallSource } from './background-calls.ts';
import type { AuthorizationExpression } from './authorizations.ts';
export declare const SESSION_INTERPRETER: Adoption;
export declare function readsSessionInterpreter(schema: Adoption): boolean;
export type InitializationItem = Omit<Extract<RecoveryTask, {
    kind: 'initialization';
}>, 'kind' | 'originalOperation' | 'state' | 'diagnostic'>;
export type SessionEntry = Readonly<{
    kind: 'session.permission-assigned';
    declaration: Extract<DeclarationChange, {
        kind: 'permission-assignment';
    }>;
    previousRevision: string;
    revision: string;
    authority: DurableEvidence;
}> | Readonly<{
    kind: 'session.authorization-expressed';
    expression: AuthorizationExpression;
    authority: DurableEvidence;
}> | Readonly<{
    kind: 'session.todo-added';
    item: TodoItemId;
    text: string;
}> | Readonly<{
    kind: 'session.todo-completed' | 'session.todo-removed';
    item: TodoItemId;
}> | Readonly<{
    kind: 'session.created';
    tenant: TenantId;
    session: SessionId;
    operation: SessionOperationId;
    creation: SessionCreation;
    tree?: SessionTree;
    items: readonly InitializationItem[];
    initializationProtocol: 1;
    initialAdoption: InitialAdoption;
    requirements: readonly InitializationRequirement[];
    plan: readonly InitializationPlanItem[];
    input: JsonValue;
}> | Readonly<{
    kind: 'session.initialization-item';
    result: InitializationResult;
    createOperation: SessionOperationId;
    operation: SessionOperationId;
    plan: InitializationPlanItem;
    outcome: InitializationGuardResult;
    facts: readonly InitializationFactReference[];
}> | Readonly<{
    kind: 'session.adoption';
    adopted: Adoption;
    residentKeys?: ResidentAdoption['keys'];
    initialization?: Readonly<{
        createOperation: SessionOperationId;
        item: Readonly<{
            owner: string;
            item: string;
        }> | null;
        adoption: InitializationAdoption;
    }>;
}> | Readonly<{
    kind: `message.${Message['role']}`;
    message: Message;
    source: DurableEvidence;
    admission: DurableEvidence | null;
    consumption: ConsumptionId | null;
    participation: Participation | null;
}> | Readonly<{
    kind: 'message.delivered';
    input: InputId;
    message: Message;
    source: DurableEvidence;
    admission: DurableEvidence;
    consumption: null;
    participation: Participation;
}> | Readonly<{
    kind: 'intake.routed';
    input: InputId;
    destination: 'current-run' | 'next-run';
    run: RunId | null;
    origin: DurableEvidence;
    source: AdmittedSource;
}> | Readonly<{
    kind: 'intake.handed-over';
    input: InputId;
    execution: string;
    result: Readonly<{
        kind: 'accepted';
        receipt: DurableEvidence;
    }> | Readonly<{
        kind: 'rejected';
        reason: string;
        rejection: DurableEvidence;
    }>;
}> | Readonly<{
    kind: 'run.started';
    run: RunId;
    execution: string;
    entry: EntryClass;
    first: InputId;
    predecessor: RunId | null;
    adoption: Adoption;
}> | Readonly<{
    kind: 'run.attempt-started';
    run: RunId;
    attempt: AttemptId;
    ordinal: string;
    instance: AgentInstanceRef;
    reason: 'start' | 'claim' | 'reload';
}> | Readonly<{
    kind: 'run.attempt-released';
    run: RunId;
    attempt: AttemptId;
    reason: 'ended' | 'bounded' | 'cancelled' | 'released' | 'superseded';
}> | Readonly<{
    kind: 'run.terminal';
    terminal: RunTerminal;
    sequence: string | null;
    cause: DurableEvidence | null;
    disposition: DurableEvidence | null;
    bounded: BoundedClose | null;
    end: RunEnd | null;
}> | Readonly<{
    kind: 'session.tool-resident-admitted';
    resident: ResidentTool;
}> | Readonly<{
    kind: 'session.mode-changed' | 'session.model-selected' | 'session.declaration-adopted' | 'session.context-registration-changed' | 'session.recovery-input-adopted';
    declaration: DeclarationChange;
    scope: string | null;
    initialization?: Readonly<{
        createOperation: SessionOperationId;
        plan: InitializationPlanItem;
        prepared: DurableEvidence;
        decision: InitializationRegistration;
    }>;
}> | Readonly<{
    kind: 'session.workspace-changed';
    workspace: WorkspaceId | null;
    workspaceAttachment: SessionCreation['workspaceAttachment'];
    basis: DurableEvidence;
}> | Readonly<{
    kind: 'session.declaration-adopted';
    policy: AutoArchivePolicy;
}> | Readonly<{
    kind: 'session.resident';
    resident: boolean;
}> | Readonly<{
    kind: 'session.child-recorded';
    child: SessionId;
    basis: DurableEvidence;
}> | Readonly<{
    kind: 'session.idle-evidence';
    observation: IdleObservation | null;
}> | Readonly<{
    kind: 'session.frozen';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'intake.released';
    inputs: readonly InputId[];
}> | Readonly<{
    kind: 'intake.routed';
    task: Extract<RecoveryTask, {
        kind: 'routed-input';
    }>;
}> | Readonly<{
    kind: 'hitl.decision';
    value: Extract<import('./values.ts').RoutedInput, {
        kind: 'card-decision';
    }>;
}> | Readonly<{
    kind: 'run.attempt-exited';
    advance: import('./identity.ts').AdvanceRef;
}> | Readonly<{
    kind: 'run.batch-taken';
    run: RunId;
    batch: InputBatch;
}> | Readonly<{
    kind: 'call.bound';
    consumption: ConsumptionId;
    registration: SessionCallRegistration;
    association: DurableEvidence | null;
}> | Readonly<{
    kind: 'call.bound';
    consumption: ConsumptionId;
    binding: CallBinding;
    reference: string;
    purpose: 'main' | 'action';
}> | Readonly<{
    kind: 'call.execution-fact' | 'account.linked';
    fact: import('./faces.ts').ProducerFact;
    consumption?: ConsumptionId;
    result?: ProducedResult | null;
    delivered?: ConsumptionId;
}> | Readonly<{
    kind: 'call.result-preserved';
    consumption: ConsumptionId;
    result: ProducedResult;
    custody: DurableEvidence;
    participation: Participation | null;
}> | Readonly<{
    kind: 'call.result-processed';
    consumption: ConsumptionId;
    result: ProducedResult;
    completion: DurableEvidence;
    participation: Participation | null;
    position: string | null;
}> | Readonly<{
    kind: 'call.backgrounded';
    consumption: ConsumptionId;
    producer: ProducerRef;
    ordinal: number;
    label: BackgroundCallLabel;
    source: BackgroundCallSource;
}> | Readonly<{
    kind: 'call.background-settled';
    consumption: ConsumptionId;
    result: string;
    disposition: BackgroundDisposition;
}> | Readonly<{
    kind: 'extension.passage';
    run: RunId;
    waiting: readonly Waiting[];
}> | Readonly<{
    kind: 'extension.passage';
    run: RunId;
    calls: readonly SessionCallWait[];
    other: readonly Exclude<Waiting, {
        kind: 'producer';
    }>[];
}> | Readonly<{
    kind: 'control.requested';
    progress: ControlProgress;
}> | Readonly<{
    kind: 'control.progress';
    progress: ControlProgress | null;
    fact: import('./faces.ts').ProducerFact | null;
}> | Readonly<{
    kind: 'session.archived';
    operation: SessionOperationId;
    scope: ContextScopeBinding;
    tasks: readonly RecoveryTask[];
}> | Readonly<{
    kind: 'session.unarchived';
    scope: ContextScopeBinding;
}> | Readonly<{
    kind: 'history.annotated';
    targets: readonly string[];
    source: DurableEvidence;
}> | Readonly<{
    kind: 'history.annotated';
    run: RunId;
    execution: ExecutionRef;
}> | Readonly<{
    kind: 'history.annotated';
    run: RunId;
    terminal: RunTerminal;
}> | Readonly<{
    kind: 'entries.interpreted';
    run: RunId;
    execution: string;
    channel: SessionEntriesChannel;
    after: string;
    through: string;
    position: string;
    boundary: Readonly<{
        revision: string;
        executionEvidence: DurableEvidence;
        count: string;
    }>;
    interpreted: readonly Readonly<{
        ordinal: string;
        key: string;
    }>[];
}>;
export type SessionEntryKind = SessionEntry['kind'];
export declare function toJsonValue(plain: unknown): JsonValue;
export declare function fromJsonValue(tree: JsonValue): unknown;
export type EntryReferences = Readonly<{
    created?: InitialAdoption | null;
    residents?: readonly ResidentTool[];
}>;
export declare function encodeEntry(entry: SessionEntry, origin: HistoryEntry['origin'], references?: EntryReferences): EncodedEntry;
export type DecodedEntry = Readonly<{
    ok: SessionEntry;
}> | Readonly<{
    unknown: string;
}> | Readonly<{
    malformed: string;
}>;
export type StoredEntry = Pick<HistoryEntry, 'kind' | 'payload'> & Partial<Pick<HistoryEntry, 'schema' | 'origin'>>;
export declare function decodeEntry(entry: StoredEntry, references?: EntryReferences): DecodedEntry;
export declare function decodeEntries(rows: readonly StoredEntry[], created: InitialAdoption | null): DecodedEntry[];
export declare function expandHistoryEntries(rows: readonly HistoryEntry[], created: InitialAdoption | null): Readonly<{
    ok: readonly HistoryEntry[];
}> | Readonly<{
    missing: 'created';
}> | Readonly<{
    malformed: string;
}>;
```

## 声明文件 `faces.d.ts`

```ts
import type { BackgroundCallResolution, BackgroundCallView } from './background-calls.ts';
import type { ArchiveCollapse } from './call-control.ts';
import type { ContextScopeBinding } from './values.ts';
import type { RelationToReference } from './directory-relation.ts';
import type { SessionCallBinding } from './call-settlement.ts';
import type { TodoMutationReceipt, TodoPage, TodoPageCursor } from './todos.ts';
import type { SenderView } from './utterance-resolver.ts';
import type { JsonValue } from '@omne-harness/json-text';
import type { TenantId } from '@omne-harness/legal-identity';
import type { CompactionContext, Message, RecordEntryRef } from '@omne-harness/message';
import type { Outcome } from '@omne-harness/operation-result';
import type { Adoption, AdvanceRef, AgentInstanceRef, ConsumptionId, DurableEvidence, EntryId, InputId, Mutation, ResidentKey, RunId, SessionAccess, SessionId, SessionOperationId, SessionRevision, TodoItemId } from './identity.ts';
import type { ControlOperationResolution, SessionCallTerminal, SessionControlReceipt, SessionModelSelection } from './control-values.ts';
import type { AutoArchivePolicy, BoundedClose, CallBinding, Control, ControlProgress, DeclarationChange, DerivedMessage, FreezeVerdict, IdleObservation, InitializationResult, Participation, ProducedResult, ProducerRef, ResidentAdoption, RoutedInput, RunTerminal, ScopeReleaseDisposition, SessionCreation, SessionWaiting, WorkSnapshot, Attendance } from './values.ts';
import type { InputFate } from './input-fate.ts';
import type { PendingPage, WaitingCall } from './intake-reads.ts';
export type SessionFailure = Readonly<{
    kind: 'limited';
    resource: 'pending-inputs' | 'input-bytes';
    limit: number;
}> | Readonly<{
    kind: 'denied';
    action: string;
}> | Readonly<{
    kind: 'invalid';
    field: string;
    reason: string;
}> | Readonly<{
    kind: 'todo-not-found';
    item: TodoItemId;
}> | Readonly<{
    kind: 'conflict';
    operation: SessionOperationId;
}> | Readonly<{
    kind: 'changed';
    revision: SessionRevision;
}> | Readonly<{
    kind: 'commit-unknown';
    operation: SessionOperationId;
}> | Readonly<{
    kind: 'unavailable';
    owner: string;
    diagnostic: string;
}> | Readonly<{
    kind: 'quarantined';
    diagnostic: string;
}> | Readonly<{
    kind: 'unsupported';
}> | Readonly<{
    kind: 'terminal';
    terminal: RunTerminal;
}> | Readonly<{
    kind: 'stale-advance';
    current: AdvanceRef | null;
}> | Readonly<{
    kind: 'frozen';
    verdict: FreezeVerdict | null;
}> | Readonly<{
    kind: 'archived' | 'no-input' | 'run-active' | 'not-ready' | 'login-required' | 'not-found' | 'nothing-pending';
}>;
export type Reply<T> = Promise<Outcome<T, SessionFailure>>;
export type CommitReceipt = Readonly<{
    operation: SessionOperationId;
    revision: SessionRevision;
    first: EntryId;
    last: EntryId;
    recovered: boolean;
    source: DurableEvidence;
}>;
export type OperationResolution = Readonly<{
    kind: 'committed';
    receipt: CommitReceipt;
}> | Readonly<{
    kind: 'attempt-rejected';
    original: 'unknown';
    reason: string;
}> | Readonly<{
    kind: 'not-committed';
    exclusion: DurableEvidence;
}> | Readonly<{
    kind: 'unknown';
}>;
export type EntryClass = 'interactive' | 'dispatch';
export type StartedRun = Readonly<{
    receipt: CommitReceipt;
    advance: AdvanceRef;
    adopted: Adoption;
    first: InputId;
    execution: string;
}>;
export type Completion = Readonly<{
    consumption: ConsumptionId;
    result: ProducedResult;
    completion: DurableEvidence;
}>;
export type ExternalCompletion = Readonly<{
    consumption: ConsumptionId;
    result: ProducedResult;
    position: string;
    processing: DurableEvidence;
    message: Message | null;
}>;
export type AdmittedMessage = Readonly<{
    message: Message;
    source: DurableEvidence;
    admission: DurableEvidence;
    consumption: ConsumptionId | null;
}>;
export type DeliveredInputs = Readonly<{
    deliveries: readonly Readonly<{
        input: InputId;
        message: Message;
    }>[];
    source: DurableEvidence;
    admission: DurableEvidence;
}>;
export type StartAdoption = ResidentAdoption & Readonly<{
    verdict?: FreezeVerdict;
}>;
export interface SessionWork<P> {
    addTodo(input: Mutation<P> & Readonly<{
        text: string;
    }>): Reply<TodoMutationReceipt>;
    removeTodo(input: Mutation<P> & Readonly<{
        item: TodoItemId;
    }>): Reply<TodoMutationReceipt>;
    markTodoComplete(input: Mutation<P> & Readonly<{
        item: TodoItemId;
    }>): Reply<TodoMutationReceipt>;
    listTodos(input: SessionAccess<P> & Readonly<{
        after: TodoPageCursor | null;
        limit: number;
    }>): Reply<TodoPage>;
    accept(input: Mutation<P> & Readonly<{
        value: RoutedInput;
        seen?: SenderView;
    }>): Reply<CommitReceipt>;
    readWork(input: SessionAccess<P>): Reply<WorkSnapshot>;
    readCurrentScope(input: SessionAccess<P>): Reply<ContextScopeBinding | null>;
    readWaiting(input: SessionAccess<P>): Reply<SessionWaiting | null>;
    readBackgroundCalls(input: SessionAccess<P>): Reply<readonly BackgroundCallView[]>;
    resolveBackgroundCall(input: SessionAccess<P> & Readonly<{
        id: string;
    }>): Reply<BackgroundCallResolution>;
    readCall(input: SessionAccess<P> & Readonly<{
        producer: ProducerRef;
    }>): Reply<SessionCallBinding | null>;
    readInput(input: SessionAccess<P> & Readonly<{
        input: InputId;
    }>): Reply<Extract<RoutedInput, {
        kind: 'ordinary';
    }>>;
    readPending(input: SessionAccess<P> & Readonly<{
        after: EntryId | null;
        limit: number;
    }>): Reply<PendingPage>;
    readWaitingCalls(input: SessionAccess<P>): Reply<readonly WaitingCall[]>;
    readInputFate(input: SessionAccess<P> & Readonly<{
        input: InputId;
    }>): Reply<InputFate>;
    startRun(input: Mutation<P> & Readonly<{
        entry: EntryClass;
        candidate: Adoption;
        instance: AgentInstanceRef;
        residentAdoption?: StartAdoption;
    }>): Reply<StartedRun>;
    claim(input: Mutation<P> & Readonly<{
        run: RunId;
        instance: AgentInstanceRef;
        continuity: DurableEvidence;
        expected: SessionRevision;
    }>): Reply<Readonly<{
        receipt: CommitReceipt;
        advance: AdvanceRef;
    }>>;
    reload(input: Mutation<P> & Readonly<{
        run: RunId;
        candidate: Adoption;
        instance: AgentInstanceRef;
        expected: SessionRevision;
        handover: DurableEvidence;
        residentAdoption?: StartAdoption;
    }>): Reply<Readonly<{
        receipt: CommitReceipt;
        advance: AdvanceRef;
    }>>;
    recordMessage(input: Mutation<P> & Readonly<{
        participation: Participation;
        value: AdmittedMessage | DeliveredInputs;
    }>): Reply<CommitReceipt>;
    preserveResult(input: Mutation<P> & Readonly<{
        participation: Participation | null;
        consumption: ConsumptionId;
        result: ProducedResult;
        custody: DurableEvidence;
    }>): Reply<DurableEvidence>;
    completeConsumption(input: Mutation<P> & Readonly<{
        participation: Participation;
        completion: Completion;
    }>): Reply<DurableEvidence>;
    completeExternalConsumption(input: Mutation<P> & Readonly<{
        expected: SessionRevision;
        qualification: DurableEvidence;
        completion: ExternalCompletion;
    }>): Reply<DurableEvidence>;
    bindExternalCall(input: Mutation<P> & Readonly<{
        expected: SessionRevision;
        qualification: DurableEvidence;
        binding: CallBinding & Readonly<{
            initiatingAttempt: null;
        }>;
    }>): Reply<Readonly<{
        receipt: CommitReceipt;
        consumption: ConsumptionId;
    }>>;
    commitDerived(input: (Mutation<P> & Readonly<{
        participation: Participation;
        value: Extract<DerivedMessage, {
            kind: 'compaction';
        }>;
        judgment: DurableEvidence;
    }>) | (Mutation<P> & Readonly<{
        expected: SessionRevision;
        value: Extract<DerivedMessage, {
            kind: 'context-reminder';
        }>;
    }>)): Reply<CommitReceipt>;
    release(input: Mutation<P> & Readonly<{
        advance: AdvanceRef;
        expected: SessionRevision;
        handover: DurableEvidence;
    }>): Reply<CommitReceipt>;
    control(input: Mutation<P> & Readonly<{
        intent: Control;
    }>): Reply<Readonly<{
        receipt: CommitReceipt;
        progress: ControlProgress;
        collapsed?: ArchiveCollapse | null;
    }>>;
    finishRun(input: Mutation<P> & Readonly<{
        run: RunId;
        expected: SessionRevision;
        bounded: BoundedClose;
    }>): Reply<Readonly<{
        receipt: CommitReceipt;
        terminal: RunTerminal;
    }>>;
    queryOperation(input: SessionAccess<P> & Readonly<{
        operation: SessionOperationId;
    }>): Reply<OperationResolution>;
    loadRecovery(input: SessionAccess<P>): Reply<WorkSnapshot>;
    readModelSelection(input: SessionAccess<P>): Reply<SessionModelSelection>;
    cancelRun(input: Mutation<P> & Readonly<{
        run: RunId;
        urgency: 'graceful' | 'force';
    }>): Reply<SessionControlReceipt<RunTerminal>>;
    stopCall(input: Mutation<P> & Readonly<{
        producer: ProducerRef;
        reason?: string | null;
    }>): Reply<SessionControlReceipt<SessionCallTerminal>>;
    retryRun(input: Mutation<P> & Readonly<{
        run: RunId;
    }>): Reply<CommitReceipt>;
    queryControlOperation(input: SessionAccess<P> & Readonly<{
        operation: SessionOperationId;
    }>): Reply<ControlOperationResolution>;
}
export interface SessionManagement<P> {
    inspectIdle(input: SessionAccess<P>): Reply<IdleObservation>;
    recordIdle(input: Mutation<P> & Readonly<{
        expected: SessionRevision;
        observation: IdleObservation;
    }>): Reply<CommitReceipt>;
    create(input: Mutation<P> & Readonly<{
        creation: SessionCreation;
    }>): Reply<Readonly<{
        receipt: CommitReceipt;
        state: WorkSnapshot;
    }>>;
    completeInitialization(input: Mutation<P> & Readonly<{
        result: InitializationResult;
    }>): Reply<CommitReceipt>;
    change(input: Mutation<P> & Readonly<{
        declaration: DeclarationChange;
    }>): Reply<CommitReceipt>;
    setResident(input: Mutation<P> & Readonly<{
        resident: boolean;
    }>): Reply<CommitReceipt>;
    configureAutoArchive(input: Mutation<P> & Readonly<{
        policy: AutoArchivePolicy;
    }>): Reply<CommitReceipt>;
    considerAutoArchive(input: Mutation<P> & Readonly<{
        idleEvidence: DurableEvidence;
    }>): Reply<Readonly<{
        result: 'archived' | 'not-due' | 'exempt' | 'disabled';
        receipt: CommitReceipt | null;
    }>>;
    interrupt(input: Mutation<P> & Readonly<{
        run: RunId | null;
        urgent: Extract<RoutedInput, {
            kind: 'ordinary';
        }>;
        decision: DurableEvidence;
        seen?: SenderView;
    }>): Reply<Readonly<{
        receipt: CommitReceipt;
        progress: ControlProgress | null;
    }>>;
    freeze(input: Mutation<P> & Readonly<{
        verdict: FreezeVerdict;
    }>): Reply<CommitReceipt>;
}
export type ProducerFact = Readonly<{
    kind: 'input-handover';
    execution: string;
    input: InputId;
    result: Readonly<{
        kind: 'accepted';
        receipt: DurableEvidence;
    }> | Readonly<{
        kind: 'rejected';
        reason: string;
        rejection: DurableEvidence;
    }>;
}> | Readonly<{
    kind: 'agent-exit';
    advance: AdvanceRef;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'execution';
    producer: ProducerRef;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'account';
    producer: ProducerRef;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'release';
    consumption: ConsumptionId;
    result: ProducedResult;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'cascade';
    child: SessionId;
    childOperation: SessionOperationId;
    source: DurableEvidence;
    refusal?: Readonly<{
        reason: string;
    }>;
}> | Readonly<{
    kind: 'routed-input';
    originalOperation: SessionOperationId;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'scope-release';
    archive: SessionOperationId;
    scope: string;
    dispositions: readonly ScopeReleaseDisposition[];
    source: DurableEvidence;
}>;
export type PendingReason = 'initialization' | 'unresolved' | 'controls' | 'tasks' | 'inputs' | 'run' | 'idle-armed' | 'release';
export type ResidentReference = Readonly<{
    tenant: TenantId;
    session: SessionId;
    capability: string;
    shape: JsonValue;
}>;
export type ReleasedScope = Readonly<{
    tenant: TenantId;
    session: SessionId;
    task: SessionOperationId;
    scope: string;
}>;
export interface SessionReconciliation<P> {
    receive(input: Mutation<P> & Readonly<{
        fact: ProducerFact;
    }>): Reply<CommitReceipt>;
    pending(input: Readonly<{
        principal: P;
        tenant: TenantId;
        after: string | null;
        limit: number;
        reason?: PendingReason;
    }>): Reply<Readonly<{
        sessions: readonly SessionId[];
        next: string | null;
    }>>;
    references(input: Readonly<{
        principal: P;
        scope: 'system';
        key: ResidentKey;
        after: string | null;
        limit: number;
    }>): Reply<Readonly<{
        sessions: readonly ResidentReference[];
        next: string | null;
    }>>;
    releasedScopes(input: Readonly<{
        principal: P;
        scope: 'system';
        after: string | null;
        limit: number;
    }>): Reply<Readonly<{
        scopes: readonly ReleasedScope[];
        next: string | null;
    }>>;
}
export type HistoryEntry = Readonly<{
    id: EntryId;
    revision: SessionRevision;
    kind: string;
    schema: Adoption;
    payload: JsonValue;
    origin: Readonly<{
        owner: string;
        via: string | null;
        source: DurableEvidence;
    }>;
}>;
export type HistoryPage = Readonly<{
    source: string;
    interpreter: Adoption;
    upper: SessionRevision;
    entries: readonly HistoryEntry[];
    scannedThrough: string;
    next: string | null;
    exhausted: boolean;
    annotations: readonly HistoryEntry[];
    from?: SessionId;
}>;
export type ModelViewBasis = Readonly<{
    epoch: string;
    upper: string;
}>;
export type ModelViewRow = Readonly<{
    seq: string;
    entry: EntryId;
    bytes: number;
    prefixDigest: string;
    message: Message;
}>;
export type ModelViewRead = Readonly<{
    kind: 'page';
    basis: ModelViewBasis;
    rows: readonly ModelViewRow[];
    next: string | null;
}> | Readonly<{
    kind: 'epoch-changed';
    current: ModelViewBasis;
}>;
export type CompactionContextRead = Readonly<{
    kind: 'context';
    value: CompactionContext;
    basis: ModelViewBasis;
}> | Readonly<{
    kind: 'epoch-changed';
    current: ModelViewBasis;
}>;
export type ForkPointRead = Readonly<{
    kind: 'point';
    point: import('./fork.ts').ForkPoint;
}> | Readonly<{
    kind: 'none';
}>;
export interface SessionHistory<P> {
    readForkPoint(input: SessionAccess<P> & Readonly<{
        asking: string;
    }>): Reply<ForkPointRead>;
    readCompactionContext(input: SessionAccess<P> & Readonly<{
        basis: ModelViewBasis;
        coverTo: RecordEntryRef | null;
    }>): Reply<CompactionContextRead>;
    begin(input: SessionAccess<P> & Readonly<{
        kinds: readonly string[];
        from: EntryId | null;
        direction: 'forward' | 'backward';
        pageBytes: number;
        inherited?: true;
    }>): Reply<HistoryPage>;
    next(input: SessionAccess<P> & Readonly<{
        cursor: string;
    }>): Reply<HistoryPage>;
    since(input: SessionAccess<P> & Readonly<{
        after: EntryId;
        kinds: readonly string[];
        pageBytes: number;
    }>): Reply<HistoryPage>;
    readModelView(input: SessionAccess<P> & Readonly<{
        basis: ModelViewBasis | null;
        after: string | null;
        pageBytes: number;
    }>): Reply<ModelViewRead>;
}
export type ArchivedBy = 'person' | 'auto' | 'parent';
export type SessionListRelation = Readonly<{
    kind: 'main';
}> | Readonly<{
    kind: 'child';
    parent: SessionId;
}> | Readonly<{
    kind: 'handoff';
    origin: SessionId;
}>;
export type SessionListItem = Readonly<{
    session: SessionId;
    createdAt: string | null;
    lastActivityAt: string | null;
    lifecycle: WorkSnapshot['lifecycle'];
    title: string | null;
    archivedAt: string | null;
    archivedBy: ArchivedBy | null;
    relation: SessionListRelation;
    root: SessionId;
    depth: number;
    attendance: Attendance;
    definition: string;
    toReference: RelationToReference | null;
}>;
export type SessionListFilter = Readonly<{
    kind?: SessionListRelation['kind'];
    parent?: SessionId;
    root?: SessionId;
    attendance?: Attendance;
    definition?: string;
    toReference?: RelationToReference;
}>;
export type SessionListPage = Readonly<{
    items: readonly SessionListItem[];
    next: string | null;
    completeness: 'complete' | 'partial';
}>;
type DirectoryAccess<P> = Readonly<{
    principal: P;
    tenant: TenantId;
    after: string | null;
    limit: number;
    filter?: SessionListFilter;
    reference?: SessionId;
}>;
export type UnarchivedLifecycle = Exclude<WorkSnapshot['lifecycle'], 'archived'>;
export interface SessionDirectory<P> {
    list(input: DirectoryAccess<P> & Readonly<{
        lifecycle?: UnarchivedLifecycle;
        titleContains?: string;
    }>): Reply<SessionListPage>;
    listArchived(input: DirectoryAccess<P> & Readonly<{
        from: string | null;
        to: string | null;
        by: ArchivedBy | null;
        titleContains: string | null;
    }>): Reply<SessionListPage>;
}
export type SessionFaces<P> = Readonly<{
    work: SessionWork<P>;
    management: SessionManagement<P>;
    reconciliation: SessionReconciliation<P>;
    history: SessionHistory<P>;
}>;
export {};
```

## 声明文件 `fork.d.ts`

```ts
import type { Message } from '@omne-harness/message';
import type { SessionId } from './identity.ts';
export type ForkPoint = Readonly<{
    epoch: string;
    upper: string;
    position: string;
}>;
export type SessionFork = Readonly<{
    source: SessionId;
    point: ForkPoint;
}>;
export type ForkFacts = Readonly<{
    rows: string | null;
    next: Message['role'] | null;
    current: boolean;
    running: boolean;
    floor: string;
    tail: string;
}>;
export type ForkPointJudgment = 'boundary' | 'unknown-epoch' | 'out-of-bounds' | 'not-a-boundary';
export declare function judgeForkPoint(point: ForkPoint, facts: ForkFacts): ForkPointJudgment;
export declare function ownPositionAfter(last: string | null, point: ForkPoint | null): bigint;
export declare function forkPointBefore(epoch: string, asking: Readonly<{
    seq: string;
    role: string;
}> | undefined, tail: string): ForkPoint | null;
export declare function forkPointText(point: ForkPoint): string;
export declare function parseForkPoint(text: string): ForkPoint | null;
```

## 声明文件 `frontier-state.d.ts`

```ts
import type { SessionEntry } from './entries.ts';
import type { RunId } from './identity.ts';
import type { HistoryEntry } from './faces.ts';
import { type SessionHistoryReads } from './history-values.ts';
import type { WorkSnapshot } from './values.ts';
export declare function validateFrontierBatch(snapshot: WorkSnapshot, entries: readonly SessionEntry[], reads?: SessionHistoryReads): void;
export declare function validateInterpretationEntry(snapshot: WorkSnapshot, entry: SessionEntry, run: RunId | undefined): void;
export declare function validateReplayHistory(snapshot: WorkSnapshot, entries: readonly SessionEntry[], rows: readonly HistoryEntry[], reads?: SessionHistoryReads): ReadonlyMap<string, RunId>;
```

## 声明文件 `history-validation.d.ts`

```ts
import type { AttemptId, DurableEvidence, InputId, RunId } from './identity.ts';
import type { WorkSnapshot, InputBatch } from './values.ts';
import type { ExecutionHistoryBoundary, SessionHistoryIndex, SessionHistoryReads, SessionInputAdmission, SessionInputScope, SessionBatchRecord, SessionExecutionPrefix } from './history-values.ts';
export type HistoryContext = Readonly<{
    snapshot: WorkSnapshot;
    index: SessionHistoryIndex;
    reads: SessionHistoryReads | undefined;
}>;
export declare function historyContext(snapshot: WorkSnapshot, reads?: SessionHistoryReads): HistoryContext;
export declare function executionBoundary(context: HistoryContext, execution: string, run?: RunId): ExecutionHistoryBoundary;
export declare function originalAttempt(snapshot: WorkSnapshot, attempt: AttemptId, run?: RunId): RunId;
export declare function inputAdmissions(context: HistoryContext, input: InputId): readonly SessionInputAdmission[];
export declare function validatePrefix(context: HistoryContext, prefix: SessionExecutionPrefix): void;
export declare function requirePrepared(context: HistoryContext, scope: SessionInputScope): void;
export declare function originalBatch(context: HistoryContext, run: RunId, execution: string, sequence: string, source: DurableEvidence, batch: InputBatch): SessionBatchRecord;
```

## 声明文件 `history-values.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { AttemptId, DurableEvidence, InputId, RunId, SessionId } from './identity.ts';
import type { InputBatch, ProducerRef } from './values.ts';
import type { ConsumptionId } from './identity.ts';
import type { SessionLogConsequence } from './projection.ts';
import type { SessionControlOrigin } from './control-normalization.ts';
export type SessionLogRoot = Readonly<{
    tenant: TenantId;
    session: SessionId;
    position: string;
    source: DurableEvidence;
}>;
export type InputAdmissionMember = Readonly<{
    ordinal: string;
    run: RunId;
    execution: string;
    operation: string;
    accepted: DurableEvidence;
    attempt: AttemptId;
}>;
export type InputAdmissionBoundary = Readonly<{
    input: InputId;
    directory: string;
    version: string;
    count: string;
    members: readonly InputAdmissionMember[];
    source: DurableEvidence;
}>;
export type SessionFactKind = SessionLogConsequence['kind'] | 'deferred';
export type SessionFactBoundary = Readonly<{
    sequence: string;
    source: DurableEvidence;
    kinds: readonly SessionFactKind[];
}>;
export declare const isDeferredFact: (kinds: readonly SessionFactKind[]) => boolean;
export type ExecutionHistoryBoundary = Readonly<{
    run: RunId;
    execution: string;
    started: DurableEvidence;
    revision: string;
    executionEvidence: DurableEvidence;
    emittedThrough: string;
    readThrough: string;
    interpreted: DurableEvidence | null;
    ended: Readonly<{
        sequence: string;
        source: DurableEvidence;
    }> | null;
    facts: readonly SessionFactBoundary[];
}>;
export type SessionBatchRecord = Readonly<{
    run: RunId;
    execution: string;
    sequence: string;
    source: DurableEvidence;
    batch: InputBatch;
}>;
export type SessionAttemptRecord = Readonly<{
    run: RunId;
    attempt: AttemptId;
    execution: string;
    ordinal: string;
    started: DurableEvidence;
    grant?: DurableEvidence;
}>;
export type SessionTakenRecord = SessionBatchRecord & Readonly<{
    commit: DurableEvidence;
}>;
export type SessionHistoryIndex = Readonly<{
    root: SessionLogRoot;
    inputs: readonly InputAdmissionBoundary[];
    executions: readonly ExecutionHistoryBoundary[];
    attempts: readonly SessionAttemptRecord[];
    batches: readonly SessionBatchRecord[];
    taken: readonly SessionTakenRecord[];
}>;
export type SessionInputScope = Readonly<{
    kind: 'pending' | 'selected';
    inputs: readonly InputId[];
}>;
export type SessionInputAdmission = InputAdmissionMember & Readonly<{
    runStarted: DurableEvidence;
    attemptStarted: DurableEvidence;
    attachment: string;
    grant: DurableEvidence;
}>;
export type InputAdmissionPage = Readonly<{
    input: InputId;
    directory: string;
    version: string;
    offset: string;
    next: string | null;
    records: readonly SessionInputAdmission[];
}>;
export type SessionPrefixFact = Readonly<{
    sequence: string;
    source: DurableEvidence;
    consequences: readonly SessionLogConsequence[];
}>;
export type SessionExecutionPrefix = Readonly<{
    execution: string;
    run: RunId;
    after: string;
    through: string;
    facts: readonly SessionPrefixFact[];
}>;
export type SessionUninterpretedCall = Readonly<{
    execution: string;
    sequence: string;
    consumption: ConsumptionId;
    producer: ProducerRef | null;
}>;
export type SessionHistoryReads = Readonly<{
    root: SessionLogRoot;
    scope: SessionInputScope;
    admissions: readonly InputAdmissionPage[];
    prefixes: readonly SessionExecutionPrefix[];
    attempts: readonly SessionAttemptRecord[];
    taken: readonly SessionTakenRecord[];
    controls?: readonly SessionControlOrigin[];
    uninterpreted: readonly SessionUninterpretedCall[];
}>;
```

## 声明文件 `identity.d.ts`

```ts
import type { Access } from '@omne-harness/legal-identity';
export type { Adoption, ConsumerRef, DurableEvidence } from '@omne-harness/exchange-refs';
declare const sessionIdentity: unique symbol;
export type SessionIdentity<K extends string> = string & {
    readonly [sessionIdentity]: K;
};
export type SessionId = SessionIdentity<'SessionId'>;
export type RunId = SessionIdentity<'RunId'>;
export type AttemptId = SessionIdentity<'AttemptId'>;
export type InputId = SessionIdentity<'SessionInputId'>;
export type BatchId = SessionIdentity<'SessionBatchId'>;
export type SessionOperationId = SessionIdentity<'SessionOperationId'>;
export type TodoItemId = SessionIdentity<'TodoItemId'>;
export type SessionRevision = SessionIdentity<'SessionRevision'>;
export type ConsumptionId = SessionIdentity<'SessionConsumptionId'>;
export type EntryId = SessionIdentity<'SessionEntryId'>;
export type ResidentKey = SessionIdentity<'ResidentKey'>;
export type AgentInstanceRef = Readonly<{
    owner: 'agent';
    id: string;
}>;
export type SessionCallerClass = 'intake' | 'coordinator' | 'maintainer' | 'reader';
export type SessionAccess<P> = Access<P> & Readonly<{
    session: SessionId;
}>;
export type Mutation<P> = SessionAccess<P> & Readonly<{
    operation: SessionOperationId;
}>;
export type AdvanceRef = Readonly<{
    run: RunId;
    attempt: AttemptId;
    instance: AgentInstanceRef;
}>;
```

## 声明文件 `index.d.ts`

```ts
export type { Adoption, AdvanceRef, AgentInstanceRef, AttemptId, BatchId, ConsumerRef, ConsumptionId, DurableEvidence, EntryId, InputId, Mutation, ResidentKey, RunId, SessionAccess, SessionCallerClass, SessionId, SessionIdentity, SessionOperationId, SessionRevision, TodoItemId, } from './identity.ts';
export { requiredWorkEntries, compactionCallChangeOf } from './work-entry-state.ts';
export type { AutoArchivePolicy, BoundedClose, CallBinding, ClockSample, Consumption, ContextMaterial, Control, ControlIntent, ControlProgress, ControlTarget, DeclarationChange, DerivedMessage, ExecutionRef, FreezeVerdict, IdleCoverage, IdleObservation, InitializationResult, InitializationSource, InitializationSources, InputBatch, Modes, Participation, ProducedResult, ProducerRef, RecoveryTask, Relation, Attendance, SessionTree, ResidentTool, ResultConsumption, RoutedInput, RunEnd, RunFailure, RunState, RunTerminal, ScopeReleaseDisposition, BackgroundDisposition, SessionCreation, SessionFrozen, SessionWaiting, Waiting, WorkSnapshot, WorkspaceAttachment, } from './values.ts';
export type { AdmittedMessage, DeliveredInputs, CommitReceipt, CompactionContextRead, Completion, EntryClass, ExternalCompletion, HistoryEntry, HistoryPage, ModelViewBasis, ForkPointRead, ModelViewRead, ModelViewRow, OperationResolution, PendingReason, ProducerFact, ReleasedScope, Reply, ResidentReference, SessionDirectory, SessionFaces, SessionFailure, SessionHistory, ArchivedBy, SessionListFilter, SessionListItem, SessionListPage, SessionListRelation, UnarchivedLifecycle, SessionManagement, SessionReconciliation, SessionWork, StartAdoption, StartedRun, } from './faces.ts';
export { INGRESS_FAMILIES, deriveDriveOperation, deriveIngressOperation, deriveSessionOperation, type DriveOperationElements, type IngressFamily, type SessionOperationElements, } from './operations.ts';
export type { ControlOperationResolution, SavedModelSelection, SessionCallLookup, SessionCallTerminal, SessionControlAnswer, SessionControlReceipt, SessionModelSelection, SessionRunLookup, } from './control-values.ts';
export type { SessionEntriesBoundary, SessionEntriesChannel, SessionEntriesInterpretation, SessionEntriesItem, SessionEntriesObservation, SessionEntriesProgress, SessionEntriesReceipt, SessionEntriesStart, SessionLogCommitObservation, SessionLogReceipt, } from './interpretation-values.ts';
export type { AdoptionEvidenceCommand, AgentDrivePort, CustodyEvidenceCommand, ProductionEvidenceCommand, RunAdoption, RunAdoptionInput, SessionAdoptionPlanAnswer, SessionAdoptionPlanInput, SessionAdoptionRecorded, SessionAdoptionSource, SessionCustodySource, SessionProductionSource, DriveFailure, DriveReceipt, DriveReply, DriveTarget, ExecutionStatus, GuardCommand, MutationName, ScopeReleasePort, ScopeReleaseReadback, SessionCallControl, SessionCallStates, SessionBlockDeclaration, SessionClock, SessionCommand, SessionContextInput, SessionEvidenceBridge, SessionIdentityBridge, SessionIdleInput, SessionInternalPrincipals, SessionNotifier, SessionPrincipalBindingSource, SessionScopeOwnerSource, SessionTransactionPort, SessionWorkPrincipals, } from './ports.ts';
export { sessionModesBlock } from './block.ts';
export { expectedHolds, expectedRevision, judgeAdvance, judgeCompletion, judgeIdle, judgeRunStart, judgeWaiting, openWork, resolveCascade, resolveControlScope, resolveOperation, routeInput, type AdvanceClaim, type AdvanceJudgment, type CommittedBatch, type CompletionJudgment, type ControlScope, type DecideReads, type Decision, type EncodedEntry, type IdleJudgment, type OpenWork, type OperationJudgment, type OperationRecord, type ReduceResult, type RouteJudgment, type RunStartJudgment, } from './judgments.ts';
export { decide, commandDigest, runIdOf } from './decide.ts';
export { RELATIONS_TO_REFERENCE, relationToReference, type DirectoryStanding, type RelationToReference, } from './directory-relation.ts';
export { MAX_SESSION_DEPTH, childRecorded, judgeStanding, relatedOf, relatedSessionOf, standingOf, type ChildRecord, type RelatedSession, } from './standing.ts';
export { workspaceSelection, type WorkspaceSelection } from './workspace-selection.ts';
export { cancellationDriveOf, runCancelledBy } from './decision-support.ts';
export { batchEvidence } from './batch-evidence.ts';
export { EMPTY_AUTHORIZATIONS, incompleteAuthorization, onceAuthorizationOf, reduceAuthorizations, retireOnce, type AuthorizationConsumer, type AuthorizationContext, type AuthorizationExpression, type AuthorizationScope, type OnceAuthorization, type SessionAuthorization, } from './authorizations.ts';
export { batchCallKeys, reduce } from './reduce.ts';
export { consumptionIdOf } from './decide-results.ts';
export { decideCompactionCommit, projectCompactionCommit, type CompactionCommitState, } from './compaction-commit.ts';
export { expandHistoryEntries } from './entries.ts';
export { CONTEXT_SCOPE_KINDS, contextScopeOf, contextScopesOf, type SessionContextScope, } from './context-scopes.ts';
export { projectSessionLog, type SessionLogObservation, type SessionLogConsequence, } from './projection.ts';
export { projectSessionEntries, digestSessionEntries } from './entries-interpretation.ts';
export { digestSessionLog, executionReadThrough } from './log-interpretation.ts';
export { decideControlConsequences, type SessionControlDecisionInput, type SessionControlEvidence, type SessionControlOrigin, type SessionControlRecordEvidence, type SessionControlSettlement, type SessionControlStage, } from './control-normalization.ts';
export { isDeferredFact, type SessionFactKind } from './history-values.ts';
export type { ResidentAdoption, RunExecution, ContextScopeBinding } from './values.ts';
export { INITIALIZATION_PROTOCOL } from './initialization-schema.ts';
export type { InitialAdoption, InitializationAdoption, InitializationGuardFacts, InitializationGuardResult, InitializationConsequence, InitializationState, InitializationFactReference, } from './initialization-schema.ts';
export { initializationRegistrationCommit } from './initialization-plan.ts';
export type { InitializationPlanItem } from './initialization-plan.ts';
export type { InitializationRegistration } from './initialization-registration.ts';
export type { InitializationRequirement } from './initialization-requirements.ts';
export type { SessionLogRoot, SessionHistoryIndex, InputAdmissionBoundary, InputAdmissionMember, ExecutionHistoryBoundary, SessionFactBoundary, SessionBatchRecord, SessionAttemptRecord, SessionTakenRecord, SessionHistoryReads, SessionInputScope, InputAdmissionPage, SessionInputAdmission, SessionExecutionPrefix, SessionPrefixFact, SessionUninterpretedCall, } from './history-values.ts';
export { uninterpretedCalls } from './uninterpreted-calls.ts';
export { boundConsumptions, committedBindings, withoutCommitted } from './committed-bindings.ts';
export type { CommittedBinding } from './committed-bindings.ts';
export type { SessionCallRegistration, SessionCallRecord, SessionCallWait } from './call-values.ts';
export { bindingOf, boundCall, callKeysIn, callKeysOutside, callWithLate, lendCalls, type SessionCallBinding, type SessionCall, type SessionCallKeys, type SessionLateCallFact, type SettledCallLookup, } from './call-settlement.ts';
export { readCallRegistration } from './call-registration.ts';
export type { CallRegistrationView } from './call-registration.ts';
export { readRunBoundary } from './run-boundary.ts';
export type { RunBoundaryView } from './run-boundary.ts';
export type { SessionWorkEntryIndex, SessionCallEntryReferences, SessionControlEntryReferences, } from './work-entry-values.ts';
export { mutationAccessRequest, readAccessRequest, type SessionAccessCheck, type SessionAccessDecision, type SessionAccessOperation, type SessionAccessRequest, type SessionAccessTarget, type SessionCheckedAccess, type SessionDelegatedTransactions, type SessionReadAccessOperation, } from './access.ts';
export { DEFAULT_SESSION_INTAKE_LIMITS, sessionIntakeLimits, sessionInputBytes, judgeSessionIntake, pendingIntakeCount, inputsToDeliver, runStartInputs, wakingInputs, } from './intake.ts';
export { archiveCollapse, backgroundCalls, controlAnswer, controlRoutes, type ArchiveCollapse, type ControlRoutes, type DirectCallControl, } from './call-control.ts';
export { backgroundInputId, judgeBackgroundOutcome, type BackgroundOutcomeJudgment, } from './background-outcome.ts';
export type { SessionIntakeLimits } from './intake.ts';
export { INTAKE_BUDGET_REQUIRED, INTAKE_GUARD_OWNER, admitDerived, admitDerivedOf, admitSource, createInputSourceRegistry, inputSourceName, commandInput, prepareEntriesTerms, prepareIntakeTerms, budgetTermsOf, commitWithinBudget, withIntakeTerms, intakeTermsOf, parseInputSourceName, type AdmittedSource, type DerivedAdmission, type DerivedInputKind, type InputSourceDeclaration, type InputSourceLookup, type InputSourceName, type InputSourceRegistry, type InputSources, type IntakeBasis, type IntakeSubject, type SourceTerms, type IntakeTerms, type SessionDerivedInputs, type SessionIntakeBudget, type BudgetTerms, type SourceAdmission, type SourceRefusal, } from './input-sources.ts';
export type { TodoItem, VisibleTodoItem, TodoMutationReceipt, TodoPageCursor, TodoPage, SessionTodos, } from './todos.ts';
export type { SessionPermissionAssignment, SessionPermissions, SessionPermissionChangeBasis, SessionPermissionWriteQualification, } from './permission-values.ts';
export { rebuildSessionPermissions, type SessionPermissionHistory } from './permission-history.ts';
export { backgroundCallView, shortCallId } from './background-calls.ts';
export type { BackgroundCallLabel, BackgroundCallResolution, BackgroundCallRecord, BackgroundCallSource, BackgroundCallState, BackgroundCallStatus, BackgroundCallStop, BackgroundCallView, StopInitiator, StopView, } from './background-calls.ts';
export { compactionContextForView, isAcceptedInputRecord } from './model-view.ts';
export { forkPointBefore, forkPointText, judgeForkPoint, ownPositionAfter, parseForkPoint, type ForkFacts, type ForkPoint, type ForkPointJudgment, type SessionFork, } from './fork.ts';
export { sourceRequestIdentities, type SourceRequest, type SourceRequestIdentities, } from './source-requests.ts';
export { INPUT_FATE_KINDS, foldInputFate, type InputFate } from './input-fate.ts';
export { PENDING_PAGE_LIMIT, PENDING_PREVIEW_CHARS, inputFateOfRows, pendingAcceptances, pendingInputOf, pendingPageOf, previewOf, waitingCalls, type PendingInput, type PendingPage, type WaitingCall, } from './intake-reads.ts';
export { createBeforeIntakeRegistry, judgeIntakeBlocks, bringsOrigin, keepsTheWords, originalContent, screenInput, type BeforeIntakeRegistry, type IntakeBlockRefusal, type IntakeProcessor, type IntakeScreening, type IntakeVerdict, type Screened, } from './before-intake.ts';
export { createUtteranceResolverRegistry, type Resolution, type SenderView, type Utterance, type UtteranceResolver, type UtteranceResolverRegistry, } from './utterance-resolver.ts';
```

## 声明文件 `initialization-parse.d.ts`

```ts
import { type JsonValue } from '@omne-harness/json-text';
import type { Adoption, DurableEvidence } from './identity.ts';
import type { ContextMaterial, InitializationResult } from './values.ts';
export declare class InitializationInvalid extends Error {
}
export declare function object(value: unknown, keys: readonly string[]): Record<string, unknown>;
export declare function text(value: unknown): string;
export declare function list<T>(value: unknown, parse: (item: unknown) => T): readonly T[];
export declare function adoption(value: unknown): Adoption;
export declare function evidence(value: unknown): DurableEvidence;
export declare function json(value: unknown): JsonValue;
export declare function material(value: unknown): ContextMaterial;
export declare function result(value: unknown): InitializationResult;
```

## 声明文件 `initialization-plan.d.ts`

```ts
import { type TenantId } from '@omne-harness/legal-identity';
import { type JsonValue } from '@omne-harness/json-text';
import type { SessionId, SessionOperationId } from './identity.ts';
import type { SessionCreation } from './values.ts';
import type { InitializationPlanItem } from './values.ts';
export type { InitializationPlanItem } from './values.ts';
export declare function canonicalInitializationValue(value: unknown): unknown;
export declare const sameInitializationValue: (left: unknown, right: unknown) => boolean;
export declare const initializationKey: (item: Readonly<{
    owner: string;
    item: string;
}>) => string;
export declare function planItem(value: unknown): InitializationPlanItem;
export declare function tenantText(tenant: TenantId): string;
export declare function creationInput(creation: SessionCreation): JsonValue;
export declare function initializationRegistrationCommit(input: Readonly<{
    tenant: TenantId;
    session: SessionId;
    createOperation: SessionOperationId;
    owner: string;
    item: string;
}>): string;
export declare function initializationPlan(creation: SessionCreation): readonly InitializationPlanItem[];
```

## 声明文件 `initialization-registration.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
import type { TenantId } from '@omne-harness/legal-identity';
import type { SessionId, SessionOperationId } from './identity.ts';
import { type InitializationPlanItem } from './initialization-plan.ts';
import type { InitializationRegistration } from './values.ts';
export type { InitializationRegistration } from './values.ts';
export declare function registration(value: unknown): InitializationRegistration;
export declare function registrationInput(value: JsonValue): Pick<InitializationRegistration, 'need' | 'binding' | 'parameters'>;
export declare function validateRegistrationBinding(decision: InitializationRegistration, plan: InitializationPlanItem, binding: Readonly<{
    tenant: TenantId;
    session: SessionId;
    createOperation: SessionOperationId;
}>): void;
```

## 声明文件 `initialization-requirements.d.ts`

```ts
import type { InitializationPlanItem } from './initialization-plan.ts';
import type { InitializationRequirement } from './values.ts';
export type { InitializationRequirement } from './values.ts';
export declare function requirements(value: unknown): readonly InitializationRequirement[];
export declare function validateRequirementPlan(values: readonly InitializationRequirement[], plan: readonly InitializationPlanItem[]): void;
```

## 声明文件 `initialization-schema.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
import type { InitializationAdoption, InitialAdoption, InitializationConsequence, InitializationGuardResult, InitializationGuardFacts } from './values.ts';
import type { Adoption } from './identity.ts';
import type { GuardCommand, SessionCommand } from './ports.ts';
export declare const INITIALIZATION_PROTOCOL: Adoption;
export type { InitializationAdoption, InitialAdoption, InitializationConsequence, InitializationGuardResult, InitializationGuardFacts, InitializationFactReference, } from './values.ts';
export declare function adoptionMaterial(value: unknown, initial: true): InitialAdoption;
export declare function adoptionMaterial(value: unknown, initial: false): InitializationAdoption;
export declare function consequence(value: unknown): InitializationConsequence | null;
export declare function guardResult(value: unknown): InitializationGuardResult;
export declare function parseInitializationFacts(guard: GuardCommand): InitializationGuardFacts;
export declare function initializationCommandInput(command: Extract<SessionCommand, {
    kind: 'create' | 'completeInitialization';
}>): JsonValue;
export type { InitializationResultRecord, InitializationState } from './values.ts';
```

## 声明文件 `initialization-validation.d.ts`

```ts
import type { GuardCommand, SessionCommand } from './ports.ts';
import type { WorkSnapshot } from './values.ts';
import { type InitializationPlanItem } from './initialization-plan.ts';
import { type InitialAdoption, type InitializationAdoption, type InitializationGuardFacts, type InitializationGuardResult } from './initialization-schema.ts';
export declare function validateAdoption(value: InitializationAdoption, original: Pick<InitialAdoption, 'definitionName' | 'adopted'>): void;
export declare function initializationGuard(previous: WorkSnapshot | null, command: Extract<SessionCommand, {
    kind: 'create' | 'completeInitialization';
}>, guards: readonly GuardCommand[]): InitializationGuardFacts;
export declare function validateResult(value: InitializationGuardResult, plan: InitializationPlanItem): void;
```

## 声明文件 `input-fate.d.ts`

```ts
import type { SessionEntry, SessionEntryKind } from './entries.ts';
import type { InputId, RunId } from './identity.ts';
import type { RunTerminal } from './values.ts';
export type InputFate = Readonly<{
    kind: 'pending';
    returnedFrom: RunId | null;
}> | Readonly<{
    kind: 'taken';
    run: RunId;
}> | Readonly<{
    kind: 'answered';
    run: RunId;
    terminal: 'active' | RunTerminal['outcome'];
}> | Readonly<{
    kind: 'settled';
    by: 'cancelled' | 'archived' | 'frozen';
    run: RunId | null;
}> | Readonly<{
    kind: 'refused';
    reason: string;
}>;
export declare const INPUT_FATE_KINDS: readonly SessionEntryKind[];
export declare function foldInputFate(input: InputId, entries: Iterable<SessionEntry>): InputFate | null;
```

## 声明文件 `input-leases.d.ts`

```ts
import type { InputId } from './identity.ts';
import type { RunTerminal, WorkSnapshot } from './values.ts';
export declare function pendingAfterTerminal(snapshot: Pick<WorkSnapshot, 'pending' | 'unanswered'>, outcome: RunTerminal['outcome']): readonly InputId[];
```

## 声明文件 `input-sources.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { Outcome } from '@omne-harness/operation-result';
import type { SessionFailure } from './faces.ts';
import { type SessionIntakeLimits } from './intake.ts';
import type { GuardCommand, SessionCommand } from './ports.ts';
import type { RoutedInput } from './values.ts';
export type InputSourceName = string & {
    readonly __inputSource: unique symbol;
};
export declare function parseInputSourceName(text: unknown): InputSourceName | null;
export declare function inputSourceName(text: string): InputSourceName;
export type InputSourceDeclaration = Readonly<{
    name: InputSourceName;
    label: string;
    accepts: Readonly<{
        subject: 'member';
    }> | Readonly<{
        subject: 'system';
        component: string;
        screened: boolean;
    }>;
    wake: 'always' | 'never' | 'as-requested';
}>;
export type IntakeSubject = Readonly<{
    kind: 'member';
}> | Readonly<{
    kind: 'system';
    component: string;
}>;
export type AdmittedSource = Readonly<{
    name: InputSourceName;
    label: string;
    role: 'user' | 'system_reminder';
    wakes: boolean;
    entry: 'login' | 'trusted';
    countsTowardCapacity: boolean;
}>;
export type SourceRefusal = 'subject-not-accepted' | 'wake-flag-not-allowed';
export type SourceAdmission = Readonly<{
    kind: 'admitted';
    source: AdmittedSource;
    parse: boolean;
    screened: boolean;
}> | Readonly<{
    kind: 'refused';
    reason: SourceRefusal;
}>;
export declare function admitSource(declaration: InputSourceDeclaration, subject: IntakeSubject, request: Readonly<{
    wake?: boolean;
}>): SourceAdmission;
export type InputSourceLookup = Readonly<{
    kind: 'registered';
    declaration: InputSourceDeclaration;
}> | Readonly<{
    kind: 'absent';
}>;
export interface InputSources {
    lookup(name: InputSourceName): InputSourceLookup;
}
export type InputSourceRegistry = InputSources & Readonly<{
    register(declaration: InputSourceDeclaration): () => void;
}>;
export declare function createInputSourceRegistry(): InputSourceRegistry;
export type DerivedInputKind = 'background-outcome' | 'background-stop';
export type DerivedAdmission = Readonly<{
    declaration: InputSourceDeclaration;
    subject: IntakeSubject;
}>;
export interface SessionDerivedInputs {
    admission(kind: DerivedInputKind): DerivedAdmission | null;
}
export type SourceTerms = Readonly<{
    kind: 'admitted';
    source: AdmittedSource;
}> | Readonly<{
    kind: 'refused';
    reason: SourceRefusal;
}> | Readonly<{
    kind: 'unavailable';
    reason: 'source-absent' | 'subject-absent';
}>;
export type BudgetTerms = Readonly<{
    kind: 'given';
    limits: SessionIntakeLimits;
}> | Readonly<{
    kind: 'unavailable';
}> | Readonly<{
    kind: 'deferred';
}>;
export interface SessionIntakeBudget {
    read(tenant: TenantId): Promise<SessionIntakeLimits | null>;
}
export type IntakeTerms = Readonly<{
    source?: SourceTerms;
    budget?: BudgetTerms;
    derived?: Readonly<Partial<Record<DerivedInputKind, DerivedAdmission>>>;
}>;
export declare const INTAKE_GUARD_OWNER = "session-intake";
export declare const INTAKE_BUDGET_REQUIRED = "the answer depends on the intake budget of the tenant";
type Ordinary = Extract<RoutedInput, {
    kind: 'ordinary';
}>;
export declare function commandInput(command: SessionCommand): Ordinary | null;
export type IntakeBasis = Readonly<{
    subject: IntakeSubject | undefined;
    sources: InputSources | null;
    derived: SessionDerivedInputs | null;
    budget?: BudgetTerms | undefined;
}>;
export declare function budgetTermsOf(budget: SessionIntakeBudget | null | undefined, command: SessionCommand): Promise<BudgetTerms | undefined>;
type Attempt<R> = (budget: BudgetTerms | undefined) => Promise<Outcome<R, SessionFailure>>;
export declare function commitWithinBudget<R>(budget: SessionIntakeBudget | null | undefined, command: SessionCommand, attempt: Attempt<R>): Promise<Outcome<R, SessionFailure>>;
export declare function prepareIntakeTerms(command: SessionCommand, basis: IntakeBasis): IntakeTerms | null;
export declare function prepareEntriesTerms(derived: SessionDerivedInputs | null): IntakeTerms['derived'];
export declare function withIntakeTerms(guards: readonly GuardCommand[], terms: IntakeTerms | null): readonly GuardCommand[];
export declare function intakeTermsOf(guards: readonly GuardCommand[]): IntakeTerms | null;
export declare function admitDerivedOf(derived: IntakeTerms['derived'], kind: DerivedInputKind, request: Readonly<{
    wake?: boolean;
}>): AdmittedSource | null;
export declare function admitDerived(admission: DerivedAdmission | undefined, request: Readonly<{
    wake?: boolean;
}>): AdmittedSource | null;
export {};
```

## 声明文件 `intake-reads.d.ts`

```ts
import type { Message } from '@omne-harness/message';
import type { HistoryEntry } from './faces.ts';
import type { DurableEvidence, EntryId, InputId, RunId } from './identity.ts';
import { type InputFate } from './input-fate.ts';
import type { AdmittedSource } from './input-sources.ts';
import type { RoutedInput, WorkSnapshot } from './values.ts';
type Ordinary = Extract<RoutedInput, {
    kind: 'ordinary';
}>;
export type PendingInput = Readonly<{
    input: InputId;
    position: EntryId;
    source: Pick<AdmittedSource, 'name' | 'label'>;
    role: AdmittedSource['role'];
    wakes: boolean;
    preview: string;
}>;
export type PendingPage = Readonly<{
    inputs: readonly PendingInput[];
    next: EntryId | null;
}>;
export type WaitingCall = Readonly<{
    card: DurableEvidence;
    action: string | null;
    passage: string;
    position: string;
    run: RunId | null;
}>;
export declare const PENDING_PREVIEW_CHARS = 160;
export declare const PENDING_PAGE_LIMIT = 100;
export declare function waitingCalls(snapshot: WorkSnapshot): readonly WaitingCall[];
export declare function previewOf(message: Message): string;
export declare function pendingAcceptances(rows: Iterable<HistoryEntry>): ReadonlyMap<InputId, Readonly<{
    position: EntryId;
    source: AdmittedSource;
}>> | null;
export declare function pendingInputOf(stored: Ordinary, accepted: Readonly<{
    position: EntryId;
    source: AdmittedSource;
}>): PendingInput;
export declare function pendingPageOf(inputs: readonly PendingInput[], after: EntryId | null, limit: number): PendingPage;
export declare function inputFateOfRows(input: InputId, rows: Iterable<HistoryEntry>): Readonly<{
    fate: InputFate | null;
}> | 'unreadable';
export {};
```

## 声明文件 `intake.d.ts`

```ts
import type { SessionFailure } from './faces.ts';
import type { InputId } from './identity.ts';
import type { RoutedInput, WorkSnapshot } from './values.ts';
export type SessionIntakeLimits = Readonly<{
    maxPendingInputs: number;
    maxInputBytes: number;
}>;
export declare const DEFAULT_SESSION_INTAKE_LIMITS: SessionIntakeLimits;
export declare function sessionIntakeLimits(value?: SessionIntakeLimits): SessionIntakeLimits;
export declare function sessionInputBytes(value: Extract<RoutedInput, {
    kind: 'ordinary';
}>): number;
export declare function judgeSessionIntake(pending: number, value: Extract<RoutedInput, {
    kind: 'ordinary';
}>, limits: SessionIntakeLimits): Extract<SessionFailure, {
    kind: 'limited';
}> | null;
export declare function pendingIntakeCount(snapshot: Pick<WorkSnapshot, 'pending' | 'handed' | 'uncountedInputs'>): number;
export declare function inputsToDeliver(snapshot: Pick<WorkSnapshot, 'deliveredTail'>, ordered: readonly InputId[]): readonly InputId[];
export declare function runStartInputs(snapshot: Pick<WorkSnapshot, 'pending' | 'quietInputs'> | null | undefined): readonly InputId[];
export declare function wakingInputs(snapshot: Pick<WorkSnapshot, 'pending' | 'quietInputs'>): readonly InputId[];
```

## 声明文件 `interpretation-values.d.ts`

```ts
import type { DurableEvidence, RunId, SessionAccess, SessionOperationId } from './identity.ts';
import type { Message } from '@omne-harness/message';
import type { ProducerFact } from './faces.ts';
import type { ProducerRef } from './values.ts';
import type { BackgroundCallLabel, BackgroundCallSource } from './background-calls.ts';
import type { SessionLogObservation } from './projection.ts';
export type SessionEntriesChannel = 'model-received' | 'tool-received';
export type SessionEntriesBoundary = Readonly<{
    execution: string;
    channel: SessionEntriesChannel;
    revision: string;
    executionEvidence: DurableEvidence;
    count: string;
}>;
export type SessionEntriesInterpretation = Extract<ProducerFact, {
    kind: 'execution' | 'account';
}> | Readonly<{
    kind: 'backgrounded';
    producer: ProducerRef;
    source: DurableEvidence;
    label: BackgroundCallLabel;
    how: BackgroundCallSource;
}> | Readonly<{
    kind: 'background-outcome';
    producer: ProducerRef;
    result: string;
    reminder: Message;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'observed';
}>;
export type SessionEntriesItem = Readonly<{
    ordinal: string;
    key: string;
    fact: DurableEvidence;
    interpretation: readonly SessionEntriesInterpretation[];
}>;
export type SessionEntriesObservation = Omit<SessionAccess<never>, 'principal'> & Readonly<{
    run: RunId;
    execution: string;
    channel: SessionEntriesChannel;
    operation: SessionOperationId;
    after: string;
    through: string;
    position: string;
    boundary: SessionEntriesBoundary;
    items: readonly SessionEntriesItem[];
}>;
export type SessionEntriesProgress = Readonly<{
    run: RunId;
    execution: string;
    channel: SessionEntriesChannel;
    through: string;
    position: string;
    interpreted: DurableEvidence;
}>;
export type SessionEntriesStart = Readonly<{
    kind: 'initial';
}> | Readonly<{
    kind: 'saved';
    progress: SessionEntriesProgress;
}>;
export type SessionEntriesReceipt = Readonly<{
    operation: SessionOperationId;
    through: string;
    interpreted: DurableEvidence;
}>;
export type SessionLogCommitObservation = SessionLogObservation & Readonly<{
    operation: SessionOperationId;
    executionEvidence: DurableEvidence;
}>;
export type SessionLogReceipt = Readonly<{
    operation: SessionOperationId;
    execution: string;
    readThrough: string;
    interpreted: DurableEvidence;
    recovered: boolean;
}>;
```

## 声明文件 `judgments.d.ts`

```ts
import type { SessionPermissionChangeBasis } from './permission-values.ts';
import { type SessionIntakeLimits } from './intake.ts';
import type { IntakeTerms } from './input-sources.ts';
import type { CompactionContext } from '@omne-harness/message';
import type { AdvanceRef, InputId, RunId, SessionId, SessionOperationId, SessionRevision } from './identity.ts';
import type { AutoArchivePolicy, BoundedClose, ControlIntent, IdleCoverage, IdleObservation, Participation, ProducerRef, RecoveryTask, RoutedInput, RunTerminal, SessionWaiting, Waiting, WorkSnapshot } from './values.ts';
import type { CommitReceipt, EntryClass, HistoryEntry, SessionFailure } from './faces.ts';
import type { GuardCommand, MutationName, SessionCommand } from './ports.ts';
import type { ConsumptionId, DurableEvidence } from './identity.ts';
import type { SessionHistoryReads } from './history-values.ts';
import type { SessionCallWait } from './call-values.ts';
import type { SessionCall, SessionLateCallFact } from './call-settlement.ts';
import type { SessionCallLookup, SessionCallTerminal, SessionControlAnswer, SessionRunLookup } from './control-values.ts';
import type { SessionEntriesChannel } from './interpretation-values.ts';
export type AdvanceJudgment = Readonly<{
    kind: 'ok';
}> | Readonly<{
    kind: 'stale-advance';
    current: AdvanceRef | null;
}> | Readonly<{
    kind: 'changed';
    revision: SessionRevision;
}> | Readonly<{
    kind: 'terminal';
    terminal: RunTerminal;
}> | Readonly<{
    kind: 'archived';
}>;
export type AdvanceClaim = Readonly<{
    kind: 'attempt';
    advance: AdvanceRef;
    expected: SessionRevision;
}> | Readonly<{
    kind: 'bounded';
    run: RunId;
    expected: SessionRevision;
    basis: BoundedClose;
}> | Readonly<{
    kind: 'participation';
    execution: string;
    joint: Participation['joint'];
}>;
export type RouteJudgment = Readonly<{
    kind: 'queue';
    destination: 'current-run' | 'next-run';
}> | Readonly<{
    kind: 'card';
    destination: DurableEvidence;
}> | Readonly<{
    kind: 'business';
    owner: string;
}> | Readonly<{
    kind: 'rejected';
    reason: 'archived' | 'frozen' | 'invalid';
}>;
export type RunStartJudgment = Readonly<{
    kind: 'eligible';
    first: InputId;
}> | Readonly<{
    kind: 'not-ready' | 'archived' | 'frozen' | 'run-active' | 'awaiting-person' | 'no-input' | 'login-required';
}>;
export type OpenWork = Readonly<{
    unassociatedWaiting?: readonly SessionCallWait[];
    unsettledControls?: readonly SessionOperationId[];
    pending: readonly InputId[];
    handed: readonly InputId[];
    taken: readonly InputId[];
    waiting: readonly Waiting[];
    backgroundPlaceholders: readonly ConsumptionId[];
    unresolved: readonly SessionOperationId[];
    unreadEvents: readonly Readonly<{
        execution: string;
        after: string;
    }>[];
}>;
export type CompletionJudgment = Readonly<{
    kind: 'allowed';
}> | Readonly<{
    kind: 'blocked';
    pendingInputs: readonly InputId[];
}> | Readonly<{
    kind: 'cancelled';
    terminal: RunTerminal;
}> | Readonly<{
    kind: 'terminal';
    terminal: RunTerminal;
}>;
export type ControlScope = Readonly<{
    kind: 'scope';
    unassociatedWaiting?: readonly SessionCallWait[];
    producers: readonly ProducerRef[];
    revokes: readonly ('advance' | 'pending' | 'delivery')[];
    cancelsRun: RunId | null;
    cascade: readonly RecoveryTask[];
    scopeRelease: boolean;
}> | Readonly<{
    kind: 'terminal';
    terminal: RunTerminal;
}> | Readonly<{
    kind: 'invalid';
    reason: string;
}>;
export type IdleJudgment = Readonly<{
    kind: 'due' | 'not-due' | 'exempt' | 'disabled';
}> | Readonly<{
    kind: 'unavailable';
    reason: string;
}>;
export type OperationJudgment = Readonly<{
    kind: 'new';
}> | Readonly<{
    kind: 'recovered';
    receipt: CommitReceipt;
}> | Readonly<{
    kind: 'conflict';
    operation: SessionOperationId;
}>;
export type OperationRecord = Readonly<{
    operation: SessionOperationId;
    digest: string;
    receipt: CommitReceipt;
}>;
export type CommittedBatch = Readonly<{
    revision: SessionRevision;
    entries: readonly HistoryEntry[];
}>;
export type ReduceResult = Readonly<{
    kind: 'reduced';
    snapshot: WorkSnapshot;
    settled: readonly SessionCall[];
    late: readonly SessionLateCallFact[];
}> | Readonly<{
    kind: 'quarantined';
    diagnostic: string;
}>;
export type EncodedEntry = Omit<HistoryEntry, 'id' | 'revision'>;
export type Decision = Readonly<{
    kind: 'entries';
    entries: readonly EncodedEntry[];
    progress?: Readonly<{
        run: RunId;
        execution: string;
        channel: SessionEntriesChannel;
        through: string;
    }>;
    interpreted?: readonly Readonly<{
        ordinal: string;
        key: string;
    }>[];
    admitted?: readonly Extract<RoutedInput, {
        kind: 'ordinary';
    }>[];
}> | Readonly<{
    kind: 'control-answer';
    answer: SessionControlAnswer<RunTerminal | SessionCallTerminal>;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'recovered';
    receipt: CommitReceipt;
}> | Readonly<{
    kind: 'rejected';
    failure: SessionFailure;
}>;
export type DecideReads = Readonly<{
    permissionChange?: SessionPermissionChangeBasis;
    intakeLimits?: SessionIntakeLimits;
    history?: SessionHistoryReads;
    compaction: CompactionContext | null;
    compactionEpoch?: string;
    children?: readonly SessionId[];
    related?: import('./standing.ts').RelatedSession | null;
    fork?: import('./fork.ts').ForkFacts;
    idleObservation?: IdleObservation;
    idleCoverage?: IdleCoverage;
    frozenReceipt?: CommitReceipt;
    initializationReceipts?: readonly CommitReceipt[];
    calls?: readonly SessionCallLookup[];
    runs?: readonly SessionRunLookup[];
    intake?: IntakeTerms;
}>;
export declare const OFF_PATH_DIAGNOSTIC = "not on the M2 first tenant path; the judgment lands with #756 (S-1b)";
export declare const OFF_PATH_FAILURE: Extract<SessionFailure, {
    kind: 'unavailable';
}>;
export declare function expectedRevision(snapshot: Pick<WorkSnapshot, 'run' | 'revision'>, kind: MutationName): SessionRevision;
export declare function expectedHolds(snapshot: Pick<WorkSnapshot, 'run' | 'revision'>, kind: MutationName, expected: SessionRevision): boolean;
export declare function judgeAdvance(snapshot: Pick<WorkSnapshot, 'lifecycle' | 'run' | 'revision'>, claim: AdvanceClaim): AdvanceJudgment;
export declare function routeInput(snapshot: WorkSnapshot, input: RoutedInput): RouteJudgment;
export declare function judgeRunStart(snapshot: WorkSnapshot, _entry: EntryClass): RunStartJudgment;
export declare function judgeWaiting(snapshot: WorkSnapshot): SessionWaiting | null;
export declare function judgeRetryRun(snapshot: WorkSnapshot, run: RunId): 'archived' | 'frozen' | 'not-found' | 'nothing-pending' | null;
export declare function openWork(snapshot: WorkSnapshot): OpenWork;
export declare function judgeCompletion(snapshot: WorkSnapshot, execution: string): CompletionJudgment;
export declare function resolveControlScope(snapshot: WorkSnapshot, intent: ControlIntent): ControlScope;
export declare function resolveCascade(snapshot: WorkSnapshot, children: readonly SessionId[]): readonly RecoveryTask[];
export declare function judgeIdle(snapshot: WorkSnapshot, input: Readonly<{
    observation: IdleObservation;
    policy: AutoArchivePolicy;
    coverage: IdleCoverage;
}>): IdleJudgment;
export declare function resolveOperation(record: OperationRecord | null, operation: SessionOperationId, digest: string): OperationJudgment;
export type { GuardCommand, SessionCommand };
```

## 声明文件 `log-interpretation.d.ts`

```ts
import type { SessionLogCommitObservation } from './interpretation-values.ts';
import type { RunId } from './identity.ts';
import type { WorkSnapshot } from './values.ts';
export declare function digestSessionLog(observation: SessionLogCommitObservation): string;
export declare function executionReadThrough(snapshot: WorkSnapshot, run: RunId, execution: string): string | null;
```

## 声明文件 `model-view.d.ts`

```ts
import { type CompactionContext, type Message } from '@omne-harness/message';
import type { HistoryEntry, ModelViewRow } from './faces.ts';
import type { WorkSnapshot } from './values.ts';
export type MaterializedModelView = Readonly<{
    epoch: string;
    rows: readonly ModelViewRow[];
    past?: ReadonlyMap<string, readonly ModelViewRow[]>;
}>;
export declare function isAcceptedInputRecord(entries: readonly Pick<HistoryEntry, 'kind'>[], index: number): boolean;
export declare function viewMessageOf(entries: readonly HistoryEntry[], index: number): Message | null;
export declare function materializeModelView(previous: MaterializedModelView, committed: readonly HistoryEntry[]): MaterializedModelView;
export declare function compactionReads(entries: readonly HistoryEntry[], snapshot: WorkSnapshot, through: string, inherited?: number): CompactionContext | null;
export declare function compactionContextForView(entries: readonly HistoryEntry[], snapshot: WorkSnapshot, rows: readonly ModelViewRow[], upper: number, through: string | null, inherited?: number): CompactionContext | null;
```

## 声明文件 `observation-validation.d.ts`

```ts
import type { WorkSnapshot } from './values.ts';
import type { SessionLogObservation } from './projection.ts';
import { type SessionHistoryReads } from './history-values.ts';
export declare function validateObservation(snapshot: WorkSnapshot, observation: SessionLogObservation, reads?: SessionHistoryReads): {
    context: Readonly<{
        snapshot: WorkSnapshot;
        index: import("./history-values.ts").SessionHistoryIndex;
        reads: SessionHistoryReads | undefined;
    }>;
    boundary: Readonly<{
        run: import("./identity.ts").RunId;
        execution: string;
        started: import("@omne-harness/exchange-refs").DurableEvidence;
        revision: string;
        executionEvidence: import("@omne-harness/exchange-refs").DurableEvidence;
        emittedThrough: string;
        readThrough: string;
        interpreted: import("@omne-harness/exchange-refs").DurableEvidence | null;
        ended: Readonly<{
            sequence: string;
            source: import("@omne-harness/exchange-refs").DurableEvidence;
        }> | null;
        facts: readonly import("./history-values.ts").SessionFactBoundary[];
    }>;
    head: Readonly<{
        owner: string;
        record: string;
        revision: string;
        digest: string;
    }>;
    deferred: boolean;
    repeated: boolean;
};
```

## 声明文件 `operations.d.ts`

```ts
import type { Adoption, AdvanceRef, AgentInstanceRef, ConsumptionId, DurableEvidence, InputId, RunId, SessionId, SessionOperationId } from './identity.ts';
import type { BoundedClose, CallBinding, Participation } from './values.ts';
import type { ProducerFact } from './faces.ts';
export type SessionOperationElements = Readonly<{
    kind: 'todo-tool-call' | 'stop-tool-call' | 'workspace-tool-call';
    tenant: string;
    session: SessionId;
    call: string;
}> | Readonly<{
    kind: 'startRun';
    session: SessionId;
    first: InputId;
    predecessor: RunId | null;
}> | Readonly<{
    kind: 'participation';
    execution: string;
    operation: string;
    joint: Participation['joint'];
}> | Readonly<{
    kind: 'claim';
    run: RunId;
    instance: AgentInstanceRef;
    continuity: DurableEvidence;
}> | Readonly<{
    kind: 'reload';
    run: RunId;
    candidate: Adoption;
    handover: DurableEvidence;
}> | Readonly<{
    kind: 'release';
    advance: AdvanceRef;
    handover: DurableEvidence;
}> | Readonly<{
    kind: 'bounded-close';
    run: RunId;
    basis: BoundedClose;
}> | Readonly<{
    kind: 'result';
    command: 'preserveResult' | 'completeExternalConsumption';
    consumption: ConsumptionId;
    version: string;
}> | Readonly<{
    kind: 'external-call';
    binding: CallBinding;
}> | Readonly<{
    kind: 'context-reminder';
    session: SessionId;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'context-step';
    session: SessionId;
    scope: string;
    at: string;
    value: string;
}> | Readonly<{
    kind: 'authorization';
    session: SessionId;
    card: DurableEvidence;
    decision: DurableEvidence;
}> | Readonly<{
    kind: 'idle';
    session: SessionId;
    observation: DurableEvidence;
}> | Readonly<{
    kind: 'auto-archive';
    session: SessionId;
    idleEvidence: DurableEvidence;
}> | Readonly<{
    kind: 'freeze';
    session: SessionId;
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'fact';
    fact: ProducerFact;
}>;
export type DriveOperationElements = Readonly<{
    kind: 'invoke';
    execution: string;
    first: InputId;
    started: DurableEvidence;
}> | Readonly<{
    kind: 'submit';
    execution: string;
    input: InputId;
}> | Readonly<{
    kind: 'resume';
    execution: string;
    grant: DurableEvidence;
}> | Readonly<{
    kind: 'detach';
    execution: string;
    advance: AdvanceRef;
}> | Readonly<{
    kind: 'control';
    execution: string;
    control: SessionOperationId;
}> | Readonly<{
    kind: 'recordResult';
    execution: string;
    consumption: ConsumptionId;
    version: string;
    transfer: 'custody' | 'processed' | 'none';
}>;
export declare function canonicalText(value: unknown): string;
export declare function digestOf(value: unknown): string;
export declare function deriveSessionOperation(elements: SessionOperationElements): SessionOperationId;
export declare function deriveDriveOperation(elements: DriveOperationElements): string;
export declare const INGRESS_FAMILIES: Readonly<{
    readonly control: 'session-public/1-control';
    readonly accept: 'session-public/1-accept';
    readonly create: 'session-public/1-create';
    readonly mode: 'session-public/1-mode';
}>;
export type IngressFamily = (typeof INGRESS_FAMILIES)[keyof typeof INGRESS_FAMILIES];
export declare function deriveIngressOperation(family: IngressFamily, fields: readonly string[]): SessionOperationId;
```

## 声明文件 `payload-members.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
export declare function member(value: JsonValue | undefined, key: string): JsonValue | undefined;
export declare function text(value: JsonValue | undefined): string | undefined;
```

## 声明文件 `permission-history.d.ts`

```ts
import type { DurableEvidence } from './identity.ts';
import type { CommittedBatch } from './judgments.ts';
import type { Modes, WorkSnapshot, SessionCreation } from './values.ts';
import type { SessionPermissions } from './permission-values.ts';
export type SessionPermissionHistory = Readonly<{
    permissions: SessionPermissions;
    mode: Readonly<{
        adopted: SessionCreation['modes'];
        override: Readonly<{
            value: Modes['permission'];
            source: DurableEvidence;
        }> | null;
    }>;
    source: DurableEvidence;
}>;
export declare function rebuildSessionPermissions(snapshot: WorkSnapshot, batches: Iterable<CommittedBatch>): Readonly<{
    kind: 'rebuilt';
    value: SessionPermissionHistory;
    snapshot: WorkSnapshot;
}> | Readonly<{
    kind: 'invalid';
    diagnostic: string;
}>;
```

## 声明文件 `permission-state.d.ts`

```ts
import type { DeclarationChange, WorkSnapshot } from './values.ts';
import type { SessionPermissionChangeBasis, SessionPermissions } from './permission-values.ts';
import type { SessionOperationId, DurableEvidence } from './identity.ts';
import type { Decision } from './judgments.ts';
import type { SessionEntry } from './entries.ts';
type AssignmentChange = Extract<DeclarationChange, {
    kind: 'permission-assignment';
}>;
export declare function decidePermissionAssignment(input: Readonly<{
    snapshot: WorkSnapshot;
    change: AssignmentChange;
    operation: SessionOperationId;
    commandDigest: string;
    basis: SessionPermissionChangeBasis | undefined;
    source: DurableEvidence;
}>): Decision;
export declare function applyPermissionEvent(state: SessionPermissions, entry: SessionEntry, source: DurableEvidence): SessionPermissions;
export {};
```

## 声明文件 `permission-values.d.ts`

```ts
import type { PermissionDefinition, PermissionDefinitionRef, PermissionRule } from '@omne-harness/permissions';
import type { TenantId } from '@omne-harness/legal-identity';
import type { DurableEvidence, SessionId, SessionOperationId } from './identity.ts';
export type SessionPermissionAssignment = Readonly<{
    capabilityId: string;
    enforcementKey: string;
    definition: PermissionDefinitionRef;
    rule: PermissionRule;
    source: DurableEvidence;
}>;
export type SessionPermissions = Readonly<{
    revision: string;
    assignments: readonly SessionPermissionAssignment[];
}>;
export type SessionPermissionChangeBasis = Readonly<{
    operation: SessionOperationId;
    commandDigest: string;
    revision: string;
    definition: PermissionDefinition | null;
    authority: DurableEvidence;
}>;
export type SessionPermissionWriteQualification = Readonly<{
    tenant: TenantId;
    session: SessionId;
    operation: SessionOperationId;
    commandDigest: string;
    permissionRevision: string;
    principalRef: string;
    policy: DurableEvidence;
}>;
```

## 声明文件 `ports.d.ts`

```ts
import type { ContextScopeBinding } from './values.ts';
import type { SessionCallBinding } from './call-settlement.ts';
import type { JsonValue } from '@omne-harness/json-text';
import type { TenantId } from '@omne-harness/legal-identity';
import type { Outcome } from '@omne-harness/operation-result';
import type { Adoption, AdvanceRef, ConsumptionId, DurableEvidence, InputId, ResidentKey, RunId, SessionAccess, SessionId, SessionOperationId, SessionRevision } from './identity.ts';
import type { ClockSample, Control, FreezeVerdict, IdleObservation, ProducedResult, ProducerRef, ResidentAdoption, RoutedInput, ScopeReleaseDisposition, WorkSnapshot } from './values.ts';
import type { BackgroundCallState } from './background-calls.ts';
import type { ControlOperationResolution, SessionModelSelection } from './control-values.ts';
import type { SessionEntriesObservation, SessionEntriesReceipt, SessionEntriesStart, SessionLogCommitObservation, SessionLogReceipt } from './interpretation-values.ts';
import type { OperationResolution, PendingReason, SessionFailure, ReleasedScope, Reply, ResidentReference, SessionDirectory, SessionHistory, SessionManagement, SessionReconciliation, SessionWork } from './faces.ts';
export type DriveFailure = Readonly<{
    kind: 'denied' | 'busy' | 'terminal' | 'changed' | 'stale-advance' | 'unsupported' | 'conflict';
}> | Readonly<{
    kind: 'invalid';
    reason: string;
    rejection: DurableEvidence;
}> | Readonly<{
    kind: 'refused';
    failure: 'invalid' | 'unsupported';
    field: string | null;
    reason: string | null;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}> | Readonly<{
    kind: 'commit-unknown';
    operation: string;
}>;
export type DriveReply<T> = Promise<Outcome<T, DriveFailure>>;
export type DriveTarget = Readonly<{
    tenant: TenantId;
    session: SessionId;
    execution: string;
    operation: string;
}>;
export type DriveReceipt = Readonly<{
    revision: string;
    evidence: DurableEvidence;
}>;
export type ExecutionStatus = Readonly<{
    revision: string | null;
    state: 'missing' | 'open' | 'suspended' | 'ended';
    attachment: 'active' | 'detached' | 'superseded' | null;
    lost: DurableEvidence | null;
    conclusion: Readonly<{
        outcome: 'complete' | 'fail' | 'cancelled';
        cause: DurableEvidence | null;
        disposition: DurableEvidence;
    }> | null;
    evidence: DurableEvidence;
}>;
export interface AgentDrivePort {
    invoke(input: DriveTarget & Readonly<{
        first: InputId;
        source: DurableEvidence;
        grant: DurableEvidence;
    }>): DriveReply<DriveReceipt>;
    submit(input: DriveTarget & Readonly<{
        input: InputId;
        source: DurableEvidence;
    }>): DriveReply<DriveReceipt>;
    resume(input: DriveTarget & Readonly<{
        recovery: DurableEvidence;
        grant: DurableEvidence;
    }>): DriveReply<DriveReceipt>;
    control(input: DriveTarget & Readonly<{
        control: SessionOperationId;
        intent: Control;
    }>): DriveReply<DriveReceipt>;
    detach(input: DriveTarget & Readonly<{
        advance: AdvanceRef;
    }>): DriveReply<DurableEvidence>;
    recordResult(input: DriveTarget & Readonly<{
        consumption: ConsumptionId;
        result: ProducedResult;
        transfer: Readonly<{
            kind: 'custody';
            retained: DurableEvidence;
        }> | Readonly<{
            kind: 'processed';
            completion: DurableEvidence;
        }> | Readonly<{
            kind: 'none';
        }>;
        release: Readonly<{
            kind: 'pending';
        }> | Readonly<{
            kind: 'confirmed';
            receipt: DurableEvidence;
        }>;
    }>): DriveReply<DriveReceipt>;
    query(input: DriveTarget): DriveReply<'committed' | 'excluded' | 'unknown'>;
    inspect(input: Omit<DriveTarget, 'operation'>): DriveReply<ExecutionStatus>;
    prewarm(input: Readonly<{
        tenant: TenantId;
        session: SessionId;
        adoption: Adoption;
        counters: DurableEvidence;
    }>): DriveReply<'requested'>;
}
export type ScopeReleaseReadback = Readonly<{
    dispositions: readonly ScopeReleaseDisposition[];
    source: DurableEvidence;
}>;
export interface SessionCallControl {
    control(input: Readonly<{
        tenant: TenantId;
        session: SessionId;
        control: SessionOperationId;
        producer: Extract<ProducerRef, {
            kind: 'tool';
        }>;
        intent: 'stop' | 'withdraw';
    }>): Reply<'recorded' | 'ended'>;
}
export interface SessionCallStates {
    read(input: Readonly<{
        tenant: TenantId;
        session: SessionId;
        producer: Extract<ProducerRef, {
            kind: 'tool';
        }>;
    }>): Reply<BackgroundCallState>;
}
export interface ScopeReleasePort {
    release(input: Readonly<{
        tenant: TenantId;
        session: SessionId;
        task: SessionOperationId;
        scope: string;
    }>): Promise<ScopeReleaseReadback>;
}
export type SessionBlockDeclaration = Readonly<{
    name: 'session.modes';
    kind: 'supplied';
    recovery: 'persisted';
    volatility: 'stable';
    consumers: readonly ('model' | 'coordinator')[];
    schema: Adoption;
}>;
export type MutationName = 'addTodo' | 'removeTodo' | 'markTodoComplete' | 'accept' | 'startRun' | 'claim' | 'reload' | 'recordMessage' | 'preserveResult' | 'completeConsumption' | 'completeExternalConsumption' | 'bindExternalCall' | 'commitDerived' | 'release' | 'control' | 'finishRun' | 'create' | 'completeInitialization' | 'change' | 'setResident' | 'configureAutoArchive' | 'considerAutoArchive' | 'recordIdle' | 'interrupt' | 'cancelRun' | 'stopCall' | 'retryRun' | 'freeze' | 'receive';
export type Mutations = Pick<SessionWork<never> & SessionManagement<never> & SessionReconciliation<never>, MutationName>;
export type SessionCommand = {
    readonly [K in MutationName]: Readonly<{
        kind: K;
        input: Omit<Parameters<Mutations[K]>[0], 'principal'> & (K extends 'commitDerived' ? Readonly<{
            participation?: import('./values.ts').Participation;
            judgment?: DurableEvidence;
            expected?: SessionRevision;
        }> : K extends 'stopCall' ? Readonly<{
            initiator?: import('./background-calls.ts').StopInitiator;
        }> : unknown);
    }>;
}[MutationName];
export type GuardCommand = Readonly<{
    owner: string;
    participant: string;
    protocol: Adoption;
    facts: JsonValue;
}>;
export interface SessionIdentityBridge<P> {
    prepare(input: SessionAccess<P>, command: SessionCommand): Reply<GuardCommand>;
}
export type RunAdoption = Readonly<{
    candidate: Adoption;
    residentAdoption?: ResidentAdoption & Readonly<{
        verdict?: FreezeVerdict;
    }>;
}>;
export type RunAdoptionInput = Readonly<{
    work: WorkSnapshot;
    run: RunId;
}>;
export interface SessionEvidenceBridge<P = unknown> {
    prepare(command: SessionCommand, access?: SessionAccess<P>): Reply<readonly GuardCommand[]>;
    runAdoption?(access: SessionAccess<P>, input: RunAdoptionInput): Reply<RunAdoption>;
}
export interface SessionClock {
    sample(): Reply<ClockSample>;
    waitUntil(instant: string, signal: AbortSignal): Promise<'elapsed' | 'cancelled'>;
}
export interface SessionIdleInput<P> {
    inspect(input: SessionAccess<P> & Readonly<{
        time: ClockSample;
    }>): Reply<IdleObservation>;
    prepare(input: SessionAccess<P>, command: Extract<SessionCommand, {
        kind: 'recordIdle' | 'considerAutoArchive';
    }>): Reply<readonly GuardCommand[]>;
}
export interface SessionContextInput<P> {
    prepare(input: SessionAccess<P>, command: Extract<SessionCommand, {
        kind: 'create' | 'change' | 'startRun' | 'reload';
    }>): Reply<readonly GuardCommand[]>;
}
export type AdoptionEvidenceCommand = Extract<SessionCommand, {
    kind: 'create' | 'startRun' | 'reload' | 'completeInitialization' | 'change' | 'freeze';
}>;
export type ProductionEvidenceCommand = Extract<SessionCommand, {
    kind: 'receive' | 'preserveResult' | 'completeInitialization';
}>;
export type CustodyEvidenceCommand = Extract<SessionCommand, {
    kind: 'preserveResult' | 'completeConsumption' | 'completeExternalConsumption';
}>;
export type SessionAdoptionRecorded = Readonly<{
    capability: string;
    key: string;
    shape: JsonValue;
}>;
export type SessionAdoptionPlanInput = Readonly<{
    recorded: readonly SessionAdoptionRecorded[];
    capabilities: readonly string[];
}>;
export type SessionAdoptionPlanAnswer = Readonly<{
    material: ResidentAdoption;
    verdict: FreezeVerdict | null;
}>;
export interface SessionAdoptionSource<P = unknown> {
    prepare(command: AdoptionEvidenceCommand, access?: SessionAccess<P>): Reply<readonly GuardCommand[]>;
    plan?: (access: SessionAccess<P>, input: SessionAdoptionPlanInput) => Promise<Outcome<SessionAdoptionPlanAnswer, Readonly<{
        kind: 'unavailable';
    }>>>;
    forRun?(access: SessionAccess<P>, input: RunAdoptionInput): Reply<RunAdoption>;
}
export interface SessionProductionSource {
    prepare(command: ProductionEvidenceCommand): Reply<readonly GuardCommand[]>;
}
export interface SessionCustodySource {
    prepare(command: CustodyEvidenceCommand): Reply<readonly GuardCommand[]>;
}
export interface SessionTransactionPort<P> {
    commit<K extends MutationName>(input: Readonly<{
        access: SessionAccess<P>;
        command: Extract<SessionCommand, {
            kind: K;
        }>;
        guards: readonly GuardCommand[];
    }>): ReturnType<Mutations[K]>;
    readWork(input: SessionAccess<P>): Reply<WorkSnapshot>;
    readCurrentScope(input: SessionAccess<P>): Reply<ContextScopeBinding | null>;
    readCall(input: SessionAccess<P> & Readonly<{
        producer: ProducerRef;
    }>): Reply<SessionCallBinding | null>;
    readInput(input: SessionAccess<P> & Readonly<{
        input: InputId;
    }>): Reply<Extract<RoutedInput, {
        kind: 'ordinary';
    }>>;
    queryOperation(input: SessionAccess<P> & Readonly<{
        operation: SessionOperationId;
    }>): Reply<OperationResolution>;
    readModelSelection(input: SessionAccess<P>): Reply<SessionModelSelection>;
    queryControlOperation(input: SessionAccess<P> & Readonly<{
        operation: SessionOperationId;
    }>): Reply<ControlOperationResolution>;
    commitEntries(input: Readonly<{
        observation: SessionEntriesObservation;
        start: SessionEntriesStart;
    }>): Reply<SessionEntriesReceipt>;
    commitLog?: (input: Readonly<{
        observation: SessionLogCommitObservation;
    }>) => Reply<SessionLogReceipt>;
    readonly history: SessionHistory<P>;
    pending(input: Readonly<{
        principal: P;
        tenant: TenantId;
        after: string | null;
        limit: number;
        reason?: PendingReason;
    }>): Reply<Readonly<{
        sessions: readonly SessionId[];
        next: string | null;
    }>>;
    readonly directory?: SessionDirectory<P>;
    references(input: Readonly<{
        principal: P;
        scope: 'system';
        key: ResidentKey;
        after: string | null;
        limit: number;
    }>): Reply<Readonly<{
        sessions: readonly ResidentReference[];
        next: string | null;
    }>>;
    releasedScopes(input: Readonly<{
        principal: P;
        scope: 'system';
        after: string | null;
        limit: number;
    }>): Reply<Readonly<{
        scopes: readonly ReleasedScope[];
        next: string | null;
    }>>;
}
export type SessionInternalPrincipals<P> = Readonly<{
    coordinator: P;
    maintainer: P;
}>;
export interface SessionPrincipalBindingSource {
    read(input: Readonly<{
        tenant: TenantId;
        session: SessionId;
    }>): Promise<Outcome<Readonly<{
        kind: 'bound';
        tenant: TenantId;
        session: SessionId;
        source: DurableEvidence;
    }> | Readonly<{
        kind: 'not-bound';
    }>, Extract<SessionFailure, {
        kind: 'unavailable' | 'quarantined';
    }>>>;
}
export interface SessionScopeOwnerSource {
    lookup(input: Readonly<{
        scope: string;
    }>): Promise<Outcome<Readonly<{
        kind: 'owned';
        tenant: TenantId;
        session: SessionId;
        generation: string;
    }> | Readonly<{
        kind: 'unknown';
    }>, Extract<SessionFailure, {
        kind: 'unavailable';
    }>>>;
}
export interface SessionWorkPrincipals<P> {
    forSession(input: Readonly<{
        actor: 'coordinator' | 'maintainer';
        tenant: TenantId;
        session: SessionId;
    }>): Promise<Outcome<P, Extract<SessionFailure, {
        kind: 'denied' | 'unavailable' | 'quarantined';
    }>>>;
}
export interface SessionNotifier {
    committed(input: Readonly<{
        tenant: TenantId;
        session: SessionId;
        revision: SessionRevision;
        source: DurableEvidence;
        kinds: readonly string[];
    }>): Promise<void>;
}
```

## 声明文件 `projection.d.ts`

```ts
import type { SessionCallRegistration, SessionCallWait } from './call-values.ts';
import type { SessionHistoryReads } from './history-values.ts';
import { type SessionControlEvidence } from './control-normalization.ts';
import type { DurableEvidence, RunId, SessionAccess, ConsumptionId, SessionOperationId } from './identity.ts';
import type { CallBinding, ControlProgress, InputBatch, RunEnd, RunTerminal, Waiting, WorkSnapshot, ProducedResult } from './values.ts';
import type { Decision } from './judgments.ts';
export type SessionLogConsequence = Readonly<{
    kind: 'call-registration';
    consumption: ConsumptionId;
    registration: SessionCallRegistration;
}> | Readonly<{
    kind: 'call-association';
    consumption: ConsumptionId;
    binding: CallBinding;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'registered-waiting';
    calls: readonly SessionCallWait[];
    other: readonly Exclude<Waiting, {
        kind: 'producer';
    }>[];
}> | Readonly<{
    kind: 'input-taken';
    batch: InputBatch;
}> | Readonly<{
    kind: 'call';
    consumption: ConsumptionId;
    binding: CallBinding;
}> | Readonly<{
    kind: 'producer';
    consumption: ConsumptionId;
    binding: CallBinding;
    result: ProducedResult | null;
}> | Readonly<{
    kind: 'waiting';
    waiting: readonly Waiting[];
}> | Readonly<{
    kind: 'control';
    progress: ControlProgress;
}> | Readonly<{
    kind: 'ended';
    outcome: RunTerminal['outcome'];
    cause: DurableEvidence | null;
    disposition: DurableEvidence;
    end: RunEnd | null;
}> | Readonly<{
    kind: 'observed';
}>;
export type SessionLogObservation = Omit<SessionAccess<never>, 'principal'> & Readonly<{
    run: RunId;
    execution: string;
    sequence: string | null;
    revision: string;
    executionEvidence?: DurableEvidence;
    operation?: SessionOperationId;
    source: DurableEvidence;
    consequences: readonly SessionLogConsequence[];
    control?: SessionControlEvidence;
}>;
export declare function projectSessionLog(snapshot: WorkSnapshot, observation: SessionLogObservation, reads?: SessionHistoryReads): Decision;
```

## 声明文件 `reduce-extended.d.ts`

```ts
import type { SessionEntry } from './entries.ts';
import type { WorkSnapshot } from './values.ts';
import type { DurableEvidence } from './identity.ts';
import type { SessionEntriesProgress } from './interpretation-values.ts';
type Draft = {
    -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K];
};
export declare function applyExtended(draft: Draft, entry: SessionEntry, source: DurableEvidence): string | null;
type ProgressRow = Extract<SessionEntry, {
    kind: 'entries.interpreted';
}>;
export declare function advanceEntriesProgress(saved: readonly SessionEntriesProgress[], rows: readonly ProgressRow[], evidence: DurableEvidence): readonly SessionEntriesProgress[] | string;
export {};
```

## 声明文件 `reduce-initialization.d.ts`

```ts
import type { CommittedBatch } from './judgments.ts';
import type { HistoryEntry } from './faces.ts';
import type { WorkSnapshot } from './values.ts';
import type { SessionEntry } from './entries.ts';
export declare function validateInitializationBatch(previous: WorkSnapshot | null, batch: CommittedBatch, decoded: readonly SessionEntry[]): string | null;
export declare function initializationProjection(snapshot: WorkSnapshot, entry: SessionEntry, row: HistoryEntry, batch: CommittedBatch): WorkSnapshot['initialization'];
```

## 声明文件 `reduce-results.d.ts`

```ts
import type { SessionEntry } from './entries.ts';
import type { WorkSnapshot } from './values.ts';
type Draft = {
    -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K];
};
type ResultEntry = Extract<SessionEntry, {
    kind: 'call.result-preserved' | 'call.result-processed';
}>;
export declare function applyResult(draft: Draft, entry: ResultEntry): string | null;
export declare function applyProducerFact(draft: Draft, entry: Extract<SessionEntry, {
    kind: 'call.execution-fact' | 'account.linked';
}>): string | null;
export {};
```

## 声明文件 `reduce-todos.d.ts`

```ts
import type { SessionEntry } from './entries.ts';
import type { WorkSnapshot } from './values.ts';
type Draft = {
    -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K];
};
export declare function applyTodo(draft: Draft, entry: Extract<SessionEntry, {
    kind: 'session.todo-added' | 'session.todo-completed' | 'session.todo-removed';
}>, revision: WorkSnapshot['revision']): string | null;
export {};
```

## 声明文件 `reduce.d.ts`

```ts
import type { SessionHistoryReads } from './history-values.ts';
import type { WorkSnapshot } from './values.ts';
import type { CommittedBatch, ReduceResult } from './judgments.ts';
import { type SessionCallKeys, type SettledCallLookup } from './call-settlement.ts';
export declare function batchCallKeys(previous: WorkSnapshot, batch: CommittedBatch): SessionCallKeys | null;
export declare function reduce(previous: WorkSnapshot | null, batch: CommittedBatch, reads?: SessionHistoryReads, lookup?: SettledCallLookup): ReduceResult;
```

## 声明文件 `release-digests.d.ts`

```ts
export declare const INITIALIZATION_RELEASE_DIGEST = "sha256:f551551bfe331262a7a35edb102d7bd6d63166d9ec51477946b356a2dd760764";
export declare const SESSION_RELEASE_DIGEST = "sha256:f551551bfe331262a7a35edb102d7bd6d63166d9ec51477946b356a2dd760764";
```

## 声明文件 `replay-validation.d.ts`

```ts
import type { SessionLogObservation } from './projection.ts';
import type { WorkSnapshot } from './values.ts';
export declare function validateReplayedConsequences(snapshot: WorkSnapshot, observation: SessionLogObservation): void;
```

## 声明文件 `result-state.d.ts`

```ts
import type { RunId } from './identity.ts';
import type { CallBinding, Participation, WorkSnapshot } from './values.ts';
type ParticipationState = Pick<WorkSnapshot, 'run' | 'executions'>;
type Draft = {
    -readonly [K in keyof ParticipationState]: ParticipationState[K];
};
export declare function bindingRun(snapshot: WorkSnapshot, binding: CallBinding): RunId | null;
export declare function resultParticipationError(snapshot: WorkSnapshot, binding: CallBinding, participation: Participation): string | null;
export declare function applyParticipation(draft: Draft, participation: Participation): string | null;
export {};
```

## 声明文件 `run-boundary.d.ts`

```ts
import type { HistoryEntry } from './faces.ts';
import type { RunId } from './identity.ts';
export type RunBoundaryView = Readonly<{
    kind: 'started';
    run: RunId;
}> | Readonly<{
    kind: 'terminal';
    run: RunId;
}>;
export declare function readRunBoundary(entry: Pick<HistoryEntry, 'kind' | 'payload'>): RunBoundaryView | null;
```

## 声明文件 `run-closure.d.ts`

```ts
import type { Message } from '@omne-harness/message';
import type { DurableEvidence } from './identity.ts';
import type { RunTerminal, WorkSnapshot } from './values.ts';
import type { EncodedEntry } from './judgments.ts';
import type { HistoryEntry } from './faces.ts';
type MessageBlock = Message['blocks'][number];
type CallBlock = Extract<MessageBlock, {
    kind: 'tool_call' | 'tool_call_unparsed';
}>;
export declare function writesCall(block: MessageBlock): block is CallBlock;
export declare function unansweredAfter(open: readonly string[], message: Message): readonly string[];
export declare function trackCalls(draft: {
    unansweredCalls?: readonly string[];
}, message: Message): void;
export declare function hasUnansweredCalls(snapshot: {
    unansweredCalls?: readonly string[];
}): boolean;
export declare function closingEntries(snapshot: WorkSnapshot, terminal: RunTerminal, source: DurableEvidence, origin: HistoryEntry['origin']): EncodedEntry[];
export {};
```

## 声明文件 `session-validation.d.ts`

```ts
import type { SessionFailure } from './faces.ts';
export declare class SessionValidationFailure extends Error {
    readonly failure: SessionFailure;
    constructor(failure: SessionFailure);
}
export declare function invalidAt(field: string, reason: string): never;
export declare function unavailableAt(field: string): never;
export declare function inconsistent(field: string): never;
export declare function nonempty(value: unknown, field: string): asserts value is string;
export declare function decimal(value: unknown, field: string): bigint;
export declare function evidenceFields(value: unknown, field: string): void;
export declare const equalValue: (left: unknown, right: unknown) => boolean;
export declare function unique<T>(items: readonly T[], key: (item: T) => string, field: string): void;
export declare function annotationTargets(value: unknown): void;
```

## 声明文件 `source-requests.d.ts`

```ts
import { type TenantId } from '@omne-harness/legal-identity';
import type { InputId, SessionId, SessionOperationId } from './identity.ts';
import type { InputSourceName } from './input-sources.ts';
export type SourceRequest = Readonly<{
    tenant: TenantId;
    source: InputSourceName;
    request: string;
    session?: SessionId;
}>;
export type SourceRequestIdentities = Readonly<{
    session: SessionId;
    input: InputId;
    create: SessionOperationId;
    accept: SessionOperationId;
}>;
export declare function sourceRequestIdentities(request: SourceRequest): SourceRequestIdentities;
```

## 声明文件 `standing.d.ts`

```ts
import { type ForkFacts } from './fork.ts';
import type { SessionId, SessionOperationId } from './identity.ts';
import type { Decision, EncodedEntry } from './judgments.ts';
import type { Attendance, Relation, SessionCreation, SessionTree, WorkSnapshot } from './values.ts';
export declare const MAX_SESSION_DEPTH = 2;
export type RelatedSession = Readonly<{
    session: SessionId;
    lifecycle: WorkSnapshot['lifecycle'];
    tree: SessionTree;
}>;
type Standing = Readonly<{
    relation: Relation;
    attendance: Attendance;
    tree: SessionTree;
}>;
export declare function standingOf(snapshot: Pick<WorkSnapshot, 'session' | 'relation' | 'attendance' | 'tree'>): Standing;
export declare function relatedOf(snapshot: WorkSnapshot): RelatedSession;
export declare function judgeStanding(session: SessionId, creation: Pick<SessionCreation, 'relation' | 'attendance'>, related: RelatedSession | null | undefined): Decision | Readonly<{
    tree: SessionTree | null;
}>;
type Created = Readonly<{
    session: SessionId;
    operation: SessionOperationId;
    creation: SessionCreation;
}>;
export declare function relatedSessionOf(creation: Pick<SessionCreation, 'relation'>): SessionId | null;
export type ChildRecord = Readonly<{
    parent: SessionId;
    operation: SessionOperationId;
    entry: EncodedEntry;
}>;
export declare function childRecorded(created: Created): ChildRecord | null;
export declare function relatedAsRecorded(creation: Pick<SessionCreation, 'relation'>, tree: SessionTree | undefined): Readonly<{
    related?: RelatedSession;
}>;
export declare function judgeFork(creation: Pick<SessionCreation, 'fork' | 'relation'>, facts: ForkFacts | undefined): Decision | null;
export declare function forkAsRecorded(creation: Pick<SessionCreation, 'fork'>): Readonly<{
    fork?: ForkFacts;
}>;
export {};
```

## 声明文件 `stop-reminder.d.ts`

```ts
import type { SystemReminderMessage } from '@omne-harness/message';
import type { BackgroundCallRecord, BackgroundCallStop } from './background-calls.ts';
import type { InputId, SessionOperationId } from './identity.ts';
import type { InputSourceName } from './input-sources.ts';
import type { RoutedInput } from './values.ts';
type Block = SystemReminderMessage['blocks'][number];
type Ordinary = Extract<RoutedInput, {
    kind: 'ordinary';
}>;
export declare function stoppedText(message: string, stop: BackgroundCallStop): Block;
export declare function stopInputId(record: BackgroundCallRecord, operation: SessionOperationId): InputId;
export declare function namedText(message: string, record: BackgroundCallRecord): Block;
export declare function stopReminderInput(record: BackgroundCallRecord, stop: BackgroundCallStop, source: InputSourceName): Ordinary;
export {};
```

## 声明文件 `testing-access.d.ts`

```ts
import type { SessionAccessCheck, SessionAccessDecision, SessionAccessRequest } from './access.ts';
export type SessionAccessScript = SessionAccessDecision | Readonly<{
    kind: 'throw';
    error: unknown;
}>;
export interface ScriptedSessionAccessCheck<P> extends SessionAccessCheck<P> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        asked(): readonly SessionAccessRequest<P>[];
    }>;
}
export declare function createScriptedSessionAccessCheck<P>(answers: readonly SessionAccessScript[]): ScriptedSessionAccessCheck<P>;
export declare function createPolicySessionAccessCheck<P>(policy: (request: SessionAccessRequest<P>) => SessionAccessScript): ScriptedSessionAccessCheck<P>;
export declare function withMemberSubject<P>(check: SessionAccessCheck<P>): SessionAccessCheck<P>;
```

## 声明文件 `testing-calls-left.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import { type SessionCall, type SessionCallBinding, type SessionLateCallFact, type SettledCallLookup } from './call-settlement.ts';
import type { ProducerRef, WorkSnapshot } from './values.ts';
export type CallsLeft = Readonly<{
    settled: readonly SessionCall[];
    late: readonly SessionLateCallFact[];
}>;
type Held = Readonly<{
    snapshot: WorkSnapshot;
    left: CallsLeft;
}>;
export declare const lookupOf: (store: Held | undefined) => SettledCallLookup;
export declare const leftAfter: (store: Held | undefined, reduced: CallsLeft) => CallsLeft;
export declare const lentFor: <T extends WorkSnapshot | null>(store: Held | undefined, snapshot: T, named: unknown) => T;
export declare function callIn(store: Held | undefined, consumption: string): SessionCall | null;
export declare function autoArchiveVerdict(snapshot: WorkSnapshot): "disabled" | "due" | "exempt" | "not-due" | "unavailable";
export declare const bindingFor: <F>(store: Outcome<Held, F>, producer: ProducerRef) => Outcome<SessionCallBinding | null, F>;
export declare const callAt: (stores: ReadonlyMap<string, Held>, key: Outcome<string, unknown>, consumption: string) => SessionCall | null;
export {};
```

## 声明文件 `testing-case.d.ts`

```ts
import type { Outcome } from '@omne-harness/operation-result';
import type { SessionFailure } from './faces.ts';
export type ConformanceCase<F> = Readonly<{
    name: string;
    clause: string;
    run(fixture: F): Promise<void>;
}>;
export declare class NotApplicable extends Error {
    readonly handle: string;
    constructor(handle: string);
}
export declare function isNotApplicable(error: unknown): error is NotApplicable;
export type CaseVerdict = Readonly<{
    kind: 'passed';
}> | Readonly<{
    kind: 'not-applicable';
    handle: string;
}>;
export declare function runConformanceCase<F>(conformance: ConformanceCase<F>, fixture: F): Promise<CaseVerdict>;
export declare function conformanceCase<F>(clause: string, name: string, run: (fixture: F) => Promise<void>): ConformanceCase<F>;
export declare function handle<T>(offered: T | undefined, name: string): T;
export declare function succeeded<T>(outcome: Outcome<T, SessionFailure>, what: string): T;
export declare function refused(outcome: Outcome<unknown, SessionFailure>, what: string): SessionFailure;
export declare function expectKind<T extends {
    kind: string;
}, K extends T['kind']>(value: T, kind: K, what: string): Extract<T, {
    kind: K;
}>;
export declare function shapeOf(answer: Outcome<unknown, SessionFailure>): string;
export declare function assertIndistinguishable(answers: Readonly<{
    real: Outcome<unknown, SessionFailure>;
    ghost: Outcome<unknown, SessionFailure>;
}>, what: string): void;
```

## 声明文件 `testing-delegated.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import { type SessionDelegatedTransactions } from './access.ts';
import type { DurableEvidence, SessionAccess, SessionId, SessionOperationId } from './identity.ts';
import type { SessionCreation } from './values.ts';
import type { GuardCommand, SessionCommand, SessionTransactionPort } from './ports.ts';
import { type ConformanceCase } from './testing-case.ts';
export interface SessionDelegatedTransactionsFixture<P> {
    readonly transactions: SessionTransactionPort<P>;
    readonly delegated: SessionDelegatedTransactions<P>;
    readonly access: SessionAccess<P>;
    readonly otherAccess: SessionAccess<P>;
    readonly creation: SessionCreation;
    operation(name: string): SessionOperationId;
    initializationGuards?(command: Extract<SessionCommand, {
        kind: 'create';
    }>): Promise<readonly GuardCommand[]>;
    checks(): number;
    decisionOf?(tenant: TenantId, session: SessionId, operation: SessionOperationId): DurableEvidence | null;
}
export declare function sessionDelegatedTransactionsConformance<P>(): readonly ConformanceCase<SessionDelegatedTransactionsFixture<P>>[];
export declare function memorySessionDelegatedTransactionsFixture(): SessionDelegatedTransactionsFixture<string>;
```

## 声明文件 `testing-entries.d.ts`

```ts
import { type ConformanceCase } from './testing-case.ts';
import { type SessionTransactionsFixture } from './testing-transactions.ts';
export declare function sessionEntriesConformance<P>(): readonly ConformanceCase<SessionTransactionsFixture<P>>[];
```

## 声明文件 `testing-fork.d.ts`

```ts
import { type ForkFacts, type SessionFork } from './fork.ts';
import { type Outcome } from '@omne-harness/operation-result';
import type { TenantId } from '@omne-harness/legal-identity';
import type { ForkPointRead, HistoryEntry, HistoryPage, SessionFailure } from './faces.ts';
import type { EntryId, SessionId, SessionRevision } from './identity.ts';
import type { EncodedEntry } from './judgments.ts';
import { type MaterializedModelView } from './model-view.ts';
import type { SessionCommand } from './ports.ts';
import { type Cursor } from './testing-history-cursor.ts';
import type { WorkSnapshot } from './values.ts';
export type MemoryFork = Readonly<{
    fork: SessionFork;
    inherited: readonly HistoryEntry[];
    prefix: readonly string[];
    owners: ReadonlyMap<string, SessionId>;
}>;
type Held = Readonly<{
    snapshot: WorkSnapshot;
    modelView: MaterializedModelView;
    entries: readonly HistoryEntry[];
    fork?: MemoryFork;
}>;
export declare function chainOf(store: Pick<Held, 'entries' | 'fork'>): readonly HistoryEntry[];
export declare function entryIdAt(store: Pick<Held, 'entries' | 'fork'>, index: number): EntryId;
export type ForkStart = Readonly<{
    facts: ForkFacts;
    modelView: MaterializedModelView;
    fork: MemoryFork;
}>;
type KeyOf = (tenant: TenantId, session: SessionId) => Outcome<string, SessionFailure>;
export declare function startOf(stores: ReadonlyMap<string, Held>, keyOf: KeyOf, command: SessionCommand, readable: boolean): ForkStart | undefined;
export declare const reads: (start: ForkStart | undefined) => Readonly<{
    fork?: ForkFacts;
}>;
export declare const kept: (store: Pick<Held, 'fork'> | undefined, start?: ForkStart) => Readonly<{
    fork?: MemoryFork;
}>;
export declare function numbered(store: Pick<Held, 'entries' | 'fork'> | undefined, start: ForkStart | undefined, revision: SessionRevision, entries: readonly EncodedEntry[]): HistoryEntry[];
export declare const compactionOf: (store: Held, through: string) => Readonly<{
    origin: import("@omne-harness/message").RecordEntryRef;
    base: import("@omne-harness/message").CompactionBase;
    covered: readonly import("@omne-harness/message").CoveredEntry[];
    after: readonly import("@omne-harness/message").CoveredEntry[];
    open: readonly import("@omne-harness/message").RecordEntryRef[];
}> | null;
export declare const chained: <S extends Held>(store: S) => S & {
    entries: readonly Readonly<{
        id: EntryId;
        revision: SessionRevision;
        kind: string;
        schema: import("@omne-harness/exchange-refs").Adoption;
        payload: import("@omne-harness/json-text").JsonValue;
        origin: Readonly<{
            owner: string;
            via: string | null;
            source: import("@omne-harness/exchange-refs").DurableEvidence;
        }>;
    }>[];
    inherited: number;
};
export declare function pointRead(store: Outcome<Held, SessionFailure>, key: Outcome<string, SessionFailure>, asking: string): Outcome<ForkPointRead, SessionFailure>;
type HistoryAsk = Readonly<{
    inherited?: true;
    from: unknown;
    direction: string;
}>;
export declare function inheritedRefusal(input: HistoryAsk): SessionFailure | null;
export declare function prefixPage(store: Held, cursor: Cursor, issued: Set<string>): HistoryPage | null;
export {};
```

## 声明文件 `testing-history-cursor.d.ts`

```ts
import type { SessionId } from './identity.ts';
export type Cursor = Readonly<{
    tenant: string;
    session: SessionId;
    kinds: readonly string[];
    direction: 'forward' | 'backward';
    upper: number;
    scanned: number;
    pageBytes: number;
    inherited?: number;
}>;
export declare function encodeCursor(cursor: Cursor): string;
export declare function decodeCursor(text: string): Cursor | null;
```

## 声明文件 `testing-history-source.d.ts`

```ts
import type { HistoryEntry } from './faces.ts';
import type { SessionHistoryIndex, SessionHistoryReads, SessionInputAdmission, SessionInputScope } from './history-values.ts';
import type { DurableEvidence, InputId, SessionAccess } from './identity.ts';
import type { SessionLogObservation } from './projection.ts';
import type { WorkSnapshot } from './values.ts';
export declare function entryEvidence(row: HistoryEntry): DurableEvidence;
export interface MemorySessionHistorySource {
    observe(observation: SessionLogObservation): void;
    admit(scope: Pick<SessionAccess<never>, 'tenant' | 'session'>, input: InputId, admission: SessionInputAdmission): void;
    read(snapshot: WorkSnapshot, entries: readonly HistoryEntry[], scope: SessionInputScope): Readonly<{
        index: SessionHistoryIndex;
        reads: SessionHistoryReads;
    }>;
}
export declare function createMemorySessionHistorySource(): MemorySessionHistorySource;
```

## 声明文件 `testing-initialization-source.d.ts`

```ts
import type { SessionFailure, Reply } from './faces.ts';
import type { GuardCommand, SessionCommand } from './ports.ts';
export type InitializationCommand = Extract<SessionCommand, {
    kind: 'create' | 'completeInitialization';
}>;
export interface MemoryInitializationSource {
    readonly durability: 'none';
    prepare(command: InitializationCommand): Reply<readonly GuardCommand[]>;
    verify(command: InitializationCommand, guards: readonly GuardCommand[]): SessionFailure | null;
    readonly controls: Readonly<{
        register(command: InitializationCommand, guard: GuardCommand): void;
        eligible(value: boolean): void;
        available(value: boolean): void;
    }>;
}
export declare function createMemoryInitializationSource(): MemoryInitializationSource;
```

## 声明文件 `testing-initialization.d.ts`

```ts
import type { WorkSnapshot } from './values.ts';
import type { GuardCommand } from './ports.ts';
import type { InitializationCommand } from './testing-initialization-source.ts';
import { type InitialAdoption, type InitializationGuardFacts, type InitializationGuardResult } from './initialization-schema.ts';
export declare function adoptedInitializationFixture(command: Extract<InitializationCommand, {
    kind: 'create';
}>): InitialAdoption;
export declare function initializationFixtureFacts(command: InitializationCommand, snapshot: WorkSnapshot | null, initialAdoption: InitialAdoption | null, results?: readonly InitializationGuardResult[]): InitializationGuardFacts;
export declare function initializationFixtureGuard(facts: InitializationGuardFacts): GuardCommand;
```

## 声明文件 `testing-inputs.d.ts`

```ts
import type { InputId } from './identity.ts';
import type { SessionCommand } from './ports.ts';
import type { RoutedInput } from './values.ts';
type Ordinary = Extract<RoutedInput, {
    kind: 'ordinary';
}>;
export declare function admittedInputs(command: SessionCommand, decided?: readonly Ordinary[]): readonly Ordinary[];
export declare function withInputs(kept: ReadonlyMap<InputId, Ordinary> | undefined, added: readonly Ordinary[]): Map<InputId, Ordinary>;
export {};
```

## 声明文件 `testing-log.d.ts`

```ts
import type { SessionTransactionPort } from './ports.ts';
import type { SessionLogObservation } from './projection.ts';
import { type ConformanceCase } from './testing-case.ts';
import { type SessionTransactionsFixture } from './testing-transactions.ts';
export interface SessionLogFixture<P> extends SessionTransactionsFixture<P> {
    readonly port: SessionTransactionPort<P> & Readonly<{
        commitLog: NonNullable<SessionTransactionPort<P>['commitLog']>;
    }>;
    observe(observation: SessionLogObservation): Promise<void>;
    delegatedView?(): SessionTransactionPort<P>;
}
export declare function sessionLogConformance<P>(): readonly ConformanceCase<SessionLogFixture<P>>[];
export declare function memorySessionLogFixture(): SessionLogFixture<string>;
```

## 声明文件 `testing-model-view-reads.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import { type MaterializedModelView } from './model-view.ts';
import type { HistoryEntry, SessionFailure, SessionHistory } from './faces.ts';
import type { WorkSnapshot } from './values.ts';
type ModelViewInput<P> = Parameters<SessionHistory<P>['readModelView']>[0];
type CompactionContextInput<P> = Parameters<SessionHistory<P>['readCompactionContext']>[0];
type Answer<P, K extends 'readModelView' | 'readCompactionContext'> = Awaited<ReturnType<SessionHistory<P>[K]>>;
export declare function memoryModelViewPage<P>(view: MaterializedModelView, key: Outcome<string, SessionFailure>, input: ModelViewInput<P>): Answer<P, 'readModelView'>;
export declare function memoryCompactionContext<P>(store: Readonly<{
    entries: readonly HistoryEntry[];
    snapshot: WorkSnapshot;
    modelView: MaterializedModelView;
    inherited?: number;
}>, key: Outcome<string, SessionFailure>, input: CompactionContextInput<P>): Answer<P, 'readCompactionContext'>;
export {};
```

## 声明文件 `testing-ports.d.ts`

```ts
import type { SessionClock, SessionContextInput, SessionEvidenceBridge, SessionIdentityBridge, SessionCommand } from './ports.ts';
import type { MemoryInitializationSource } from './testing-initialization-source.ts';
export type IdentityScript = 'allow' | 'deny' | 'unavailable';
export interface ScriptedSessionIdentityBridge<P> extends SessionIdentityBridge<P> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        script(next: IdentityScript): void;
        asked(): readonly SessionCommand[];
    }>;
}
export declare function createScriptedSessionIdentityBridge<P>(initial?: IdentityScript): ScriptedSessionIdentityBridge<P>;
export interface MemorySessionEvidenceBridge extends SessionEvidenceBridge {
    readonly durability: 'none';
    readonly controls: Readonly<{
        unavailable(down: boolean): void;
    }>;
}
export declare function createMemorySessionEvidenceBridge(options?: Readonly<{
    initialization?: MemoryInitializationSource;
}>): MemorySessionEvidenceBridge;
export interface MemorySessionContextInput<P> extends SessionContextInput<P> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        unavailable(down: boolean): void;
    }>;
}
export declare function createMemorySessionContextInput<P>(): MemorySessionContextInput<P>;
export interface MemorySessionClock extends SessionClock {
    readonly durability: 'none';
    readonly controls: Readonly<{
        advance(milliseconds: number): void;
        instantAfter(milliseconds: number): string;
        unavailable(down: boolean): void;
    }>;
}
export declare function createMemorySessionClock(): MemorySessionClock;
```

## 声明文件 `testing-provider-conformance.d.ts`

```ts
import { type ConformanceCase } from './testing-case.ts';
import type { MemoryAgentDrive, MemoryScopeRelease, MemorySessionIdleInput, MemorySessionNotifier } from './testing-providers.ts';
import type { MemorySessionClock, MemorySessionContextInput, MemorySessionEvidenceBridge, ScriptedSessionIdentityBridge } from './testing-ports.ts';
export declare function sessionIdentityBridgeConformance(): readonly ConformanceCase<ScriptedSessionIdentityBridge<string>>[];
export declare function sessionEvidenceBridgeConformance(): readonly ConformanceCase<MemorySessionEvidenceBridge>[];
export declare function sessionContextInputConformance(): readonly ConformanceCase<MemorySessionContextInput<string>>[];
export declare function sessionClockConformance(): readonly ConformanceCase<MemorySessionClock>[];
export declare function sessionIdleInputConformance(): readonly ConformanceCase<MemorySessionIdleInput<string>>[];
export declare function sessionNotifierConformance(): readonly ConformanceCase<MemorySessionNotifier>[];
export declare function scopeReleaseConformance(): readonly ConformanceCase<MemoryScopeRelease>[];
export declare function agentDriveConformance(): readonly ConformanceCase<MemoryAgentDrive>[];
```

## 声明文件 `testing-providers.d.ts`

```ts
import type { IdleObservation, ScopeReleaseDisposition } from './values.ts';
import type { AgentDrivePort, DriveTarget, ExecutionStatus, ScopeReleasePort, SessionIdleInput, SessionNotifier } from './ports.ts';
export interface MemorySessionIdleInput<P> extends SessionIdleInput<P> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        observation(value: IdleObservation): void;
        unavailable(value: boolean): void;
    }>;
}
export declare function createMemorySessionIdleInput<P>(initial: IdleObservation): MemorySessionIdleInput<P>;
export interface MemorySessionNotifier extends SessionNotifier {
    readonly durability: 'none';
    readonly controls: Readonly<{
        drop(value: boolean): void;
        notifications(): readonly Parameters<SessionNotifier['committed']>[0][];
    }>;
}
export declare function createMemorySessionNotifier(): MemorySessionNotifier;
export interface MemoryScopeRelease extends ScopeReleasePort {
    readonly durability: 'none';
    readonly controls: Readonly<{
        dispositions(values: readonly ScopeReleaseDisposition[]): void;
        requests(): readonly Parameters<ScopeReleasePort['release']>[0][];
    }>;
}
export declare function createMemoryScopeRelease(): MemoryScopeRelease;
export interface MemoryAgentDrive extends AgentDrivePort {
    readonly durability: 'none';
    readonly controls: Readonly<{
        denied(value: boolean): void;
        unavailable(value: boolean): void;
        status(input: Omit<DriveTarget, 'operation'>, value: ExecutionStatus): void;
    }>;
}
export declare function createMemoryAgentDrive(): MemoryAgentDrive;
```

## 声明文件 `testing-sources.d.ts`

```ts
import { type InputSources, type IntakeSubject, type IntakeTerms, type InputSourceDeclaration, type InputSourceName, type InputSourceRegistry, type SessionDerivedInputs, type SessionIntakeBudget } from './input-sources.ts';
import type { SessionAccessCheck } from './access.ts';
import type { GuardCommand, SessionCommand } from './ports.ts';
export declare const TESTING_SYSTEM_COMPONENT = "session-testing";
export declare const TESTING_SOURCES: Readonly<{
    person: InputSourceName;
    system: InputSourceName;
    quiet: InputSourceName;
    outcome: InputSourceName;
    stop: InputSourceName;
}>;
export declare const TESTING_DECLARATIONS: readonly InputSourceDeclaration[];
export declare function testingInputSources(): InputSourceRegistry;
export declare function testingDerivedInputs(sources?: Pick<InputSourceRegistry, 'lookup'>): SessionDerivedInputs;
export declare function testingIntakeGuards(command: SessionCommand, given?: IntakeSubject | null): readonly GuardCommand[];
export type TestingWriterOptions = Readonly<{
    sources?: InputSources | null;
    derived?: SessionDerivedInputs | null;
    budget?: SessionIntakeBudget;
    subjects?: 'strict' | 'member-by-default';
}>;
export declare function testingWriter<P>(options: TestingWriterOptions): {
    check: (check: SessionAccessCheck<P>) => SessionAccessCheck<P>;
    guards: (command: SessionCommand, guards: readonly GuardCommand[], subject: IntakeSubject | undefined) => Promise<readonly GuardCommand[]>;
    entries: () => IntakeTerms['derived'];
};
```

## 声明文件 `testing-store-reads.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import { type Outcome } from '@omne-harness/operation-result';
import type { SessionModelSelection } from './control-values.ts';
import type { HistoryEntry, SessionFailure } from './faces.ts';
import type { SessionId } from './identity.ts';
import type { DecideReads, OperationRecord } from './judgments.ts';
import { type MaterializedModelView } from './model-view.ts';
import type { SessionCommand } from './ports.ts';
import * as gone from './testing-calls-left.ts';
import { type MemoryFork } from './testing-fork.ts';
import type { WorkSnapshot } from './values.ts';
type Held = Readonly<{
    snapshot: WorkSnapshot;
    left: gone.CallsLeft;
    modelView: MaterializedModelView;
    entries: HistoryEntry[];
    fork?: MemoryFork;
}>;
type KeyOf = (tenant: TenantId, session: SessionId) => Outcome<string, SessionFailure>;
export declare function relatedReads<S extends Held>(stores: ReadonlyMap<string, S>, keyOf: KeyOf, command: SessionCommand): Pick<DecideReads, 'related'>;
export declare function recordChild<S extends Held>(stores: Map<string, S>, keyOf: KeyOf, command: SessionCommand): void;
type Operated<O> = Readonly<{
    operations: ReadonlyMap<unknown, O>;
    entries: readonly HistoryEntry[];
}>;
export declare function frozenOperation<O extends Readonly<{
    record: OperationRecord;
}>>(store: Operated<O> | undefined): O | undefined;
export declare function readStoredModelSelection(store: Operated<{
    record: OperationRecord;
}> & Pick<Held, 'snapshot'>): Outcome<SessionModelSelection, SessionFailure>;
export {};
```

## 声明文件 `testing-transactions.d.ts`

```ts
import { type SessionIntakeLimits } from './intake.ts';
import { type MemorySessionHistorySource } from './testing-history-source.ts';
import { type Outcome } from '@omne-harness/operation-result';
import { type TenantId } from '@omne-harness/legal-identity';
import { type SessionAccessCheck, type SessionDelegatedTransactions } from './access.ts';
import type { DurableEvidence, EntryId, InputId, SessionAccess, SessionId, SessionOperationId, SessionRevision } from './identity.ts';
import type { SessionCallTerminal } from './control-values.ts';
import type { BoundedClose, RoutedInput, RunTerminal, SessionCreation, WorkSnapshot, Participation } from './values.ts';
import type { CommitReceipt, AdmittedMessage, EntryClass, HistoryEntry, PendingReason, SessionFailure } from './faces.ts';
import type { GuardCommand, MutationName, Mutations, SessionCommand, SessionTransactionPort } from './ports.ts';
import { type SessionLogObservation } from './projection.ts';
import type { SessionCall } from './call-settlement.ts';
import { type TestingWriterOptions } from './testing-sources.ts';
import { type MemoryInitializationSource } from './testing-initialization-source.ts';
import { type ConformanceCase } from './testing-case.ts';
export interface MemorySessionTransactions<P> extends SessionTransactionPort<P> {
    readonly durability: 'none';
    readonly commitLog: NonNullable<SessionTransactionPort<P>['commitLog']>;
    readonly controls: Readonly<{
        entriesOf(tenant: TenantId, session: SessionId): readonly HistoryEntry[];
        callOf(tenant: TenantId, session: SessionId, consumption: string): SessionCall | null;
        decisionOf(tenant: TenantId, session: SessionId, operation: SessionOperationId): DurableEvidence | null;
    }>;
}
export interface MemorySessionLogTransactions<P> extends MemorySessionTransactions<P> {
    readonly controls: MemorySessionTransactions<P>['controls'] & Readonly<{
        project(observation: SessionLogObservation, operation: SessionOperationId): Promise<Outcome<CommitReceipt, SessionFailure>>;
        directoryAvailable(available: boolean): void;
        forkSourceAvailable(available: boolean): void;
        recordCallTerminal(tenant: TenantId, session: SessionId, terminal: SessionCallTerminal): void;
    }>;
}
export interface MemoryInitializationTransactions<P> extends MemorySessionLogTransactions<P> {
    readonly controls: MemorySessionLogTransactions<P>['controls'] & Readonly<{
        failNextInitializationCommit(): void;
        loseNextInitializationReply(): void;
    }>;
}
export declare function pendingReasonsOf(snapshot: WorkSnapshot): readonly PendingReason[];
export type MemorySessionTransactionOptions<P> = TestingWriterOptions & Readonly<{
    intakeLimits?: SessionIntakeLimits;
    initialization?: MemoryInitializationSource;
    history?: MemorySessionHistorySource;
    accessCheck: SessionAccessCheck<P>;
}>;
export type MemorySessionTransactionPair<P> = Readonly<{
    transactions: MemoryInitializationTransactions<P>;
    delegated: SessionDelegatedTransactions<P>;
}>;
export declare function createMemorySessionTransactionPair<P>(options: MemorySessionTransactionOptions<P>): MemorySessionTransactionPair<P>;
export declare function createMemorySessionTransactions<P>(options: MemorySessionTransactionOptions<P>): MemoryInitializationTransactions<P>;
export interface SessionTransactionsFixture<P> {
    readonly port: SessionTransactionPort<P>;
    readonly access: SessionAccess<P>;
    readonly otherAccess?: SessionAccess<P>;
    readonly creation: SessionCreation;
    operation(name: string): SessionOperationId;
    prepareInputAdmission?(input: Readonly<{
        execution: string;
        input: InputId;
        operation: SessionOperationId;
        receipt: DurableEvidence;
    }>): Promise<void>;
    publishMessageParticipation?(input: Readonly<{
        execution: string;
        operation: string;
        value: AdmittedMessage;
    }>): Promise<Participation>;
    initializationGuards?(command: Extract<SessionCommand, {
        kind: 'create';
    }>): Promise<readonly GuardCommand[]>;
    readonly askedAccessChecks?: () => number;
}
type Commit<K extends MutationName> = Awaited<ReturnType<Mutations[K]>>;
export declare function scene<P>(fixture: SessionTransactionsFixture<P>): {
    port: SessionTransactionPort<P>;
    access: SessionAccess<P>;
    base: {
        tenant: TenantId;
        session: SessionId;
    };
    commit: <K extends MutationName>(command: Extract<SessionCommand, {
        kind: K;
    }>, guards?: readonly GuardCommand[], as?: SessionAccess<P>) => Promise<Commit<K>>;
    create: (name?: string, creation?: Readonly<{
        definition: Readonly<{
            name: string;
            candidate: import("@omne-harness/exchange-refs").Adoption;
        }>;
        execution: import("@omne-harness/exchange-refs").Adoption;
        requiredIdentities: readonly Readonly<{
            capability: string;
            name: string;
        }>[];
        purpose: string;
        workspace: import("@omne-harness/legal-identity").WorkspaceId | null;
        workspaceAttachment: import("./values.ts").WorkspaceAttachment | null;
        modes: Readonly<{
            kind: 'explicit';
            value: import("./values.ts").Modes;
        }> | Readonly<{
            kind: 'tenant-default';
            source: import("@omne-harness/exchange-refs").Adoption;
        }>;
        initial: Extract<RoutedInput, {
            kind: 'ordinary';
        }> | null;
        entryContract: import("@omne-harness/exchange-refs").Adoption;
        initialModelSelection?: import("./control-values.ts").SavedModelSelection;
        residentAdoption?: import("./values.ts").ResidentAdoption;
        initialization?: import("./values.ts").InitializationSources;
        relation?: import("./values.ts").Relation;
        attendance?: import("./values.ts").Attendance;
        fork?: import('./fork.ts').SessionFork;
    }>) => Promise<Outcome<Readonly<{
        receipt: CommitReceipt;
        state: WorkSnapshot;
    }>, SessionFailure>>;
    accept: (input: string, name?: string, value?: Extract<RoutedInput, {
        kind: 'ordinary';
    }>) => Promise<Outcome<Readonly<{
        operation: SessionOperationId;
        revision: SessionRevision;
        first: EntryId;
        last: EntryId;
        recovered: boolean;
        source: DurableEvidence;
    }>, SessionFailure>>;
    startRun: (name?: string, entry?: EntryClass) => Promise<Outcome<Readonly<{
        receipt: CommitReceipt;
        advance: import("./identity.ts").AdvanceRef;
        adopted: import("@omne-harness/exchange-refs").Adoption;
        first: InputId;
        execution: string;
    }>, SessionFailure>>;
    handover: (execution: string, input: string, name?: string) => Promise<Outcome<Readonly<{
        operation: SessionOperationId;
        revision: SessionRevision;
        first: EntryId;
        last: EntryId;
        recovered: boolean;
        source: DurableEvidence;
    }>, SessionFailure>>;
    message: (execution: string, text: string, name?: string) => Promise<Outcome<Readonly<{
        operation: SessionOperationId;
        revision: SessionRevision;
        first: EntryId;
        last: EntryId;
        recovered: boolean;
        source: DurableEvidence;
    }>, SessionFailure>>;
    publishMessage: (execution: string, text: string) => Promise<Participation | null>;
    finish: (name?: string, bounded?: BoundedClose) => Promise<Outcome<Readonly<{
        receipt: CommitReceipt;
        terminal: RunTerminal;
    }>, SessionFailure>>;
    readWork: () => Promise<Readonly<{
        workEntryIndex?: import("./work-entry-values.ts").SessionWorkEntryIndex;
        session: SessionId;
        tenant: TenantId;
        revision: SessionRevision;
        interpreter: import("@omne-harness/exchange-refs").Adoption;
        source: DurableEvidence;
        lifecycle: 'initializing' | 'dormant' | 'active' | 'frozen' | 'archived';
        frozen: import("./values.ts").SessionFrozen | null;
        residents: readonly import("./values.ts").ResidentTool[];
        definition: Readonly<{
            name: string;
            adopted: import("@omne-harness/exchange-refs").Adoption;
        }>;
        execution: import("@omne-harness/exchange-refs").Adoption;
        declarations: DurableEvidence;
        permissions: import("./permission-values.ts").SessionPermissions;
        authorizations: import("./authorizations.ts").AuthorizationContext;
        revisions: Readonly<{
            workspace: string;
            declarations: string;
        }>;
        run: import("./values.ts").RunState;
        pending: readonly InputId[];
        handed: readonly InputId[];
        waiting: readonly import("./values.ts").Waiting[];
        consumptions: readonly import("./values.ts").Consumption[];
        controls: readonly import("./values.ts").ControlProgress[];
        unresolved: readonly SessionOperationId[];
        creation: SessionCreation;
        tasks: readonly import("./values.ts").RecoveryTask[];
        idle: Readonly<{
            observation: import("./values.ts").IdleObservation;
            commit: DurableEvidence;
        }> | null;
        todos?: readonly import("./todos.ts").TodoItem[];
        executions?: readonly import("./values.ts").RunExecution[];
        residentKeys?: import("./values.ts").ResidentAdoption['keys'];
        relation?: import("./values.ts").Relation;
        tree?: import("./values.ts").SessionTree;
        attendance?: import("./values.ts").Attendance;
        resident?: boolean;
        children?: readonly SessionId[];
        autoArchive?: import("./values.ts").AutoArchivePolicy;
        taken?: readonly InputId[];
        unanswered?: readonly InputId[];
        awaitingPerson?: true;
        backgroundPlaceholders?: readonly import("./identity.ts").ConsumptionId[];
        backgroundCalls?: readonly import("./background-calls.ts").BackgroundCallRecord[];
        backgroundOrdinal?: number;
        uncountedInputs?: readonly InputId[];
        quietInputs?: readonly InputId[];
        deliveredTail?: readonly InputId[];
        releasedScopes?: readonly Readonly<{
            task: SessionOperationId;
            scope: string;
        }>[];
        contextScopes?: readonly import("./values.ts").ContextScopeBinding[];
        contextRecords?: readonly Readonly<{
            scope: string;
            declaration: import("./values.ts").DeclarationChange;
        }>[];
        changes?: readonly import("./values.ts").DeclarationChange[];
        initialization?: import("./values.ts").InitializationState;
        historyIndex?: import("./history-values.ts").SessionHistoryIndex;
        callRegistrations?: readonly import("./call-values.ts").SessionCallRecord[];
        callWaits?: readonly import("./call-values.ts").SessionCallWait[];
        unansweredCalls?: readonly string[];
        entriesProgress?: readonly import("./interpretation-values.ts").SessionEntriesProgress[];
    }>>;
    openRun: () => Promise<string>;
};
export declare function sessionTransactionsConformance<P>(): readonly ConformanceCase<SessionTransactionsFixture<P>>[];
export declare function memorySessionTransactionsFixture(): SessionTransactionsFixture<string>;
export declare function memoryFixtureParts(): Readonly<{
    fixture: SessionTransactionsFixture<string> & Readonly<{
        port: MemoryInitializationTransactions<string>;
    }>;
    history: MemorySessionHistorySource;
    delegated: SessionDelegatedTransactions<string>;
}>;
export declare function memoryInitializationGuards(initialization: MemoryInitializationSource): (command: Extract<SessionCommand, {
    kind: 'create';
}>) => Promise<readonly GuardCommand[]>;
export {};
```

## 声明文件 `testing-values.d.ts`

```ts
import { type TenantId, type WorkspaceId } from '@omne-harness/legal-identity';
import type { Message } from '@omne-harness/message';
import type { Adoption, DurableEvidence, InputId, SessionAccess, SessionId, SessionOperationId } from './identity.ts';
import type { RoutedInput, SessionCreation } from './values.ts';
import type { GuardCommand } from './ports.ts';
export declare const TESTING_OWNER = "@omne-harness/session-contract/testing";
export declare function adoption(name: string): Adoption;
export declare function evidence(record: string): DurableEvidence;
export declare function mintEvidence(record: string, content: unknown): DurableEvidence;
export declare function testingTenant(organization: string, account: string): TenantId;
export declare function testingWorkspace(text: string): WorkspaceId;
export declare const sessionId: (text: string) => SessionId;
export declare const inputId: (text: string) => InputId;
export declare const operationId: (text: string) => SessionOperationId;
export declare function memoryAccess<P>(principal: P, session?: string): SessionAccess<P>;
export declare function memoryOtherAccess<P>(principal: P, session?: string): SessionAccess<P>;
export declare function userMessage(text: string, id?: string): Message;
export declare function assistantMessage(text: string, id?: string): Message;
export declare function ordinaryInput(input: string, text?: string): Extract<RoutedInput, {
    kind: 'ordinary';
}>;
export declare function creation(overrides?: Partial<SessionCreation>): SessionCreation;
export declare function guard(participant: string, owner: string, facts: unknown): GuardCommand;
```

## 声明文件 `testing.d.ts`

```ts
export { NotApplicable, assertIndistinguishable, conformanceCase, expectKind, handle, isNotApplicable, refused, runConformanceCase, shapeOf, succeeded, type CaseVerdict, type ConformanceCase, } from './testing-case.ts';
export { createMemorySessionTransactionPair, createMemorySessionTransactions, memorySessionTransactionsFixture, pendingReasonsOf, sessionTransactionsConformance, type MemorySessionTransactionPair, type MemorySessionTransactions, type MemorySessionLogTransactions, type MemoryInitializationTransactions, type SessionTransactionsFixture, } from './testing-transactions.ts';
export { sessionEntriesConformance } from './testing-entries.ts';
export { memorySessionLogFixture, sessionLogConformance, type SessionLogFixture, } from './testing-log.ts';
export { memorySessionDelegatedTransactionsFixture, sessionDelegatedTransactionsConformance, type SessionDelegatedTransactionsFixture, } from './testing-delegated.ts';
export { createMemorySessionClock, createMemorySessionContextInput, createMemorySessionEvidenceBridge, createScriptedSessionIdentityBridge, type IdentityScript, type MemorySessionClock, type MemorySessionContextInput, type MemorySessionEvidenceBridge, type ScriptedSessionIdentityBridge, } from './testing-ports.ts';
export { TESTING_OWNER, adoption, assistantMessage, creation, evidence, guard, inputId, memoryAccess, memoryOtherAccess, mintEvidence, operationId, ordinaryInput, sessionId, testingTenant, testingWorkspace, userMessage, } from './testing-values.ts';
export * from './testing-providers.ts';
export { createMemoryInitializationSource, type MemoryInitializationSource, } from './testing-initialization-source.ts';
export { adoptedInitializationFixture, initializationFixtureFacts, initializationFixtureGuard, } from './testing-initialization.ts';
export type { MemorySessionTransactionOptions } from './testing-transactions.ts';
export { sessionIdentityBridgeConformance, sessionEvidenceBridgeConformance, sessionContextInputConformance, sessionClockConformance, sessionIdleInputConformance, sessionNotifierConformance, scopeReleaseConformance, agentDriveConformance, } from './testing-provider-conformance.ts';
export { createMemorySessionHistorySource, type MemorySessionHistorySource, } from './testing-history-source.ts';
export { createPolicySessionAccessCheck, createScriptedSessionAccessCheck, type ScriptedSessionAccessCheck, type SessionAccessScript, } from './testing-access.ts';
export { TESTING_DECLARATIONS, TESTING_SOURCES, TESTING_SYSTEM_COMPONENT, testingDerivedInputs, testingInputSources, testingIntakeGuards, } from './testing-sources.ts';
export { withMemberSubject } from './testing-access.ts';
```

## 声明文件 `todos.d.ts`

```ts
import type { CommitReceipt, SessionWork } from './faces.ts';
import type { SessionId, SessionRevision, TodoItemId } from './identity.ts';
export type TodoItem = Readonly<{
    id: TodoItemId;
    text: string;
    status: 'pending' | 'completed' | 'removed';
    createdAt: SessionRevision;
    changedAt: SessionRevision;
}>;
export type VisibleTodoItem = TodoItem & Readonly<{
    status: 'pending' | 'completed';
}>;
export type TodoMutationReceipt = Readonly<{
    receipt: CommitReceipt;
    item: TodoItem;
}>;
export type TodoPageCursor = Readonly<{
    tenant: string;
    session: SessionId;
    revision: SessionRevision;
    after: TodoItemId;
}>;
export type TodoPage = Readonly<{
    revision: SessionRevision;
    items: readonly VisibleTodoItem[];
    next: TodoPageCursor | null;
}>;
export type SessionTodos<P> = Pick<SessionWork<P>, 'addTodo' | 'removeTodo' | 'markTodoComplete' | 'listTodos'>;
export declare function validTodoText(text: unknown): text is string;
```

## 声明文件 `uninterpreted-calls.d.ts`

```ts
import type { SessionLogConsequence } from './projection.ts';
import type { SessionUninterpretedCall } from './history-values.ts';
export declare function uninterpretedCalls(execution: string, facts: Iterable<Readonly<{
    sequence: string;
    consequences: readonly SessionLogConsequence[];
}>>): SessionUninterpretedCall[];
```

## 声明文件 `utterance-resolver.d.ts`

```ts
import type { Message } from '@omne-harness/message';
import type { InputId, SessionAccess, SessionOperationId } from './identity.ts';
import type { InputSourceName } from './input-sources.ts';
export type SenderView = Readonly<{
    command: string | null;
    references: readonly string[];
}>;
export type Utterance<P> = Readonly<{
    original: Message;
    seen: SenderView | null;
    source: InputSourceName;
    request: Readonly<{
        input: InputId;
        operation: SessionOperationId;
    }>;
    access: SessionAccess<P>;
}>;
export type Resolution = Readonly<{
    kind: 'input';
    effective: Message;
}> | Readonly<{
    kind: 'operation';
    name: string;
    operation: string;
    args: string;
}> | Readonly<{
    kind: 'refused';
    reason: string;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export type UtteranceResolver<P> = Readonly<{
    name: string;
    resolve(utterance: Utterance<P>): Promise<Resolution>;
}>;
export type UtteranceResolverRegistry<P> = Readonly<{
    register(resolver: UtteranceResolver<P>): () => void;
    current(): UtteranceResolver<P> | null;
}>;
export declare function createUtteranceResolverRegistry<P>(): UtteranceResolverRegistry<P>;
```

## 声明文件 `values.d.ts`

```ts
import type { SavedModelSelection } from './control-values.ts';
import type { SessionPermissions } from './permission-values.ts';
import type { AuthorizationContext, AuthorizationExpression } from './authorizations.ts';
import type { PermissionDefinitionRef, PermissionRule } from '@omne-harness/permissions';
import type { TodoItem } from './todos.ts';
import type { BackgroundCallRecord, StopInitiator } from './background-calls.ts';
import type { SessionWorkEntryIndex } from './work-entry-values.ts';
import type { JsonValue } from '@omne-harness/json-text';
import type { CompactionMessage, Message } from '@omne-harness/message';
import type { TenantId, WorkspaceId } from '@omne-harness/legal-identity';
import type { SessionHistoryIndex } from './history-values.ts';
import type { SessionCallRecord, SessionCallWait } from './call-values.ts';
import type { SessionEntriesProgress } from './interpretation-values.ts';
import type { Adoption, AdvanceRef, AttemptId, ConsumerRef, ConsumptionId, DurableEvidence, InputId, ResidentKey, BatchId, RunId, SessionId, SessionOperationId, SessionRevision } from './identity.ts';
import type { InputSourceName } from './input-sources.ts';
export type ResidentTool = Readonly<{
    capability: string;
    version: string;
    shape: JsonValue;
    admitted: DurableEvidence;
}>;
export type SessionFrozen = Readonly<{
    cause: 'tool-shape-lost';
    evidence: DurableEvidence;
    commit: DurableEvidence;
}>;
export type ExecutionRef = Readonly<{
    execution: string;
    revision: string | null;
    evidence: DurableEvidence | null;
    readThrough: string;
}>;
export type Participation = Readonly<{
    execution: string;
    operation: string;
    joint: 'message' | 'context-transition' | 'custody' | 'processed' | 'delivered';
    written: string;
    handover: DurableEvidence;
}>;
export type ProducerRef = Readonly<{
    kind: 'model';
    call: string;
}> | Readonly<{
    kind: 'tool';
    call: string;
}>;
export type CallBinding = Readonly<{
    producer: ProducerRef;
    action: string;
    consumer: ConsumerRef;
    request: DurableEvidence;
    initiatingAttempt: AttemptId | null;
}>;
export type ProducedResult = Readonly<{
    producer: ProducerRef;
    version: string;
    delivery: string | null;
    source: DurableEvidence;
}>;
export type ResultConsumption = Readonly<{
    result: ProducedResult;
    custody: DurableEvidence | null;
    completion: DurableEvidence | null;
    release: 'pending' | 'confirmed';
}>;
export type Consumption = Readonly<{
    id: ConsumptionId;
    binding: CallBinding;
    results: readonly ResultConsumption[];
    delivered?: DurableEvidence;
}>;
export type InputBatch = Readonly<{
    id: BatchId;
    watermark: DurableEvidence;
    ordered: readonly InputId[];
}>;
export type RunFailure = Readonly<{
    kind: 'node-failed';
    node: string;
    category: string;
    failureKind: string;
}> | Readonly<{
    kind: 'model-refused';
    failure: string;
}> | Readonly<{
    kind: 'no-reply';
    cause: string | null;
    upstreamStatus: string | null;
    diagnostic: string | null;
}> | Readonly<{
    kind: 'cannot-fit';
    reason: string;
}> | Readonly<{
    kind: 'request-rejected' | 'compaction-invalid' | 'compaction-failed' | 'message-rejected' | 'extension-stop' | 'guard';
}>;
export type RunEnd = Readonly<{
    conclusion: 'complete' | 'fail' | 'cancelled';
    failure: RunFailure | null;
}>;
export type RunTerminal = Readonly<{
    run: RunId;
    outcome: 'completed' | 'failed' | 'cancelled';
    evidence: DurableEvidence;
}>;
export type RunState = Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'active';
    run: RunId;
    adoption: Adoption;
    first: InputId;
    advance: AdvanceRef | null;
    ordinal: string;
    execution: ExecutionRef;
    revision: SessionRevision;
}> | Readonly<{
    kind: 'terminal';
    terminal: RunTerminal;
}>;
export type Waiting = Readonly<{
    kind: 'producer';
    binding: CallBinding;
    position: string;
}> | Readonly<{
    kind: 'extension-batch';
    passage: string;
    position: string;
    members: readonly Readonly<{
        action: string;
        card: DurableEvidence;
        decision: DurableEvidence | null;
    }>[];
}> | Readonly<{
    kind: 'extension-passage';
    passage: string;
    position: string;
    members: readonly Readonly<{
        card: DurableEvidence;
        decision: DurableEvidence | null;
    }>[];
}> | Readonly<{
    kind: 'dependency';
    owner: string;
    position: string;
}>;
export type BackgroundDisposition = Readonly<{
    kind: 'input';
    input: InputId;
}> | Readonly<{
    kind: 'kept';
    reason: 'archived' | 'frozen';
}>;
export type ControlTarget = Readonly<{
    kind: 'run';
    run: RunId;
}> | Readonly<{
    kind: 'producer';
    producer: ProducerRef;
}> | Readonly<{
    kind: 'session';
}>;
export type RoutedInput = Readonly<{
    kind: 'ordinary';
    input: InputId;
    message: Message;
    origin: DurableEvidence;
    source: InputSourceName;
    wake?: boolean;
}> | Readonly<{
    kind: 'card-decision';
    card: DurableEvidence;
    decision: DurableEvidence;
    destination: DurableEvidence;
}> | Readonly<{
    kind: 'business';
    owner: string;
    input: DurableEvidence;
    destination: DurableEvidence;
}>;
export type ArchiveCascade = Readonly<{
    parent: SessionId;
    control: SessionOperationId;
}>;
export type Control = Readonly<{
    kind: 'cancel-run';
    run: RunId;
    urgency: 'graceful' | 'force';
}> | Readonly<{
    kind: 'stop-call';
    producer: ProducerRef;
    initiator?: StopInitiator;
    reason?: string | null;
}> | Readonly<{
    kind: 'background-tool';
    producer: Extract<ProducerRef, {
        kind: 'tool';
    }>;
}> | Readonly<{
    kind: 'archive';
    cascade?: ArchiveCascade;
}> | Readonly<{
    kind: 'unarchive';
}> | Readonly<{
    kind: 'retry-run';
    run: RunId;
}>;
export type ControlIntent = Readonly<{
    kind: 'control';
    value: Control;
}> | Readonly<{
    kind: 'interrupt';
    run: RunId;
    urgent: Extract<RoutedInput, {
        kind: 'ordinary';
    }>;
    decision: DurableEvidence;
}> | Readonly<{
    kind: 'auto-archive';
    idleEvidence: DurableEvidence;
}>;
export type ControlProgress = Readonly<{
    operation: SessionOperationId;
    target: ControlTarget;
    intent: ControlIntent;
    state: 'committed' | 'propagating' | 'reconciled';
    pending: readonly ProducerRef[];
    pendingUnassociatedWaiting?: readonly SessionCallWait[];
}>;
export type ScopeReleaseDisposition = 'released' | 'pending' | 'unsupported' | 'unavailable' | 'not-authorized';
export type RecoveryTask = Readonly<{
    kind: 'initialization';
    item: string;
    owner: string;
    protocol: Adoption;
    input: JsonValue;
    originalOperation: SessionOperationId;
    state: 'pending' | 'unknown' | 'failed';
    diagnostic: string | null;
}> | Readonly<{
    kind: 'cascade';
    child: SessionId;
    parentControl: SessionOperationId;
    childOperation: SessionOperationId;
    intent: Extract<Control, {
        kind: 'archive';
    }>;
    basis: DurableEvidence;
    state: 'pending' | 'unknown' | 'denied';
}> | Readonly<{
    kind: 'routed-input';
    originalOperation: SessionOperationId;
    value: Exclude<RoutedInput, {
        kind: 'ordinary';
    }>;
    state: 'pending' | 'unknown';
}> | Readonly<{
    kind: 'scope-release';
    archive: SessionOperationId;
    scope: string;
    state: 'pending' | 'unknown';
    last: readonly ScopeReleaseDisposition[];
}>;
export type BoundedClose = Readonly<{
    kind: 'uninterpretable';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'admission-rejected';
    input: InputId;
    rejection: DurableEvidence;
}> | Readonly<{
    kind: 'drive-refused';
    failure: 'invalid' | 'unsupported';
    field: string | null;
    reason: string | null;
    input: InputId | null;
}>;
export type DerivedMessage = Readonly<{
    kind: 'compaction';
    message: CompactionMessage;
    epoch: string;
}> | Readonly<{
    kind: 'context-reminder';
    message: Message;
    source: DurableEvidence;
}>;
export type Modes = Readonly<{
    permission: 'never' | 'auto_permission' | 'bypass-permissions';
    environment: Adoption;
    collaboration: 'co-work' | 'auto-drive';
}>;
export type WorkspaceAttachment = Readonly<{
    instance: string;
    basis: string;
}>;
export type SessionCreation = Readonly<{
    definition: Readonly<{
        name: string;
        candidate: Adoption;
    }>;
    execution: Adoption;
    requiredIdentities: readonly Readonly<{
        capability: string;
        name: string;
    }>[];
    purpose: string;
    workspace: WorkspaceId | null;
    workspaceAttachment: WorkspaceAttachment | null;
    modes: Readonly<{
        kind: 'explicit';
        value: Modes;
    }> | Readonly<{
        kind: 'tenant-default';
        source: Adoption;
    }>;
    initial: Extract<RoutedInput, {
        kind: 'ordinary';
    }> | null;
    entryContract: Adoption;
    initialModelSelection?: SavedModelSelection;
    residentAdoption?: ResidentAdoption;
    initialization?: InitializationSources;
    relation?: Relation;
    attendance?: Attendance;
    fork?: import('./fork.ts').SessionFork;
}>;
export type InitializationSource = Readonly<{
    item: string;
    owner: string;
    protocol: Adoption;
}> & (Readonly<{
    kind: 'context-registration';
    input: Omit<Extract<DeclarationChange, {
        kind: 'context-registration';
    }>, 'kind' | 'registration'>;
}> | Readonly<{
    kind: 'workspace-load';
}> | Readonly<{
    kind: 'execution-adoption';
}>);
export type InitializationSources = Readonly<{
    sources: readonly InitializationSource[];
    results: readonly InitializationResult[];
}>;
export type InitializationResult = Readonly<{
    item: string;
    owner: string;
    result: Readonly<{
        kind: 'ready';
        evidence: DurableEvidence;
    }> | Readonly<{
        kind: 'failed';
        diagnostic: string;
        recovery: DurableEvidence;
    }>;
}>;
export type ContextMaterial = Readonly<{
    schema: Adoption;
    value: JsonValue;
}>;
export type DeclarationChange = Readonly<{
    kind: 'permission-assignment';
    capabilityId: string;
    enforcementKey: string;
    definition: PermissionDefinitionRef;
    rule: PermissionRule | null;
    expectedRevision: string;
    authorization: DurableEvidence;
}> | Readonly<{
    kind: 'authorization-expression';
    expression: AuthorizationExpression;
    authorization: DurableEvidence;
}> | Readonly<{
    kind: 'permission-mode';
    value: Modes['permission'];
    expectedRevision: string;
    authorization: DurableEvidence;
}> | Readonly<{
    kind: 'collaboration-mode';
    value: Modes['collaboration'];
    authorization: DurableEvidence;
}> | Readonly<{
    kind: 'environment-mode';
    value: Adoption;
    authorization: DurableEvidence;
    setting: DurableEvidence;
}> | Readonly<{
    kind: 'workspace';
    value: WorkspaceId | null;
    workspaceAttachment: WorkspaceAttachment | null;
    basis: DurableEvidence;
}> | (Readonly<{
    kind: 'model';
}> & SavedModelSelection) | Readonly<{
    kind: 'declaration';
    item: string;
    value: JsonValue | null;
    basis: DurableEvidence;
}> | Readonly<{
    kind: 'context-registration';
    registration: DurableEvidence;
    need: ContextMaterial;
    binding: ContextMaterial;
    parameters: ContextMaterial;
}> | Readonly<{
    kind: 'context-step-commit';
    basis: DurableEvidence;
    updates: readonly Readonly<{
        block: string;
        value: ContextMaterial;
    }>[];
}> | Readonly<{
    kind: 'recovery-input';
    item: string;
    value: DurableEvidence;
    basis: DurableEvidence;
}>;
export type Relation = Readonly<{
    kind: 'main';
}> | Readonly<{
    kind: 'child';
    parent: SessionId;
    basis: DurableEvidence;
}> | Readonly<{
    kind: 'handoff';
    origin: SessionId;
    basis: DurableEvidence;
}>;
export type Attendance = 'attended' | 'unattended';
export type SessionTree = Readonly<{
    root: SessionId;
    depth: number;
}>;
export type ClockSample = Readonly<{
    at: string;
    protocol: Adoption;
    source: DurableEvidence;
}>;
export type IdleCoverage = Readonly<{
    own: DurableEvidence;
    relations: DurableEvidence;
    children: readonly Readonly<{
        session: SessionId;
        work: DurableEvidence;
    }>[];
    calls: readonly Readonly<{
        producer: ProducerRef;
        state: DurableEvidence;
    }>[];
    completeScope: DurableEvidence;
}>;
export type IdleObservation = Readonly<{
    kind: 'interval';
    started: string;
    through: ClockSample;
    elapsedMs: string;
    coverage: IdleCoverage;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'interrupted';
    at: ClockSample;
    cause: DurableEvidence;
    source: DurableEvidence;
}> | Readonly<{
    kind: 'unknown';
    at: ClockSample;
    scope: DurableEvidence;
    source: DurableEvidence;
}>;
export type AutoArchivePolicy = Readonly<{
    kind: 'disabled';
}> | Readonly<{
    kind: 'enabled';
    idleMs: string;
}>;
export type FreezeVerdict = Readonly<{
    cause: 'tool-shape-lost';
    evidence: DurableEvidence;
}>;
export type WorkSnapshot = Readonly<{
    workEntryIndex?: SessionWorkEntryIndex;
    session: SessionId;
    tenant: TenantId;
    revision: SessionRevision;
    interpreter: Adoption;
    source: DurableEvidence;
    lifecycle: 'initializing' | 'dormant' | 'active' | 'frozen' | 'archived';
    frozen: SessionFrozen | null;
    residents: readonly ResidentTool[];
    definition: Readonly<{
        name: string;
        adopted: Adoption;
    }>;
    execution: Adoption;
    declarations: DurableEvidence;
    permissions: SessionPermissions;
    authorizations: AuthorizationContext;
    revisions: Readonly<{
        workspace: string;
        declarations: string;
    }>;
    run: RunState;
    pending: readonly InputId[];
    handed: readonly InputId[];
    waiting: readonly Waiting[];
    consumptions: readonly Consumption[];
    controls: readonly ControlProgress[];
    unresolved: readonly SessionOperationId[];
    creation: SessionCreation;
    tasks: readonly RecoveryTask[];
    idle: Readonly<{
        observation: IdleObservation;
        commit: DurableEvidence;
    }> | null;
    todos?: readonly TodoItem[];
    executions?: readonly RunExecution[];
    residentKeys?: ResidentAdoption['keys'];
    relation?: Relation;
    tree?: SessionTree;
    attendance?: Attendance;
    resident?: boolean;
    children?: readonly SessionId[];
    autoArchive?: AutoArchivePolicy;
    taken?: readonly InputId[];
    unanswered?: readonly InputId[];
    awaitingPerson?: true;
    backgroundPlaceholders?: readonly ConsumptionId[];
    backgroundCalls?: readonly BackgroundCallRecord[];
    backgroundOrdinal?: number;
    uncountedInputs?: readonly InputId[];
    quietInputs?: readonly InputId[];
    deliveredTail?: readonly InputId[];
    releasedScopes?: readonly Readonly<{
        task: SessionOperationId;
        scope: string;
    }>[];
    contextScopes?: readonly ContextScopeBinding[];
    contextRecords?: readonly Readonly<{
        scope: string;
        declaration: DeclarationChange;
    }>[];
    changes?: readonly DeclarationChange[];
    initialization?: InitializationState;
    historyIndex?: SessionHistoryIndex;
    callRegistrations?: readonly SessionCallRecord[];
    callWaits?: readonly SessionCallWait[];
    unansweredCalls?: readonly string[];
    entriesProgress?: readonly SessionEntriesProgress[];
}>;
export type SessionWaiting = Readonly<{
    run: RunId;
    pending: number;
    execution: string | null;
}>;
export type ResidentAdoption = Readonly<{
    residents: readonly ResidentTool[];
    keys: readonly Readonly<{
        capability: string;
        key: ResidentKey;
    }>[];
}>;
export type RunExecution = Readonly<{
    run: RunId;
    execution: ExecutionRef;
    terminal: RunTerminal | null;
}>;
export type ContextScopeBinding = Readonly<{
    generation: string;
    scope: string;
    operation: SessionOperationId;
    ended: DurableEvidence | null;
}>;
export type InitializationPlanItem = Readonly<{
    kind: 'identity' | InitializationSource['kind'];
    owner: string;
    item: string;
    protocol: Adoption;
    originalInput: JsonValue;
}>;
export type InitializationRegistration = Readonly<{
    scope: string;
    tenant: string;
    key: string;
    commit: string;
    basedOn: number;
    revision: number;
    creating: true;
    required: true;
    need: ContextMaterial;
    binding: ContextMaterial;
    parameters: ContextMaterial;
}>;
export type InitializationRequirement = Readonly<{
    kind: 'entry-contract' | 'identity' | 'context-registration' | 'workspace-load' | 'execution-preparation';
    key: string;
    requirement: DurableEvidence;
    resolution: Readonly<{
        kind: 'satisfied';
        evidence: DurableEvidence;
    }> | Readonly<{
        kind: 'planned';
        owner: string;
        item: string;
    }>;
}>;
export type InitializationAdoption = Readonly<{
    definitionName: string;
    adopted: Adoption;
    source: DurableEvidence;
    boundary: DurableEvidence;
    inputSnapshot: ContextMaterial;
    capabilities: ContextMaterial;
    residentBindings: ResidentAdoption['keys'];
    newResidents: ResidentAdoption['residents'];
}>;
export type InitialAdoption = InitializationAdoption & Readonly<{
    candidate: Adoption;
}>;
export type InitializationConsequence = Readonly<{
    kind: 'identity';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'workspace-load';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'context-registration';
    prepared: DurableEvidence;
    decision: InitializationRegistration;
}> | Readonly<{
    kind: 'execution-ready';
    evidence: DurableEvidence;
    adoption: InitializationAdoption | null;
}>;
export type InitializationGuardResult = Readonly<{
    owner: string;
    item: string;
    result: InitializationResult;
    consequence: InitializationConsequence | null;
}>;
export type InitializationGuardFacts = Readonly<{
    version: 1;
    command: 'create' | 'completeInitialization';
    binding: Readonly<{
        tenant: string;
        session: string;
        operation: string;
        createOperation: string;
    }>;
    input: JsonValue;
    initialAdoption: InitialAdoption | null;
    requirements: readonly InitializationRequirement[] | null;
    plan: readonly InitializationPlanItem[];
    results: readonly InitializationGuardResult[];
}>;
export type InitializationFactReference = Readonly<{
    kind: 'batch';
    ordinal: number;
}> | Readonly<{
    kind: 'committed';
    entry: DurableEvidence;
}>;
export type InitializationResultRecord = Readonly<{
    operation: SessionOperationId;
    outcome: InitializationGuardResult;
    facts: readonly InitializationFactReference[];
    entry: DurableEvidence;
    revision: string;
    range: Readonly<{
        first: import('./identity.ts').EntryId;
        last: import('./identity.ts').EntryId;
    }>;
}>;
export type InitializationState = Readonly<{
    protocol: 1;
    createOperation: SessionOperationId;
    initialAdoption: InitialAdoption;
    input: JsonValue;
    requirements: readonly InitializationRequirement[];
    plan: readonly InitializationPlanItem[];
    results: readonly InitializationResultRecord[];
    registrations: readonly Readonly<{
        plan: InitializationPlanItem;
        prepared: DurableEvidence;
        decision: InitializationRegistration;
        entry: DurableEvidence;
    }>[];
}>;
```

## 声明文件 `work-entry-state.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import type { SessionEntry } from './entries.ts';
import type { HistoryEntry } from './faces.ts';
import type { EntryId } from './identity.ts';
import type { ControlProgress, WorkSnapshot } from './values.ts';
import type { SessionWorkEntryIndex } from './work-entry-values.ts';
export declare function unsettled(control: ControlProgress): boolean;
export declare function requiredWorkEntries(snapshot: WorkSnapshot): readonly EntryId[];
export declare function projectWorkEntries(before: WorkSnapshot, after: WorkSnapshot, entry: SessionEntry, row: HistoryEntry): SessionWorkEntryIndex | undefined;
export type CompactionCallChange = Readonly<{
    kind: 'bound';
    consumption: string;
    associated: boolean;
}> | Readonly<{
    kind: 'result';
    consumption: string;
    version: string;
    processed: boolean;
}>;
export declare function compactionCallChangeOf(row: HistoryEntry): Outcome<CompactionCallChange | null, string>;
```

## 声明文件 `work-entry-values.d.ts`

```ts
import type { ConsumptionId, EntryId, SessionOperationId } from './identity.ts';
export type SessionCallEntryReferences = Readonly<{
    consumption: ConsumptionId;
    registered: EntryId;
    association: EntryId | null;
    waits: readonly Readonly<{
        position: string;
        entry: EntryId;
    }>[];
}>;
export type SessionControlEntryReferences = Readonly<{
    operation: SessionOperationId;
    intent: EntryId;
    progress: EntryId | null;
    selected: readonly Readonly<{
        consumption: ConsumptionId;
        position: string;
        registered: EntryId;
        waiting: EntryId;
        association: EntryId | null;
    }>[];
}>;
export type SessionWorkEntryIndex = Readonly<{
    calls: readonly SessionCallEntryReferences[];
    controls: readonly SessionControlEntryReferences[];
}>;
```

## 声明文件 `workspace-selection.d.ts`

```ts
import type { WorkspaceId } from '@omne-harness/legal-identity';
import type { WorkSnapshot, WorkspaceAttachment } from './values.ts';
export type WorkspaceSelection = Readonly<{
    workspace: WorkspaceId;
    attachment: WorkspaceAttachment;
}>;
export declare function workspaceSelection(snapshot: Pick<WorkSnapshot, 'creation' | 'changes'>): WorkspaceSelection | null;
```
