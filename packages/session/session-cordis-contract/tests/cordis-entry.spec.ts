// The `./cordis` entry: every key constant equals the `provide` of its class and matches the key
// table of docs/cordis.md; a real subclass loads under the `session` key in a real Context and is
// removed on unload; the superseded keys are not exported.
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import * as cordis from '@omne-harness/session-cordis-contract/cordis'
import {
  SessionAdoptionSourceService,
  SessionScopeLookupService,
  SessionService,
  SessionTransactionPortService,
  sessionKey,
  sessionScopeLookupKey,
} from '@omne-harness/session-cordis-contract/cordis'

/** The key table of docs/cordis.md: key constant to its class. */
const documentedPairs = {
  sessionKey: 'SessionService',
  sessionAccessCheckKey: 'SessionAccessCheckService',
  sessionTransactionsKey: 'SessionTransactionPortService',
  sessionPrincipalsKey: 'SessionInternalPrincipalsService',
  sessionDelegatedTransactionsKey: 'SessionDelegatedTransactionsService',
  sessionWorkPrincipalsKey: 'SessionWorkPrincipalsService',
  sessionPrincipalBindingsKey: 'SessionPrincipalBindingsService',
  sessionIdentityKey: 'SessionIdentityBridgeService',
  sessionEvidenceKey: 'SessionEvidenceBridgeService',
  sessionClockKey: 'SessionClockService',
  sessionIdleInputKey: 'SessionIdleInputService',
  sessionContextInputKey: 'SessionContextInputService',
  sessionNotifierKey: 'SessionNotifierService',
  sessionAgentDriveKey: 'AgentDrivePortService',
  sessionScopeReleaseKey: 'ScopeReleasePortService',
  sessionAdoptionSourceKey: 'SessionAdoptionSourceService',
  sessionProductionSourceKey: 'SessionProductionSourceService',
  sessionCustodySourceKey: 'SessionCustodySourceService',
  sessionCursorSigningKey: 'SessionCursorSigningService',
  sessionReplayFactsKey: 'SessionReplayFactsService',
  sessionScopeLookupKey: 'SessionScopeLookupService',
} as const

const documentedKeys = {
  sessionKey: 'session',
  sessionAccessCheckKey: 'sessionAccessCheck',
  sessionTransactionsKey: 'sessionTransactions',
  sessionPrincipalsKey: 'sessionPrincipals',
  sessionDelegatedTransactionsKey: 'sessionDelegatedTransactions',
  sessionWorkPrincipalsKey: 'sessionWorkPrincipals',
  sessionPrincipalBindingsKey: 'sessionPrincipalBindings',
  sessionIdentityKey: 'sessionIdentity',
  sessionEvidenceKey: 'sessionEvidence',
  sessionClockKey: 'sessionClock',
  sessionIdleInputKey: 'sessionIdleInput',
  sessionContextInputKey: 'sessionContextInput',
  sessionNotifierKey: 'sessionNotifier',
  sessionAgentDriveKey: 'sessionAgentDrive',
  sessionScopeReleaseKey: 'sessionScopeRelease',
  sessionAdoptionSourceKey: 'sessionAdoptionSource',
  sessionProductionSourceKey: 'sessionProductionSource',
  sessionCustodySourceKey: 'sessionCustodySource',
  sessionCursorSigningKey: 'sessionCursorSigning',
  sessionReplayFactsKey: 'sessionReplayFacts',
  sessionScopeLookupKey: 'sessionScopeLookup',
} as const

describe('the ./cordis entry', () => {
  it('exports exactly the twenty-one classes and their keys', () => {
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

  it('loads a subclass that omits the optional commitLog and plan, and one that gives them', async () => {
    // The optional members are not abstract: a provider written before them still compiles.
    class Transactions extends SessionTransactionPortService<string> {
      readonly commit = (() =>
        undefined) as unknown as SessionTransactionPortService<string>['commit']
      readonly readWork = (() =>
        undefined) as unknown as SessionTransactionPortService<string>['readWork']
      readonly readInput = (() =>
        undefined) as unknown as SessionTransactionPortService<string>['readInput']
      readonly queryOperation = (() =>
        undefined) as unknown as SessionTransactionPortService<string>['queryOperation']
      readonly queryControlOperation = (() =>
        undefined) as unknown as SessionTransactionPortService<string>['queryControlOperation']
      readonly readModelSelection = (() =>
        undefined) as unknown as SessionTransactionPortService<string>['readModelSelection']
      readonly commitEntries = (() =>
        undefined) as unknown as SessionTransactionPortService<string>['commitEntries']
      readonly history = {} as SessionTransactionPortService<string>['history']
      readonly pending = (() =>
        undefined) as unknown as SessionTransactionPortService<string>['pending']
      readonly references = (() =>
        undefined) as unknown as SessionTransactionPortService<string>['references']
      readonly releasedScopes = (() =>
        undefined) as unknown as SessionTransactionPortService<string>['releasedScopes']
    }
    class Source extends SessionAdoptionSourceService<string> {
      readonly prepare = (() =>
        undefined) as unknown as SessionAdoptionSourceService<string>['prepare']
      override readonly plan = (() => undefined) as unknown as NonNullable<
        SessionAdoptionSourceService<string>['plan']
      >
    }
    const ctx = new Context()
    const transactions = await ctx.plugin(Transactions)
    const source = await ctx.plugin(Source)
    expect(ctx.get('sessionTransactions')).toBeInstanceOf(Transactions)
    expect(Object.hasOwn(ctx.get('sessionTransactions') ?? {}, 'commitLog')).toBe(false)
    expect(typeof ctx.get('sessionAdoptionSource')?.plan).toBe('function')
    await source.dispose()
    await transactions.dispose()
  })

  it('declares the scope lookup service by its key', () => {
    expect(sessionScopeLookupKey).toBe(SessionScopeLookupService.provide)
    expect(sessionScopeLookupKey).toBe('sessionScopeLookup')
  })
})
