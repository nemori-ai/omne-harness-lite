import { expect, it } from 'vitest'
import * as session from '@omne-harness/session-contract'
import * as testing from '@omne-harness/session-contract/testing'

// The whole runtime surface of the root entry. Every type is erased, so a new value export has to
// be added here on purpose; the entry codec and the identity derivations of `decide` stay out.
it('exports exactly the declared root runtime surface', () => {
  expect(Object.keys(session).sort()).toEqual([
    'INITIALIZATION_PROTOCOL',
    'commandDigest',
    'decide',
    'deriveDriveOperation',
    'deriveSessionOperation',
    'initializationRegistrationCommit',
    'judgeAdvance',
    'judgeCompletion',
    'judgeIdle',
    'judgeRunStart',
    'mutationAccessRequest',
    'openWork',
    'projectSessionLog',
    'readAccessRequest',
    'reduce',
    'resolveCascade',
    'resolveControlScope',
    'resolveOperation',
    'routeInput',
    'sessionModesBlock',
  ])
})

it('keeps the entry codec and the testing values off the root entry', () => {
  for (const internal of ['encodeEntry', 'decodeEntry', 'toJsonValue', 'memoryAccess'])
    expect(Object.keys(session)).not.toContain(internal)
})

it('exports the suite, the doubles and the legal values from ./testing', () => {
  expect(Object.keys(testing).sort()).toEqual([
    'NotApplicable',
    'TESTING_OWNER',
    'adoptedInitializationFixture',
    'adoption',
    'agentDriveConformance',
    'assertIndistinguishable',
    'assistantMessage',
    'conformanceCase',
    'createMemoryAgentDrive',
    'createMemoryInitializationSource',
    'createMemoryScopeRelease',
    'createMemorySessionClock',
    'createMemorySessionContextInput',
    'createMemorySessionEvidenceBridge',
    'createMemorySessionHistorySource',
    'createMemorySessionIdleInput',
    'createMemorySessionNotifier',
    'createMemorySessionTransactions',
    'createPolicySessionAccessCheck',
    'createScriptedSessionAccessCheck',
    'createScriptedSessionIdentityBridge',
    'creation',
    'evidence',
    'expectKind',
    'guard',
    'handle',
    'initializationFixtureFacts',
    'initializationFixtureGuard',
    'inputId',
    'isNotApplicable',
    'memoryAccess',
    'memoryOtherAccess',
    'memorySessionTransactionsFixture',
    'mintEvidence',
    'operationId',
    'ordinaryInput',
    'pendingReasonsOf',
    'refused',
    'runConformanceCase',
    'scopeReleaseConformance',
    'sessionClockConformance',
    'sessionContextInputConformance',
    'sessionEvidenceBridgeConformance',
    'sessionId',
    'sessionIdentityBridgeConformance',
    'sessionIdleInputConformance',
    'sessionNotifierConformance',
    'sessionTransactionsConformance',
    'shapeOf',
    'succeeded',
    'testingTenant',
    'testingWorkspace',
    'userMessage',
  ])
})

it('declares the block session.modes with its two consumers', () => {
  expect(session.sessionModesBlock).toMatchObject({
    name: 'session.modes',
    kind: 'supplied',
    recovery: 'persisted',
    volatility: 'stable',
    consumers: ['model', 'coordinator'],
  })
  expect(session.sessionModesBlock.schema.digest).toMatch(/^sha256:[0-9a-f]{64}$/u)
})
