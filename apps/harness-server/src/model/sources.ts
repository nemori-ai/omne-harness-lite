// The profile adoption rule below copies model-host-local `profile-source.ts`, which does not export
// it; `tests/model/sources.spec.ts` guards the copy against the real `ModelProfilesLocalPlugin`.
import { createHash } from 'node:crypto'
import type { Adoption, ModelProfileDefinition } from '@omne-harness/model-contract'
import type { ModelSendSource } from '@omne-harness/model/commands'
import { officialOpenAiProfiles } from '@omne-harness/pi-ai-openai'

export type OfficialProfilesInput = Readonly<{
  retryPolicy: Adoption
  compactionTriggerPercent: string
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
