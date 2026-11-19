import type { Adoption } from '@omne-harness/model-contract'
import type { ModelSendSource } from '@omne-harness/model/commands'
import { officialProfileAdoption, officialProfiles } from '@omne-harness/model-host-local'

export type OfficialProfilesInput = Readonly<{
  retryPolicy: Adoption
  compactionTriggerPercent: string
}>

export function officialSendSources(
  input: Readonly<{
    profiles: OfficialProfilesInput
    current: ModelSendSource<unknown>['current']
  }>,
): readonly ModelSendSource<unknown>[] {
  return officialProfiles(input.profiles).flatMap(definition => {
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
