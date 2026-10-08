import { Service, type Context } from '@deepseek-ai/cordis'
import type { SessionRuntime, SessionCoordination, SessionStateParticipant } from './index.ts'
import type { SourceToken } from '@omne-harness-lite/session-log'

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
    sessionRuntime: SessionRuntimeService
    sessionCoordination: SessionCoordinationService
    sessionStateParticipant: SessionStateParticipantService
  }
  interface Events {
    /** A hint after commit. Consumers must read facts and independently check current authority. */
    'session-runtime/facts-changed'(source: SourceToken): void
  }
}
