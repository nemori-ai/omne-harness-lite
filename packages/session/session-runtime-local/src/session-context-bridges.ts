import type { Context } from '@deepseek-ai/cordis'
import { StorageService } from '@omne-harness-lite/storage/cordis'
import { ClockService } from '@omne-harness-lite/offer-expiry/cordis'
import { SessionLogBackingService } from '@omne-harness-lite/session-log/cordis'
import { SessionAccessService } from '@omne-harness-lite/session-tenancy/cordis'
import { AssemblyLifetimeService } from '@omne-harness-lite/assembly-lifecycle/cordis'
import type { AssemblyLifetimePort } from '@omne-harness-lite/assembly-lifecycle'
import type { SessionLog } from '@omne-harness-lite/session-log'
import type { SessionAccessOperations, SessionScope } from '@omne-harness-lite/session-tenancy'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { SessionContextOptions } from './session-context-types.ts'

class StorageBridge extends StorageService {
  readonly read: StorageService['read']
  readonly write: StorageService['write']
  constructor(ctx: Context, options: SessionContextOptions) {
    super(ctx)
    this.read = options.storage.read.bind(options.storage)
    this.write = options.storage.write.bind(options.storage)
  }
}
class ClockBridge extends ClockService {
  readonly now: ClockService['now']
  constructor(ctx: Context, options: SessionContextOptions) {
    super(ctx)
    this.now = options.clock.now.bind(options.clock)
  }
}
class BackingBridge extends SessionLogBackingService {
  readonly ownerGeneration: string
  readonly borrow: SessionLogBackingService['borrow']
  constructor(ctx: Context, options: SessionContextOptions) {
    super(ctx)
    this.ownerGeneration = options.logBacking.ownerGeneration
    this.borrow = () => {
      const original = options.logBacking.borrow()
      return Object.freeze({
        log: scopedLog(original.log, options.scope),
        release: original.release,
      })
    }
  }
}
function scopedLog(log: SessionLog, scope: SessionScope): SessionLog {
  const invalid = Object.freeze({ failure: 'invalidInput' } as const)
  return Object.freeze<SessionLog>({
    append: (session, entries, fence, condition) =>
      session === scope.session
        ? log.append(session, entries, fence, condition)
        : Promise.resolve(invalid),
    readSince: (session, after) =>
      session === scope.session ? log.readSince(session, after) : Promise.resolve(invalid),
    readByKey: (session, key) =>
      session === scope.session ? log.readByKey(session, key) : Promise.resolve(invalid),
  })
}
class AccessBridge extends SessionAccessService {
  readonly authorize: SessionAccessOperations['authorize']
  constructor(ctx: Context, options: SessionContextOptions, current: () => boolean) {
    super(ctx)
    this.authorize = async (access, scope, operation) => {
      if (!current()) return { kind: 'rejected', reason: 'ownerStopped' }
      if (!sameScope(options.scope, scope)) return { kind: 'rejected', reason: 'notAuthorized' }
      const decision = await options.access.authorize(access, scope, operation)
      if (!current()) return { kind: 'rejected', reason: 'ownerStopped' }
      if (decision.kind === 'authorized' && !sameScope(options.scope, decision.identity.scope))
        return { kind: 'rejected', reason: 'notAuthorized' }
      return decision
    }
  }
}
export function sameScope(left: SessionScope, right: SessionScope): boolean {
  return left.session === right.session && tenantIdEquals(left.tenant, right.tenant)
}
class LifetimeBridge extends AssemblyLifetimeService {
  readonly isCurrent: AssemblyLifetimePort['isCurrent']
  readonly register: AssemblyLifetimePort['register']
  readonly retainClose: AssemblyLifetimePort['retainClose']
  constructor(ctx: Context, port: AssemblyLifetimePort) {
    super(ctx)
    this.isCurrent = port.isCurrent
    this.register = port.register
    this.retainClose = port.retainClose
  }
}
/** Explicit shared references. Session-local services are owned by the supplied host fiber. */
export function installSessionBridges(
  ctx: Context,
  options: SessionContextOptions,
  port: AssemblyLifetimePort,
) {
  new StorageBridge(ctx, options)
  new ClockBridge(ctx, options)
  new BackingBridge(ctx, options)
  new AccessBridge(ctx, options, port.isCurrent)
  new LifetimeBridge(ctx, port)
}
