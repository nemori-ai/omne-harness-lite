// The definition name mapping of a deployment: the Cordis service definition and the table shape.
// The mapping is release-layer data. One producer parses it once and hands the same read-only table
// to every consumer, so each consumer sees one content identity. This member owns the shape and the
// key. It parses nothing and reads no configuration.
import { createHash } from 'node:crypto'
import { Service, type Context } from '@deepseek-ai/cordis'
import type { Adoption, Modes, SavedModelSelection } from '@omne-harness/session-contract'

/**
 * What one public definition name resolves into: the parts of a session creation that the public
 * message does not carry. `modes` are the explicit defaults of this definition. The first path reads
 * no tenant setting.
 */
export type DefinitionMappingEntry = Readonly<{
  name: string
  candidate: Adoption
  execution: Adoption
  entryContract: Adoption
  requiredIdentities: readonly Readonly<{ capability: string; name: string }>[]
  modes: Modes
  initialModelSelection?: SavedModelSelection
}>

/** The read-only table. `identity` marks the whole parsed table and does not depend on the tenant. */
export interface DefinitionMappings {
  readonly identity: string
  /** The same array on every call: two consumers of one table see one object. */
  entries(): readonly DefinitionMappingEntry[]
  byName(name: string): DefinitionMappingEntry | undefined
  /** The entry whose candidate is exactly this adoption (owner, name, revision and digest). */
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

/** The text of a plain value with sorted object keys. Members that are `undefined` are left out. */
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

/** The digest of the canonical text of a plain value. Equal content gives an equal digest. */
export function contentDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalText(value)).digest('hex')}`
}

const OWNER = '@omne-harness/server-entry'

/**
 * The adoption that stands for the modes of one entry. The public creation names it as the source of
 * the tenant default, and the evidence of the same table resolves it back. Its digest covers the
 * modes, so a change of a default also changes the creation material.
 */
export function modesAdoptionOf(entry: DefinitionMappingEntry): Adoption {
  return Object.freeze({
    owner: OWNER,
    name: `${entry.name}/modes`,
    revision: '1',
    digest: contentDigest(entry.modes),
  })
}

/** The shape that the server entry takes from a definition resolver (same fields, same meaning). */
export type MappedDefinition = Readonly<{
  candidate: Adoption
  execution: Adoption
  entryContract: Adoption
  requiredIdentities: readonly Readonly<{ capability: string; name: string }>[]
  tenantDefaults: Adoption
  initialModelSelection?: SavedModelSelection
}>

/** A resolver over one table. An unknown name gives `undefined`, never a default definition. */
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
