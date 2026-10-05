import { Service, type Context } from '@deepseek-ai/cordis'
import type { GovernanceClientOperations, ClientCloseObservation } from './index.ts'

/** @contract composition.governance-client-operations */
export abstract class GovernanceClientOperationsService
  extends Service
  implements GovernanceClientOperations
{
  static readonly provide = 'governanceClientOperations' as const
  constructor(ctx: Context) {
    super(ctx, GovernanceClientOperationsService.provide)
  }
  abstract runAction: GovernanceClientOperations['runAction']
  abstract runPrepared: GovernanceClientOperations['runPrepared']
  abstract openUse: GovernanceClientOperations['openUse']
  abstract close: GovernanceClientOperations['close']
}

export const GOVERNANCE_CLIENT_OPERATIONS_SERVICE = GovernanceClientOperationsService.provide

/** @owner packages/core/governance-client-operations */
export abstract class GovernanceClientCloseObserver
  extends Service
  implements ClientCloseObservation
{
  static readonly provide = 'governanceClientCloseObserver' as const
  constructor(ctx: Context) {
    super(ctx, GovernanceClientCloseObserver.provide)
  }
  abstract observe: ClientCloseObservation['observe']
}
export const GOVERNANCE_CLIENT_CLOSE_OBSERVER_SERVICE = GovernanceClientCloseObserver.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    governanceClientOperations: GovernanceClientOperationsService
    governanceClientCloseObserver: GovernanceClientCloseObserver
  }
}
