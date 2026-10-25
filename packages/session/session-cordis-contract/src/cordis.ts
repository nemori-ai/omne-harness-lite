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
  DurableEvidence,
  ScopeReleasePort,
  SessionCallerClass,
  SessionClock,
  SessionContextInput,
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
}
export const sessionKey = SessionService.provide

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
  abstract readonly history: SessionTransactionPort<P>['history']
  abstract readonly pending: SessionTransactionPort<P>['pending']
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
export abstract class SessionEvidenceBridgeService
  extends Service
  implements SessionEvidenceBridge
{
  static readonly provide = 'sessionEvidence'
  constructor(ctx: Context) {
    super(ctx, SessionEvidenceBridgeService.provide)
  }
  abstract readonly prepare: SessionEvidenceBridge['prepare']
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

declare module '@deepseek-ai/cordis' {
  // The trusted identity adapter of an assembly narrows the principal type. Providers still
  // check every input at run time.
  interface Context {
    session: SessionService<unknown>
    sessionTransactions: SessionTransactionPortService<unknown>
    sessionPrincipals: SessionInternalPrincipalsService<unknown>
    sessionIdentity: SessionIdentityBridgeService<unknown>
    sessionEvidence: SessionEvidenceBridgeService
    sessionClock: SessionClockService
    sessionIdleInput: SessionIdleInputService<unknown>
    sessionContextInput: SessionContextInputService<unknown>
    sessionNotifier: SessionNotifierService
    sessionAgentDrive: AgentDrivePortService
    sessionScopeRelease: ScopeReleasePortService
  }
  interface Events {
    /**
     * A committed batch of one session. The payload has identities, the revision, the evidence of
     * the original commit and the entry kinds of the batch. It has no message text, credentials
     * or attachment addresses. It is a wake-up only, not a source of fact: the sender dispatches
     * after the commit, does not wait for listeners, and keeps the commit result when a listener
     * fails. A missed notification is recovered by the authoritative scan.
     *
     * @mode parallel
     * @param tenant - the tenant that owns the session.
     * @param session - the session that changed.
     * @param revision - the session revision after the batch, as the original receipt gave it.
     * @param source - the evidence of the original commit; a retry keeps the same value.
     * @param kinds - the entry kinds that the batch wrote.
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
