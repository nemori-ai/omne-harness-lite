import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import type { Context } from '@deepseek-ai/cordis'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import {
  checkSourceToken,
  type OwnerFailure,
  type SessionLog,
  type SessionLogOwnerOperations,
} from '@omne-harness-lite/session-log'
import { SessionLogOwnerService } from '@omne-harness-lite/session-log/cordis'

const rejected = (reason: OwnerFailure['reason']): OwnerFailure => ({ kind: 'rejected', reason })
/** Application catalog check over the real SQL journal owner. No second authorization implementation. */
export async function createAuthorizedLogOwner(input: {
  readonly owner: SessionLogOwnerOperations
  readonly generation: string
  readonly recovery: RecoveryAccess
  readonly decorateLog?: (log: SessionLog) => SessionLog | void | Promise<SessionLog | void>
  readonly catalog: () => Promise<readonly SessionScope[]>
}) {
  let open = true
  const active = new Set<Promise<unknown>>()
  const borrows = new Set<{ readonly release: () => Promise<void> }>()
  function track<T>(action: () => Promise<T>): Promise<T> {
    const task = Promise.resolve().then(action)
    active.add(task)
    void task.then(
      () => active.delete(task),
      () => active.delete(task),
    )
    return task
  }
  async function enumerate(): ReturnType<SessionLogOwnerOperations['enumerate']> {
    let catalog: readonly SessionScope[]
    try {
      catalog = await input.catalog()
    } catch (error) {
      if (error instanceof StorageUnavailable) return rejected('unavailable')
      throw error
    }
    if (
      catalog.some(
        scope =>
          'failure' in
          checkSourceToken({ ...scope, journalGeneration: 'catalog-validation', tail: 0 }),
      )
    )
      return rejected('unavailable')
    const bySession = new Map(catalog.map(scope => [scope.session, scope]))
    if (bySession.size !== catalog.length) return rejected('unavailable')
    const actual = await input.owner.enumerate(input.recovery)
    if (actual.kind !== 'sessions') return actual
    for (const item of actual.sessions) {
      const scope = bySession.get(item.scope.session)
      if (scope === undefined || !tenantIdEquals(scope.tenant, item.scope.tenant))
        return rejected('unavailable')
    }
    // A catalogued empty Session still has a durable journal identity before consumers bind.
    for (const scope of catalog) {
      const held = await input.owner.borrow(input.recovery, scope)
      if (held.kind !== 'borrowed') return held
      await held.release()
    }
    return open
      ? {
          kind: 'sessions',
          sessions: Object.freeze(catalog.map(scope => ({ scope, locator: scope.session }))),
        }
      : rejected('ownerStopped')
  }
  const operations = Object.freeze<SessionLogOwnerOperations>({
    enumerate(authority) {
      if (!open) return Promise.resolve(rejected('ownerStopped'))
      if (authority !== input.recovery) return Promise.resolve(rejected('notAuthorized'))
      return track(enumerate)
    },
    readPrefix(authority, scope) {
      if (!open) return Promise.resolve(rejected('ownerStopped'))
      const captured = captureScope(scope)
      if (captured === undefined) return Promise.resolve(rejected('invalidInput'))
      return track(() => input.owner.readPrefix(authority, captured))
    },
    borrow(authority, scope) {
      if (!open) return Promise.resolve(rejected('ownerStopped'))
      const captured = captureScope(scope)
      if (captured === undefined) return Promise.resolve(rejected('invalidInput'))
      return track(async () => {
        const held = await input.owner.borrow(authority, captured)
        if (held.kind !== 'borrowed') return held
        let source: SessionLog
        try {
          source = (await input.decorateLog?.(held.log)) ?? held.log
        } catch (error) {
          await held.release()
          throw error
        }
        let admitting = true
        const unavailable = { failure: 'unavailable' } as const
        const log = Object.freeze<SessionLog>({
          append: (...args) =>
            open && admitting ? source.append(...args) : Promise.resolve(unavailable),
          readSince: (...args) =>
            open && admitting ? source.readSince(...args) : Promise.resolve(unavailable),
          readByKey: (...args) =>
            open && admitting ? source.readByKey(...args) : Promise.resolve(unavailable),
        })
        const borrow = {
          ...held,
          log,
          async release() {
            admitting = false
            await held.release()
            borrows.delete(borrow)
          },
        }
        borrows.add(borrow)
        if (!open) {
          await borrow.release()
          return rejected('ownerStopped')
        }
        return Object.freeze(borrow)
      })
    },
  })
  return Object.freeze({
    operations,
    generation: input.generation,
    recovery: input.recovery,
    closeAdmission() {
      open = false
    },
    async drain() {
      open = false
      await Promise.all([...active])
      await Promise.all([...borrows].map(borrow => borrow.release()))
    },
  })
}
export class AuthorizedLogOwner extends SessionLogOwnerService {
  constructor(
    ctx: Context,
    private readonly operations: SessionLogOwnerOperations,
  ) {
    super(ctx)
  }
  enumerate(...args: Parameters<SessionLogOwnerOperations['enumerate']>) {
    return this.operations.enumerate(...args)
  }
  readPrefix(...args: Parameters<SessionLogOwnerOperations['readPrefix']>) {
    return this.operations.readPrefix(...args)
  }
  borrow(...args: Parameters<SessionLogOwnerOperations['borrow']>) {
    return this.operations.borrow(...args)
  }
}

function captureScope(value: unknown): SessionScope | undefined {
  const copy = copyJsonValue(value)
  if ('failed' in copy || copy.ok === null || typeof copy.ok !== 'object' || Array.isArray(copy.ok))
    return
  if (Object.keys(copy.ok).length !== 2) return
  const checked = checkSourceToken({ ...copy.ok, journalGeneration: 'scope-check', tail: 0 })
  return 'failure' in checked
    ? undefined
    : Object.freeze({ tenant: checked.ok.tenant, session: checked.ok.session })
}
