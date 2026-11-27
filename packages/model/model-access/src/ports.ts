import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type {
  ModalityRequirement,
  ModelFailure,
  ModelProfileDefinition,
} from '@omne-harness/model-contract'
import type { ModelChoices, ModelProfiles } from '@omne-harness/model-contract/provider'
import type { TenantId } from '@omne-harness/legal-identity'

/** Whether this login may act for the tenant now; the application adapts it from identity. */
export interface ModelAccessPrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
}

/** Lists the chat models of a tenant: the ones a person picks the model of a session from. */
export type ModelChoiceReader = Readonly<{
  list(
    input: Parameters<ModelProfiles<Principal>['list']>[0] & Readonly<{ kind: 'llm' }>,
  ): Promise<{ readonly ok: ModelChoices<'llm'> } | { readonly failure: ModelFailure }>
}>

/** What a model is asked to take for it to count as selectable in the list. */
export type ModelAccessSettings = Readonly<{ required: ModalityRequirement }>

export type BlockPosition = Readonly<{ message: string; block: string }>

/** What the history of one session asks of a model, and which of its blocks a model cannot take. */
export type SessionRequirement = Readonly<{
  required: ModalityRequirement
  unmetBy(definition: ModelProfileDefinition<'llm'>): readonly BlockPosition[]
}>

/** The requirement of a session, as selecting a model in it judges; null when its history cannot be read. */
export interface ModelSessionRequirements {
  of(session: Readonly<{ tenant: TenantId; session: string }>): Promise<SessionRequirement | null>
}
