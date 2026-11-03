// The `session-conditions` row (SC1, R2-D145): the J06 current conditions plugin of session-adapters
// (`createSessionConditionsPlugin`), which provides `agentConditions`. It reads the Session snapshot
// through `session` as `coordinator`, and its sub-plugin `session-conditions-selection` reads the
// saved model selection as `maintainer` (the classes that read admits), both with the caller's Access.
// It reads the execution index and the Journal attempt record through the trusted `storage` and
// `tenantDomainLookup`. Construction input (a runtime object, not configuration): the resolver of a
// session's tenant-default modes over the trusted `definitionMappings` table, below.
//
// No configuration: the plugin takes none, and the release writes no value.
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { agentConditionsKey } from '@omne-harness/agent-cordis-contract/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  createSessionConditionsPlugin,
  type SessionConditionsInput,
} from '@omne-harness/session-adapters/cordis'
import {
  definitionMappingsKey,
  modesAdoptionOf,
  type DefinitionMappings,
} from '@omne-harness/server-entry/cordis'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { defineRow } from '../../row.ts'

/**
 * The tenant-default modes of a session, from the deployment's definition mapping. The creation
 * named `source`, the modes adoption of the entry at that time (`modesAdoptionOf`: its digest covers
 * the modes). The entry of the session's definition name must still stand for exactly that
 * adoption; a renamed, removed or changed default is `unavailable`, never the current default. The
 * basis is the same adoption as evidence.
 */
export function defaultModesOf(
  mappings: DefinitionMappings,
): SessionConditionsInput['defaultModes'] {
  return input => {
    const entry = mappings.byName(input.definition.name)
    if (entry === undefined)
      return Promise.resolve(
        fail({
          kind: 'unavailable',
          diagnostic: `no definition mapping entry is named "${input.definition.name}"`,
        }),
      )
    const current = modesAdoptionOf(entry)
    const same = (Object.keys(current) as (keyof typeof current)[]).every(
      key => current[key] === input.source[key],
    )
    if (!same)
      return Promise.resolve(
        fail({
          kind: 'unavailable',
          diagnostic: `the modes of "${entry.name}" no longer stand for the source the creation named`,
        }),
      )
    return Promise.resolve(
      succeed({
        modes: entry.modes,
        basis: {
          owner: current.owner,
          record: current.name,
          revision: current.revision,
          digest: current.digest,
        },
      }),
    )
  }
}

const INJECTS = [definitionMappingsKey, sessionKey, storageKey, tenantDomainLookupKey]

const plugin: Plugin.Object = {
  name: 'session-conditions',
  inject: INJECTS,
  async apply(ctx: Context) {
    await ctx.plugin(
      createSessionConditionsPlugin<unknown>({
        defaultModes: defaultModesOf(ctx[definitionMappingsKey]),
      }),
    )
  },
}

export const sessionConditionsRow = defineRow({
  row: 'session-conditions',
  implementation: 'real',
  manifest: { provides: [agentConditionsKey], injects: INJECTS, sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin,
})
