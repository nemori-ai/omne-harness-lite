// The world of the handler cases: the Session double, the in-process principal authority of
// identity, stand-ins for the two principal ports that follow the server entry's identity steps (a
// target tenant's account must be the login's account; the principal acts for the target tenant on
// the work of the login), a definition mapping, and a session observation stand-in.
import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import { inProcessPrincipalAuthority, type ActingForTenantPrincipal } from '@omne-harness/identity'
import {
  accountCodec,
  accountEquals,
  organizationCodec,
  tenant,
  tenantCodec,
  type AccountId,
  type TenantId,
} from '@omne-harness/legal-identity'
import type {
  SessionObservation,
  SessionObservationEnd,
  SessionObservationFrame,
} from '@omne-harness/session-observation'
import type { SessionAccess } from '@omne-harness/session-contract'
import { createSessionContribution } from '../../src/contribution.ts'
import type {
  DefinitionResolver,
  PrincipalFacts,
  ResolvedDefinition,
  SessionAccessSettings,
  SessionListing,
  SessionListPage,
  TargetTenantPrincipals,
} from '../../src/ports.ts'
import { createSessionDouble, type SessionDouble } from './session-double.ts'

export const DEFINITION = 'assistant'
export const DEFAULT_DEFINITION = 'coding'

export const INITIAL_MODEL_SELECTION = {
  name: 'fixture/model',
  basis: { owner: 'fixture', record: 'model-selection', revision: '1', digest: 'sha256:selection' },
} as const

function definitionOf(name: string): ResolvedDefinition {
  return {
    candidate: { owner: 'fixture', name: `${name}@1`, revision: '1', digest: `sha256:${name}` },
    execution: { owner: 'fixture', name: 'execution', revision: '1', digest: 'sha256:execution' },
    entryContract: { owner: 'fixture', name: 'entry', revision: '1', digest: 'sha256:entry' },
    requiredIdentities: [],
    tenantDefaults: {
      owner: 'fixture',
      name: 'defaults',
      revision: '1',
      digest: 'sha256:defaults',
    },
    initialModelSelection: INITIAL_MODEL_SELECTION,
  }
}

/** The fixture mapping: `assistant` and `coding`. */
export const resolveDefinition: DefinitionResolver = name =>
  name === DEFINITION || name === DEFAULT_DEFINITION ? definitionOf(name) : undefined

/** A recognised login as the stand-in identity knows it. The handlers see it as opaque. */
export type FixtureLogin = Readonly<{
  account: AccountId
  loginText: string
  tenant: TenantId
  tenantText: string
}>

function parsed<T>(result: { ok: true; value: T } | { ok: false }, text: string): T {
  if (!result.ok) throw new Error(`fixture ${text} did not parse`)
  return result.value
}

const BODY = 'abcdefghjkmnpqrstvwxyz2345'

/** A login of the account `acc_<letter><body>` acting for its own personal-organization tenant. */
export function fixtureLogin(letter: string, loginText = `login-${letter}`): FixtureLogin {
  const suffix = `${letter}${BODY.slice(1)}`
  const account = parsed(accountCodec.parse(`acc_${suffix}`), suffix)
  const organization = parsed(organizationCodec.parse(`org_${suffix}`), suffix)
  const minted = tenant(organization, account)
  const tenantText = tenantCodec.encode(minted)
  if (!tenantText.ok) throw new Error('fixture tenant did not encode')
  return { account, loginText, tenant: minted, tenantText: tenantText.value }
}

export function loginIdentity(login: FixtureLogin): LoginIdentity {
  return login as unknown as LoginIdentity
}

/** The membership key of the Session double. */
export function memberKey(target: TenantId): string {
  return `${target.organization.text}/${target.account.text}`
}

/** What the stand-in `SessionListing` answers from now on. */
export type ListingScript =
  | Readonly<{ ok: SessionListPage }>
  | Readonly<{ refused: 'invalid' | 'denied' | 'basis-unavailable' }>
  | 'throw'

export type ListingCall = Parameters<SessionListing['list']>[0]

export type ObservationScript =
  | Readonly<{
      kind: 'opened'
      frames: readonly SessionObservationFrame[]
      /** `undefined`: the frames end only when the signal is aborted, without a reason. */
      end?: SessionObservationEnd
    }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>

export type World = Readonly<{
  session: SessionDouble
  issue(login: FixtureLogin, target?: TenantId): Principal
  /** The principal-port refusal to answer from now on; `undefined` answers by the account rule. */
  refuseTargets(refusal: 'denied' | 'basis-unavailable' | 'throw' | undefined): void
  /** Takes Session, the observation, the mapping or the session list off the tree. */
  remove(port: 'faces' | 'observation' | 'definitions' | 'listing'): void
  /** The calls the stand-in session list has had, and the answer it gives from now on. */
  listing: Readonly<{
    calls(): readonly ListingCall[]
    answer(script: ListingScript): void
  }>
  script(script: ObservationScript): void
  opens(): readonly SessionAccess<Principal>[]
  /** Whether the frames of the last opened observation were closed. */
  closed(): boolean
  contribution: ReturnType<typeof createSessionContribution>
}>

export function createWorld(settings: Partial<SessionAccessSettings> = {}): World {
  const members = new Map<string, Set<string>>()
  const session = createSessionDouble({ members })
  const authority = inProcessPrincipalAuthority()
  const system = authority.issuer.issueSystem({ component: 'session-access-fixture' })
  if ('failure' in system) throw new Error('fixture system principal not issued')
  let refusal: 'denied' | 'basis-unavailable' | 'throw' | undefined
  const removed = new Set<string>()
  let scripted: ObservationScript = { kind: 'opened', frames: [], end: 'refresh-exhausted' }
  const opens: SessionAccess<Principal>[] = []
  let closed = false
  const listingCalls: ListingCall[] = []
  let listed: ListingScript = { ok: { items: [], next: null, completeness: 'complete' } }

  const issue = (login: FixtureLogin, target: TenantId = login.tenant): Principal => {
    const key = memberKey(target)
    members.set(key, (members.get(key) ?? new Set()).add(login.account.text))
    const issued = authority.issuer.issueActingForTenant({
      actor: system.ok,
      tenant: target,
      work: { owner: 'identity-login', work: login.loginText },
    })
    if ('failure' in issued) throw new Error('fixture principal not issued')
    return issued.ok as unknown as Principal
  }

  const principals: TargetTenantPrincipals = {
    async actingFor(login, tenantText) {
      if (refusal === 'throw') throw new Error('identity fault')
      if (refusal !== undefined) return { refused: refusal }
      const caller = login as unknown as FixtureLogin
      const target = tenantCodec.parse(tenantText)
      if (!target.ok || !accountEquals(target.value.account, caller.account))
        return { refused: 'denied' }
      return { ok: issue(caller, target.value) }
    },
  }

  const facts: PrincipalFacts = {
    describe(principal) {
      const acting = principal as unknown as ActingForTenantPrincipal
      if (acting.kind !== 'acting-for-tenant' || acting.work.owner !== 'identity-login')
        return undefined
      return { tenant: acting.tenant, account: acting.tenant.account.text, login: acting.work.work }
    },
  }

  const observation: SessionObservation<Principal> = {
    async open({ access, signal }) {
      opens.push(access)
      const script = scripted
      if (script.kind !== 'opened') return script
      const frames = async function* (): AsyncGenerator<
        SessionObservationFrame,
        SessionObservationEnd | undefined
      > {
        try {
          for (const frame of script.frames) yield frame
          if (script.end !== undefined) return script.end
          await new Promise<void>(resolve => {
            if (signal.aborted) return resolve()
            signal.addEventListener('abort', () => resolve(), { once: true })
          })
          return undefined
        } finally {
          closed = true
        }
      }
      return { kind: 'opened', frames: frames() }
    },
  }

  const listing: SessionListing = {
    async list(call) {
      listingCalls.push(call)
      if (listed === 'throw') throw new Error('directory fault')
      return listed
    },
  }

  const contribution = createSessionContribution({
    faces: () => (removed.has('faces') ? undefined : session.faces),
    observation: () => (removed.has('observation') ? undefined : observation),
    definitions: () => (removed.has('definitions') ? undefined : resolveDefinition),
    listing: () => (removed.has('listing') ? undefined : listing),
    principals,
    facts,
    settings: {
      maxPageBytes: 65536,
      historyKinds: ['message.user', 'message.assistant'],
      defaultListLimit: 50,
      maxListLimit: 50,
      ...settings,
    },
  })

  return {
    session,
    issue,
    refuseTargets: next => {
      refusal = next
    },
    remove: port => {
      removed.add(port)
    },
    listing: {
      calls: () => [...listingCalls],
      answer: next => {
        listed = next
      },
    },
    script: next => {
      scripted = next
    },
    opens: () => [...opens],
    closed: () => closed,
    contribution,
  }
}
