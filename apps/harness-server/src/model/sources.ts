// The trusted send sources of the `model-records` row (R2-D30, facts a.4): one per supplier of an
// official OpenAI profile. Every source is official, so a send may use the official credential
// layer of its provider; the layer itself is fixed by request preparation. A source names the profile adoption and the
// supplier the way the `model-profiles` row publishes them, so the coordinator can match a request
// to its source. The profile adoption of the official source is the supplier adoption's owner and
// revision, the route as the name, and the digest of the canonical JSON of the definition
// (model-host-local `profile-source.ts`). That rule is not exported by the member; the copy below
// is guarded by `tests/model/sources.spec.ts` against the real `ModelProfilesLocalPlugin`.
import { createHash } from 'node:crypto'
import type { Adoption, ModelProfileDefinition } from '@omne-harness/model-contract'
import type { ModelSendSource } from '@omne-harness/model/commands'
import { officialOpenAiProfiles } from '@omne-harness/pi-ai-openai'

export type OfficialProfilesInput = Readonly<{
  retryPolicy: Adoption
  compactionTriggerPercent: string
}>

/** Canonical JSON: no white space, object keys sorted by UTF-16 code units. */
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

/** The adoption the official profile source gives a definition. */
export function officialProfileAdoption(definition: ModelProfileDefinition): Adoption {
  const supplier = definition.suppliers[0]
  return Object.freeze({
    owner: supplier.adoption.owner,
    name: supplier.model,
    revision: supplier.adoption.revision,
    digest: createHash('sha256').update(canonicalJson(definition), 'utf8').digest('hex'),
  })
}

export function officialSendSources(
  input: Readonly<{
    profiles: OfficialProfilesInput
    current: ModelSendSource<unknown>['current']
  }>,
): readonly ModelSendSource<unknown>[] {
  return officialOpenAiProfiles(input.profiles).flatMap(definition => {
    const profile = officialProfileAdoption(definition)
    return definition.suppliers.map((supplier): ModelSendSource<unknown> =>
      Object.freeze({
        profile,
        supplier: supplier.adoption,
        provider: supplier.provider,
        model: supplier.model,
        official: true,
        current: input.current,
      }),
    )
  })
}
