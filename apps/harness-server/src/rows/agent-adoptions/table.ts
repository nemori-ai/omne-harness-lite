import type { AgentDefinition, LoopExtensionDeclaration } from '@omne-harness/agent-contract'
import { judgeAgentDefinition, judgeLoopExtensions } from '@omne-harness/agent-contract'
import {
  canonicalText,
  contentDigest,
  type DefinitionMappingEntry,
  type DefinitionMappings,
} from '@omne-harness/server-entry/cordis'
import type { Adoption } from '@omne-harness/session-contract'
import type { AgentAdoptionsConfig } from './config.ts'

export type AgentSide = Readonly<{
  definition: AgentDefinition
  extensions: readonly LoopExtensionDeclaration[]
}>

export type MappingTable = Readonly<{
  mappings: DefinitionMappings
  agentSide(candidate: Adoption): AgentSide | undefined
}>

const candidateKey = (candidate: Adoption): string => canonicalText(candidate)

const TOOL_CATEGORY = 'Tool'

function residentCapabilitiesOf(definition: AgentDefinition, at: string): readonly string[] {
  const names: string[] = []
  for (const [index, reference] of definition.references.entries()) {
    if (reference.resident !== true) continue
    if (reference.capability.category !== TOOL_CATEGORY)
      throw new Error(
        `${at}.definition.references.${index}: a resident reference must name a ${TOOL_CATEGORY}`,
      )
    names.push(reference.capability.name)
  }
  return Object.freeze(names)
}

export async function buildTable(config: AgentAdoptionsConfig): Promise<MappingTable> {
  const entries: DefinitionMappingEntry[] = []
  const agentSides = new Map<string, AgentSide>()
  for (const [index, item] of config.mappings.entries()) {
    const at = `mappings.${index}`
    const definition = await judgeAgentDefinition(item.definition)
    if (definition.kind === 'refused')
      throw new Error(`${at}.definition: refused (${definition.reason})`)
    if (definition.value.name !== item.name)
      throw new Error(`${at}.definition.name: must equal the definition name "${item.name}"`)
    const residents = residentCapabilitiesOf(definition.value, at)
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
        ...(residents.length === 0 ? {} : { residentCapabilities: residents }),
      }),
    )
    agentSides.set(candidateKey(item.candidate), {
      definition: definition.value,
      extensions: extensions.value,
    })
  }
  const frozen = Object.freeze(entries)
  const byName = new Map(frozen.map(item => [item.name, item]))
  const byCandidate = new Map(frozen.map(item => [candidateKey(item.candidate), item]))
  const mappings: DefinitionMappings = Object.freeze({
    identity: contentDigest(config),
    entries: () => frozen,
    byName: (name: string) => byName.get(name),
    byCandidate: (candidate: Adoption) => byCandidate.get(candidateKey(candidate)),
  })
  return Object.freeze({
    mappings,
    agentSide: (candidate: Adoption) => agentSides.get(candidateKey(candidate)),
  })
}
