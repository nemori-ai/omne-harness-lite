// The `session-provider` row as a contract double (`implementation: 'contract-double'`): the
// Session faces under the service key `session`, over sessions that live in process memory. It has
// no business durability, and the real Session provider (line L-SES) replaces it. The row has no
// shutdown phase.
//
// The manifest equals the `session-provider` row of `src/s0/stubs.ts`. The row reads
// `sessionAccessCheck` and asks it for every call. It does not read `sessionDelegatedTransactions`,
// `sessionPrincipals` or `sessionWorkPrincipals`: a double needs no storage and runs no work, but
// the injects keep the visibility and the start order of the row what the real provider needs.
import type { Context } from '@deepseek-ai/cordis'
import type { SessionFaces } from '@omne-harness/session-contract'
import {
  SessionService,
  sessionAccessCheckKey,
  sessionDelegatedTransactionsKey,
  sessionKey,
  sessionPrincipalsKey,
  sessionWorkPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { defineRow } from '../../row.ts'
import type { ArrivalObserver } from './arrival.ts'
import { createSessionProviderFaces } from './faces.ts'

export type { ArrivalObserver, SessionProviderArrival, SessionProviderMethod } from './arrival.ts'

export type CreateSessionProviderRowOptions = Readonly<{
  /** Receives one arrival per call that reaches the double: classes and verdicts, no credentials. */
  observe?: ArrivalObserver
}>

// The faces are fields, set once from one memory. The class has no `#` field: a call through the
// caller context does not run with the instance as `this`.
class SessionProviderDouble extends SessionService<unknown> {
  readonly work: SessionFaces<unknown>['work']
  readonly management: SessionFaces<unknown>['management']
  readonly reconciliation: SessionFaces<unknown>['reconciliation']
  readonly history: SessionFaces<unknown>['history']
  constructor(ctx: Context, faces: SessionFaces<unknown>) {
    super(ctx)
    this.work = faces.work
    this.management = faces.management
    this.reconciliation = faces.reconciliation
    this.history = faces.history
  }
}

/** A fresh row. A reload of the row, or another call of this function, starts with an empty memory. */
export function createSessionProviderRow(options: CreateSessionProviderRowOptions = {}) {
  return defineRow({
    row: 'session-provider',
    implementation: 'contract-double',
    manifest: {
      provides: [sessionKey],
      injects: [
        sessionAccessCheckKey,
        sessionDelegatedTransactionsKey,
        sessionPrincipalsKey,
        sessionWorkPrincipalsKey,
      ],
      sameProviderGroup: null,
    },
    lifecycle: { kind: 'none' },
    plugin: {
      name: 'session-provider-double',
      apply(ctx: Context) {
        new SessionProviderDouble(
          ctx,
          createSessionProviderFaces({
            accessCheck: ctx.sessionAccessCheck,
            observe: options.observe,
          }),
        )
      },
    },
  })
}

export const sessionProviderRow = createSessionProviderRow()
