import type { Context, Plugin } from '@deepseek-ai/cordis'
import {
  agentAdoptionsKey,
  agentDefinitionsPoint,
} from '@omne-harness/agent-cordis-contract/cordis'
import { agentDefinitionCategory } from '@omne-harness/agent-host-local/cordis'
import { broughtDefinitionsPlugin } from '@omne-harness/assets-cordis-contract/cordis'
import { agentDefinitionCatalogKey } from './definition-catalog.ts'
import { definitionMappingsKey } from './definition-mappings.ts'
import { officialItem } from '../../assets/official-holdings.ts'
import { defineRow } from '../../row.ts'
import { agentAdoptionsConfig, type AgentAdoptionsConfig } from './config.ts'
import { definitionEffectOf } from './definition-effect.ts'
import { createDefinitionReading } from './held-definitions.ts'
import {
  AgentAdoptionsImpl,
  AgentDefinitionCatalogImpl,
  DEFINITION_CATEGORY,
  definitionLayersOf,
  DefinitionMappingsImpl,
} from './services.ts'
import { buildTable } from './table.ts'

const plugin: Plugin.Object = {
  name: 'agent-adoptions',
  Config: agentAdoptionsConfig,
  async apply(ctx: Context, config: AgentAdoptionsConfig) {
    const table = await buildTable(config)
    ctx.plugin(
      agentDefinitionCategory(
        definitionEffectOf(ctx, name => table.mappings.byName(name) !== undefined),
      ),
    )
    ctx.plugin(
      broughtDefinitionsPlugin(
        'agent-definitions-official',
        agentDefinitionsPoint.name,
        table.mappings.entries().map(({ name, candidate }) => ({
          name,
          item: officialItem(DEFINITION_CATEGORY, name, candidate.digest, true),
        })),
      ),
    )
    const reading = createDefinitionReading({
      table,
      custom: config.custom,
      layers: definitionLayersOf(ctx),
    })
    new AgentAdoptionsImpl(ctx, table, reading)
    new DefinitionMappingsImpl(ctx, table.mappings, reading)
    new AgentDefinitionCatalogImpl(ctx, table, reading)
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
