import type { LifecyclePhase, RowId, RowManifest } from '../types.ts'

/**
 * Human projection of the provide and inject columns of the AA plugin-tree table.
 * Names are the formal AA keys; the S0 private service name is `s0.<key>`.
 * Keys that the table gives only in prose are written out where a real row of `./cordis` injects
 * them (`session-ad10`: the three evidence sources; `session-ad06`: the Journal views and
 * `sessionTransactions`), so that `real-manifests-sync` compares the real row with this table.
 * When AA changes the rows, regenerate aa-rows.json, then update this table by hand.
 */
type Entry = {
  provides?: readonly string[]
  injects?: readonly string[]
  phase?: LifecyclePhase
  group?: string
}

const priv = (keys: readonly string[] = []): readonly string[] => keys.map(key => `s0.${key}`)

const TABLE: Readonly<Record<string, Entry>> = {
  telemetry: { provides: ['telemetry'] },
  storage: { provides: ['storage'], injects: ['storageHost'], phase: 'storage' },
  identity: {
    provides: [
      'identityOperations',
      'tenantStanding',
      'identityGovernance',
      'standingReservations',
    ],
    injects: ['storage', 'identityClock'],
  },
  authorization: {
    provides: [
      'agentAccessCheck',
      'sessionAccessCheck',
      'agentActionAdmission',
      'systemActionAuthorization',
    ],
    injects: ['tenantStanding', 'principalVerifier', 'identityClock', 'identityGovernance'],
  },
  governance: {
    provides: ['sessionPermissionBackend', 'standingDestinationResolver', 'currentToolPermission'],
    injects: [
      'storage',
      'tenantDomainLookup',
      'principalVerifier',
      'tenantStanding',
      'standingReservations',
      'governanceDirectoryPrincipals',
      'governanceInstallationPrincipals',
      'identityGovernance',
      'toolContributionAuthority',
    ],
    phase: 'composition',
  },
  'session-storage': {
    provides: [
      'sessionTransactions',
      'sessionDelegatedTransactions',
      'tenantDomains',
      'tenantDomainLookup',
      'sessionPrincipalBindings',
    ],
    injects: ['storage', 'sessionAccessCheck'],
    phase: 'composition',
  },
  'session-provider': {
    provides: ['session'],
    injects: [
      'sessionAccessCheck',
      'sessionDelegatedTransactions',
      'sessionPrincipals',
      'sessionWorkPrincipals',
      'telemetry',
    ],
    phase: 'business',
  },
  'session-ad02': {
    injects: [
      'sessionWorkPrincipals',
      'session',
      'sessionTransactions',
      'storage',
      'tenantDomainLookup',
    ],
  },
  'session-ad03': {
    provides: [
      'runtimeContextReaderEligibility',
      'sessionReplayFacts',
      'sessionScopeLookup',
      'sessionModesInstallation',
    ],
    injects: [
      'sessionWorkPrincipals',
      'sessionModesPrincipals',
      'principalVerifier',
      'runtimeContext',
      'session',
      'storage',
      'tenantDomainLookup',
      'definitionMappings',
    ],
  },
  'session-ad04': { provides: ['contextHolderSources'], injects: ['session'] },
  'session-ad05': {
    injects: [
      'sessionWorkPrincipals',
      'session',
      'agentJournal',
      'agentJournalEntries',
      'agentMaterials',
      'sessionTransactions',
    ],
  },
  'session-ad06': {
    injects: [
      'session',
      'agentJournal',
      'agentJournalEntries',
      'agentMaterials',
      'sessionTransactions',
    ],
  },
  'session-ad09': { provides: ['sessionIdentity'], injects: ['principalVerifier'] },
  'session-ad10': {
    provides: ['sessionEvidence'],
    injects: ['sessionAdoptionSource', 'sessionProductionSource', 'sessionCustodySource'],
  },
  'session-ad11': {
    provides: ['sessionIdleInput'],
    injects: ['modelRuntime', 'toolRuntime', 'session'],
  },
  'session-ad12': { provides: ['sessionContextInput'], injects: ['runtimeContext'] },
  'session-ad14': {
    provides: ['sessionAgentDrive'],
    injects: [
      'agentInstances',
      'agentInstanceProvision',
      'agentExecutionRecovery',
      'agentExecutionControl',
      'session',
    ],
  },
  'session-ad15': {
    provides: ['sessionScopeRelease'],
    injects: ['executionEnvironment', 'session'],
  },
  'session-handoff': {
    provides: ['agentMessageHandoff'],
    injects: [
      'sessionWorkPrincipals',
      'session',
      'agentAccessCheck',
      'storage',
      'tenantDomainLookup',
    ],
  },
  'session-conditions': {
    provides: ['agentConditions'],
    injects: ['definitionMappings', 'session', 'storage', 'tenantDomainLookup'],
  },
  'agent-journal': {
    provides: [
      'agentJournal',
      'agentJournalEntries',
      'agentMaterials',
      'agentReceivedCommits',
      'agentReceivedRecords',
      'agentModelReceptionTargets',
      'agentToolReceptionTargets',
      'sessionAdoptedRequests',
    ],
    injects: ['sessionAccessCheck', 'storage', 'tenantDomainLookup'],
    group: 'agent-journal',
  },
  'agent-adoptions': { provides: ['agentAdoptions', 'definitionMappings'] },
  'adoption-sources': {
    provides: ['sessionAdoptionSource'],
    injects: ['definitionMappings', 'sessionWorkPrincipals'],
  },
  'agent-model-selection': { provides: ['agentModelSelection'], injects: ['modelProfiles'] },
  'agent-host': {
    provides: [
      'agentPublicationAuthority',
      'agentExecutionRecovery',
      'agentExecutionControl',
      'agentInstanceProvision',
    ],
    injects: [
      'agentJournal',
      'agentJournalEntries',
      'agentMaterials',
      'agentReceivedCommits',
      'agentModelReceptionTargets',
      'agentAccessCheck',
      'agentAdoptions',
      'agentConditions',
      'agentRequests',
      'agentModelSelection',
      'agentModelContext',
      'agentMessageHandoff',
      'agentAccountOutlet',
      'modelRuntime',
      'agentClock',
      'agentHostPrincipal',
      'telemetry',
    ],
    phase: 'business',
  },
  'agent-instances': {
    provides: ['agentInstances'],
    injects: ['agentPublicationAuthority', 'agentAccessCheck'],
  },
  'model-host': {
    provides: ['modelRuntime', 'modelInstanceHost'],
    injects: ['modelCommands', 'modelClock', 'modelHostAuthority'],
    phase: 'business',
  },
  'model-instances': { provides: ['modelInstances'], injects: ['modelPublicationAuthority'] },
  'model-converters': { provides: ['modelConverters'], injects: ['modelConverterAuthority'] },
  'model-profiles': { provides: ['modelProfiles'] },
  'model-tokenizers': { provides: ['modelTokenizers'], phase: 'composition' },
  'model-request-preparation': {
    provides: ['modelRequestPreparation'],
    injects: ['modelCommands', 'modelTokenizers'],
  },
  'model-credential': { provides: ['modelCredential', 'modelCredentialCustody'] },
  'model-records': {
    provides: ['modelCommands', 'modelSendBoundary', 'modelDiagnostics'],
    injects: ['storage', 'tenantDomainLookup', 'modelClock', 'principalVerifier', 'tenantStanding'],
    group: 'model-records',
  },
  'tool-records': {
    provides: [
      'toolCommands',
      'toolReads',
      'toolStartAuthority',
      'toolStartFence',
      'toolInvocationQualification',
    ],
    injects: ['storage', 'tenantDomainLookup'],
    group: 'tool-start',
  },
  'tool-bindings': {
    provides: ['toolBindings', 'toolCatalog'],
    injects: ['toolContributionAuthority'],
  },
  'tool-runtime': {
    provides: ['toolRuntime'],
    injects: ['toolCommands', 'toolReads'],
  },
  'tool-executor': {
    provides: ['toolInstanceHost'],
    injects: ['toolCommands', 'toolClock'],
    phase: 'business',
  },
  'tool-host': {
    provides: ['toolGenerations'],
    injects: ['toolBindings', 'toolContributionAuthority', 'toolResidencyReader'],
  },
  'tool-residency': {
    provides: ['toolResidencyReader'],
    injects: ['session', 'toolResidencyPrincipal'],
  },
  'tool-instances': { provides: ['toolInstances'], injects: ['toolPublicationAuthority'] },
  'tool-environments': { provides: ['toolEnvironments'], injects: ['executionEnvironment'] },
  'execution-environment': { provides: ['executionEnvironment'] },
  'execution-files': { injects: ['executionEnvironment'] },
  'execution-command': { injects: ['executionEnvironment'] },
  'execution-host': { injects: ['executionEnvironment'] },
  'request-context': {
    provides: ['requestContext', 'contextAccountingInbox'],
    injects: ['requestContextTrust'],
  },
  'agent-context': {
    provides: ['agentRequests', 'agentModelContext'],
    injects: [
      'requestContext',
      'contextHolderSources',
      'runtimeContextReaderEligibility',
      'runtimeContext',
      'modelRequestPreparation',
      'modelPreparationResources',
      'agentAdoptions',
    ],
  },
  'agent-account-outlet': {
    provides: ['agentAccountOutlet'],
    injects: ['requestContext', 'contextAccountingInbox'],
  },
  'runtime-context': { provides: ['runtimeContext'], injects: ['runtimeContextTrust'] },
  'server-entry': {
    injects: [
      'session',
      'principalIssuer',
      'definitionMappings',
      'telemetry',
      'agentJournal',
      'modelDiagnostics',
      'modelRuntime',
    ],
    phase: 'entry',
  },
}

export const rowManifests: ReadonlyMap<RowId, RowManifest> = new Map(
  Object.entries(TABLE).map(([id, entry]) => [
    id as RowId,
    {
      provides: priv(entry.provides),
      injects: priv(entry.injects),
      phase: entry.phase ?? null,
      sameProviderGroup: entry.group ?? null,
    },
  ]),
)
