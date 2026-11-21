import { Service, type Context } from '@deepseek-ai/cordis'
import type { DispatchReconciling, Dispatching } from '@omne-harness/dispatch-contract'

/** @owner packages/dispatch/dispatch-cordis-contract */
export abstract class DispatchingService extends Service implements Dispatching {
  static readonly provide = 'dispatching'

  constructor(ctx: Context) {
    super(ctx, DispatchingService.provide)
  }

  abstract readonly dispatch: Dispatching['dispatch']
  abstract readonly withdraw: Dispatching['withdraw']
  abstract readonly report: Dispatching['report']
  abstract readonly message: Dispatching['message']
  abstract readonly show: Dispatching['show']
  abstract readonly list: Dispatching['list']
}
export const dispatchingKey = DispatchingService.provide

/** @owner packages/dispatch/dispatch-cordis-contract */
export abstract class DispatchReconcilingService extends Service implements DispatchReconciling {
  static readonly provide = 'dispatchReconciling'

  constructor(ctx: Context) {
    super(ctx, DispatchReconcilingService.provide)
  }

  abstract readonly advance: DispatchReconciling['advance']
  abstract readonly reconcile: DispatchReconciling['reconcile']
  abstract readonly dispatcherArchived: DispatchReconciling['dispatcherArchived']
}
export const dispatchReconcilingKey = DispatchReconcilingService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    dispatching: DispatchingService
    dispatchReconciling: DispatchReconcilingService
  }
}
