import type { Context, Plugin } from '@deepseek-ai/cordis'
import {
  agentAdoptionsKey,
  agentDefinitionsPoint,
} from '@omne-harness/agent-cordis-contract/cordis'
import { agentDefinitionCategoryPlugin } from '@omne-harness/agent-host-local/cordis'
import { broughtDefinitionsPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { agentDefinitionCatalogKey } from './definition-catalog.ts'
import { definitionMappingsKey } from './definition-mappings.ts'
import { officialItem, releaseDocument } from '../../assets/official-holdings.ts'
import { defineRow } from '../../row.ts'
import { agentAdoptionsConfig, type AgentAdoptionsConfig } from './config.ts'
import {
  AgentAdoptionsImpl,
  AgentDefinitionCatalogImpl,
  DEFINITION_CATEGORY,
  DefinitionMappingsImpl,
} from './services.ts'
import { buildTable } from './table.ts'

const plugin: Plugin.Object = {
  name: 'agent-adoptions',
  Config: agentAdoptionsConfig,
  async apply(ctx: Context, config: AgentAdoptionsConfig) {
    const table = await buildTable(config)
    ctx.plugin(agentDefinitionCategoryPlugin)
    ctx.plugin(
      broughtDefinitionsPlugin(
        'agent-definitions-official',
        agentDefinitionsPoint.name,
        table.mappings.entries().map(({ name, candidate }) => ({
          name,
          item: officialItem(DEFINITION_CATEGORY, name, candidate.digest),
          body: releaseDocument(table.agentSide(candidate)?.definition),
        })),
      ),
    )
    new AgentAdoptionsImpl(ctx, table)
    new DefinitionMappingsImpl(ctx, table.mappings)
    new AgentDefinitionCatalogImpl(ctx, table)
  },
}

export const agentAdoptionsRow = defineRow({
  row: 'agent-adoptions',
  implementation: 'real',
  manifest: {
    provides: [agentAdoptionsKey, definitionMappingsKey, agentDefinitionCatalogKey],
    injects: [],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
