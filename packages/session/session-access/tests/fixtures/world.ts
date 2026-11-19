import type { HistorySearch } from '@omne-harness/session-search'
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
  ModelTargetCheck,
  ModelTargets,
  PermissionModeReading,
  PrincipalFacts,
  RequestJournal,
  ResolvedDefinition,
  RunFailureCauses,
  RunFailureReading,
  SessionAccessSettings,
  SessionListing,
  SessionListPage,
  SessionPermissionModes,
  TargetTenantPrincipals,
} from '../../src/ports.ts'
import { createRequestDrain, type RequestDrain } from '../../src/request-drain.ts'
import type { QueuedRequest } from '../../src/request-queue.ts'
import { admitRequest } from '../../src/send-input.ts'
import { createJournalDouble, type JournalDouble } from './journal-double.ts'
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

export const resolveDefinition: DefinitionResolver = name =>
  name === DEFINITION || name === DEFAULT_DEFINITION ? definitionOf(name) : undefined

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

export function memberKey(target: TenantId): string {
  return `${target.organization.text}/${target.account.text}`
}

export type ListingScript =
  | Readonly<{ ok: SessionListPage }>
  | Readonly<{ refused: 'invalid' | 'denied' | 'basis-unavailable' }>
  | 'throw'

export type ListingCall =
  | Parameters<SessionListing['list']>[0]
  | Parameters<SessionListing['listArchived']>[0]

export type CauseScript = RunFailureReading | 'throw'

export type CauseCall = Parameters<RunFailureCauses['read']>[0]

export type ModeScript = PermissionModeReading | 'throw'

export type ObservationScript =
  | Readonly<{
      kind: 'opened'
      frames: readonly SessionObservationFrame[]
      end?: SessionObservationEnd
    }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>

type Port =
  | 'faces'
  | 'observation'
  | 'definitions'
  | 'listing'
  | 'searching'
  | 'causes'
  | 'permissionModes'
  | 'modelTargets'

type SearchCall = Parameters<HistorySearch<Principal>['search']>[0]
type SearchScript = Awaited<ReturnType<HistorySearch<Principal>['search']>> | 'throw'

export type TargetScript = ModelTargetCheck | 'throw'
export type TargetCall = Parameters<ModelTargets['check']>[0]

/** The basis a selectable target answers with in these tests. */
export const TARGET_BASIS = {
  owner: 'model-profiles',
  record: 'anthropic/claude-sonnet-5',
  revision: '1',
  digest: 'a'.repeat(64),
}

export type World = Readonly<{
  session: SessionDouble
  issue(login: FixtureLogin, target?: TenantId): Principal
  refuseTargets(refusal: 'denied' | 'basis-unavailable' | 'throw' | undefined): void
  refuseResumes(refusal: 'denied' | 'basis-unavailable' | 'throw' | undefined): void
  breakFacts(fault: 'throw' | 'undescribed' | undefined): void
  useDefinitions(resolver: DefinitionResolver): void
  resumes(): readonly Readonly<{ tenant: string; login: string }>[]
  remove(port: Port): void
  put(port: Port): void
  journal: JournalDouble
  requests: RequestDrain
  admissions(): readonly QueuedRequest[]
  restart(): void
  listing: Readonly<{
    calls(): readonly ListingCall[]
    answer(script: ListingScript): void
  }>
  searching: Readonly<{
    calls(): readonly SearchCall[]
    answer(script: SearchScript): void
  }>
  causes: Readonly<{
    calls(): readonly CauseCall[]
    answer(script: CauseScript): void
  }>
  targets: Readonly<{
    calls(): readonly TargetCall[]
    answer(script: TargetScript): void
  }>
  modes: Readonly<{
    calls(): readonly SessionAccess<Principal>[]
    answer(script: ModeScript): void
  }>
  script(script: ObservationScript): void
  opens(): readonly SessionAccess<Principal>[]
  closed(): boolean
  contribution: ReturnType<typeof createSessionContribution>
}>

export function createWorld(
  settings: Partial<SessionAccessSettings> = {},
  journal?: RequestJournal,
): World {
  const members = new Map<string, Set<string>>()
  const session = createSessionDouble({ members })
  const authority = inProcessPrincipalAuthority()
  const system = authority.issuer.issueSystem({ component: 'session-access-fixture' })
  if ('failure' in system) throw new Error('fixture system principal not issued')
  let refusal: 'denied' | 'basis-unavailable' | 'throw' | undefined
  let resumeRefusal: 'denied' | 'basis-unavailable' | 'throw' | undefined
  let factsFault: 'throw' | 'undescribed' | undefined
  let resolver: DefinitionResolver = resolveDefinition
  const resumes: { tenant: string; login: string }[] = []
  const admissions: QueuedRequest[] = []
  const store = createJournalDouble()
  const removed = new Set<string>()
  let scripted: ObservationScript = { kind: 'opened', frames: [], end: 'refresh-exhausted' }
  const opens: SessionAccess<Principal>[] = []
  let closed = false
  const listingCalls: ListingCall[] = []
  let listed: ListingScript = { ok: { items: [], next: null, completeness: 'complete' } }
  const causeCalls: CauseCall[] = []
  let caused: CauseScript = { kind: 'none' }
  const targetCalls: TargetCall[] = []
  let targeted: TargetScript = { kind: 'selectable', credential: 'available', basis: TARGET_BASIS }

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
    async resume(tenantText, loginText) {
      resumes.push({ tenant: tenantText, login: loginText })
      if (resumeRefusal === 'throw') throw new Error('identity fault')
      if (resumeRefusal !== undefined) return { refused: resumeRefusal }
      const target = tenantCodec.parse(tenantText)
      if (!target.ok) return { refused: 'denied' }
      const { account } = target.value
      return { ok: issue({ account, loginText, tenant: target.value, tenantText }) }
    },
  }

  const facts: PrincipalFacts = {
    describe(principal) {
      if (factsFault === 'throw') throw new Error('identity fault')
      if (factsFault === 'undescribed') return undefined
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

  const read = async (call: ListingCall) => {
    listingCalls.push(call)
    if (listed === 'throw') throw new Error('directory fault')
    return listed
  }
  const listing: SessionListing = { list: read, listArchived: read }

  const searchCalls: SearchCall[] = []
  let searched: SearchScript = { ok: { hits: [], next: null, complete: true, incomplete: null } }
  const searching: HistorySearch<Principal> = {
    async search(call) {
      searchCalls.push(call)
      if (searched === 'throw') throw new Error('search fault')
      return searched
    },
  }

  const causes: RunFailureCauses = {
    async read(call) {
      causeCalls.push(call)
      if (caused === 'throw') throw new Error('agent journal fault')
      return caused
    },
  }

  const modelTargets: ModelTargets = {
    async check(call) {
      targetCalls.push(call)
      if (targeted === 'throw') throw new Error('model profiles fault')
      return targeted
    },
  }

  const modeCalls: SessionAccess<Principal>[] = []
  let moded: ModeScript = { kind: 'read', mode: 'bypass-permissions', revision: '0' }
  const permissionModes: SessionPermissionModes = {
    async read(access) {
      modeCalls.push(access)
      if (moded === 'throw') throw new Error('modes fault')
      return moded
    },
  }

  const faces = () => (removed.has('faces') ? undefined : session.faces)
  const complete: SessionAccessSettings = {
    maxPageBytes: 65536,
    historyKinds: ['message.user', 'message.assistant'],
    defaultListLimit: 50,
    maxListLimit: 50,
    requestQueueLimit: 8,
    requestRetryDelaysMs: [1],
    ...settings,
  }

  const assemble = (opened: RequestJournal) => {
    const requests = createRequestDrain({
      journal: opened,
      admit: request => {
        admissions.push(request)
        return admitRequest({ principals, facts, faces }, request)
      },
      limit: complete.requestQueueLimit,
      retryDelaysMs: complete.requestRetryDelaysMs,
    })
    const contribution = createSessionContribution({
      faces,
      observation: () => (removed.has('observation') ? undefined : observation),
      definitions: () => (removed.has('definitions') ? undefined : resolver),
      listing: () => (removed.has('listing') ? undefined : listing),
      searching: () => (removed.has('searching') ? undefined : searching),
      causes: () => (removed.has('causes') ? undefined : causes),
      modelTargets: () => (removed.has('modelTargets') ? undefined : modelTargets),
      permissionModes: () => (removed.has('permissionModes') ? undefined : permissionModes),
      principals,
      facts,
      settings: complete,
      requests,
    })
    return { requests, contribution }
  }
  let assembled = assemble(journal ?? store.open())

  return {
    session,
    issue,
    refuseTargets: next => {
      refusal = next
    },
    refuseResumes: next => {
      resumeRefusal = next
    },
    breakFacts: next => {
      factsFault = next
    },
    useDefinitions: next => {
      resolver = next
    },
    resumes: () => [...resumes],
    remove: port => {
      removed.add(port)
    },
    put: port => {
      removed.delete(port)
    },
    journal: store,
    get requests() {
      return assembled.requests
    },
    admissions: () => [...admissions],
    restart: () => {
      assembled.requests.stop()
      assembled = assemble(store.open())
    },
    listing: {
      calls: () => [...listingCalls],
      answer: next => {
        listed = next
      },
    },
    searching: {
      calls: () => [...searchCalls],
      answer: next => {
        searched = next
      },
    },
    causes: {
      calls: () => [...causeCalls],
      answer: next => {
        caused = next
      },
    },
    targets: {
      calls: () => [...targetCalls],
      answer: next => {
        targeted = next
      },
    },
    modes: {
      calls: () => [...modeCalls],
      answer: next => {
        moded = next
      },
    },
    script: next => {
      scripted = next
    },
    opens: () => [...opens],
    closed: () => closed,
    get contribution() {
      return assembled.contribution
    },
  }
}
