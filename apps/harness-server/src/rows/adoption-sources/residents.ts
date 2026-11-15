import type { Context } from '@deepseek-ai/cordis'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  DurableEvidence,
  ResidentAdoption,
  SessionAccess,
  SessionFailure,
} from '@omne-harness/session-contract'
import type { ToolAuthority } from '@omne-harness/tool-contract/provider'
import {
  ToolBindingsService,
  ToolGenerationsService,
  toolBindingsKey,
  toolGenerationsKey,
} from '@omne-harness/tool-cordis-contract/cordis'
import { releaseOf, type ToolRelease } from '../../entry/tool-release.ts'
import { TOOL_RELEASE_FILE } from '../../entry/tool-release-manifest.ts'
import { createAdoptionPlanner, type AdoptionDefinition } from './planner.ts'

const OWNER = '@omne-harness/harness-server'

type Trusted = Extract<ToolRelease, { kind: 'trusted' }>
export type ResidentsAnswer = Outcome<ResidentAdoption, SessionFailure>

const unavailable = (diagnostic: string): ResidentsAnswer =>
  fail({ kind: 'unavailable', owner: OWNER, diagnostic: `resident tools: ${diagnostic}` })

export const NO_RESIDENTS: ResidentAdoption = Object.freeze({
  residents: Object.freeze([]),
  keys: Object.freeze([]),
})

export function releaseDefinitionOf(
  release: Trusted,
  capability: string,
): AdoptionDefinition | undefined {
  const entry = release.manifest.entries.find(candidate => candidate.asset.name === capability)
  if (entry === undefined) return undefined
  const { adoption } = entry.asset
  const authority: ToolAuthority = Object.freeze({
    layer: Object.freeze({ kind: 'official' as const }),
    asset: entry.asset,
    holding: entry.holding,
    publication: entry.publication,
  })
  const admitted: DurableEvidence = Object.freeze({
    owner: adoption.owner,
    record: `${TOOL_RELEASE_FILE}#${entry.asset.name}/asset`,
    revision: adoption.revision,
    digest: adoption.digest,
  })
  return Object.freeze({ authority, version: adoption.revision, admitted })
}

function current<T>(ctx: Context, key: string, kind: abstract new (...args: never[]) => T) {
  const service: unknown = ctx.get(key, false)
  return service instanceof kind ? service : undefined
}

export async function plannedResidents<P>(
  ctx: Context,
  capabilities: readonly string[],
  access: SessionAccess<P> | undefined,
): Promise<ResidentsAnswer> {
  if (capabilities.length === 0) return succeed(NO_RESIDENTS)
  if (access === undefined) return unavailable('the create carries no access to plan them with')
  const release = releaseOf(ctx)
  if (release.kind !== 'trusted') return unavailable(`tool release: ${release.diagnostic}`)
  const definitions = new Map<string, AdoptionDefinition>()
  for (const capability of capabilities) {
    const definition = releaseDefinitionOf(release, capability)
    if (definition === undefined)
      return unavailable(`${capability} is not a tool of the trusted release`)
    definitions.set(capability, definition)
  }
  if (current(ctx, toolBindingsKey, ToolBindingsService) === undefined)
    return unavailable('the tool binding registry (toolBindings) is absent')
  const planner = createAdoptionPlanner<P>({
    readBindings: () => current(ctx, toolBindingsKey, ToolBindingsService) as never,
    readGenerations: () => current(ctx, toolGenerationsKey, ToolGenerationsService) as never,
    definitionFor: capability => definitions.get(capability),
  })
  const planned = await planner.plan(access, { recorded: [], capabilities })
  if ('failure' in planned)
    return unavailable(
      `${capabilities.join(', ')} could not be planned: each needs exactly one live contribution ` +
        'readable to this tenant, or a first load that the tool generations coordinator admits',
    )
  const { material } = planned.ok
  const covered = new Set(material.keys.map(pair => pair.capability))
  const missing = capabilities.filter(capability => !covered.has(capability))
  if (missing.length > 0 || material.residents.length !== capabilities.length)
    return unavailable(`the plan left out ${missing.join(', ') || 'a first definition'}`)
  return succeed(material)
}
