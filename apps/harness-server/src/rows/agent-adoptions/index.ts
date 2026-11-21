import type { Context, Plugin } from '@deepseek-ai/cordis'
import { agentAdoptionsKey } from '@omne-harness/agent-cordis-contract/cordis'
import { agentDefinitionCatalogKey } from './definition-catalog.ts'
import { definitionMappingsKey } from './definition-mappings.ts'
import { defineRow } from '../../row.ts'
import { agentAdoptionsConfig, type AgentAdoptionsConfig } from './config.ts'
import {
  AgentAdoptionsImpl,
  AgentDefinitionCatalogImpl,
  DefinitionMappingsImpl,
} from './services.ts'
import { buildTable } from './table.ts'

const plugin: Plugin.Object = {
  name: 'agent-adoptions',
  Config: agentAdoptionsConfig,
  async apply(ctx: Context, config: AgentAdoptionsConfig) {
    const table = await buildTable(config)
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
