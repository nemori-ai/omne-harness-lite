import { Service, type Context } from '@deepseek-ai/cordis'
import type { AgentDefinitionListing } from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'

export interface AgentDefinitionCatalog {
  /** The definitions the tenant can see now. Computed at each call from the current table. */
  visibleTo(tenant: TenantId): readonly AgentDefinitionListing[]
}

/** @owner apps/harness-server/src/rows/agent-adoptions */
export abstract class AgentDefinitionCatalogService
  extends Service
  implements AgentDefinitionCatalog
{
  static readonly provide = 'agentDefinitionCatalog'
  constructor(ctx: Context) {
    super(ctx, AgentDefinitionCatalogService.provide)
  }
  abstract visibleTo(tenant: TenantId): readonly AgentDefinitionListing[]
}
export const agentDefinitionCatalogKey = AgentDefinitionCatalogService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    agentDefinitionCatalog: AgentDefinitionCatalogService
  }
}
