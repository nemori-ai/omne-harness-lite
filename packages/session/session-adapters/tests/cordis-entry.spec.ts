import { expect, it } from 'vitest'

it('cordis entry exports the production plugins that have landed', async () => {
  const cordis = (await import('@omne-harness/session-adapters/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'SESSION_CONTEXT_INPUT',
    'SESSION_CONTEXT_MATERIAL',
    'SessionEvidenceBridgeProvider',
    'SessionIdentityBridgeProvider',
    'SessionLogAgentJournalProvider',
    'contextChangeCommit',
    'contextScopeEndCommit',
    'contextStepCommit',
    'createSessionAgentDrivePlugin',
    'createSessionContextHolder',
    'createSessionContextInputPlugin',
    'createSessionContextTranslation',
    'createSessionHistorySource',
    'createSessionLogJournal',
    'createSessionModelLogConsumptionPlugin',
    'encodeContextRegistrationChange',
    'encodeContextStepCommit',
    'encodeInitialContextRegistration',
    'prepareContextRegistration',
    'sessionScopeEvidence',
  ])
})
