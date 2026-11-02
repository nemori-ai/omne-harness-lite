// The `adoption-sources` row: Session's adoption source over the table of `agent-adoptions`. The
// row injects `definitionMappings` and reads no configuration of its own.
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { definitionMappingsKey } from '@omne-harness/server-entry/cordis'
import { sessionAdoptionSourceKey } from '@omne-harness/session-cordis-contract/cordis'
import { defineRow } from '../../row.ts'
import { AdoptionSourcesImpl } from './sources.ts'

export { createAdoptionPlanner } from './planner.ts'
export type { AdoptionDefinition, AdoptionPlannerInput, AdoptionPlannerOptions } from './planner.ts'

const plugin: Plugin.Object = {
  name: 'adoption-sources',
  inject: [definitionMappingsKey],
  apply(ctx: Context) {
    new AdoptionSourcesImpl(ctx, ctx.definitionMappings)
  },
}

export const adoptionSourcesRow = defineRow({
  row: 'adoption-sources',
  implementation: 'real',
  manifest: {
    provides: [sessionAdoptionSourceKey],
    injects: [definitionMappingsKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
