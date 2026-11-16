import type { Context } from '@deepseek-ai/cordis'
import type { SessionFaces, SessionIntakeLimits } from '@omne-harness/session-contract'
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
export { sessionProviderRealRow as sessionProviderRow } from './real.ts'

export type CreateSessionProviderRowOptions = Readonly<{
  observe?: ArrivalObserver
  intakeLimits?: SessionIntakeLimits
}>

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
            ...(options.intakeLimits === undefined ? {} : { intakeLimits: options.intakeLimits }),
          }),
        )
      },
    },
  })
}
