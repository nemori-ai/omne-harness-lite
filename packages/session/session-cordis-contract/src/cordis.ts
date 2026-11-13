// The Cordis service definitions of Session (docs/cordis.md): the `session` service that exposes
// the four faces, one abstract Service and one key for each construction port, outbound port and
// the internal principals, the intercept configuration `{ caller }`, and the `committed` event.
// The provider lives in `@omne-harness/session-cordis`; this entry imports no provider. The
// superseded `sessionToolStartFence` and `sessionDeliveryRelease` keys are not here: the delivery
// release goes through the Agent host's result receiver (CA-06) and the tool start fence is the
// Agent journal `start-fence` entry (#672 J03).
import { type Context, Service } from '@deepseek-ai/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  AgentDrivePort,
  SessionAdoptionSource,
  SessionCustodySource,
  SessionProductionSource,
  SessionDelegatedTransactions,
  SessionPrincipalBindingSource,
  SessionScopeOwnerSource,
  SessionWorkPrincipals,
  DurableEvidence,
  ScopeReleasePort,
  SessionAccessCheck,
  SessionCallerClass,
  SessionClock,
  SessionContextInput,
  SessionDirectory,
  SessionEvidenceBridge,
  SessionFaces,
  SessionId,
  SessionIdentityBridge,
  SessionIdleInput,
  SessionInternalPrincipals,
  SessionNotifier,
  SessionRevision,
  SessionTransactionPort,
} from '@omne-harness/session-contract'
import type { SessionAdoptedRequests } from './adopted-request.ts'
import type { SessionCursorSigning } from './cursor-signing.ts'
import type { SessionReplayFacts, SessionScopeLookup } from './context-facts.ts'

/** The intercept configuration of a caller plugin: `inject: { session: { caller } }`. */
export type SessionIntercept = Readonly<{ caller: SessionCallerClass }>

/** @owner packages/session/session-contract */
export abstract class SessionService<P = unknown> extends Service<SessionIntercept> {
  static readonly provide = 'session'
  constructor(ctx: Context) {
    super(ctx, SessionService.provide)
  }
  abstract readonly work: SessionFaces<P>['work']
  abstract readonly management: SessionFaces<P>['management']
  abstract readonly reconciliation: SessionFaces<P>['reconciliation']
  abstract readonly history: SessionFaces<P>['history']
  /**
   * The session list of a tenant. Absent by default: a provider without a directory keeps this
   * accessor, and a reader answers basis-unavailable. A provider overrides it with a getter, so
   * the caller class of each read is the caller's, like the four faces.
   */
  get directory(): SessionDirectory<P> | undefined {
    return undefined
  }
}
export const sessionKey = SessionService.provide

/** @owner packages/session/session-contract */
export abstract class SessionAccessCheckService<P = unknown>
  extends Service
  implements SessionAccessCheck<P>
{
  static readonly provide = 'sessionAccessCheck'
  constructor(ctx: Context) {
    super(ctx, SessionAccessCheckService.provide)
  }
  abstract readonly check: SessionAccessCheck<P>['check']
}
export const sessionAccessCheckKey = SessionAccessCheckService.provide

/** @owner packages/session/session-contract */
export abstract class SessionTransactionPortService<P = unknown>
  extends Service
  implements SessionTransactionPort<P>
{
  static readonly provide = 'sessionTransactions'
  constructor(ctx: Context) {
    super(ctx, SessionTransactionPortService.provide)
  }
  abstract readonly commit: SessionTransactionPort<P>['commit']
  abstract readonly readWork: SessionTransactionPort<P>['readWork']
  abstract readonly readInput: SessionTransactionPort<P>['readInput']
  abstract readonly queryOperation: SessionTransactionPort<P>['queryOperation']
  abstract readonly queryControlOperation: SessionTransactionPort<P>['queryControlOperation']
  abstract readonly readModelSelection: SessionTransactionPort<P>['readModelSelection']
  abstract readonly commitEntries: SessionTransactionPort<P>['commitEntries']
  /** Optional like the port member, and not abstract: a provider without it omits it. */
  declare readonly commitLog?: NonNullable<SessionTransactionPort<P>['commitLog']>
  abstract readonly history: SessionTransactionPort<P>['history']
  abstract readonly pending: SessionTransactionPort<P>['pending']
  /** Optional like the port member: a provider without it omits it. */
  declare readonly directory?: NonNullable<SessionTransactionPort<P>['directory']>
  abstract readonly references: SessionTransactionPort<P>['references']
  abstract readonly releasedScopes: SessionTransactionPort<P>['releasedScopes']
}
export const sessionTransactionsKey = SessionTransactionPortService.provide

/** @owner packages/session/session-contract */
export abstract class SessionInternalPrincipalsService<P = unknown>
  extends Service
  implements SessionInternalPrincipals<P>
{
  static readonly provide = 'sessionPrincipals'
  constructor(ctx: Context) {
    super(ctx, SessionInternalPrincipalsService.provide)
  }
  abstract readonly coordinator: SessionInternalPrincipals<P>['coordinator']
  abstract readonly maintainer: SessionInternalPrincipals<P>['maintainer']
}
export const sessionPrincipalsKey = SessionInternalPrincipalsService.provide

/**
 * The delegated entry from the Session execution boundary to storage. Trusted: the assembly makes
 * it visible to the `session-provider` row only, never on the shared root.
 *
 * @owner packages/session/session-contract
 */
export abstract class SessionDelegatedTransactionsService<P = unknown>
  extends Service
  implements SessionDelegatedTransactions<P>
{
  static readonly provide = 'sessionDelegatedTransactions'
  constructor(ctx: Context) {
    super(ctx, SessionDelegatedTransactionsService.provide)
  }
  abstract readonly bind: SessionDelegatedTransactions<P>['bind']
}
export const sessionDelegatedTransactionsKey = SessionDelegatedTransactionsService.provide

/**
 * The per-session principals of the coordinators and maintainers. Trusted: the assembly entry
 * provides it, visible to the `session-provider` row only.
 *
 * @owner packages/session/session-contract
 */
export abstract class SessionWorkPrincipalsService<P = unknown>
  extends Service
  implements SessionWorkPrincipals<P>
{
  static readonly provide = 'sessionWorkPrincipals'
  constructor(ctx: Context) {
    super(ctx, SessionWorkPrincipalsService.provide)
  }
  abstract readonly forSession: SessionWorkPrincipals<P>['forSession']
}
export const sessionWorkPrincipalsKey = SessionWorkPrincipalsService.provide

/**
 * The tenant ownership read of established sessions. Trusted: the `session-storage` row provides
 * it, and only the assembly entry reads it, per call.
 *
 * @owner packages/session/session-contract
 */
export abstract class SessionPrincipalBindingsService
  extends Service
  implements SessionPrincipalBindingSource
{
  static readonly provide = 'sessionPrincipalBindings'
  constructor(ctx: Context) {
    super(ctx, SessionPrincipalBindingsService.provide)
  }
  abstract readonly read: SessionPrincipalBindingSource['read']
}
export const sessionPrincipalBindingsKey = SessionPrincipalBindingsService.provide

/**
 * The durable owner of a Context scope: the session that minted it, read from the record Session
 * writes in the minting commit. Trusted: the `session-storage` row provides it, and only the
 * assembly entry reads it, per call, where the holder's in-process index has not seen the scope.
 *
 * @owner packages/session/session-contract
 */
export abstract class SessionScopeOwnersService extends Service implements SessionScopeOwnerSource {
  static readonly provide = 'sessionScopeOwners'
  constructor(ctx: Context) {
    super(ctx, SessionScopeOwnersService.provide)
  }
  abstract readonly lookup: SessionScopeOwnerSource['lookup']
}
export const sessionScopeOwnersKey = SessionScopeOwnersService.provide

/** @owner packages/session/session-contract */
export abstract class SessionIdentityBridgeService<P = unknown>
  extends Service
  implements SessionIdentityBridge<P>
{
  static readonly provide = 'sessionIdentity'
  constructor(ctx: Context) {
    super(ctx, SessionIdentityBridgeService.provide)
  }
  abstract readonly prepare: SessionIdentityBridge<P>['prepare']
}
export const sessionIdentityKey = SessionIdentityBridgeService.provide

/** @owner packages/session/session-contract */
export abstract class SessionEvidenceBridgeService<P = unknown>
  extends Service
  implements SessionEvidenceBridge<P>
{
  static readonly provide = 'sessionEvidence'
  constructor(ctx: Context) {
    super(ctx, SessionEvidenceBridgeService.provide)
  }
  abstract readonly prepare: SessionEvidenceBridge<P>['prepare']
}
export const sessionEvidenceKey = SessionEvidenceBridgeService.provide

/** @owner packages/session/session-contract */
export abstract class SessionClockService extends Service implements SessionClock {
  static readonly provide = 'sessionClock'
  constructor(ctx: Context) {
    super(ctx, SessionClockService.provide)
  }
  abstract readonly sample: SessionClock['sample']
  abstract readonly waitUntil: SessionClock['waitUntil']
}
export const sessionClockKey = SessionClockService.provide

/** @owner packages/session/session-contract */
export abstract class SessionIdleInputService<P = unknown>
  extends Service
  implements SessionIdleInput<P>
{
  static readonly provide = 'sessionIdleInput'
  constructor(ctx: Context) {
    super(ctx, SessionIdleInputService.provide)
  }
  abstract readonly inspect: SessionIdleInput<P>['inspect']
  abstract readonly prepare: SessionIdleInput<P>['prepare']
}
export const sessionIdleInputKey = SessionIdleInputService.provide

/** @owner packages/session/session-contract */
export abstract class SessionContextInputService<P = unknown>
  extends Service
  implements SessionContextInput<P>
{
  static readonly provide = 'sessionContextInput'
  constructor(ctx: Context) {
    super(ctx, SessionContextInputService.provide)
  }
  abstract readonly prepare: SessionContextInput<P>['prepare']
}
export const sessionContextInputKey = SessionContextInputService.provide

/** @owner packages/session/session-contract */
export abstract class SessionNotifierService extends Service implements SessionNotifier {
  static readonly provide = 'sessionNotifier'
  constructor(ctx: Context) {
    super(ctx, SessionNotifierService.provide)
  }
  abstract readonly committed: SessionNotifier['committed']
}
export const sessionNotifierKey = SessionNotifierService.provide

/** @owner packages/session/session-contract */
export abstract class AgentDrivePortService extends Service implements AgentDrivePort {
  static readonly provide = 'sessionAgentDrive'
  constructor(ctx: Context) {
    super(ctx, AgentDrivePortService.provide)
  }
  abstract readonly invoke: AgentDrivePort['invoke']
  abstract readonly submit: AgentDrivePort['submit']
  abstract readonly resume: AgentDrivePort['resume']
  abstract readonly control: AgentDrivePort['control']
  abstract readonly detach: AgentDrivePort['detach']
  abstract readonly recordResult: AgentDrivePort['recordResult']
  abstract readonly query: AgentDrivePort['query']
  abstract readonly inspect: AgentDrivePort['inspect']
  abstract readonly prewarm: AgentDrivePort['prewarm']
}
export const sessionAgentDriveKey = AgentDrivePortService.provide

/** @owner packages/session/session-contract */
export abstract class ScopeReleasePortService extends Service implements ScopeReleasePort {
  static readonly provide = 'sessionScopeRelease'
  constructor(ctx: Context) {
    super(ctx, ScopeReleasePortService.provide)
  }
  abstract readonly release: ScopeReleasePort['release']
}
export const sessionScopeReleaseKey = ScopeReleasePortService.provide

/**
 * The tenants of the deployment, for the startup scan of the Session provider. The application
 * assembly provides it over its tenant directory and asks the directory as the scanner of the
 * deployment; the Session provider holds no principal for it.
 */
export type SessionTenantSource = Readonly<{
  enumerate(): Promise<
    | Readonly<{ ok: readonly TenantId[] }>
    | Readonly<{ failure: Readonly<{ kind: 'unavailable' | 'denied'; diagnostic: string }> }>
  >
}>

/** @owner packages/session/session-cordis-contract */
export abstract class SessionTenantSourceService extends Service implements SessionTenantSource {
  static readonly provide = 'sessionTenants'
  constructor(ctx: Context) {
    super(ctx, SessionTenantSourceService.provide)
  }
  abstract readonly enumerate: SessionTenantSource['enumerate']
}
export const sessionTenantsKey = SessionTenantSourceService.provide

/** @owner packages/session/session-contract */
export abstract class SessionAdoptionSourceService<P = unknown>
  extends Service
  implements SessionAdoptionSource<P>
{
  static readonly provide = 'sessionAdoptionSource'
  constructor(ctx: Context) {
    super(ctx, SessionAdoptionSourceService.provide)
  }
  abstract readonly prepare: SessionAdoptionSource<P>['prepare']
  /** Optional like the port member, and not abstract: the adoption point that Session calls before `startRun`. */
  declare readonly plan?: NonNullable<SessionAdoptionSource<P>['plan']>
}
export const sessionAdoptionSourceKey = SessionAdoptionSourceService.provide

/** @owner packages/session/session-contract */
export abstract class SessionProductionSourceService
  extends Service
  implements SessionProductionSource
{
  static readonly provide = 'sessionProductionSource'
  constructor(ctx: Context) {
    super(ctx, SessionProductionSourceService.provide)
  }
  abstract readonly prepare: SessionProductionSource['prepare']
}
export const sessionProductionSourceKey = SessionProductionSourceService.provide

/** @owner packages/session/session-contract */
export abstract class SessionCustodySourceService extends Service implements SessionCustodySource {
  static readonly provide = 'sessionCustodySource'
  constructor(ctx: Context) {
    super(ctx, SessionCustodySourceService.provide)
  }
  abstract readonly prepare: SessionCustodySource['prepare']
}
export const sessionCustodySourceKey = SessionCustodySourceService.provide

/**
 * The replay facts of the context holder: what its durable facts say about the checkpointed
 * blocks of a scope. Trusted: the `session-ad03` row provides it, and only the assembly entry of
 * Runtime Context reads it, per call. A missing service reads as `unavailable`.
 *
 * @owner packages/session/session-cordis-contract
 */
export abstract class SessionReplayFactsService extends Service implements SessionReplayFacts {
  static readonly provide = 'sessionReplayFacts'
  constructor(ctx: Context) {
    super(ctx, SessionReplayFactsService.provide)
  }
  abstract readonly stepCommittedBlocks: SessionReplayFacts['stepCommittedBlocks']
}
export const sessionReplayFactsKey = SessionReplayFactsService.provide

/**
 * The session that a scope belongs to. Trusted: the `session-ad03` row provides it from the index
 * that the holder keeps, and only the assembly entry of Runtime Context reads it, per call. A
 * missing service reads as `unavailable`, never as a grant.
 *
 * @owner packages/session/session-cordis-contract
 */
export abstract class SessionScopeLookupService extends Service implements SessionScopeLookup {
  static readonly provide = 'sessionScopeLookup'
  constructor(ctx: Context) {
    super(ctx, SessionScopeLookupService.provide)
  }
  abstract readonly lookup: SessionScopeLookup['lookup']
}
export const sessionScopeLookupKey = SessionScopeLookupService.provide

/**
 * The narrow cursor signing of the Session reads. A provider signs and verifies with its current
 * key per call. The consumer takes it per call (`ctx.get`) and treats absence as `unavailable`.
 *
 * @owner packages/session/session-cordis-contract
 */
export abstract class SessionCursorSigningService extends Service implements SessionCursorSigning {
  static readonly provide = 'sessionCursorSigning'
  constructor(ctx: Context) {
    super(ctx, SessionCursorSigningService.provide)
  }
  abstract readonly sign: SessionCursorSigning['sign']
  abstract readonly verify: SessionCursorSigning['verify']
}
export const sessionCursorSigningKey = SessionCursorSigningService.provide

/**
 * The adopted request of a session: what the session-log Journal provider saved in the same
 * publication as the last main-purpose M0 (FIXED-FACTS F4). The `agent-journal` row provides it
 * in the plugin body of `agentJournal`, so it is in the same authoritative ordering as the Agent
 * records. The consumer takes it per call (`ctx.get`) and treats absence as `unavailable`.
 *
 * @owner packages/session/session-cordis-contract
 */
export abstract class SessionAdoptedRequestsService<P = unknown>
  extends Service
  implements SessionAdoptedRequests<P>
{
  static readonly provide = 'sessionAdoptedRequests'
  constructor(ctx: Context) {
    super(ctx, SessionAdoptedRequestsService.provide)
  }
  abstract readonly readAdoptedRequest: SessionAdoptedRequests<P>['readAdoptedRequest']
}
export const sessionAdoptedRequestsKey = SessionAdoptedRequestsService.provide

declare module '@deepseek-ai/cordis' {
  // The trusted identity adapter of an assembly narrows the principal type. Providers still
  // check every input at run time.
  interface Context {
    session: SessionService<unknown>
    sessionAccessCheck: SessionAccessCheckService<unknown>
    sessionTransactions: SessionTransactionPortService<unknown>
    sessionPrincipals: SessionInternalPrincipalsService<unknown>
    sessionDelegatedTransactions: SessionDelegatedTransactionsService<unknown>
    sessionWorkPrincipals: SessionWorkPrincipalsService<unknown>
    sessionPrincipalBindings: SessionPrincipalBindingsService
    sessionScopeOwners: SessionScopeOwnersService
    sessionIdentity: SessionIdentityBridgeService<unknown>
    sessionEvidence: SessionEvidenceBridgeService<unknown>
    sessionClock: SessionClockService
    sessionIdleInput: SessionIdleInputService<unknown>
    sessionContextInput: SessionContextInputService<unknown>
    sessionNotifier: SessionNotifierService
    sessionAgentDrive: AgentDrivePortService
    sessionScopeRelease: ScopeReleasePortService
    sessionTenants: SessionTenantSourceService
    sessionAdoptionSource: SessionAdoptionSourceService<unknown>
    sessionProductionSource: SessionProductionSourceService
    sessionCustodySource: SessionCustodySourceService
    sessionCursorSigning: SessionCursorSigningService
    sessionReplayFacts: SessionReplayFactsService
    sessionScopeLookup: SessionScopeLookupService
    sessionAdoptedRequests: SessionAdoptedRequestsService<unknown>
  }
  interface Events {
    /**
     * A committed batch of one session. The payload has identities, the revision, the evidence of
     * the original commit and the entry kinds of the batch. It has no message text, credentials
     * or attachment addresses. It is a wake-up only, not a source of fact.
     *
     * Where it is dispatched: the session log has one writer, and the one landing of its commits
     * (session-storage-sql「本批与提交通知」) tells each fresh batch, once, to the notifiers
     * registered on the database. The notifier that session-cordis makes
     * (`createSessionCommitNotifier`) dispatches this event. A recall, a rollback and a commit that
     * wrote no entry dispatch nothing. The dispatch comes after the commit, outside its
     * transaction, does not wait for listeners, and keeps the commit result when a listener fails.
     * The session provider only listens. A missed notification is recovered by the authoritative
     * scan.
     *
     * @mode parallel
     * @param tenant - the tenant that owns the session.
     * @param session - the session that changed.
     * @param revision - the revision of the batch, as the writer gave it; a retry keeps the same
     *   value.
     * @param source - the evidence of the batch receipt; a retry keeps the same value.
     * @param kinds - the entry kinds that the batch wrote, without repeats.
     */
    'session-cordis-contract/committed'(
      tenant: TenantId,
      session: SessionId,
      revision: SessionRevision,
      source: DurableEvidence,
      kinds: readonly string[],
    ): void
  }
}
