import type { Context } from '@deepseek-ai/cordis'
import type { DispatchReconciling, Dispatching } from '@omne-harness/dispatch-contract'
import {
  DispatchReconcilingService,
  DispatchingService,
} from '@omne-harness/dispatch-cordis-contract/cordis'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import { createDispatchLocalApplication, type DispatchLocalOptions } from './application.ts'

/** What the assembly gives: everything but the storage, which is injected. */
export type DispatchLocalConfiguration = Omit<DispatchLocalOptions, 'sql'> &
  Readonly<{ sql: Omit<DispatchLocalOptions['sql'], 'storage'> }>

class LocalDispatching extends DispatchingService {
  readonly dispatch: Dispatching['dispatch']
  readonly withdraw: Dispatching['withdraw']
  readonly report: Dispatching['report']
  readonly message: Dispatching['message']
  readonly show: Dispatching['show']
  readonly list: Dispatching['list']
  constructor(ctx: Context, face: Dispatching) {
    super(ctx)
    this.dispatch = face.dispatch
    this.withdraw = face.withdraw
    this.report = face.report
    this.message = face.message
    this.show = face.show
    this.list = face.list
  }
}

class LocalReconciling extends DispatchReconcilingService {
  readonly advance: DispatchReconciling['advance']
  readonly reconcile: DispatchReconciling['reconcile']
  readonly dispatcherArchived: DispatchReconciling['dispatcherArchived']
  constructor(ctx: Context, face: DispatchReconciling) {
    super(ctx)
    this.advance = face.advance
    this.reconcile = face.reconcile
    this.dispatcherArchived = face.dispatcherArchived
  }
}

export function createDispatchLocalPlugin() {
  return {
    name: 'dispatch-local',
    inject: [storageKey],
    async apply(ctx: Context, config: DispatchLocalConfiguration) {
      const application = await createDispatchLocalApplication({
        ...config,
        sql: { ...config.sql, storage: ctx.storage },
      })
      try {
        const bound = [
          ctx.plugin(LocalDispatching, application.dispatching),
          ctx.plugin(LocalReconciling, application.reconciling),
        ]
        ctx.effect(() => () => application.close(), 'dispatch-local-drain')
        await Promise.all(bound.map(fiber => fiber.await()))
      } catch (error) {
        try {
          await application.close()
        } catch (cleanup) {
          throw new AggregateError([error, cleanup], 'Dispatch binding and cleanup failed')
        }
        throw error
      }
    },
  }
}
