import type { Context } from '@deepseek-ai/cordis'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { createHash } from 'node:crypto'
import { capabilityId } from '@omne-harness/assets'
import type { TenantId } from '@omne-harness/legal-identity'
import { MCP_SOURCE_PREFIX } from '@omne-harness/mcp-bridge'
import { mcpEndpointGates } from '@omne-harness/mcp-contract'
import { residentToolFacts } from '@omne-harness/tool-contract'
import type {
  DurableEvidence,
  FreezeVerdict,
  ResidentAdoption,
  ResidentSegment,
  ResidentTool,
  SessionAccess,
  SessionFailure,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { residentSkillLine, residentSkillsText } from '@omne-harness/skill'
import { skillBodyContract } from '@omne-harness/skill-contract'
import {
  sameBindingKey,
  shapeOf,
  type ToolAuthority,
  type ToolBindingKey,
  type ToolSourceEntry,
} from '@omne-harness/tool-contract/provider'
import {
  ToolBindingsService,
  ToolGenerationsService,
  toolBindingsKey,
  toolGenerationsKey,
} from '@omne-harness/tool-cordis-contract/cordis'
import { releaseOf, type ToolRelease } from '../../entry/tool-release.ts'
import { TOOL_RELEASE_FILE } from '../../entry/tool-release-manifest.ts'
import type { ResidentReference } from '../agent-adoptions/definition-mappings.ts'
import { TOOL_CATEGORY } from '../agent-adoptions/table.ts'
import { ResidentEndpointsService, residentEndpointsKey } from '../mcp/resident-endpoints.ts'
import { SessionSkillsService, sessionSkillsKey } from '../skills/session-skills.ts'
import { candidateOfRevision } from '../tenant-assets/layers.ts'
import type { Turn } from '../tenant-assets/turn.ts'
import { currentHeldTool } from '../tool-host/held-current.ts'
import { HELD_TOOL_OWNER, heldToolAuthority } from '../tool-host/held-tools.ts'
import { createAdoptionPlanner, type AdoptionDefinition } from './planner.ts'

const OWNER = '@omne-harness/harness-server'

type Trusted = Extract<ToolRelease, { kind: 'trusted' }>
export type PlannedResidents = ResidentAdoption & Readonly<{ verdict?: FreezeVerdict }>
export type ResidentsAnswer = Outcome<PlannedResidents, SessionFailure>

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

/** The tool the tenant of the session holds in force under a name, loaded; a text says why there is none to plan. */
async function heldDefinitionOf<P>(
  ctx: Context,
  access: SessionAccess<P>,
  capability: string,
  turn: Turn | null,
): Promise<AdoptionDefinition | string> {
  const held = await currentHeldTool(ctx, access, capability, turn)
  if (held.kind === 'unavailable') return held.diagnostic
  if (held.kind === 'unfit') return held.reason
  if (held.kind === 'none')
    return `${capability} is not a tool of the trusted release, nor one this tenant holds in force`
  const { authority } = held
  return Object.freeze({
    authority,
    version: authority.asset.adoption.digest,
    admitted: authority.holding,
  })
}

function current<T>(ctx: Context, key: string, kind: abstract new (...args: never[]) => T) {
  const service: unknown = ctx.get(key, false)
  return service instanceof kind ? service : undefined
}

/** Says why a resident a definition names is left out of the session: it is not held, or cannot be read now. */
export type ResidentReport = (reason: string) => void

export type KeptResidents = Pick<WorkSnapshot, 'residents' | 'segments' | 'residentKeys'>

const NOTHING_KEPT: KeptResidents = Object.freeze({ residents: [], segments: [], residentKeys: [] })

const namesOf = (references: readonly ResidentReference[], category: string) =>
  references.filter(reference => reference.category === category).map(({ name }) => name)

/** The authority a recorded version loads under: the release entry when it is that very version, or the tenant's holding of it. */
function authorityOf(release: Trusted, key: ToolBindingKey): ToolAuthority | undefined {
  const named =
    key.layer.kind === 'official'
      ? releaseDefinitionOf(release, key.asset.name)?.authority
      : key.layer.kind === 'tenant' && key.asset.adoption.owner === HELD_TOOL_OWNER
        ? heldToolAuthority(
            key.layer.tenant,
            key.asset.name,
            candidateOfRevision(key.asset.adoption.revision, key.asset.adoption.digest),
          )
        : undefined
  return named !== undefined && sameBindingKey({ layer: named.layer, asset: named.asset }, key)
    ? named
    : undefined
}

type RecordedTool = Readonly<{ capability: string; key: string; shape: ResidentTool['shape'] }>

/** The tools a session keeps by its registry keys, as the planner judges them again; source entries have no key. */
function recordedTools(kept: KeptResidents): readonly RecordedTool[] {
  const keys = new Map((kept.residentKeys ?? []).map(pair => [pair.capability, pair.key]))
  return kept.residents.flatMap(resident => {
    const key = keys.get(resident.capability)
    return resident.definition !== undefined || key === undefined
      ? []
      : [{ capability: resident.capability, key, shape: resident.shape }]
  })
}

/** Each one as it stands now, so a newer version can win; a kept one not to be read now is judged without it. */
async function definitionsOf<P>(
  ctx: Context,
  release: Trusted,
  access: SessionAccess<P>,
  turn: Turn | null,
  capabilities: readonly string[],
  recorded: readonly RecordedTool[],
): Promise<Map<string, AdoptionDefinition> | string> {
  const load = async (capability: string) =>
    releaseDefinitionOf(release, capability) ?? heldDefinitionOf(ctx, access, capability, turn)
  const definitions = new Map<string, AdoptionDefinition>()
  for (const capability of capabilities) {
    const definition = await load(capability)
    if (typeof definition === 'string') return definition
    definitions.set(capability, definition)
  }
  for (const { capability } of recorded) {
    const definition = await load(capability)
    if (typeof definition !== 'string') definitions.set(capability, definition)
  }
  return definitions
}

async function plannedTools<P>(
  ctx: Context,
  capabilities: readonly string[],
  access: SessionAccess<P> | undefined,
  turn: Turn | null,
  recorded: readonly RecordedTool[] = [],
): Promise<ResidentsAnswer> {
  if (capabilities.length === 0 && recorded.length === 0) return succeed(NO_RESIDENTS)
  if (access === undefined) return unavailable('the create carries no access to plan them with')
  const release = releaseOf(ctx)
  if (release.kind !== 'trusted') return unavailable(`tool release: ${release.diagnostic}`)
  const definitions = await definitionsOf(ctx, release, access, turn, capabilities, recorded)
  if (typeof definitions === 'string') return unavailable(definitions)
  if (current(ctx, toolBindingsKey, ToolBindingsService) === undefined)
    return unavailable('the tool binding registry (toolBindings) is absent')
  const planner = createAdoptionPlanner<P>({
    readBindings: () => current(ctx, toolBindingsKey, ToolBindingsService) as never,
    readGenerations: () => current(ctx, toolGenerationsKey, ToolGenerationsService) as never,
    definitionFor: capability => definitions.get(capability),
    authorityOf: key => authorityOf(release, key),
  })
  const planned = await planner.plan(access, { recorded, capabilities })
  const all = [...recorded.map(item => item.capability), ...capabilities]
  if ('failure' in planned)
    return unavailable(
      `${all.join(', ')} could not be planned: each needs exactly one live contribution ` +
        'readable to this tenant, or a first load that the tool generations coordinator admits',
    )
  const { material, verdict } = planned.ok
  if (verdict !== null) return succeed({ ...material, verdict })
  const covered = new Set(material.keys.map(pair => pair.capability))
  const missing = all.filter(capability => !covered.has(capability))
  if (missing.length > 0 || material.residents.length !== capabilities.length)
    return unavailable(`the plan left out ${missing.join(', ') || 'a first definition'}`)
  return succeed(material)
}

const SKILLS_SEGMENT = 'skills'
const SKILL_CATEGORY = skillBodyContract().category

const lineDigest = (line: string) => `sha256:${createHash('sha256').update(line).digest('hex')}`

async function skillsSegment<P>(
  ctx: Context,
  names: readonly string[],
  access: SessionAccess<P> | undefined,
  kept: ResidentSegment | undefined,
  report: ResidentReport,
): Promise<ResidentSegment | undefined> {
  const had = new Set((kept?.sources ?? []).map(source => source.name))
  const wanted = names.filter(name => !had.has(name))
  if (wanted.length === 0) return undefined
  const skills = current(ctx, sessionSkillsKey, SessionSkillsService)
  if (skills === undefined || access === undefined) {
    report(`resident skills ${wanted.join(', ')}: the Skill catalog cannot be read now`)
    return undefined
  }
  const ids = wanted.flatMap(name => {
    const id = capabilityId(SKILL_CATEGORY, name)
    return id.ok ? [id.id] : []
  })
  const read = await skills.summaries(access.tenant, ids)
  if (!('ok' in read)) {
    report(`resident skills ${wanted.join(', ')}: the Skill catalog cannot be read now`)
    return undefined
  }
  const byName = new Map(read.ok.map(entry => [String(entry.name), entry]))
  const entries = wanted.flatMap(name => {
    const entry = byName.get(name)
    if (entry === undefined) report(`resident skill ${name}: this tenant does not hold it`)
    return entry === undefined ? [] : [entry]
  })
  if (entries.length === 0) return undefined
  const lines = entries.map(residentSkillLine)
  return {
    key: SKILLS_SEGMENT,
    text: kept === undefined ? residentSkillsText(entries) : [kept.text, ...lines].join('\n'),
    sources: [
      ...(kept?.sources ?? []),
      ...entries.map((entry, at) => ({
        category: SKILL_CATEGORY,
        name: String(entry.name),
        digest: lineDigest(lines[at] ?? ''),
      })),
    ],
  }
}

const ENDPOINT_CATEGORY = mcpEndpointGates.category

function sourcedResident(entry: ToolSourceEntry, tenant: TenantId): ResidentTool | string {
  const { definition } = entry
  const key = {
    layer: { kind: 'tenant' as const, tenant },
    asset: { name: definition.name, adoption: definition.adoption },
  }
  const facts = residentToolFacts(key, shapeOf(definition))
  if ('failure' in facts) return `its definition makes no resident shape (${facts.failure.field})`
  return {
    capability: definition.name,
    version: definition.adoption.digest,
    shape: facts.ok.shape,
    admitted: {
      owner: definition.adoption.owner,
      record: `${ENDPOINT_CATEGORY}/${entry.capability.name}`,
      revision: definition.adoption.revision,
      digest: definition.adoption.digest,
    },
    definition: { kind: 'string', value: JSON.stringify(definition) },
  }
}

async function plannedEndpoints<P>(
  ctx: Context,
  names: readonly string[],
  access: SessionAccess<P> | undefined,
  kept: ReadonlySet<string>,
  report: ResidentReport,
): Promise<readonly ResidentTool[]> {
  const endpoints = current(ctx, residentEndpointsKey, ResidentEndpointsService)
  const out: ResidentTool[] = []
  for (const name of names) {
    const tool = `${MCP_SOURCE_PREFIX}${name}`
    if (kept.has(tool)) continue
    const said = (why: string) => report(`resident mcp endpoint ${name}: ${why}`)
    if (endpoints === undefined || access === undefined) {
      said('the MCP endpoints cannot be read now')
      continue
    }
    const found = await endpoints.named(access as SessionAccess<unknown>, tool)
    if (found.kind === 'absent') said('this tenant does not hold it')
    else if (found.kind === 'unreadable') said(`it cannot be read now (${found.reason})`)
    else if (found.kind === 'withheld') said(`it is withheld (${found.reason})`)
    else {
      const resident = sourcedResident(found.entry, access.tenant)
      if (typeof resident === 'string') said(resident)
      else out.push(resident)
    }
  }
  return out
}

/** What a session adopts as resident from the references of its definition, over what it already keeps. */
export async function plannedResidents<P>(
  ctx: Context,
  references: readonly ResidentReference[],
  access: SessionAccess<P> | undefined,
  report: ResidentReport,
  turn: Turn | null = null,
  kept: KeptResidents = NOTHING_KEPT,
): Promise<ResidentsAnswer> {
  const keptTools = new Set(kept.residents.map(resident => resident.capability))
  const tools = await plannedTools(
    ctx,
    namesOf(references, TOOL_CATEGORY).filter(name => !keptTools.has(name)),
    access,
    turn,
    recordedTools(kept),
  )
  if ('failure' in tools) return tools
  if (tools.ok.verdict !== undefined) return tools
  const endpoints = await plannedEndpoints(
    ctx,
    namesOf(references, ENDPOINT_CATEGORY),
    access,
    keptTools,
    report,
  )
  const segment = await skillsSegment(
    ctx,
    namesOf(references, SKILL_CATEGORY),
    access,
    kept.segments?.find(item => item.key === SKILLS_SEGMENT),
    report,
  )
  const judged = new Set(tools.ok.keys.map(pair => pair.capability))
  return succeed({
    residents: [...tools.ok.residents, ...endpoints],
    keys: [
      ...(kept.residentKeys ?? []).filter(pair => !judged.has(pair.capability)),
      ...tools.ok.keys,
    ],
    ...(segment === undefined ? {} : { segments: [segment] }),
  })
}
