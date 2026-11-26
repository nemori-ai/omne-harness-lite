import type { Adoption } from '@omne-harness/model-contract'
import type { ModelSendSource } from '@omne-harness/model/commands'
import { officialProfileAdoption, officialProfiles } from '@omne-harness/model-host-local'
import {
  OPENROUTER_DECISION_MODELS,
  decisionSupplierOf,
} from '@omne-harness/pi-ai-transport/decisions'

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

/** The send sources of the decision models: each is its one official supplier, and stands on no chat profile. */
export function decisionSendSources(
  current: ModelSendSource<unknown>['current'],
): readonly ModelSendSource<unknown>[] {
  return OPENROUTER_DECISION_MODELS.flatMap(name => {
    const known = decisionSupplierOf(name)
    if (known === undefined) return []
    const { adoption, provider, model } = known
    return [
      Object.freeze({
        profile: adoption,
        supplier: adoption,
        provider,
        model,
        official: true,
        current,
      }),
    ]
  })
}
