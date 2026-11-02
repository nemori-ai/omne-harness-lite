// The read operations of the faces (SPEC CP-03). A single-session read asks `check` once and reads
// through its view; `pending`, `references` and `releasedScopes` name no session, so they go to the
// public port, whose method asks `check` once at the real execution point.
import { fail, type Outcome } from '@omne-harness/operation-result'
import {
  readAccessRequest,
  type Reply,
  type SessionAccess,
  type SessionCallerClass,
  type SessionFailure,
  type SessionReadAccessOperation,
  type SessionTransactionPort,
} from '@omne-harness/session-contract'
import { admits, type FaceOperation } from './callers.ts'
import type { SessionDependencies } from './dependencies.ts'
import { denied, guarded, messageOf, OWNERS, unavailable } from './failures.ts'
import type { Lifecycle } from './lifecycle.ts'
import { qualify } from './qualify.ts'

export type Reads<P> = Readonly<{
  /** One single-session read: one check, one view, then `read` through the view. */
  session<T>(
    caller: SessionCallerClass,
    operation: SessionReadAccessOperation,
    access: SessionAccess<P>,
    read: (view: SessionTransactionPort<P>) => Reply<T>,
  ): Reply<T>
  /** One directory read on the public port, resolved at the call. */
  directory<T>(
    caller: SessionCallerClass,
    operation: Extract<FaceOperation, 'pending' | 'references' | 'releasedScopes'>,
    read: (port: SessionTransactionPort<P>) => Reply<T>,
  ): Reply<T>
}>

export function createReads<P>(
  dependencies: SessionDependencies<P>,
  lifecycle: Lifecycle,
): Reads<P> {
  const closed = (): Outcome<never, SessionFailure> =>
    fail(unavailable(OWNERS.session, 'the session instance is closed'))
  return {
    session: async (caller, operation, access, read) => {
      if (lifecycle.closed) return closed()
      if (!admits(caller, operation)) return fail(denied(operation))
      const tenant: unknown = access.tenant
      if (tenant === undefined || tenant === null)
        return fail({ kind: 'invalid', field: 'tenant', reason: 'the access names no tenant' })
      const request = readAccessRequest(access, operation)
      return lifecycle.track(
        (async () => {
          const view = await qualify(dependencies, request)
          if ('failure' in view) return view
          return guarded(OWNERS.delegated, operation, () => read(view.ok))
        })(),
      )
    },
    directory: async (caller, operation, read) => {
      if (lifecycle.closed) return closed()
      if (!admits(caller, operation)) return fail(denied(operation))
      let port
      try {
        port = dependencies.directory.current()
      } catch (error) {
        return fail(unavailable(OWNERS.directory, `directory.current threw: ${messageOf(error)}`))
      }
      if (port === null)
        return fail(unavailable(OWNERS.directory, 'the public transaction port is absent'))
      const target = port
      return lifecycle.track(guarded(OWNERS.directory, operation, () => read(target)))
    },
  }
}
