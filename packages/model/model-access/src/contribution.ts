import type {
  AccessContribution,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { supportedReasoningEfforts, type ProfileResolution } from '@omne-harness/model-contract'
import type { ModelProtocol } from '@omne-harness/model-protocol'
import type {
  ModelAccessPrincipals,
  ModelAccessSettings,
  ModelChoiceReader,
  ModelSessionRequirements,
  SessionRequirement,
} from './ports.ts'

export type ModelAccessContributionInput = Readonly<{
  profiles: () => ModelChoiceReader | undefined
  principals: ModelAccessPrincipals
  settings: ModelAccessSettings
  sessions?: () => ModelSessionRequirements | undefined
}>

type Handler = AccessContribution<ModelProtocol>['operations']['list-models']
type Body = Parameters<Handler>[1]
type Answer = Awaited<ReturnType<Handler>>
type Listed = Extract<Answer, { outcome: 'succeeded' }>['body']['models'][number]
type Refusal = Readonly<{ outcome: 'denied' | 'basis-unavailable' }>

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const NAMED_BLOCKS = 16

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

async function requirementOf(
  sessions: ModelSessionRequirements | undefined,
  tenant: Body['tenant'],
  session: string,
): Promise<SessionRequirement | null> {
  try {
    return (await sessions?.of({ tenant, session })) ?? null
  } catch {
    return null
  }
}

function blocksOf(resolution: ProfileResolution, session: SessionRequirement | null) {
  if (session === null || resolution.kind === 'absent') return {}
  if (!resolution.reasons.includes('modality')) return {}
  const blocks = session.unmetBy(resolution.profile.definition).slice(0, NAMED_BLOCKS)
  return blocks.length === 0
    ? {}
    : { blocks: blocks.map(({ message, block }) => ({ message, block })) }
}

// A name that resolves to no profile is not a model of the tenant: it is left out of the list.
function listedOf(
  resolution: ProfileResolution,
  session: SessionRequirement | null,
): readonly Listed[] {
  if (resolution.kind === 'absent') return []
  const { identity, definition } = resolution.profile
  return [
    {
      route: identity.route,
      selectable: resolution.selectable,
      reasons: resolution.reasons.filter(reason => reason !== 'not-enabled'),
      enabled: !resolution.reasons.includes('not-enabled'),
      credential: CREDENTIAL[resolution.credential],
      reasoningEfforts: supportedReasoningEfforts(definition),
      ...(resolution.defaultReasoningEffort === undefined
        ? {}
        : { defaultReasoningEffort: resolution.defaultReasoningEffort }),
      input: [...definition.input],
      output: [...definition.output],
      ...blocksOf(resolution, session),
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
    // A history that cannot be read is not an empty history: the list is not judged without it.
    const session =
      body.session === undefined
        ? null
        : await requirementOf(input.sessions?.(), body.tenant, body.session)
    if (body.session !== undefined && session === null) return UNAVAILABLE
    let listed: Awaited<ReturnType<ModelChoiceReader['list']>>
    try {
      listed = await profiles.list({
        principal: issued.principal,
        tenant: body.tenant,
        selected: null,
        required: session?.required ?? settings.required,
      })
    } catch {
      return UNAVAILABLE
    }
    if ('failure' in listed)
      return listed.failure.kind === 'denied' ? { outcome: 'denied' } : UNAVAILABLE
    const models = listed.ok.choices.flatMap(choice => listedOf(choice, session))
    return { outcome: 'succeeded', body: { models } }
  }

  return { operations: { 'list-models': listModels }, observations: {} }
}
