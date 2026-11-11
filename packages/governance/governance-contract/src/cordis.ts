import { Service, type Context } from '@deepseek-ai/cordis'
import type { GovernanceContributions } from './ports.ts'

/** @owner packages/governance/governance-contract */
export abstract class GovernanceContributionsService<Registrar, Assembler, Reader>
  extends Service
  implements GovernanceContributions<Registrar, Assembler, Reader>
{
  static readonly provide = 'governanceContributions'

  constructor(ctx: Context) {
    super(ctx, GovernanceContributionsService.provide)
  }

  abstract readonly contribute: GovernanceContributions<Registrar, Assembler, Reader>['contribute']
  abstract readonly withdraw: GovernanceContributions<Registrar, Assembler, Reader>['withdraw']
  abstract readonly adopt: GovernanceContributions<Registrar, Assembler, Reader>['adopt']
  abstract readonly readCatalog: GovernanceContributions<
    Registrar,
    Assembler,
    Reader
  >['readCatalog']
  abstract readonly queryOperation: GovernanceContributions<
    Registrar,
    Assembler,
    Reader
  >['queryOperation']
}
export const governanceContributionsKey = GovernanceContributionsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    governanceContributions: GovernanceContributionsService<unknown, unknown, unknown>
  }
}
