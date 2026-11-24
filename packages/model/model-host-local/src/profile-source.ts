import { createHash } from 'node:crypto'
import type {
  Adoption,
  DurableEvidence,
  ModelProfile,
  ModelProfileDefinition,
  ProfileScope,
  ProviderName,
} from '@omne-harness/model-contract'
import { decodeRevision } from '@omne-harness/model-contract'
import type { Access } from '@omne-harness/legal-identity'
import type { ProviderPreferences } from '@omne-harness/model-contract/provider-asset'
import type {
  ModelPreferencesPort,
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
  credentials?: readonly (readonly string[])[],
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

type CredentialState = ModelProfileSnapshot['candidates'][number]['credential']
type Preferences = ReadonlyMap<ProviderName, ProviderPreferences>

const PREFERENCES_UNAVAILABLE = Object.freeze({
  failure: {
    kind: 'unavailable' as const,
    dependency: 'model-preferences',
    diagnostic: 'unreadable',
  },
})

function credentialOf<P>(
  port: CredentialPort<P> | undefined,
  provider: ProviderName,
  access: Access<P>,
): CredentialState {
  if (port === undefined) return 'unavailable'
  try {
    const layer = port.layerOf({ provider, official: true, access })
    if ('ok' in layer) return 'available'
    switch (layer.failure.kind) {
      case 'missing':
      case 'incomplete':
      case 'revoked':
        return 'missing'
      case 'unreadable':
        return 'unreadable'
      case 'denied':
      case 'unavailable':
        return 'unavailable'
    }
  } catch {
    return 'unavailable'
  }
}

function credentialsOf<P>(
  readCredentials: (() => CredentialPort<P> | undefined) | undefined,
  providers: readonly ProviderName[],
  access: Access<P>,
): ReadonlyMap<ProviderName, CredentialState> | undefined {
  if (readCredentials === undefined) return undefined
  let port: CredentialPort<P> | undefined
  try {
    port = readCredentials()
  } catch {
    port = undefined
  }
  return new Map(providers.map(provider => [provider, credentialOf(port, provider, access)]))
}

/** Each provider's preferences, read once; undefined when the tree has none, null when unreadable. */
async function preferencesOf<P>(
  readPreferences: (() => ModelPreferencesPort<P> | undefined) | undefined,
  providers: readonly ProviderName[],
  access: Access<P>,
): Promise<Preferences | undefined | null> {
  if (readPreferences === undefined) return undefined
  const port = readPreferences()
  if (port === undefined) return undefined
  const read = new Map<ProviderName, ProviderPreferences>()
  for (const provider of providers) {
    try {
      const answer = await port.read({ provider, access })
      if (!('ok' in answer)) return null
      read.set(provider, answer.ok)
    } catch {
      return null
    }
  }
  return read
}

export function createOfficialProfileSource<P>(
  input: OfficialProfileSourceInput,
  readCredentials?: () => CredentialPort<P> | undefined,
  readPreferences?: () => ModelPreferencesPort<P> | undefined,
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
  const providers = [...new Set(profiles.map(supplierOf))]
  return {
    read: async access => {
      const preferences = await preferencesOf(readPreferences, providers, access)
      if (preferences === null) return PREFERENCES_UNAVAILABLE
      const credentials = credentialsOf(readCredentials, providers, access)
      if (credentials === undefined && preferences === undefined) return { ok: snapshot }
      const candidates = Object.freeze(
        profiles.map(profile => {
          const provider = supplierOf(profile)
          const route = profile.identity.route
          const chosen = preferences?.get(provider)
          const effort = chosen?.efforts.get(route)
          return Object.freeze({
            profile,
            excluded: chosen === undefined ? false : !chosen.enabled.has(route),
            locked: false,
            credential: credentials?.get(provider) ?? 'unavailable',
            ...(effort === undefined ? {} : { defaultReasoningEffort: effort }),
          })
        }),
      )
      return {
        ok: Object.freeze({
          precedence: snapshot.precedence,
          candidates,
          source: sourceEvidence(
            input.updatedAt,
            profiles,
            candidates.map(candidate =>
              preferences === undefined
                ? [candidate.profile.identity.route, candidate.credential]
                : [
                    candidate.profile.identity.route,
                    candidate.credential,
                    candidate.excluded ? 'off' : 'on',
                    candidate.defaultReasoningEffort ?? '',
                  ],
            ),
          ),
        }),
      }
    },
  }
}

function supplierOf(profile: ModelProfile): ProviderName {
  return profile.definition.suppliers[0].provider
}
