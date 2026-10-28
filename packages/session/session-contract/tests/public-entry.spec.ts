import { expect, it } from 'vitest'
import * as session from '@omne-harness/session-contract'
import * as testing from '@omne-harness/session-contract/testing'

// The whole runtime surface of the root entry. Every type is erased, so a new value export has to
// be added here on purpose; the entry codec and the identity derivations of `decide` stay out.
it('exports exactly the two derivations, the nine services, decide, reduce and the block', () => {
  expect(Object.keys(session).sort()).toEqual([
    'commandDigest',
    'decide',
    'deriveDriveOperation',
    'deriveSessionOperation',
    'judgeAdvance',
    'judgeCompletion',
    'judgeIdle',
    'judgeRunStart',
    'openWork',
    'projectSessionLog',
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
    'adoption',
    'agentDriveConformance',
    'assertIndistinguishable',
    'assistantMessage',
    'conformanceCase',
    'createMemoryAgentDrive',
    'createMemoryScopeRelease',
    'createMemorySessionClock',
    'createMemorySessionContextInput',
    'createMemorySessionEvidenceBridge',
    'createMemorySessionIdleInput',
    'createMemorySessionNotifier',
    'createMemorySessionTransactions',
    'createScriptedSessionIdentityBridge',
    'creation',
    'evidence',
    'expectKind',
    'guard',
    'handle',
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
