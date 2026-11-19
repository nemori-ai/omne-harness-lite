import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { ModalityRequirement } from '@omne-harness/model-contract'
import type { ModelProfiles } from '@omne-harness/model-contract/provider'

/** Whether this login may act for the tenant now; the application adapts it from identity. */
export interface ModelAccessPrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
}

export type ModelChoiceReader = Pick<ModelProfiles<Principal>, 'list'>

/** What a model is asked to take for it to count as selectable in the list. */
export type ModelAccessSettings = Readonly<{ required: ModalityRequirement }>
