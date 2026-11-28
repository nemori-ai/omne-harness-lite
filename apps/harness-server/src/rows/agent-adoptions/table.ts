import type { AgentDefinition, AgentDefinitionListing } from '@omne-harness/agent-contract'
import {
  definitionListing,
  judgeAgentDefinition,
  judgeLoopExtensions,
} from '@omne-harness/agent-contract'
import {
  canonicalText,
  contentDigest,
  type AgentSide,
  type DefinitionMappingEntry,
  type DefinitionMappings,
  type ResidentReference,
} from './definition-mappings.ts'
import { mcpEndpointGates } from '@omne-harness/mcp-contract'
import { skillBodyContract } from '@omne-harness/skill-contract'
import type { Adoption } from '@omne-harness/session-contract'
import type { AgentAdoptionsConfig } from './config.ts'

export type MappingTable = Readonly<{
  mappings: DefinitionMappings
  /** What the catalog says about each definition of the table, in the order of the table. */
  listings: readonly AgentDefinitionListing[]
  agentSide(candidate: Adoption): AgentSide | undefined
}>

const candidateKey = (candidate: Adoption): string => canonicalText(candidate)

/** The category of a tool, as a reference of a definition writes it: the name the tool category is registered under. */
export const TOOL_CATEGORY = 'tool'

/** The categories a definition can keep resident: a tool, a Skill, an MCP endpoint. */
export const RESIDENT_CATEGORIES: readonly string[] = Object.freeze([
  TOOL_CATEGORY,
  skillBodyContract().category,
  mcpEndpointGates.category,
])

/** What a definition keeps resident, in its own order; a resident reference of another category plans nothing. */
export function residentReferencesOf(definition: AgentDefinition): readonly ResidentReference[] {
  return Object.freeze(
    definition.references
      .filter(
        reference =>
          reference.resident === true &&
          RESIDENT_CATEGORIES.includes(reference.capability.category),
      )
      .map(({ capability }) =>
        Object.freeze({ category: capability.category, name: capability.name }),
      ),
  )
}

function officialResidentsOf(
  definition: AgentDefinition,
  at: string,
): readonly ResidentReference[] {
  for (const [index, reference] of definition.references.entries())
    if (reference.resident === true && !RESIDENT_CATEGORIES.includes(reference.capability.category))
      throw new Error(
        `${at}.definition.references.${index}: a resident reference names a tool, a skill or an mcp endpoint`,
      )
  return residentReferencesOf(definition)
}

export async function buildTable(config: AgentAdoptionsConfig): Promise<MappingTable> {
  const entries: DefinitionMappingEntry[] = []
  const listings: AgentDefinitionListing[] = []
  const agentSides = new Map<string, AgentSide>()
  for (const [index, item] of config.mappings.entries()) {
    const at = `mappings.${index}`
    const definition = await judgeAgentDefinition(item.definition)
    if (definition.kind === 'refused')
      throw new Error(`${at}.definition: refused (${definition.reason})`)
    if (definition.value.name !== item.name)
      throw new Error(`${at}.definition.name: must equal the definition name "${item.name}"`)
    const residents = officialResidentsOf(definition.value, at)
    const extensions = await judgeLoopExtensions(item.extensions)
    if (extensions.kind === 'refused')
      throw new Error(`${at}.extensions.${extensions.index}: refused (${extensions.reason})`)
    entries.push(
      Object.freeze({
        name: item.name,
        candidate: Object.freeze(item.candidate),
        execution: Object.freeze(item.execution),
        entryContract: Object.freeze(item.entryContract),
        requiredIdentities: Object.freeze(item.requiredIdentities),
        modes: Object.freeze(item.modes),
        ...(item.initialModelSelection === undefined
          ? {}
          : { initialModelSelection: Object.freeze(item.initialModelSelection) }),
        ...(residents.length === 0 ? {} : { residentReferences: residents }),
      }),
    )
    listings.push(definitionListing(definition.value))
    agentSides.set(candidateKey(item.candidate), {
      definition: definition.value,
      extensions: extensions.value,
    })
  }
  const frozen = Object.freeze(entries)
  const byName = new Map(frozen.map(item => [item.name, item]))
  const byCandidate = new Map(frozen.map(item => [candidateKey(item.candidate), item]))
  const mappings: DefinitionMappings = Object.freeze({
    identity: contentDigest({ mappings: config.mappings }),
    entries: () => frozen,
    byName: (name: string) => byName.get(name),
    byCandidate: (candidate: Adoption) => byCandidate.get(candidateKey(candidate)),
  })
  return Object.freeze({
    mappings,
    listings: Object.freeze(listings),
    agentSide: (candidate: Adoption) => agentSides.get(candidateKey(candidate)),
  })
}
