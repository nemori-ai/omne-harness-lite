import { createHash } from 'node:crypto'
import { lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { parseTenantId, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { validate as validateMessage } from '@omne-harness-lite/messages'
import {
  copyJsonValue,
  isNonNegativeJsonInteger,
  type JsonNumber,
} from '@omne-harness-lite/content-blocks'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import type {
  SessionAccess,
  SessionAccessOperations,
  SessionScope,
  SessionTenancyService,
} from '@omne-harness-lite/session-tenancy'
import {
  addInteger,
  checkAppendInput,
  checkSession,
  compareInteger,
  object,
  type LogEntry,
  type OwnerFailure,
  type ReadResult,
  type SessionLog,
  type SessionLogBackingOperations,
  type SessionLogOwnerOperations,
} from '@omne-harness-lite/session-log'
import { SessionLogOwnerService } from '@omne-harness-lite/session-log/cordis'

type Authority = SessionAccess | RecoveryAccess
const reject = (reason: OwnerFailure['reason']): OwnerFailure => ({ kind: 'rejected', reason })
const unavailable = Object.freeze({ failure: 'unavailable' as const })
const invalid = Object.freeze({ failure: 'invalidInput' as const })
function ownScope(value: SessionScope): SessionScope | undefined {
  const copied = copyJsonValue(value)
  if ('failed' in copied || !object(copied.ok)) return
  const session = checkSession(copied.ok.session),
    tenant = parseTenantId(copied.ok.tenant)
  if ('failure' in session || !('ok' in tenant) || !validateMessage('SessionRef', session.ok).valid)
    return
  return Object.freeze({ session: session.ok, tenant: Object.freeze(tenant.ok) })
}
function sameSession(scope: SessionScope, entries: readonly LogEntry[]): boolean {
  return entries.every(
    entry => entry.session === scope.session && tenantIdEquals(entry.tenant, scope.tenant),
  )
}
function completePrefix(scope: SessionScope, result: ReadResult): boolean {
  if (
    'failure' in result ||
    !sameSession(scope, result.entries) ||
    !isNonNegativeJsonInteger(result.tail)
  )
    return false
  let position: JsonNumber = 0
  for (const entry of result.entries) {
    position = addInteger(position, 1)
    if (!isNonNegativeJsonInteger(entry.position) || compareInteger(entry.position, position) !== 0)
      return false
  }
  return compareInteger(position, result.tail) === 0
}

/** Application-private construction. The service exposes neither this token nor physical close. */
export async function createAuthorizedLogOwner(input: {
  readonly dir: string
  readonly backing: SessionLogBackingOperations
  readonly access: SessionAccessOperations
  readonly tenancy: SessionTenancyService
  readonly catalog: () => Promise<readonly SessionScope[]>
}) {
  const root = await lstat(input.dir, { bigint: true })
  if (!root.isDirectory()) throw new Error('session log owner requires a directory')
  const generation = input.backing.ownerGeneration
  const recovery = Object.freeze(Object.create(null)) as RecoveryAccess
  const active = new Set<Promise<unknown>>()
  const borrows = new Set<{ release(): Promise<void> }>()
  let open = true
  function track<T>(operation: () => Promise<T>): Promise<T> {
    const promise = Promise.resolve().then(operation)
    active.add(promise)
    void promise.then(
      () => active.delete(promise),
      () => active.delete(promise),
    )
    return promise
  }
  async function checkRoot(): Promise<boolean> {
    const actual = await lstat(input.dir, { bigint: true })
    return actual.isDirectory() && root.dev === actual.dev && root.ino === actual.ino
  }
  async function authorize(
    authority: Authority,
    scope: SessionScope,
  ): Promise<OwnerFailure | undefined> {
    if (!open) return reject('ownerStopped')
    try {
      if (authority !== recovery) {
        const result = await input.access.authorize(
          authority as SessionAccess,
          scope,
          'session.log.coordinate',
        )
        if (result.kind !== 'authorized') return result
      }
      if (!open) return reject('ownerStopped')
      const held = await input.tenancy.holdingTenant(scope.session)
      if (!open) return reject('ownerStopped')
      if ('failure' in held)
        return reject(held.failure === 'unavailable' ? 'unavailable' : 'notAuthorized')
      if (!tenantIdEquals(held.tenant, scope.tenant)) return reject('notAuthorized')
      // Tenancy IO may yield while a login is revoked. Check current authority again.
      if (authority !== recovery) {
        const current = await input.access.authorize(
          authority as SessionAccess,
          scope,
          'session.log.coordinate',
        )
        if (current.kind !== 'authorized') return current
      }
      if (!open) return reject('ownerStopped')
    } catch {
      return reject(open ? 'unavailable' : 'ownerStopped')
    }
  }

  async function borrow(
    authority: Authority,
    supplied: SessionScope,
  ): ReturnType<SessionLogOwnerOperations['borrow']> {
    const checkedScope = ownScope(supplied)
    if (!checkedScope) return reject('invalidInput')
    const scope: SessionScope = checkedScope
    const denied = await authorize(authority, scope)
    if (denied) return denied
    if (!open) return reject('ownerStopped')
    let held: ReturnType<SessionLogBackingOperations['borrow']>
    try {
      held = input.backing.borrow()
    } catch {
      return reject('unavailable')
    }
    let usable = true,
      released = false
    let releasing: Promise<void> | undefined
    const tasks = new Set<Promise<unknown>>()
    function admitted<T>(operation: () => Promise<T>): Promise<T | typeof unavailable> {
      if (!open || !usable) return Promise.resolve(unavailable)
      const task = Promise.resolve().then(async () => {
        if ((await authorize(authority, scope)) || !usable) return unavailable
        return operation()
      })
      tasks.add(task)
      void task.then(
        () => tasks.delete(task),
        () => tasks.delete(task),
      )
      return task
    }
    async function read(operation: () => Promise<ReadResult>): Promise<ReadResult> {
      const result = await operation()
      if ('failure' in result) return result
      if (!sameSession(scope, result.entries) || (await authorize(authority, scope)) || !usable)
        return unavailable
      return result
    }
    const result = Object.freeze({
      kind: 'borrowed' as const,
      ownerGeneration: generation,
      log: Object.freeze<SessionLog>({
        append(session, entries, fence, condition) {
          if (session !== scope.session) return Promise.resolve(invalid)
          const checked = checkAppendInput(session, entries, fence, condition)
          if ('failure' in checked) return Promise.resolve(checked)
          const request = checked.ok
          if (request.entries.some(entry => !tenantIdEquals(entry.tenant, scope.tenant)))
            return Promise.resolve({ failure: 'tenantMismatch' as const })
          return admitted(() =>
            held.log.append(request.session, request.entries, request.fence, request.condition),
          )
        },
        readByKey(session, key) {
          if (session !== scope.session) return Promise.resolve(invalid)
          return admitted(() => read(() => held.log.readByKey(session, key)))
        },
        readSince(session, after) {
          if (session !== scope.session) return Promise.resolve(invalid)
          return admitted(() => read(() => held.log.readSince(session, after)))
        },
      }),
      release(): Promise<void> {
        usable = false
        if (released) return Promise.resolve()
        if (releasing) return releasing
        const task = Promise.resolve().then(async () => {
          await Promise.allSettled([...tasks])
          await held.release()
          released = true
          borrows.delete(result)
        })
        releasing = task
        void task.then(
          () => {
            releasing = undefined
          },
          () => {
            releasing = undefined
          },
        )
        return task
      },
    })
    borrows.add(result)
    return result
  }
  const operations = Object.freeze<SessionLogOwnerOperations>({
    enumerate(authority) {
      if (!open) return Promise.resolve(reject('ownerStopped'))
      if (authority !== recovery) return Promise.resolve(reject('notAuthorized'))
      return track(async () => {
        try {
          if (!(await checkRoot())) return reject('unavailable')
          const catalog = await input.catalog()
          const byLocator = new Map<string, SessionScope>()
          const identities = new Set<string>()
          for (const value of catalog) {
            const scope = ownScope(value)
            if (!scope || identities.has(scope.session)) return reject('unavailable')
            identities.add(scope.session)
            const locator = createHash('sha256').update(scope.session, 'utf8').digest('hex')
            if (byLocator.has(locator)) return reject('unavailable')
            byLocator.set(locator, scope)
          }
          for (const entry of await readdir(input.dir, { withFileTypes: true })) {
            // The exclusive SQLite lock also owns its rollback journal while open.
            if (['.owner-lock', '.owner-lock-journal'].includes(entry.name) && entry.isFile())
              continue
            if (!entry.isDirectory() || !byLocator.has(entry.name)) return reject('unavailable')
          }
          if (!(await checkRoot())) return reject('unavailable')
          if (!open) return reject('ownerStopped')
          return {
            kind: 'sessions',
            sessions: Object.freeze(
              [...byLocator].map(([locator, scope]) =>
                Object.freeze({ scope, locator: join(input.dir, locator) }),
              ),
            ),
          }
        } catch {
          return reject(open ? 'unavailable' : 'ownerStopped')
        }
      })
    },
    borrow(authority, scope) {
      if (!open) return Promise.resolve(reject('ownerStopped'))
      // Capture the scope before any authority IO.
      const owned = ownScope(scope)
      return owned ? track(() => borrow(authority, owned)) : Promise.resolve(reject('invalidInput'))
    },
    readPrefix(authority, supplied) {
      if (!open) return Promise.resolve(reject('ownerStopped'))
      const scope = ownScope(supplied)
      if (!scope) return Promise.resolve(reject('invalidInput'))
      return track(async () => {
        const held = await borrow(authority, scope)
        if (held.kind === 'rejected') return held
        let result: Awaited<ReturnType<SessionLogOwnerOperations['readPrefix']>>
        try {
          const read = await held.log.readSince(scope.session, 0)
          result =
            !('failure' in read) && completePrefix(scope, read)
              ? {
                  kind: 'prefix',
                  prefix: Object.freeze({
                    scope,
                    ownerGeneration: generation,
                    tail: read.tail,
                    entries: read.entries,
                  }),
                }
              : reject('unavailable')
        } catch {
          result = reject('unavailable')
        }
        try {
          await held.release()
        } catch {
          return reject('unresolvedWrites')
        }
        return open ? result : reject('ownerStopped')
      })
    },
  })
  return Object.freeze({
    operations,
    generation,
    recovery,
    closeAdmission() {
      open = false
    },
    async drain() {
      open = false
      await Promise.allSettled([...active])
      const results = await Promise.allSettled([...borrows].map(borrow => borrow.release()))
      if (results.some(result => result.status === 'rejected') || borrows.size)
        throw new Error('authorized log owner retains unresolved borrows')
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
