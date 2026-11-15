import { createHash } from 'node:crypto'
import type {
  DurableEvidence,
  ModelProfile,
  ModelProfileDefinition,
  ProfileScope,
} from '@omne-harness/model-contract'
import { decodeRevision } from '@omne-harness/model-contract'
import type {
  ModelProfileSnapshot,
  ModelProfileSource,
} from '@omne-harness/model-contract/provider'

const SOURCE_OWNER = '@omne-harness/model-host-local'
const SOURCE_RECORD = 'official-profiles'

const FACTORY: ProfileScope = Object.freeze({ kind: 'factory' })

export type OfficialProfileSourceInput = Readonly<{
  definitions: readonly ModelProfileDefinition[]
  updatedAt: string
}>

function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value)
    case 'number':
      if (!Number.isFinite(value)) throw new RangeError('a definition is not finite JSON')
      return JSON.stringify(value)
    case 'boolean':
      return value ? 'true' : 'false'
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item)).join(',')}]`
      const members = Object.getOwnPropertyNames(value)
        .toSorted()
        .map(key => `${JSON.stringify(key)}:${canonicalJson(Reflect.get(value, key))}`)
      return `{${members.join(',')}}`
    }
    default:
      throw new RangeError(`a definition holds a ${typeof value}, not JSON data`)
  }
}

function digestOf(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}

function profileOf(definition: ModelProfileDefinition, updatedAt: string): ModelProfile {
  const supplier = definition.suppliers[0]
  const route = supplier.model
  const { adoption } = supplier
  const revision = decodeRevision(adoption.revision)
  if ('failure' in revision)
    throw new RangeError(`the supplier adoption revision of ${route} is not a revision`)
  return Object.freeze({
    identity: Object.freeze({ scope: FACTORY, route }),
    adoption: Object.freeze({
      owner: adoption.owner,
      name: route,
      revision: adoption.revision,
      digest: digestOf(definition),
    }),
    revision: revision.ok,
    updatedAt,
    availability: 'active',
    definition,
  })
}

function sourceEvidence(updatedAt: string, profiles: readonly ModelProfile[]): DurableEvidence {
  return Object.freeze({
    owner: SOURCE_OWNER,
    record: SOURCE_RECORD,
    revision: updatedAt,
    digest: digestOf(profiles.map(profile => profile.adoption)),
  })
}

export function createOfficialProfileSource<P>(
  input: OfficialProfileSourceInput,
): ModelProfileSource<P> {
  const profiles: ModelProfile[] = []
  for (const definition of input.definitions) {
    const profile = profileOf(definition, input.updatedAt)
    if (profiles.some(existing => existing.identity.route === profile.identity.route))
      throw new RangeError(`two official profiles share the route ${profile.identity.route}`)
    profiles.push(profile)
  }
  const snapshot: ModelProfileSnapshot = Object.freeze({
    precedence: Object.freeze([FACTORY]),
    candidates: Object.freeze(
      profiles.map(profile =>
        Object.freeze({
          profile,
          excluded: false,
          locked: false,
          credential: 'unavailable' as const,
        }),
      ),
    ),
    source: sourceEvidence(input.updatedAt, profiles),
  })
  return { read: async () => ({ ok: snapshot }) }
}
