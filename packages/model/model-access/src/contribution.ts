import type {
  AccessContribution,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { ProfileResolution } from '@omne-harness/model-contract'
import type { ModelProtocol } from '@omne-harness/model-protocol'
import type { ModelAccessPrincipals, ModelAccessSettings, ModelChoiceReader } from './ports.ts'

export type ModelAccessContributionInput = Readonly<{
  profiles: () => ModelChoiceReader | undefined
  principals: ModelAccessPrincipals
  settings: ModelAccessSettings
}>

type Handler = AccessContribution<ModelProtocol>['operations']['list-models']
type Answer = Awaited<ReturnType<Handler>>
type Listed = Extract<Answer, { outcome: 'succeeded' }>['body']['models'][number]
type Refusal = Readonly<{ outcome: 'denied' | 'basis-unavailable' }>

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })

const CREDENTIAL = {
  available: 'available',
  missing: 'missing',
  unreadable: 'unknown',
  unavailable: 'unknown',
} as const

async function actingFor(
  principals: ModelAccessPrincipals,
  login: LoginIdentity,
  tenantText: string,
): Promise<Readonly<{ principal: Principal }> | Refusal> {
  try {
    const issued = await principals.actingFor(login, tenantText)
    return 'refused' in issued ? { outcome: issued.refused } : { principal: issued.ok }
  } catch {
    return UNAVAILABLE
  }
}

// A name that resolves to no profile is not a model of the tenant: it is left out of the list.
function listedOf(resolution: ProfileResolution): readonly Listed[] {
  if (resolution.kind === 'absent') return []
  const { identity, definition } = resolution.profile
  return [
    {
      route: identity.route,
      selectable: resolution.selectable,
      reasons: [...resolution.reasons],
      credential: CREDENTIAL[resolution.credential],
      input: [...definition.input],
      output: [...definition.output],
    },
  ]
}

export function createModelAccessContribution(
  input: ModelAccessContributionInput,
): Omit<AccessContribution<ModelProtocol>, 'protocol'> {
  const { principals, settings } = input

  const listModels: Handler = async (call, body) => {
    const tenantText = tenantCodec.encode(body.tenant)
    if (!tenantText.ok) return UNAVAILABLE
    const issued = await actingFor(principals, call.principal, tenantText.value)
    if ('outcome' in issued) return issued
    const profiles = input.profiles()
    if (profiles === undefined) return UNAVAILABLE
    let listed: Awaited<ReturnType<ModelChoiceReader['list']>>
    try {
      listed = await profiles.list({
        principal: issued.principal,
        tenant: body.tenant,
        selected: null,
        required: settings.required,
      })
    } catch {
      return UNAVAILABLE
    }
    if ('failure' in listed)
      return listed.failure.kind === 'denied' ? { outcome: 'denied' } : UNAVAILABLE
    return { outcome: 'succeeded', body: { models: listed.ok.choices.flatMap(listedOf) } }
  }

  return { operations: { 'list-models': listModels }, observations: {} }
}
