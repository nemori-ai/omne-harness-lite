import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  SessionRuntime,
  SessionIngressOperations,
  SessionCoordination,
  SessionLifecycle,
  SessionWorkReading,
  OriginalRunJournal,
  SessionStateParticipant,
  SessionDriverControl,
  SessionDriverStartup,
} from './index.ts'
import type { SourceToken } from '@omne-harness-lite/session-log'

/** Five-operation ingress face. This definition does not implement the operations.
 * @owner packages/core/session-runtime
 */
export abstract class SessionIngressService extends Service implements SessionIngressOperations {
  static readonly provide = 'sessionIngress'
  constructor(ctx: Context) {
    super(ctx, SessionIngressService.provide)
  }
  abstract readonly createSession: SessionIngressOperations['createSession']
  abstract readonly readSession: SessionIngressOperations['readSession']
  abstract readonly submitInput: SessionIngressOperations['submitInput']
  abstract readonly readReceipt: SessionIngressOperations['readReceipt']
  abstract readonly readProgress: SessionIngressOperations['readProgress']
}
export const SESSION_INGRESS = SessionIngressService.provide

/** Trusted six-step face. Availability does not grant a coordination authority.
 * @owner packages/core/session-runtime
 */
export abstract class SessionLifecycleService extends Service implements SessionLifecycle {
  static readonly provide = 'sessionLifecycle'
  constructor(ctx: Context) {
    super(ctx, SessionLifecycleService.provide)
  }
  abstract readonly commitStep: SessionLifecycle['commitStep']
}
export const SESSION_LIFECYCLE = SessionLifecycleService.provide

/** Trusted tenant work observations. This face does not consume work or issue permits.
 * @owner packages/core/session-runtime
 */
export abstract class SessionWorkReadingService extends Service implements SessionWorkReading {
  static readonly provide = 'sessionWorkReading'
  constructor(ctx: Context) {
    super(ctx, SessionWorkReadingService.provide)
  }
  abstract readonly scanWork: SessionWorkReading['scanWork']
  abstract readonly readWork: SessionWorkReading['readWork']
}
export const SESSION_WORK_READING = SessionWorkReadingService.provide

/** Trusted original-Run journal borrows. Borrowers must return their actual references.
 * @owner packages/core/session-runtime
 */
export abstract class SessionRunJournalService extends Service implements OriginalRunJournal {
  static readonly provide = 'sessionRunJournal'
  constructor(ctx: Context) {
    super(ctx, SessionRunJournalService.provide)
  }
  abstract readonly borrow: OriginalRunJournal['borrow']
}
export const SESSION_RUN_JOURNAL = SessionRunJournalService.provide

/** Trusted driver lifecycle. This definition does not start a driver.
 * @owner packages/core/session-runtime
 */
export abstract class SessionDriverControlService extends Service implements SessionDriverControl {
  static readonly provide = 'sessionDriverControl'
  constructor(ctx: Context) {
    super(ctx, SessionDriverControlService.provide)
  }
  abstract readonly requestStop: SessionDriverControl['requestStop']
  abstract readonly close: SessionDriverControl['close']
}
export const SESSION_DRIVER_CONTROL = SessionDriverControlService.provide

/** Runtime construction is provided by the trusted root, never plugin JSON.
 * @owner packages/core/session-runtime
 */
export abstract class SessionDriverStartupService extends Service implements SessionDriverStartup {
  static readonly provide = 'sessionDriverStartup'
  constructor(ctx: Context) {
    super(ctx, SessionDriverStartupService.provide)
  }
  abstract readonly start: SessionDriverStartup['start']
}
export const SESSION_DRIVER_STARTUP = SessionDriverStartupService.provide

/** Public Session operations. Providing the abstract definition does not implement them.
 * @owner packages/core/session-runtime
 */
export abstract class SessionRuntimeService extends Service implements SessionRuntime {
  static readonly provide = 'sessionRuntime'
  constructor(ctx: Context) {
    super(ctx, SessionRuntimeService.provide)
  }
  abstract readonly createSession: SessionRuntime['createSession']
  abstract readonly readSession: SessionRuntime['readSession']
  abstract readonly submitInput: SessionRuntime['submitInput']
  abstract readonly readReceipt: SessionRuntime['readReceipt']
  abstract readonly readProgress: SessionRuntime['readProgress']
  abstract readonly cancelRun: SessionRuntime['cancelRun']
  abstract readonly setArchived: SessionRuntime['setArchived']
}
export const SESSION_RUNTIME = SessionRuntimeService.provide
/** Trusted coordination face; applications must scope its availability separately from user operations.
 * @owner packages/core/session-runtime
 */
export abstract class SessionCoordinationService extends Service implements SessionCoordination {
  static readonly provide = 'sessionCoordination'
  constructor(ctx: Context) {
    super(ctx, SessionCoordinationService.provide)
  }
  abstract readonly commitStep: SessionCoordination['commitStep']
}
export const SESSION_COORDINATION = SessionCoordinationService.provide
/** @owner packages/core/session-runtime */
export abstract class SessionStateParticipantService
  extends Service
  implements SessionStateParticipant
{
  static readonly provide = 'sessionStateParticipant'
  constructor(ctx: Context) {
    super(ctx, SessionStateParticipantService.provide)
  }
  abstract readonly headIn: SessionStateParticipant['headIn']
  abstract readonly stageIn: SessionStateParticipant['stageIn']
  abstract readonly pendingIn: SessionStateParticipant['pendingIn']
}
export const SESSION_STATE_PARTICIPANT = SessionStateParticipantService.provide
declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionIngress: SessionIngressService
    sessionLifecycle: SessionLifecycleService
    sessionWorkReading: SessionWorkReadingService
    sessionRunJournal: SessionRunJournalService
    sessionDriverControl: SessionDriverControlService
    sessionDriverStartup: SessionDriverStartupService
    sessionRuntime: SessionRuntimeService
    sessionCoordination: SessionCoordinationService
    sessionStateParticipant: SessionStateParticipantService
  }
  interface Events {
    /** A hint after commit. Consumers must read facts and independently check current authority.
     * @mode emit
     * @param source Committed journal coordinate, not an execution authority.
     */
    'session-runtime/facts-changed'(source: SourceToken): void
  }
}
