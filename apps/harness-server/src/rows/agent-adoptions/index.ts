// The `agent-adoptions` row. The plugin body parses the deployment mapping once, then builds the
// two faces from the same table object: `agentAdoptions` on the root and the trusted
// `definitionMappings`. A malformed mapping throws, the row is FAILED and startup fails.
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { agentAdoptionsKey } from '@omne-harness/agent-cordis-contract/cordis'
import { definitionMappingsKey } from '@omne-harness/server-entry/cordis'
import { defineRow } from '../../row.ts'
import { agentAdoptionsConfig, type AgentAdoptionsConfig } from './config.ts'
import { AgentAdoptionsImpl, DefinitionMappingsImpl } from './services.ts'
import { buildTable } from './table.ts'

const plugin: Plugin.Object = {
  name: 'agent-adoptions',
  Config: agentAdoptionsConfig,
  async apply(ctx: Context, config: AgentAdoptionsConfig) {
    const table = await buildTable(config)
    new AgentAdoptionsImpl(ctx, table)
    new DefinitionMappingsImpl(ctx, table.mappings)
  },
}

export const agentAdoptionsRow = defineRow({
  row: 'agent-adoptions',
  implementation: 'real',
  manifest: {
    provides: [agentAdoptionsKey, definitionMappingsKey],
    injects: [],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
