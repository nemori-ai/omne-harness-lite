import { createHash } from 'node:crypto'
import { Service, type Context } from '@deepseek-ai/cordis'
import type { AgentDefinition, LoopExtensionDeclaration } from '@omne-harness/agent-contract'
import type { Access, TenantId } from '@omne-harness/legal-identity'
import type { Adoption, Modes, SavedModelSelection } from '@omne-harness/session-contract'

export type DefinitionAsker = Readonly<{
  tenant: TenantId
  turn?: Readonly<{ access: Access<unknown>; key: string }>
}>

export type DefinitionLookup =
  | Readonly<{ kind: 'found'; entry: DefinitionMappingEntry; side: AgentSide }>
  | Readonly<{ kind: 'absent'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** A definition as one tenant sees it: of the deployment, held by the tenant, or carried by the workspace of a turn. */
export interface DefinitionReading {
  named(asker: DefinitionAsker, name: string): Promise<DefinitionLookup>
  adopted(asker: DefinitionAsker, candidate: Adoption): Promise<DefinitionLookup>
  modesFor(name: string): Pick<DefinitionMappingEntry, 'name' | 'modes'> | undefined
}

export type AgentSide = Readonly<{
  definition: AgentDefinition
  extensions: readonly LoopExtensionDeclaration[]
}>

export type DefinitionMappingEntry = Readonly<{
  name: string
  candidate: Adoption
  execution: Adoption
  entryContract: Adoption
  requiredIdentities: readonly Readonly<{ capability: string; name: string }>[]
  modes: Modes
  initialModelSelection?: SavedModelSelection
  residentReferences?: readonly ResidentReference[]
}>

/** A capability a definition keeps resident, by the category it is registered under and its name. */
export type ResidentReference = Readonly<{ category: string; name: string }>

export interface DefinitionMappings {
  readonly identity: string
  entries(): readonly DefinitionMappingEntry[]
  byName(name: string): DefinitionMappingEntry | undefined
  byCandidate(candidate: Adoption): DefinitionMappingEntry | undefined
}

/**
 * The trusted service of the table. Only the producer provides it, and only the rows that the
 * assembly lists see it.
 *
 * @owner packages/access/server-entry
 */
export abstract class DefinitionMappingsService
  extends Service
  implements DefinitionMappings, DefinitionReading
{
  static readonly provide = 'definitionMappings'
  constructor(ctx: Context) {
    super(ctx, DefinitionMappingsService.provide)
  }
  abstract readonly identity: DefinitionMappings['identity']
  abstract entries(): readonly DefinitionMappingEntry[]
  abstract byName(name: string): DefinitionMappingEntry | undefined
  abstract byCandidate(candidate: Adoption): DefinitionMappingEntry | undefined
  abstract named(asker: DefinitionAsker, name: string): Promise<DefinitionLookup>
  abstract adopted(asker: DefinitionAsker, candidate: Adoption): Promise<DefinitionLookup>
  abstract modesFor(name: string): Pick<DefinitionMappingEntry, 'name' | 'modes'> | undefined
}
export const definitionMappingsKey = DefinitionMappingsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    definitionMappings: DefinitionMappingsService
  }
}

export function canonicalText(value: unknown): string {
  if (value === undefined || value === null) return 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalText).join(',')}]`
  if (typeof value === 'object') {
    const members = Object.entries(value as Record<string, unknown>)
      .filter(([, member]) => member !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, member]) => `${JSON.stringify(key)}:${canonicalText(member)}`)
    return `{${members.join(',')}}`
  }
  return JSON.stringify(value)
}

export function contentDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalText(value)).digest('hex')}`
}

const OWNER = '@omne-harness/server-entry'

export function modesAdoptionOf(entry: Pick<DefinitionMappingEntry, 'name' | 'modes'>): Adoption {
  return Object.freeze({
    owner: OWNER,
    name: `${entry.name}/modes`,
    revision: '1',
    digest: contentDigest(entry.modes),
  })
}

export type MappedDefinition = Readonly<{
  candidate: Adoption
  execution: Adoption
  entryContract: Adoption
  requiredIdentities: readonly Readonly<{ capability: string; name: string }>[]
  tenantDefaults: Adoption
  initialModelSelection?: SavedModelSelection
}>

function mappedOf(entry: DefinitionMappingEntry): MappedDefinition {
  return {
    candidate: entry.candidate,
    execution: entry.execution,
    entryContract: entry.entryContract,
    requiredIdentities: entry.requiredIdentities,
    tenantDefaults: modesAdoptionOf(entry),
    ...(entry.initialModelSelection === undefined
      ? {}
      : { initialModelSelection: entry.initialModelSelection }),
  }
}

export function definitionResolverOf(
  mappings: DefinitionMappings,
): (name: string) => MappedDefinition | undefined {
  return name => {
    const entry = mappings.byName(name)
    return entry === undefined ? undefined : mappedOf(entry)
  }
}

/** A definition by name as one asker sees it; `unavailable` while that cannot be read. */
export async function mappedDefinitionFor(
  reading: Pick<DefinitionReading, 'named'>,
  asker: DefinitionAsker,
  name: string,
): Promise<MappedDefinition | undefined | 'unavailable'> {
  const read = await reading.named(asker, name)
  if (read.kind === 'unavailable') return 'unavailable'
  return read.kind === 'found' ? mappedOf(read.entry) : undefined
}
