export * from './config.ts'
export * from './protocol.ts'
export * from './governance.ts'
import type { PublicHealthOptions } from './config.ts'
import type { PublicHealthOutcome } from './protocol.ts'
import type { GovernanceOutcome } from './governance.ts'

export interface GovernanceTransport {
  readPublicHealth(options: PublicHealthOptions): Promise<PublicHealthOutcome>
  exchangeGovernance(options: PublicHealthOptions, input: unknown): Promise<GovernanceOutcome>
}
export class GovernanceTransportStopped extends Error {
  override readonly name = 'GovernanceTransportStopped'
  constructor() {
    super('Governance transport has stopped')
  }
}
