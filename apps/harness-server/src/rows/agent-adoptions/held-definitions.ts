import { judgeAgentDefinition, type AgentDefinition } from '@omne-harness/agent-contract'
import {
  capabilityId,
  collectCandidates,
  evaluate,
  type Candidate,
  type JsonValue,
} from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import type { Adoption } from '@omne-harness/session-contract'
import {
  candidateOfRevision,
  inWorkspace,
  revisionOf,
  type AssetLayers,
} from '../tenant-assets/layers.ts'
import type { CustomDefaults } from './config.ts'
import type {
  DefinitionAsker,
  DefinitionLookup,
  DefinitionMappingEntry,
  DefinitionMappings,
  DefinitionReading,
} from './definition-mappings.ts'
import { residentReferencesOf, type MappingTable } from './table.ts'

export const DEFINITION_CATEGORY = 'AgentDefinition'

/** The owner of the candidate of a definition that a tenant holds or a workspace carries. */
export const HELD_DEFINITION_OWNER = '@omne-harness/assets'

export type DefinitionReadingInput = Readonly<{
  table: MappingTable
  custom: CustomDefaults | undefined
  /** The layers of the asker for the definition category; undefined while they cannot be read. */
  layers(asker: DefinitionAsker): Promise<AssetLayers | undefined>
}>

const absent = (reason: string): DefinitionLookup => ({ kind: 'absent', reason })
const unavailable = (diagnostic: string): DefinitionLookup => ({ kind: 'unavailable', diagnostic })

function candidateOf(name: string, held: Candidate): Adoption {
  return Object.freeze({
    owner: HELD_DEFINITION_OWNER,
    name,
    revision: revisionOf(held),
    digest: held.version,
  })
}

const heldOf = (candidate: Adoption): Candidate =>
  candidateOfRevision(candidate.revision, candidate.digest)

/** The definition a body writes, as a tenant or a workspace may bring one; a text says why it is not used. */
export async function writtenDefinitionOf(body: JsonValue): Promise<AgentDefinition | string> {
  const { manifest: _manifest, ...fields } = JSON.parse(writeJsonText(body)) as Record<
    string,
    unknown
  >
  const judged = await judgeAgentDefinition({ category: DEFINITION_CATEGORY, ...fields })
  if (judged.kind === 'refused') return `its body is refused (${judged.reason})`
  return judged.value.type === 'non-master'
    ? judged.value
    : 'it is a master: only the deployment brings a master'
}

export function createDefinitionReading(input: DefinitionReadingInput): DefinitionReading {
  const { table, custom } = input

  async function found(
    layers: AssetLayers,
    name: string,
    held: Candidate,
  ): Promise<DefinitionLookup> {
    const body = await layers.body(held)
    if (body === undefined) return unavailable(`the definition ${name} is held and cannot be read`)
    const definition = await writtenDefinitionOf(body)
    if (typeof definition === 'string')
      return absent(`the definition ${name} is not used: ${definition}`)
    if (definition.name !== name)
      return absent(`the definition ${name} is not used: its body names ${definition.name}`)
    if (custom === undefined)
      return unavailable(
        'the deployment gives no agent-adoptions.custom: how a definition of a tenant runs is not configured',
      )
    const residents = residentReferencesOf(definition)
    const entry: DefinitionMappingEntry = Object.freeze({
      name,
      candidate: candidateOf(name, held),
      execution: custom.execution,
      entryContract: custom.entryContract,
      requiredIdentities: custom.requiredIdentities,
      modes: custom.modes,
      ...(custom.initialModelSelection === undefined
        ? {}
        : { initialModelSelection: custom.initialModelSelection }),
      ...(residents.length === 0 ? {} : { residentReferences: residents }),
    })
    return { kind: 'found', entry, side: { definition, extensions: [] } }
  }

  return {
    modesFor: name =>
      table.mappings.byName(name) ??
      (custom === undefined ? undefined : { name, modes: custom.modes }),
    async named(asker, name) {
      const official = table.mappings.byName(name)
      if (official !== undefined) return officialOf(table, official)
      const capability = capabilityId(DEFINITION_CATEGORY, name)
      if (!capability.ok) return absent('a definition has a name')
      const layers = await input.layers(asker)
      if (layers === undefined) return unavailable('the assets of the tenant cannot be read')
      const answer = evaluate({
        layers: await collectCandidates(layers.sources, capability.id),
        eligible: () => 'yes',
      })
      if (answer.kind === 'unavailable')
        return unavailable(`the ${answer.layer} layer cannot be read`)
      if (answer.kind === 'none') return absent(`no definition is named ${name}`)
      return found(layers, name, answer.candidate)
    },
    async adopted(asker, candidate) {
      const official = table.mappings.byCandidate(candidate)
      if (official !== undefined) return officialOf(table, official)
      if (candidate.owner !== HELD_DEFINITION_OWNER)
        return absent('the candidate is not a definition adoption of this deployment')
      if (inWorkspace(candidate.revision) && asker.turn === undefined)
        return unavailable('a definition of a workspace is read in the turn that adopted it')
      const layers = await input.layers(asker)
      if (layers === undefined) return unavailable('the assets of the tenant cannot be read')
      return found(layers, candidate.name, heldOf(candidate))
    },
  }
}

/** The reading of a deployment that keeps no assets of tenants: the table alone. */
export const tableReading = (table: MappingTable): DefinitionReading =>
  createDefinitionReading({ table, custom: undefined, layers: async () => undefined })

/** The table with the reading over it alone: what a deployment without tenant assets gives. */
export const tableMappings = (table: MappingTable): DefinitionMappings & DefinitionReading => ({
  ...table.mappings,
  ...tableReading(table),
})

function officialOf(table: MappingTable, entry: DefinitionMappingEntry): DefinitionLookup {
  const side = table.agentSide(entry.candidate)
  return side === undefined
    ? unavailable(`the definition ${entry.name} of the deployment has no agent side`)
    : { kind: 'found', entry, side }
}
