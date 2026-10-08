import { Context, Service } from '@deepseek-ai/cordis'
import type { SessionLogOwnerOperations, SessionLog } from './index.ts'
import type { SessionLogBackingOperations } from './backing.ts'
import type { LogAuthorityOperations, SessionLogParticipant } from './participant.ts'

/** Trusted current-authority reads on the original storage transaction.
 * @owner packages/core/session-log
 */
export abstract class SessionLogAuthorityService extends Service implements LogAuthorityOperations {
  static readonly provide = 'sessionLogAuthority'
  constructor(ctx: Context) {
    super(ctx, SessionLogAuthorityService.provide)
  }
  abstract readonly storage: LogAuthorityOperations['storage']
  abstract readonly authorize: LogAuthorityOperations['authorize']
  abstract readonly authorizeEnumeration: LogAuthorityOperations['authorizeEnumeration']
}
export const SESSION_LOG_AUTHORITY = SessionLogAuthorityService.provide

/** @owner packages/core/session-log */
export abstract class SessionLogParticipantService
  extends Service
  implements SessionLogParticipant
{
  static readonly provide = 'sessionLogParticipant'
  constructor(ctx: Context) {
    super(ctx, SessionLogParticipantService.provide)
  }
  abstract readonly readPrefixIn: SessionLogParticipant['readPrefixIn']
  abstract readonly sourceIn: SessionLogParticipant['sourceIn']
  abstract readonly appendIn: SessionLogParticipant['appendIn']
  abstract readonly source: SessionLogParticipant['source']
  abstract readonly readPrefix: SessionLogParticipant['readPrefix']
}
export const SESSION_LOG_PARTICIPANT = SessionLogParticipantService.provide

/** @owner packages/core/session-log */
export abstract class SessionLogBackingService
  extends Service
  implements SessionLogBackingOperations
{
  static readonly provide = 'sessionLogBacking'
  constructor(ctx: Context) {
    super(ctx, SessionLogBackingService.provide)
  }
  abstract readonly ownerGeneration: string
  abstract borrow(): ReturnType<SessionLogBackingOperations['borrow']>
}
export const SESSION_LOG_BACKING = SessionLogBackingService.provide

/** @contract capability.session-log */
export abstract class SessionLogOwnerService extends Service implements SessionLogOwnerOperations {
  static readonly provide = 'sessionLogOwner'
  constructor(ctx: Context) {
    super(ctx, SessionLogOwnerService.provide)
  }
  abstract enumerate(
    ...args: Parameters<SessionLogOwnerOperations['enumerate']>
  ): ReturnType<SessionLogOwnerOperations['enumerate']>
  abstract readPrefix(
    ...args: Parameters<SessionLogOwnerOperations['readPrefix']>
  ): ReturnType<SessionLogOwnerOperations['readPrefix']>
  abstract borrow(
    ...args: Parameters<SessionLogOwnerOperations['borrow']>
  ): ReturnType<SessionLogOwnerOperations['borrow']>
}
export const SESSION_LOG_OWNER = SessionLogOwnerService.provide

/** @contract capability.session-log */
export abstract class SessionLogService extends Service implements SessionLog {
  static readonly provide = 'sessionLog'
  constructor(ctx: Context) {
    super(ctx, SessionLogService.provide)
  }
  abstract append(...args: Parameters<SessionLog['append']>): ReturnType<SessionLog['append']>
  abstract readByKey(
    ...args: Parameters<SessionLog['readByKey']>
  ): ReturnType<SessionLog['readByKey']>
  abstract readSince(
    ...args: Parameters<SessionLog['readSince']>
  ): ReturnType<SessionLog['readSince']>
}
export const SESSION_LOG = SessionLogService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionLogAuthority: SessionLogAuthorityService
    sessionLogParticipant: SessionLogParticipantService
    sessionLogBacking: SessionLogBackingService
    sessionLogOwner: SessionLogOwnerService
    sessionLog: SessionLogService
  }
}
