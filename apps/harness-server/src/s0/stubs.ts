import type { LifecyclePhase, RowId, RowManifest } from '../types.ts'

/**
 * Human projection of the provide and inject columns of the AA plugin-tree table.
 * Names are the formal AA keys; the S0 private service name is `s0.<key>`.
 * Keys that the table gives only in prose (the evidence sources of `session-ad10`) are left out.
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
  storage: { provides: ['storage'], injects: ['storageHost'], phase: 'storage' },
  identity: { provides: ['identityOperations', 'tenantStanding'], injects: ['storage'] },
  authorization: {
    provides: ['agentAccessCheck', 'sessionAccessCheck', 'agentActionAdmission'],
    injects: ['tenantStanding', 'principalVerifier'],
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
    ],
  },
  'session-ad01': { injects: ['session'] },
  'session-ad02': { injects: ['session'] },
  'session-ad03': { injects: ['runtimeContext', 'session'] },
  'session-ad04': { injects: ['session'] },
  'session-ad05': { injects: ['session'] },
  'session-ad06': { injects: ['session'] },
  'session-ad09': { provides: ['sessionIdentity'], injects: ['principalVerifier'] },
  'session-ad10': { provides: ['sessionEvidence'] },
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
  'session-handoff': { provides: ['agentMessageHandoff'], injects: ['session'] },
  'session-conditions': { provides: ['agentConditions'], injects: ['session'] },
  'agent-journal': {
    provides: ['agentJournal', 'agentJournalEntries', 'agentMaterials'],
    injects: ['sessionAccessCheck', 'storage', 'tenantDomainLookup'],
    group: 'agent-journal',
  },
  'agent-adoptions': { provides: ['agentAdoptions', 'definitionMappings'] },
  'adoption-sources': { provides: ['sessionAdoptionSource'], injects: ['definitionMappings'] },
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
  'model-request-preparation': {
    provides: ['modelRequestPreparation'],
    injects: ['modelCommands'],
  },
  'model-credential': { provides: ['modelCredential'] },
  'model-records': { provides: ['modelCommands'], injects: ['storage', 'tenantDomainLookup'] },
  'tool-records': {
    provides: ['toolCommands', 'toolReads', 'toolStartAuthority', 'toolStartFence'],
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
    phase: 'business',
  },
  'tool-executor': {
    injects: ['toolCommands', 'toolInstanceHost', 'toolClock'],
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
    injects: ['requestContext', 'runtimeContext', 'modelRequestPreparation'],
  },
  'agent-account-outlet': {
    provides: ['agentAccountOutlet'],
    injects: ['requestContext', 'contextAccountingInbox'],
  },
  'runtime-context': { provides: ['runtimeContext'], injects: ['runtimeContextTrust'] },
  'server-entry': {
    injects: ['session', 'principalIssuer', 'definitionMappings'],
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
