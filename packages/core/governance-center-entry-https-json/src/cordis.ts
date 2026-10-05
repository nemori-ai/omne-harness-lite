import { Service, type Context } from '@deepseek-ai/cordis'
import type { GovernanceTransport } from './index.ts'

/** @contract composition.governance-center-entry-https-json */
export abstract class GovernanceTransportService extends Service implements GovernanceTransport {
  static readonly provide = 'governanceTransport' as const
  constructor(ctx: Context) {
    super(ctx, GovernanceTransportService.provide)
  }
  abstract readPublicHealth: GovernanceTransport['readPublicHealth']
  abstract exchangeGovernance: GovernanceTransport['exchangeGovernance']
}

export const GOVERNANCE_TRANSPORT_SERVICE = GovernanceTransportService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    governanceTransport: GovernanceTransportService
  }
}
