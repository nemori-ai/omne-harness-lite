import { createHash } from 'node:crypto'
import type {
  Adoption,
  DurableEvidence,
  ModelProfile,
  ModelProfileDefinition,
  ProfileScope,
} from '@omne-harness/model-contract'
import { decodeRevision } from '@omne-harness/model-contract'
import type {
  ModelProfileSnapshot,
  ModelProfileSource,
  CredentialPort,
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

/** The adoption of an official profile: its supplier's owner and revision, named by route. */
export function officialProfileAdoption(definition: ModelProfileDefinition): Adoption {
  const { adoption, model } = definition.suppliers[0]
  return Object.freeze({
    owner: adoption.owner,
    name: model,
    revision: adoption.revision,
    digest: digestOf(definition),
  })
}

function profileOf(definition: ModelProfileDefinition, updatedAt: string): ModelProfile {
  const supplier = definition.suppliers[0]
  const route = supplier.model
  const revision = decodeRevision(supplier.adoption.revision)
  if ('failure' in revision)
    throw new RangeError(`the supplier adoption revision of ${route} is not a revision`)
  return Object.freeze({
    identity: Object.freeze({ scope: FACTORY, route }),
    adoption: officialProfileAdoption(definition),
    revision: revision.ok,
    updatedAt,
    availability: 'active',
    definition,
  })
}

function sourceEvidence(
  updatedAt: string,
  profiles: readonly ModelProfile[],
  credentials?: readonly (readonly [string, string])[],
): DurableEvidence {
  const digest = digestOf(
    credentials === undefined
      ? profiles.map(profile => profile.adoption)
      : { profiles: profiles.map(profile => profile.adoption), credentials },
  )
  return Object.freeze({
    owner: SOURCE_OWNER,
    record: SOURCE_RECORD,
    revision: credentials === undefined ? updatedAt : digest,
    digest,
  })
}

export function createOfficialProfileSource<P>(
  input: OfficialProfileSourceInput,
  readCredentials?: () => CredentialPort<P> | undefined,
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
  return {
    read: async access => {
      if (readCredentials === undefined) return { ok: snapshot }
      let port: CredentialPort<P> | undefined
      try {
        port = readCredentials()
      } catch {
        port = undefined
      }
      type State = ModelProfileSnapshot['candidates'][number]['credential']
      const states = new Map<string, State>()
      const candidates = Object.freeze(
        profiles.map(profile => {
          const provider = profile.definition.suppliers[0].provider
          let credential = states.get(provider)
          if (credential === undefined) {
            credential = 'unavailable'
            if (port !== undefined) {
              try {
                const layer = port.layerOf({ provider, official: true, access })
                if ('ok' in layer) credential = 'available'
                else
                  switch (layer.failure.kind) {
                    case 'missing':
                    case 'incomplete':
                    case 'revoked':
                      credential = 'missing'
                      break
                    case 'unreadable':
                      credential = 'unreadable'
                      break
                    case 'denied':
                    case 'unavailable':
                      break
                  }
              } catch {
                credential = 'unavailable'
              }
            }
            states.set(provider, credential)
          }
          return Object.freeze({ profile, excluded: false, locked: false, credential })
        }),
      )
      return {
        ok: Object.freeze({
          precedence: snapshot.precedence,
          candidates,
          source: sourceEvidence(
            input.updatedAt,
            profiles,
            candidates.map(candidate => [candidate.profile.identity.route, candidate.credential]),
          ),
        }),
      }
    },
  }
}
