import { createHash } from 'node:crypto'
import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  Adoption,
  Modes,
  SavedModelSelection,
  SessionAdoptionPlanInput,
} from '@omne-harness/session-contract'

export type DefinitionMappingEntry = Readonly<{
  name: string
  candidate: Adoption
  execution: Adoption
  entryContract: Adoption
  requiredIdentities: readonly Readonly<{ capability: string; name: string }>[]
  modes: Modes
  initialModelSelection?: SavedModelSelection
  residentCapabilities?: SessionAdoptionPlanInput['capabilities']
}>

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
export abstract class DefinitionMappingsService extends Service implements DefinitionMappings {
  static readonly provide = 'definitionMappings'
  constructor(ctx: Context) {
    super(ctx, DefinitionMappingsService.provide)
  }
  abstract readonly identity: DefinitionMappings['identity']
  abstract entries(): readonly DefinitionMappingEntry[]
  abstract byName(name: string): DefinitionMappingEntry | undefined
  abstract byCandidate(candidate: Adoption): DefinitionMappingEntry | undefined
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

export function modesAdoptionOf(entry: DefinitionMappingEntry): Adoption {
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

export function definitionResolverOf(
  mappings: DefinitionMappings,
): (name: string) => MappedDefinition | undefined {
  return name => {
    const entry = mappings.byName(name)
    if (entry === undefined) return undefined
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
}
