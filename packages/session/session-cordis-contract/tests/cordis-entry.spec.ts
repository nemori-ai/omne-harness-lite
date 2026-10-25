// The `./cordis` entry: every key constant equals the `provide` of its class and matches the key
// table of docs/cordis.md; a real subclass loads under the `session` key in a real Context and is
// removed on unload; the superseded keys are not exported.
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import * as cordis from '@omne-harness/session-cordis-contract/cordis'
import { SessionService, sessionKey } from '@omne-harness/session-cordis-contract/cordis'

/** The key table of docs/cordis.md: key constant to its class. */
const documentedPairs = {
  sessionKey: 'SessionService',
  sessionTransactionsKey: 'SessionTransactionPortService',
  sessionPrincipalsKey: 'SessionInternalPrincipalsService',
  sessionIdentityKey: 'SessionIdentityBridgeService',
  sessionEvidenceKey: 'SessionEvidenceBridgeService',
  sessionClockKey: 'SessionClockService',
  sessionIdleInputKey: 'SessionIdleInputService',
  sessionContextInputKey: 'SessionContextInputService',
  sessionNotifierKey: 'SessionNotifierService',
  sessionAgentDriveKey: 'AgentDrivePortService',
  sessionScopeReleaseKey: 'ScopeReleasePortService',
} as const

const documentedKeys = {
  sessionKey: 'session',
  sessionTransactionsKey: 'sessionTransactions',
  sessionPrincipalsKey: 'sessionPrincipals',
  sessionIdentityKey: 'sessionIdentity',
  sessionEvidenceKey: 'sessionEvidence',
  sessionClockKey: 'sessionClock',
  sessionIdleInputKey: 'sessionIdleInput',
  sessionContextInputKey: 'sessionContextInput',
  sessionNotifierKey: 'sessionNotifier',
  sessionAgentDriveKey: 'sessionAgentDrive',
  sessionScopeReleaseKey: 'sessionScopeRelease',
} as const

describe('the ./cordis entry', () => {
  it('exports exactly the eleven classes and their keys', () => {
    expect(Object.keys(cordis).sort()).toEqual(
      [...Object.keys(documentedPairs), ...Object.values(documentedPairs)].sort(),
    )
  })

  it('gives every key only by the provide of its class, with the text of the key table', () => {
    const entry = cordis as unknown as Record<string, unknown>
    for (const [key, className] of Object.entries(documentedPairs)) {
      const service = entry[className] as { provide: string }
      expect(entry[key]).toBe(service.provide)
      expect(service.provide).toBe(documentedKeys[key as keyof typeof documentedKeys])
      expect(Object.hasOwn(service, 'provide')).toBe(true)
    }
    expect(new Set(Object.values(documentedKeys)).size).toBe(Object.keys(documentedKeys).length)
  })

  it('does not export the superseded keys', () => {
    for (const name of [
      'sessionToolStartFenceKey',
      'sessionDeliveryReleaseKey',
      'ToolStartFencePortService',
      'DeliveryReleasePortService',
    ])
      expect(Object.keys(cordis)).not.toContain(name)
  })

  it('loads a real subclass under the session key and removes it on unload', async () => {
    class Probe extends SessionService<string> {
      readonly work = {} as SessionService<string>['work']
      readonly management = {} as SessionService<string>['management']
      readonly reconciliation = {} as SessionService<string>['reconciliation']
      readonly history = {} as SessionService<string>['history']
    }
    const ctx = new Context()
    const fiber = await ctx.plugin(Probe)
    expect(ctx.get(sessionKey)).toBeInstanceOf(Probe)
    expect(ctx.get(sessionKey)).toBeInstanceOf(Service)
    await fiber.dispose()
    expect(ctx.get(sessionKey)).toBeUndefined()
  })
})
