import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import {
  accountCodec,
  organizationCodec,
  tenant,
  tenantCodec,
  type TenantId,
} from '@omne-harness/legal-identity'
import type {
  ModalityRequirement,
  ModelFailure,
  ProfileResolution,
} from '@omne-harness/model-contract'
import type { ModelAccessPrincipals, ModelChoiceReader } from '@omne-harness/model-access'

export type FixtureLogin = Readonly<{ loginText: string; tenant: TenantId; tenantText: string }>

const BODY = 'abcdefghjkmnpqrstvwxyz2345'

function parsed<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('the fixture did not parse')
  return result.value
}

export function fixtureLogin(letter: string): FixtureLogin {
  const suffix = `${letter}${BODY.slice(1)}`
  const minted = tenant(
    parsed(organizationCodec.parse(`org_${suffix}`)),
    parsed(accountCodec.parse(`acc_${suffix}`)),
  )
  return {
    loginText: `login-${letter}`,
    tenant: minted,
    tenantText: parsed(tenantCodec.encode(minted)),
  }
}

export const loginIdentity = (login: FixtureLogin): LoginIdentity =>
  login as unknown as LoginIdentity

export const REQUIRED: ModalityRequirement = {
  modalities: ['text'],
  source: { owner: 'test', record: 'list-models', revision: '1', digest: '0'.repeat(64) },
}

type Resolved = Extract<ProfileResolution<'llm'>, { kind: 'resolved' }>

/** A profile as Model resolves it; only what the list reads is filled in. */
export function resolved(
  route: string,
  over: Partial<Resolved> = {},
  reasoningEfforts?: Resolved['profile']['definition']['reasoningEfforts'],
): ProfileResolution<'llm'> {
  const profile = {
    identity: { scope: { kind: 'factory' }, route },
    definition: { input: ['text', 'image'], output: ['text'], reasoningEfforts },
  } as unknown as Resolved['profile']
  return {
    kind: 'resolved',
    profile,
    source: REQUIRED.source,
    selectable: true,
    reasons: [],
    credential: 'available',
    shadowed: [],
    ...over,
  }
}

export type Script<T> = T | 'throw'
type Acting = 'issued' | 'denied' | 'basis-unavailable'
type ListCall = Parameters<ModelChoiceReader['list']>[0]

export function createWorld() {
  const principal = { fixture: 'principal' } as unknown as Principal
  const state = {
    acting: 'issued' as Script<Acting>,
    listing: [resolved('anthropic/claude-sonnet-5')] as Script<
      readonly ProfileResolution<'llm'>[] | ModelFailure
    >,
    present: true,
  }
  const asked: { login: string; tenant: string }[] = []
  const listed: ListCall[] = []
  const principals: ModelAccessPrincipals = {
    async actingFor(login, tenantText) {
      asked.push({ login: (login as unknown as FixtureLogin).loginText, tenant: tenantText })
      if (state.acting === 'throw') throw new Error('identity is down')
      return state.acting === 'issued' ? { ok: principal } : { refused: state.acting }
    },
  }
  const profiles: ModelChoiceReader = {
    async list(input) {
      listed.push(input)
      if (state.listing === 'throw') throw new Error('model is down')
      if ('kind' in state.listing) return { failure: state.listing }
      return { ok: { choices: state.listing, selected: null, source: REQUIRED.source } }
    },
  }
  return {
    state,
    asked,
    listed,
    principal,
    principals,
    profiles: () => (state.present ? profiles : undefined),
  }
}
