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
    // A request fixed before effort selection still names the previous profile content.
    // Its supplier and credential authority must match exactly as for a new request.
    const { reasoningEfforts, ...beforeEffortSelection } = definition
    const profiles = [officialProfileAdoption(definition)]
    if (reasoningEfforts !== undefined)
      profiles.push(officialProfileAdoption(beforeEffortSelection))
    return definition.suppliers.flatMap(supplier =>
      profiles.map((profile): ModelSendSource<unknown> =>
        Object.freeze({
          profile,
          supplier: supplier.adoption,
          provider: supplier.provider,
          model: supplier.model,
          official: true,
          current: input.current,
        }),
      ),
    )
  })
}
