import type {
  AccessContribution,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  chatNeedOf,
  supportedReasoningEfforts,
  type ModelFailure,
  type ModelNeed,
  type ModelProfileDefinition,
  type ProfileKind,
  type ProfileResolution,
} from '@omne-harness/model-contract'
import {
  supplyOf,
  type ModelChoices,
  type ModelSupply,
} from '@omne-harness/model-contract/provider'
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

// A history that cannot be read is not an empty history: the list is not judged without it.
async function requirementOf(
  sessions: ModelSessionRequirements | undefined,
  { tenant, session }: Body,
): Promise<SessionRequirement | null | 'unreadable'> {
  if (session === undefined) return null
  try {
    return (await sessions?.of({ tenant, session })) ?? 'unreadable'
  } catch {
    return 'unreadable'
  }
}

type Resolved = Extract<ProfileResolution, { kind: 'resolved' }>
type Supply = NonNullable<Extract<Answer, { outcome: 'succeeded' }>['body']['supply']>

function blocksOf(
  resolution: Resolved,
  definition: ModelProfileDefinition<'llm'>,
  session: SessionRequirement | null,
) {
  if (session === null || !resolution.reasons.includes('modality')) return {}
  const blocks = session.unmetBy(definition).slice(0, NAMED_BLOCKS)
  return blocks.length === 0
    ? {}
    : { blocks: blocks.map(({ message, block }) => ({ message, block })) }
}

// What a chat model says beyond every model: its efforts, the tenant's default one, the blocks it cannot take.
function chatFactsOf(
  resolution: Resolved,
  definition: ModelProfileDefinition<'llm'>,
  session: SessionRequirement | null,
) {
  return {
    reasoningEfforts: supportedReasoningEfforts(definition),
    ...(resolution.defaultReasoningEffort === undefined
      ? {}
      : { defaultReasoningEffort: resolution.defaultReasoningEffort }),
    ...blocksOf(resolution, definition, session),
  }
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
      kind: definition.kind,
      route: identity.route,
      selectable: resolution.selectable,
      reasons: resolution.reasons.filter(reason => reason !== 'not-enabled'),
      enabled: !resolution.reasons.includes('not-enabled'),
      credential: CREDENTIAL[resolution.credential],
      input: [...definition.input],
      output: [...definition.output],
      ...(definition.kind === 'llm' ? chatFactsOf(resolution, definition, session) : {}),
    },
  ]
}

function supplyAnswerOf(supply: ModelSupply): Supply {
  if (supply.state !== 'blocked') return { state: supply.state }
  switch (supply.by) {
    case 'no-offering':
      return { state: 'blocked', by: supply.by }
    case 'credential':
      return { state: 'blocked', by: supply.by, providers: [...supply.providers] }
    default:
      return {
        state: 'blocked',
        by: supply.by,
        models: supply.models.map(({ provider, route }) => ({ provider, route })),
      }
  }
}

type Listing = Readonly<{ ok: ModelChoices }> | Readonly<{ failure: ModelFailure }>

// A list that throws is no answer: undefined, which the caller answers as unavailable.
async function listingOf(
  profiles: ModelChoiceReader,
  input: Parameters<ModelChoiceReader['list']>[0],
): Promise<Listing | undefined> {
  try {
    return await profiles.list(input)
  } catch {
    return undefined
  }
}

function answerOf(listed: Listing, session: SessionRequirement | null): Answer {
  if ('failure' in listed)
    return listed.failure.kind === 'denied' ? { outcome: 'denied' } : UNAVAILABLE
  const models = listed.ok.choices.flatMap(choice => listedOf(choice, session))
  return { outcome: 'succeeded', body: { models, supply: supplyAnswerOf(supplyOf(listed)) } }
}

// The kinds a profile is held of; a kind of model the release has no profile of is no offering.
const NO_OFFERING: Answer = {
  outcome: 'succeeded',
  body: { models: [], supply: { state: 'blocked', by: 'no-offering' } },
}

export function createModelAccessContribution(
  input: ModelAccessContributionInput,
): Omit<AccessContribution<ModelProtocol>, 'protocol'> {
  const { principals, settings } = input

  // A chat list is judged by the session it names, if any; another kind's need follows no history.
  async function needOf(
    kind: ProfileKind,
    body: Body,
  ): Promise<Readonly<{ required: ModelNeed; session: SessionRequirement | null }> | 'unreadable'> {
    if (kind !== 'llm')
      return { required: { kind, source: settings.required.source }, session: null }
    const session = await requirementOf(input.sessions?.(), body)
    if (session === 'unreadable') return session
    return { required: chatNeedOf(session?.required ?? settings.required), session }
  }

  const listModels: Handler = async (call, body) => {
    const tenantText = tenantCodec.encode(body.tenant)
    if (!tenantText.ok) return UNAVAILABLE
    const issued = await actingFor(principals, call.principal, tenantText.value)
    if ('outcome' in issued) return issued
    const kind = body.kind ?? 'llm'
    if (kind === 'live') return NO_OFFERING
    const profiles = input.profiles()
    if (profiles === undefined) return UNAVAILABLE
    const asked = await needOf(kind, body)
    if (asked === 'unreadable') return UNAVAILABLE
    const listed = await listingOf(profiles, {
      principal: issued.principal,
      tenant: body.tenant,
      selected: null,
      required: asked.required,
    })
    return listed === undefined ? UNAVAILABLE : answerOf(listed, asked.session)
  }

  return { operations: { 'list-models': listModels }, observations: {} }
}
